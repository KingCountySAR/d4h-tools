import { d4hClient } from './d4h.js';
import { subMonths, isAfter, addMonths, parseISO } from 'date-fns';

const NOTE_PREFIX = 'cc-script:';

const rules = [
  { name: 'ESAR Field', test: signin => signin?.role?.bundle == 'ESAR' && signin.role.title.includes("(Mission)"), needHours: 30, cutoff: subMonths(new Date(), 12) },
  { name: 'SMR Field', test: signin => signin?.role?.bundle == 'SMR' && signin.role.title != 'SMR - ITOL', needHours: 30, cutoff: subMonths(new Date(), 12) },
]

const cutoff = new Date(Math.min.apply(this, rules.map(r => r.cutoff.getTime())));

async function getChunkedList(name, url) {
  let list = [];
  let chunk = [];
  do {
    chunk = (await d4hClient.get(`${url}${url.includes('?') ? '&' : '?'}limit=250&offset=${list.length}`)).data.data;
    list = [ ...list, ...chunk ];
    console.log(`${name}: ${list.length}`);
  } while (chunk.length >= 250);

  return list;
}

async function body() {
  const memberLookup = (await getChunkedList('members', `team/members?include_details=true`)).reduce((accum, cur) => ({ ...accum, [cur.id]: cur}), {});
  const signins = await getChunkedList('rosters', `team/attendance?activity=incident&status=attending&sort=date:desc&after=${cutoff.toJSON()}`);

  let members = rules.reduce((accum, cur) => ({ ...accum, [cur.name]: {}}), {});

  let awards = [];
  for (let i=0; i<signins.length; i++) {
    const signin = signins[i];

    for (let r=0; r < rules.length; r++) {
      const rule = rules[r];
      if (!rule.test(signin)) continue;

      let existing = members[rule.name][signin.member.id] ?? { minutes: 0 };
      if (existing.minutes < rule.needHours * 60) {
        existing.minutes += signin.duration;
        existing.date = signin.date;
        existing.name = signin.member.name;
        if (existing.minutes >= rule.needHours * 60) {
          awards.push({ award: rule, member: memberLookup[signin.member.id], date: signin.date});
        }
      }
      members[rule.name][signin.member.id] = existing;

    }
  }

  awards = awards;//.filter(f => f.member.name == 'Cosand, Matt');
  for (let i = 0; i< awards.length; i++) {
    const a = awards[i];
    console.log(`${a.date} - ${a.member.name} - ${a.award.name}`);
    
    let dirty = false;
    //const qualsResponse = await d4hClient.get(`team/members/${a.member.id}/qualification-awards`);

    const noteLines = (a.member.notes?.replace(/\\\r/g, '\r').replace(/\\\n/g, '\n') ?? '').split('\r\n') ?? [];
    const otherNotes = noteLines.filter(l => !l.startsWith(NOTE_PREFIX));

    const scriptNoteLine = noteLines.filter(l => l.startsWith(NOTE_PREFIX))[0]?.substr(10)?.replace(/\\"/g, '"') ?? '{}';
    let noteInfo;
    try {
      console.log(`**${scriptNoteLine}**`);
      noteInfo = JSON.parse(scriptNoteLine);
    } catch (err) { 
      console.log(`Failed to parse cc-script note for ${a.member.name}: **${scriptNoteLine}** ${err}`);
      noteInfo = {};
    }


    const quals = [
      27521, // Radio.PE
      27529, // Search Techniques
      27523, // Navigation
      27520, // Survival
      27533, // Rescue Techniques
      27525, // GPS
    ];
    for (let j=0; j < quals.length; j++) {
      const qid = quals[j];

      if (noteInfo[qid] && !isAfter(parseISO(a.date), addMonths(parseISO(noteInfo[qid]), 12))) {
        console.log(`${a.member.name} already has qualification ${qid} from script on ${noteInfo[qid]}`);
        continue;
      }

      const params = new URLSearchParams()
      params.append('member_id', a.member.id)
      params.append('start_date', a.date)
      const response = await d4hClient.post(`team/qualifications/${qid}/qualified-members`, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }});
      noteInfo[qid] = a.date.substr(0, 10);
      dirty = true;
    }

    if (noteLines.filter(l => l.startsWith(NOTE_PREFIX)).length > 1) {
      console.log('  removing extra note line(s)')
      dirty = true;
    }

    if (dirty) {
      console.log('  updating notes')
      const newNotes = [ ...otherNotes, `${NOTE_PREFIX}${JSON.stringify(noteInfo)}`].join('\r\n');
      const params = new URLSearchParams();
      params.append('notes', newNotes);
    
      await d4hClient.put(`team/members/${a.member.id}`, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }});
    }
  }
  console.log(awards.length)
}

body();

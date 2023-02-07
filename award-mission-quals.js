import { d4hClient, getChunkedList, saveBundle } from './d4h.js';
import { subMonths, isAfter, addMonths, parseISO } from 'date-fns';

const NOTE_PREFIX = 'cc-script:';

const rules = [
  { name: 'ESAR Field', test: signin => signin?.role?.bundle == 'ESAR' && signin.role.title.includes("(Mission)"), needHours: 30, cutoff: subMonths(new Date(), 12) },
  { name: 'SMR Field', test: signin => signin?.role?.bundle == 'SMR' && signin.role.title != 'SMR - ITOL', needHours: 30, cutoff: subMonths(new Date(), 12) },
]

const cutoff = new Date(Math.min.apply(this, rules.map(r => r.cutoff.getTime())));

async function body() {
  const qualsNotesField = (await getChunkedList('fields', `team/custom-fields`)).find(f => f.title === 'Qualification Scripts');
  if (!qualsNotesField) {
    console.log('Can\'t find Qualifications field');
    return;
  }
  const memberLookup = (await getChunkedList('members', `team/members?include_details=true&include_custom_fields=true`)).reduce((accum, cur) => ({ ...accum, [cur.id]: cur}), {});
  
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

  for (let i = 0; i< awards.length; i++) {
    const a = awards[i];
    if (!a.member) {
      if (a.award.test) {
        console.log(`Entry for test award: ${a.award.name}`);
        continue;
      } else {
        console.log('Unknown member', a);
        return;
      }
    }

    console.log(`${a.date} - ${a.member.name} - ${a.award.name}`);
    
    let dirty = false;
    let noteInfo;
    const fieldValue = a.member.custom_fields.find(mf => mf.id === qualsNotesField.id)?.value;
  
    try {
      console.log(`##${fieldValue}##`);
      noteInfo = JSON.parse(fieldValue ?? {});
    } catch (err) { 
      console.log(`Failed to parse cc-script note for ${a.member.name}: **${fieldValue}** ${err}`);
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
      console.log("Should write new qualification record");
      const response = await d4hClient.post(`team/qualifications/${qid}/qualified-members`, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }});
      noteInfo[qid] = a.date.substr(0, 10);
      dirty = true;
    }

    if (dirty) {
      console.log('  updating notes')

      // Silly API makes us update the bundle all at once.
      // Fetch the user's fields in the same bundle as Secondary Email to make sure we have the latest copy.
      const bundle = (await getChunkedList('fields', `team/custom-fields/member/${a.member.id}`)).filter(f => f.bundle_id === qualsNotesField.bundle_id);
      // Create a list of field_id / values for the bundle, replacing the Secondary Email value
      const fieldValues = bundle.map(f => ({
        id: f.id,
        value: f.id == qualsNotesField.id ? JSON.stringify(noteInfo) : a.member.custom_fields.find(mf => mf.id === f.id)?.value
      }));
      // Save the bundle
      await saveBundle('member', a.member.id, { fields: fieldValues });
    }
  }
  console.log(awards.length)
}

body();

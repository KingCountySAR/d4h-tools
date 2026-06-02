import { d4hv3Client, getChunkedList/*, saveBundle*/ } from './lib/d4hv3.mjs';
import { subMonths, isAfter, addMonths, parseISO } from 'date-fns';

//const TEST_USER = 'Smith, Joe';
const TEST_USER = undefined;

const ARMED = true;

const rules = [
  { name: 'ESAR Field', test: (signin, role) => role?.deprecatedBundle == 'ESAR' && role.title.includes("(Mission)"), needHours: 30, cutoff: subMonths(new Date(), 12) },
  { name: 'SMR Field', test: (signin, role) => role?.deprecatedBundle == 'SMR' && role.title != 'SMR - ITOL', needHours: 30, cutoff: subMonths(new Date(), 12) },
]

const cutoff = new Date(Math.min.apply(this, rules.map(r => r.cutoff.getTime())));

function verbose(...msg) {
  if (process.argv[2] === '--verbose') {
    console.log(...msg);
  }
}

async function body() {
  const qualsNotesField = (await getChunkedList(`custom-fields?target_resource_type=Member`)).find(f => f.title === 'Qualification Scripts');
  if (!qualsNotesField) {
    console.log('Can\'t find Qualifications field');
    return;
  }

  verbose('Downloading roles ...');
  /*
    {
    owner: { resourceType: 'Team', id: {teamId}} },
    id: number,
    title: '{Title}',
    order: 0,
    createdAt: '2021-02-20T03:27:53.000Z',
    updatedAt: '2021-02-20T03:27:53.000Z',
    resourceType: 'Role',
    cost: { use: null, hour: null },
    deprecatedBundle: '{UnitName}'
  }
  */
  const roles = (await getChunkedList('roles')).reduce((accum, cur) => ({...accum, [cur.id]: cur }), {});

  verbose('Downloading members ...');
  const memberLookup = (await getChunkedList('members')).reduce((accum, cur) => ({ ...accum, [cur.id]: cur}), {});

  verbose('Downloading rosters ...');
  const signins = await getChunkedList(`attendance?activity_resource_type=Incident&status=ATTENDING&starts_after=${cutoff.toJSON()}&sort=startsAt&order=desc`)

  let membersByRule = rules.reduce((accum, cur) => ({ ...accum, [cur.name]: {}}), {});

  let awards = [];
  for (let i=0; i<signins.length; i++) {
    const signin = signins[i];
    const role = roles[signin.role.id];
    for (let r=0; r < rules.length; r++) {
      const rule = rules[r];
      if (!rule.test(signin, role)) continue;

      let existing = membersByRule[rule.name][signin.member.id] ?? { minutes: 0 };
      if (existing.minutes < rule.needHours * 60) {
        existing.minutes += signin.duration;
        existing.date = signin.startsAt;
        existing.name = memberLookup[signin.member.id].name;
        if (existing.minutes >= rule.needHours * 60) {
          awards.push({ rule, member: memberLookup[signin.member.id], date: signin.startsAt});
        }
      }
      membersByRule[rule.name][signin.member.id] = existing;
    }
  }

  verbose(`Need to award qualifications to ${awards.length} members`);
  verbose(awards.map(f => `${f.member.name} ${f.rule.name} ${f.date}`).sort().join('\n'));
  for (let i = 0; i< awards.length; i++) {
    const a = awards[i];
    if (!a.member) {
      if (a.rule.test) {
        console.log(`Entry for test award: ${a.rule.name}`);
        continue;
      } else {
        console.log('Unknown member', a);
        return;
      }
    }

    verbose(`${a.member.name} met equivalents on ${a.date}`);

    let dirty = false;
    let noteInfo;
    let qualificationScriptField = a.member.customFieldValues.find(mf => mf.customField.id === qualsNotesField.id)
    let fieldValue = qualificationScriptField?.value;

    try {
      noteInfo = JSON.parse(fieldValue ?? '{}');
    } catch (err) {
      console.log(`Failed to parse cc-script note for ${a.member.name}: **${fieldValue}** ${err}`);
      noteInfo = {};
    }


    const quals = [
      36493, // Radio
      36489, // Search Tactics
      36487, // Map & Compass
      36490, // Survival
      36492, // Searcher Safety
      36488, // GPS
      36491, // Litter
    ];
    for (let j=0; j < quals.length; j++) {
      const qid = quals[j];

      if (noteInfo[qid] && !isAfter(parseISO(a.date), addMonths(parseISO(noteInfo[qid]), 12))) {
        console.log(`${a.member.name} already has qualification ${qid} from script on ${noteInfo[qid]}`);
        continue;
      }

      const params = {
        memberId: a.member.id,
        startsAt: a.date,
        qualificationId: qid
      }
      if (a.member.name === (TEST_USER ?? a.member.name)) {
        console.log(`${a.member.name}\t${qid}\t${a.date}`);
        if (ARMED) {
          const response = await d4hv3Client.post(`member-qualification-awards`, params);
        }
      }
      noteInfo[qid] = a.date.substr(0, 10);
      dirty = true;
    }

    if (dirty && ARMED && a.member.name === (TEST_USER ?? a.member.name)) {
      const data = {
        customFieldValues: [
          ...a.member.customFieldValues.map(cf => ({ id: cf.customField.id, value: cf.value }))
          .filter(f => f.id !== qualsNotesField.id),
          { id: qualsNotesField.id, value: JSON.stringify(noteInfo)},
        ],
      }
      
      try {
        await d4hv3Client.patch(`members/${a.member.id}`, data)
      } catch (err) {
        console.dir(err.response.data.detailObj.data, { depth: null })
      }
    }
  }
  console.log(awards.length)
}

body();

import { d4hClient } from './d4h.js';
import { subDays, subMonths, isAfter } from 'date-fns';


const rules = [
  { name: 'ESAR Field', test: signin => signin?.role?.bundle == 'ESAR' && signin.role.title.includes("(Mission)"), needHours: 30, cutoff: subMonths(new Date(), 12) },
  { name: 'SMR Field', test: signin => signin?.role?.bundle == 'SMR' && signin.role.title != 'SMR - ITOL', needHours: 30, cutoff: subMonths(new Date(), 12) },
]

const cutoff = new Date(Math.min.apply(this, rules.map(r => r.cutoff.getTime())));

async function body() {
  let signins = [];
  let chunk = [];
  console.log(`Getting sign-ins since ${cutoff}...`);
  do {
    chunk = (await d4hClient.get(`team/attendance?limit=250&offset=${signins.length}&activity=incident&status=attending&sort=date:desc&after=${cutoff.toJSON()}`)).data.data;
    signins = [...signins, ...chunk ];
    console.log(`  ${chunk[0].date}  ${chunk[chunk.length - 1].date}`);
  } while (chunk.length >= 250);

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
          awards.push({ award: rule, member: signin.member, date: signin.date});
        }
      }
      members[rule.name][signin.member.id] = existing;

    }
  }

  awards.forEach(a => console.log(`${a.date} - ${a.member.name} - ${a.award.name}`));
  console.log(awards.length)
}

body();

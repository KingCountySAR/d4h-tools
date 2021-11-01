import * as fs from 'fs';
import { exec } from 'child_process';
import { format } from 'date-fns';
import { d4hClient } from './d4h.js';
import path from 'path';

async function body() {
  console.log('Clearing previous data ...');
  await new Promise((resolve) => {
    fs.readdir("data", (err, files) => {
      files.filter(f => f !== '.git').forEach(file => {
        fs.rmSync(`data/${file}`, { recursive: true, force: true });
      });
      resolve();
    });
  });

  const teamData = await d4hClient.get('team');
  await writeFile('team.json', teamData.data.data);

  await getEventOfType('mission', 'incident');
  await getEventOfType('training', 'exercise');
  await getEventOfType('event', 'event');

  await getMembers();

  console.log('Getting qualifications ...');
  let quals = [];
  let chunk = [];
  do {
    chunk = (await d4hClient.get(`team/qualifications?limit=500&offset=${quals.length}&sort=title`)).data.data;
    quals = [ ...quals, ...chunk ];
  } while (chunk.length == 500);
  await writeFile(`courses.json`, quals.map(q => {
    delete q.next_expiration;
    return q;
  }));

  console.log('Getting locations ...');
  let locations = [];
  chunk = [];
  do {
    chunk = (await d4hClient.get(`team/locations?limit=500&offset=${locations.length}`)).data.data;
    locations = [ ...locations, ...chunk ];
  } while (chunk.length == 500);
  await writeFile(`locations.json`, locations);

  commit();
}

async function getMembers() {
  console.log('Getting members ...');
  let members = [];
  let chunk = [];
  do {
    chunk = (await d4hClient.get(`team/members?limit=500&offset=${members.length}&include_details=true&include_custom_fields=true`)).data.data;
    members = [ ...members, ...chunk ];
  } while (chunk.length == 500);
  await writeFile(`members/_list.json`, members
    .map(inc => ({
      id: inc.id,
      ref: inc.ref,
      name: inc.name,
      updated_at: inc.updated_at,
    }))
  );

  for (let i=0; i<members.length; i++) {
    const member = members[i];
    console.log(member.name);
    member.custom_fields = member.custom_fields
                            .filter(f => f.entity_value)
                            .map(f => ({
                              id: f.id,
                              title: f.title,
                              entity_value: f.entity_value,
                              entity_value_created: f.entity_value_created,
                              entity_value_updated: f.entity_value_updated,
                            }));
    member.emergency_contacts = (await d4hClient.get(`team/members/${member.id}/emergency`)).data.data;
    member.animals = (await d4hClient.get(`team/members/${member.id}/animals`)).data.data;
    let quals = [];
    do {
      chunk = (await d4hClient.get(`team/members/${member.id}/qualification-awards?limit=500&offset=${quals.length}&state=all`)).data.data;
      quals = [ ...quals, ...chunk ];
    } while (chunk.length == 500);
    member.qualifications = quals;
  
    await writeFile(`members/${member.id}.json`, member);
  }
}

async function getEventOfType(localType, urlType) {
  console.log(`Getting ${localType}s ...`);
  let missions = [];
  let chunk = [];
  do {
    chunk = (await d4hClient.get(`team/${urlType}s?limit=500&offset=${missions.length}&sort=date&archived=false&include_archived=false&include_custom_fields=true`)).data.data;
    missions = [ ...missions, ...chunk ];
  } while (chunk.length == 500);
  await writeFile(`${localType}s/_list.json`, missions.map(inc => ({
    id: inc.id,
    date: inc.date,
    title: inc.ref_desc,
    updated_at: inc.updated_at,
  })));

  const missionLookup = missions.reduce((accum, cur) => ({ ...accum, [cur.id]: cur }), {});
  for (let i=0; i<missions.length; i++) {
    let mission = missions[i];
    mission.custom_fields = mission.custom_fields.filter(f => f.entity_value).map(f => ({
      id: f.id,
      title: f.title,
      entity_value: f.entity_value,
      entity_value_created: f.entity_value_created,
      entity_value_updated: f.entity_value_updated,
    }));
    mission.roster = [];
  }

  console.log(`Getting ${localType} rosters ...`);
  let missionRosters = [];
  chunk = [];
  do {
    chunk = (await d4hClient.get(`team/attendance?activity=${urlType}&limit=500&offset=${missionRosters.length}&sort=date`)).data.data;
    missionRosters = [ ...missionRosters, ...chunk ];
  } while (chunk.length == 500);

  for (let i=0; i<missionRosters.length; i++) {
    const { activity, ...row } = missionRosters[i];
    missionLookup[activity.id].roster.push(row);
  }

  for (let i=0; i<missions.length; i++) {
    await writeFile(`${localType}s/${missions[i].id}.json`, missions[i]);
  }
}

async function writeFile(name, data) {
  try {
    const filePath = `data/${name}`;
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(data, undefined, 2));
  } catch (err) {
    console.error(err);
  }
}

async function commit() {
  await new Promise((resolve) => {
    exec('git add "**"', {cwd: 'data'}, function(err, stdout, stderr) {
      if (err) throw new Error(err);
      resolve();
    });
  });
  await new Promise((resolve) => {
    const date = format(new Date(), 'yyyy-MM-dd')
    exec(`git diff-index --quiet HEAD || git commit -m "${date}"`, {cwd: 'data'}, function(err, stdout, stderr) {
      if (err) throw new Error(err);
      resolve();
    });
  });
}

body();
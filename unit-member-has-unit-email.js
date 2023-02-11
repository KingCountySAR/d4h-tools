/**
 * Usage:
 *  In Google Admin, Manage Users:
 *  - Navigate to Organization as desired
 *  - "Download Users" at top
 *  - "Currently filtered list", "All user info columns", and "Comma-separated values"
 *
 * node unit-member-has-unit-email.js ESAR kcesar.org User_Download_000000.csv
 * 
 */
import fs from 'fs';
import neatCsv from 'neat-csv';
import { getChunkedList, saveBundle } from './lib/d4h.js';

const unitName = process.argv[2];
const unitDomain = process.argv[3];
const fixWithCsv = process.argv[4];

function readCsv() {
  if (fixWithCsv) {
    return new Promise((resolve, reject) => {
      const filePath = fixWithCsv;
      fs.readFile(filePath, (error, data) => {
        if (error) {
          return console.log('error reading file');
        }
        neatCsv(data, {
          mapHeaders: ({ header }) => header.replace(/ \[.*\]/, "").replace(/ /g, "")
        }).then(d => resolve(d));
      });
    });
  }
  return Promise.resolve([]);
}

function findCsvUser(csvData, d4hMember) {
  const matches = csvData.filter(c => c.EmployeeTitle?.toUpperCase() == d4hMember.custom_fields.filter(f => f.label == 'UUID')[0]?.value?.toUpperCase());
  if (matches?.length == 1) {
    console.log(`matched ${d4hMember.name} by uuid`);
    return matches[0];
  }
}

async function body() {
  const secondaryEmailField = (await getChunkedList('fields', `team/custom-fields`)).find(f => f.title === 'Secondary Email');
  if (!secondaryEmailField) {
    console.log('Can\'t find Secondary Email field');
    return;
  }

  const unitGroup = (await getChunkedList('groups', 'team/groups'))
                      .filter(g => g.bundle === 'Units' && g.title === unitName)[0];

  if (!unitGroup) {
    console.log(`Can't find unit group with name ${unitName}`);
    return;
  }

  const members = (await getChunkedList('members', `team/members?include_details=true&include_custom_fields=true`))
                    .filter(m => m.group_ids.includes(unitGroup.id));
  ;

  let csvData = await readCsv();

  for (let i = 0; i< members.length; i++) {
    const m = members[i];

    if (m.email && m.email.endsWith(`@${unitDomain}`)) {
      console.log(`!! ${m.name} has unit email as primary address !!`);
    }
    const secondaryEmailText = m.custom_fields.filter(f => f.label === 'Secondary Email')[0].value;
    let secondaryEmails = secondaryEmailText?.split(';').map(e => e.trim()) ?? [];

    const unitEmails = secondaryEmails.filter(e => e.endsWith(`@${unitDomain}`));
    if (unitEmails.length == 0) {
      console.log(`${m.name} doesn't have a unit email`);
      const matchingUser = findCsvUser(csvData, m);
      if (matchingUser) {
        secondaryEmails.push(matchingUser.EmailAddress);
        console.log('secondary now: ', secondaryEmails.join('; '));

        // Silly API makes us update the bundle all at once.
        // Fetch the user's fields in the same bundle as Secondary Email to make sure we have the latest copy.
        const bundle = (await getChunkedList('fields', `team/custom-fields/member/${m.id}`)).filter(f => f.bundle_id === secondaryEmailField.bundle_id);
        // Create a list of field_id / values for the bundle, replacing the Secondary Email value
        const fieldValues = bundle.map(f => ({
          id: f.id,
          value: f.id == secondaryEmailField.id ? secondaryEmails.join('; ') : m.custom_fields.find(mf => mf.id === f.id)?.value
        }));
        // Save the bundle
        await saveBundle('member', m.id, { fields: fieldValues });
      }
    } else if (unitEmails.length > 1) {
      console.log(`${m.name} has multiple unit emails: `, unitEmails);
    }
  }
}

body();
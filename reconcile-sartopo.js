import * as fs from 'fs';
import * as path from 'path';
import { d4hClient, getChunkedList } from './lib/d4h.js';
import { CalTopoClient } from './lib/caltopo.js';


class Reconciler {
  
  async init() {
    const configFile = new URL('reconcile-sartopo.json', import.meta.url);
    this.config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

    this.calTopo = new CalTopoClient(this.config.auth);
    this.rootCaltopoUsers = (await this.calTopo.getApi(`/api/v0/group/${this.config.calTopoRootId}/members`)).list;

    const secondaryEmailField = (await getChunkedList('fields', `team/custom-fields`)).find(f => f.title === 'Secondary Email');
    if (!secondaryEmailField) {
      console.log('Can\'t find Secondary Email field');
      return;
    }
    
    this.d4hMembersList = (await getChunkedList('members', `team/members?include_details=true&include_custom_fields=true`))
    .map(m => ({
      ...m,
      emails: [...new Set([m.email?.toLowerCase(), ...m.custom_fields.filter(f => f.id === secondaryEmailField.id)?.[0]?.value?.split(';')?.map(e => e.trim().toLowerCase()) ?? []])]
    }));

    this.d4hMembersByEmail = this.d4hMembersList.reduce((accum, cur) => {
      for (const email of cur.emails) {
        if (accum[email]) {
          console.log(`!! Multiple people (${accum[email].name}) (${cur.name}) have email ${email}`);
          continue;
        }

        accum[email] = {
          id: cur.id,
          name: cur.name,
          groups: cur.group_ids,
        };
      }
    
      return accum;
    }, {});

    return this;
  }

  async processGroups() {
    await this.init();

    if (process.argv[2]) {
      const group = this.config.groups[process.argv[2]];
      await this.processCalTopoGroup([process.argv[2], group]);
    } else {
      await Promise.all(
        Object.entries(this.config.groups).map(this.processCalTopoGroup.bind(this))
      )
    }
    console.log('done');
  }

  async processCalTopoGroup([niceName, spec]) {
    const caltopoMembers = (await this.calTopo.getApi(`/api/v0/group/${spec.sartopoId}/members`)).list;

    const unitD4HMembers = this.d4hMembersList
                              .filter(m => m.group_ids.filter(g => spec.d4hIds.includes(g)).length > 0)
                              .reduce((accum, cur) => ({ ...accum, [cur.id]: cur }), {});

    for (const caltopoUser of caltopoMembers) {
      const caltopoEmail = caltopoUser.email.toLowerCase();
      const d4h = this.d4hMembersByEmail[caltopoEmail];
      if (d4h) {
        // This CalTopo user is still in D4H.
        delete unitD4HMembers[d4h.id];
        // Are they still in the unit?
        const inUnit = d4h.groups.filter(g => spec.d4hIds.includes(g)).length > 0;
        if (!inUnit) {
          console.log(`!! CalTopo user ${caltopoUser.email} is in D4H (${d4h.name} / ${d4h.id}), but not in ${niceName}`);
        }
      } else if (spec.extras?.find(e => e === caltopoEmail)) {
        console.log(`  CalTopo user ${caltopoUser.email} is listed as unit extra`);
      } else {
       console.log(`!! CalTopo ${niceName} user ${caltopoUser.email} (${caltopoUser.fullName}) not found in D4H`);
      }
    }

    const scriptEmails = [];
    Object.values(unitD4HMembers).sort((a, b) => (a.name > b.name) ? 1 : -1).forEach(nonCaltopo => {
      const rootUsers = this.rootCaltopoUsers.filter(r => nonCaltopo.emails.map(e => e.toLowerCase()).indexOf(r.email.toLowerCase()) >= 0);
      if (rootUsers.length > 0) {
        console.log(`!! ${nonCaltopo.name} is not in ${niceName} CalTopo team, but ${rootUsers[0].email} is in KCSARA team`);
        scriptEmails.push(rootUsers[0].email);        
      } else {
        console.log(`  ${nonCaltopo.name} (${nonCaltopo.emails}) not in ${niceName} CalTopo team`);
      }
    });
    if (scriptEmails.length > 0) {
      console.log(`['${scriptEmails.join("','")}'].forEach(e => document.evaluate("//div[text()='" + e + "']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.closest('tr').querySelectorAll('input[type="checkbox"]')[0].click());`);
    }
  }
}

new Reconciler().processGroups();
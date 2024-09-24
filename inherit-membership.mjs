import { d4hv3Client, getChunkedList } from './lib/d4hv3.mjs';
import { d4hClient, getChunkedList as getChunkedList2 } from './lib/d4h.js';

async function copyMembersFromGroupToGroup(fromGroupId, toGroupId) {
  const fromMembersJson = await getChunkedList(`member-group-memberships?group_id=${fromGroupId}`);
  const toMembersJson = await getChunkedList(`member-group-memberships?group_id=${toGroupId}`);

  let membersToAdd = Object.keys(fromMembersJson.reduce((a, c) => ({ ...a, [c.member.id]: true }), {}));
  for (const existing of toMembersJson) {
    membersToAdd = membersToAdd.filter(id => id != existing.member.id);
  }
  for (const memberId of membersToAdd) {
    console.log('adding member ' + memberId);
    d4hv3Client.post(`member-group-memberships`, {
      memberId,
      groupId: toGroupId,
    });
  }
}

const args = process.argv ?? [];
if (args.length > 2) {
  copyMembersFromGroupToGroup(...args.slice(2));
} else {
  console.log(`Invalid options:\n${args.join(' ')} <from-grou-id> <to-group-id>`);
}

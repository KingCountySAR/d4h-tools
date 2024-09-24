import { d4hv3Client, getChunkedList } from './lib/d4hv3.mjs';
import { d4hClient, getChunkedList as getChunkedList2 } from './lib/d4h.js';
import { subMonths, isAfter, addMonths, parseISO } from 'date-fns';


/**
 *
 * @param {*} groupId
 * @param {*} eventId
 * @returns
 */
async function addAbsentees(groupId, eventId) {
  const memberships = await getChunkedList(`member-group-memberships?group_id=${groupId}`);
  const memberIds = Object.keys(memberships.reduce((a, c) => ({ ...a, [c.member.id]: true }), {}));
  return await addAbsenteeFromGroup(eventId, memberIds);
}

/**
 * Reconciles an exercise roster against a list of member IDs. If the member does not already have an attendance
 * record for the exercise, one is created with status=absent.
 * @param {string|Activity} activity The D4H activity object, or the ID of the activity
 * @param {string[]} memberIds An arrau of members that should be attending the exercise
 */
async function addAbsenteeFromGroup(activity, memberIds) {
  if (typeof activity !== 'object') {
    activity = (await d4hv3Client.get(`exercises/${activity}`)).data;
  }
  const signins = await getChunkedList2('rosters', `team/attendance?activity=exercise&sort=date:desc&activity_id=${activity.id}`);
  for (const row of signins) {
    console.log(row.member)
    memberIds = memberIds.filter(m => m != row.member.id);
  }
  for (const member of memberIds) {
    d4hClient.post('team/attendance', {
      activity_id: activity.id,
      member,
      status: 'absent',
      date: activity.startsAt,
      enddate: activity.endsAt,
    });
  }
}


const args = process.argv ?? [];
if (args.length > 2) {
  addAbsentees(...args.slice(2));
} else {
  console.log(`Invalid options:\n${args.join(' ')} <event-tag> <group-id>`);
}

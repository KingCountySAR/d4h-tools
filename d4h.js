import axios from 'axios';
import config from './config.js';
axios.defaults.baseURL = 'https://api.d4h.org/v2/';
axios.defaults.headers.common['Authorization'] = `Bearer ${config.d4h_token}`;

export const d4hClient = axios;
if (config.proxy) {
  d4hClient.defaults.proxy = config.proxy;
}

export async function getChunkedList(name, url) {
  let list = [];
  let chunk = [];
  do {
    chunk = (await d4hClient.get(`${url}${url.includes('?') ? '&' : '?'}limit=250&offset=${list.length}`)).data.data;
    list = [ ...list, ...chunk ];
    console.log(`${name}: ${list.length}`);
  } while (chunk.length >= 250);

  return list;
}

export async function saveMember(d4hMember) {
  //return (await d4hClient.put(`team/members/${d4hMember.id}`)).data.data;
}

export async function saveBundle(entityType, entityId, fieldValues) {
  const result = await d4hClient.put(`team/custom-fields/${entityType}/${entityId}`, fieldValues);
  return result.data.data;
}
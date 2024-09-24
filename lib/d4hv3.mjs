import axios from 'axios';
import config from '../config.js';

export const d4hv3Client = new axios.create({
  baseURL: `https://api.team-manager.us.d4h.com/v3/team/${config.d4h_teamid}/`,
  headers: {
    common: {
      Authorization: `Bearer ${config.d4h_v3token}`
    }
  },
  proxy: config.proxy || undefined,
});


export async function getChunkedList(url) {
  let list = [];
  let chunk = [];
  do {
    chunk = (await d4hv3Client.get(`${url}${url.includes('?') ? '&' : '?'}size=250&page=${Math.floor(list.length / 250)}`)).data.results;
    list = [ ...list, ...chunk ];
  } while (chunk.length >= 250);

  return list;
}
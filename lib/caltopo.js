import crypto from 'crypto';
import axios from 'axios';
import https from 'https';

export class CalTopoClient {
  constructor(config) {
    this.url = config.url;
    this.authId = config.authId;
    this.authKey = config.authKey;

    this.topoClient = axios.create({
      baseURL: config.url,
      timeout: 60000, //optional
      httpsAgent: new https.Agent({ keepAlive: true })
    });
  }

  async getApi(url) {
    return (await this.topoClient.get(this.generateGetUrl(url))).data.result;
  }
  
  generateGetUrl(relativeUrl) {
    return `${this.url}${relativeUrl}?${this._signUrl('GET', relativeUrl)}`;
  }

  _sign(method, url, expires, payloadString) {
    const message = `${method} ${url}\n${expires}\n${payloadString}`
    const secret = Buffer.from(this.authKey, 'base64');
    let test = crypto.createHmac('sha256', secret).update(message).digest("base64");
    return test;
  }
  
  _signUrl(method, url, payload) {
    const payloadString = payload ? JSON.stringify(payload) : '';
    const expires = new Date().getTime() + 300 * 1000;
    const signature = this._sign(method, url, expires, payloadString);
    const parameters = {
      id: this.authId,
      expires: expires,
      signature
    };
  
    const queryString = Object.entries(parameters).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
    return queryString;
  }
}
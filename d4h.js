import axios from 'axios';
import config from './config.js';

axios.defaults.baseURL = 'https://api.d4h.org/v2/';
axios.defaults.headers.common['Authorization'] = `Bearer ${config.d4h_token}`;

export const d4hClient = axios;
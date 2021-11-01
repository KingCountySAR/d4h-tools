import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

process.chdir(path.dirname(fileURLToPath(import.meta.url)));

const config = JSON.parse(fs.readFileSync('config.json'));

export default config;

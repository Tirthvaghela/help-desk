import dotenv from 'dotenv';
import { readEnv } from './envRules.js';

dotenv.config({ quiet: true });

const { env: config, errors } = readEnv(process.env);

if (errors.length > 0) {
  for (const message of errors) console.error(message);
  console.error('Copy backend/.env.example to backend/.env and fill in the values.');
  process.exit(1);
}

export const env = config;

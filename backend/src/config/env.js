import dotenv from 'dotenv';
import { readEnv } from './envRules.js';

dotenv.config({ quiet: true });

const { env: config, errors, warnings } = readEnv(process.env);

for (const message of warnings) console.warn(`Warning: ${message}`);
if (errors.length > 0) {
  for (const message of errors) console.error(message);
  console.error('Copy backend/.env.example to backend/.env and fill in the values.');
  process.exit(1);
}

export const env = config;

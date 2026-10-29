import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Reads runtime settings from environment variables, with safe defaults
 * so `npm start` works on a fresh clone without any setup.
 */
export function loadConfig(env = process.env) {
  return {
    port: parsePort(env.PORT ?? '3000'),
    dbPath: env.DB_PATH ?? path.join(ROOT_DIR, 'data', 'helpdesk.db'),
    demoDefects: parseSwitch(env.DEMO_DEFECTS),
    publicDir: path.join(ROOT_DIR, 'public'),
  };
}

export function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${value}": expected an integer between 1 and 65535`);
  }
  return port;
}

export function parseSwitch(value) {
  return ['on', 'true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

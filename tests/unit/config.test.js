import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig, parsePort, parseSwitch } from '../../src/config.js';

describe('config', () => {
  it('uses safe defaults when no variables are set', () => {
    const config = loadConfig({});
    assert.equal(config.port, 3000);
    assert.equal(config.demoDefects, false);
    assert.match(config.dbPath, /data[\\/]helpdesk\.db$/);
  });

  it('reads PORT, DB_PATH and DEMO_DEFECTS', () => {
    const config = loadConfig({ PORT: '4000', DB_PATH: '/tmp/x.db', DEMO_DEFECTS: 'on' });
    assert.deepEqual([config.port, config.dbPath, config.demoDefects], [4000, '/tmp/x.db', true]);
  });

  it('rejects an invalid port', () => {
    for (const value of ['abc', '0', '70000', '3.5']) {
      assert.throws(() => parsePort(value), /Invalid PORT/);
    }
  });

  it('only turns defects on for explicit values', () => {
    for (const value of ['on', 'ON', 'true', '1', 'yes', ' on ']) assert.equal(parseSwitch(value), true, value);
    for (const value of [undefined, '', 'off', 'false', '0', 'no']) assert.equal(parseSwitch(value), false, String(value));
  });
});

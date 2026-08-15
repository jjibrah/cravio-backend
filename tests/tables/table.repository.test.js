import test from 'node:test';
import assert from 'node:assert/strict';
import { TableRepository } from '../../src/tables/table.repository.js';

test('database bulk creation rolls back and releases transaction on insert failure', async () => {
  const calls = []; let inserts = 0;
  const client = { query: async (sql) => { calls.push(sql); if (sql.startsWith('INSERT') && ++inserts === 2) throw new Error('failure'); return { rows: [{}] }; }, release: () => calls.push('RELEASE') };
  const repository = new TableRepository({ connect: async () => client });
  await assert.rejects(repository.createBulk('restaurant', [{ name: 'A', code: 'A', qrToken: 'a' }, { name: 'B', code: 'B', qrToken: 'b' }]), /failure/);
  assert.ok(calls.includes('ROLLBACK')); assert.ok(calls.includes('RELEASE')); assert.ok(!calls.includes('COMMIT'));
});

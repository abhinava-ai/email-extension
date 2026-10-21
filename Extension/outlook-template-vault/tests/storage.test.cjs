const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStorage, template } = require('./storage-fixture.cjs');

test('simultaneous saves of different templates retain both records', async () => {
  const { api } = createStorage();
  await Promise.all([api.upsert(template('a'), null), api.upsert(template('b'), null)]);
  const result = await api.load();
  assert.deepEqual(Array.from(result.templates, (item) => item.id).sort(), ['a', 'b']);
  assert.equal(result.syncPending, false);
});

test('stale edits and stale deletions cannot overwrite another window', async () => {
  const { api } = createStorage();
  const first = (await api.upsert(template('a'), null)).template;
  const second = (await api.upsert({ ...first, html: '<p>New version</p>' }, first.revision)).template;
  await assert.rejects(api.upsert({ ...first, html: '<p>Stale</p>' }, first.revision), /changed or deleted/);
  await assert.rejects(api.remove('a', first.revision), /changed elsewhere/);
  assert.equal((await api.load()).templates[0].html, second.html);
  await api.remove('a', second.revision);
  await assert.rejects(api.upsert(first, second.revision), /changed or deleted/);
});

test('incomplete remote data never replaces local records or gets overwritten', async () => {
  const { api, areas } = createStorage({
    local: { etm_local_v1: { updatedAt: 1, templates: [template('local')] } },
    sync: { etm_manifest_v1: { updatedAt: 99, items: [{ id: 'remote', chunks: 2 }] }, etm_chunk_v1_remote_0: '{' }
  });
  const originalSync = structuredClone(areas.sync);
  const loaded = await api.load();
  assert.equal(loaded.templates[0].id, 'local');
  assert.equal(loaded.syncAvailable, false);
  const result = await api.upsert(template('new'), null);
  assert.equal(result.synced, false);
  assert.deepEqual(areas.sync, originalSync);
  assert.equal(areas.local.etm_local_v1.templates.length, 2);
});

test('local save survives quota and unavailable-sync failures', async () => {
  const { api, failures, areas } = createStorage({ quota: 1500 });
  const result = await api.upsert(template('large', '😀\\"'.repeat(3000)), null);
  assert.equal(result.synced, false);
  assert.equal(areas.local.etm_local_v1.templates.length, 1);
  failures.syncGet = true;
  assert.equal((await api.load()).syncAvailable, false);
  const saved = await api.upsert(template('offline'), null);
  assert.equal(saved.synced, false);
  assert.equal(areas.local.etm_local_v1.templates.length, 2);
});

test('UTF-8 and JSON-escaped chunks fit item quotas and round-trip exactly', async () => {
  const { api, areas } = createStorage();
  const html = '<p>' + '😀\\"\n漢字'.repeat(1000) + '</p>';
  assert.equal((await api.upsert(template('unicode', html), null)).synced, true);
  const remote = createStorage({ sync: areas.sync });
  assert.equal((await remote.api.load()).templates[0].html, html);
  assert.ok(areas.sync.etm_manifest_v1.keys.length > 1);
});

test('different offline edits merge per record; deletion markers prevent resurrection', async () => {
  const first = createStorage();
  await first.api.upsert(template('a'), null);
  await first.api.upsert(template('b'), null);
  const second = createStorage({ sync: first.areas.sync });
  const secondRecords = (await second.api.load()).templates;
  second.failures.syncSet = true;
  await second.api.upsert({ ...secondRecords[1], html: '<p>Offline B</p>' }, secondRecords[1].revision);
  const a = (await first.api.load()).templates.find((item) => item.id === 'a');
  await first.api.remove(a.id, a.revision);
  second.areas.sync = structuredClone(first.areas.sync);
  const merged = await second.api.load();
  assert.deepEqual(Array.from(merged.templates, (item) => item.id), ['b']);
  assert.equal(merged.templates[0].html, '<p>Offline B</p>');
});

test('imports validate all records before replacing anything', async () => {
  const { api, areas } = createStorage();
  await api.upsert(template('safe'), null);
  const original = structuredClone(areas.local);
  await assert.rejects(api.replaceFromImport([template('x'), template('x')]), /Duplicate/);
  await assert.rejects(api.replaceFromImport([{ ...template('bad'), name: '' }]), /Invalid/);
  await assert.rejects(api.replaceFromImport([{ ...template('bad'), id: {} }]), /Invalid/);
  assert.deepEqual(areas.local, original);
  await api.replaceFromImport([template('imported')]);
  assert.deepEqual(Array.from((await api.load()).templates, (item) => item.id), ['imported']);
  assert.equal(areas.local.etm_local_v1.tombstones[0].id, 'safe');
});

test('failed local writes report failure and do not publish', async () => {
  const { api, failures, areas } = createStorage();
  failures.localSet = true;
  await assert.rejects(api.upsert(template('a'), null), /local write failed/);
  assert.deepEqual(areas.sync, {});
});

test('retry sync publishes local changes after a transient failure', async () => {
  const { api, failures } = createStorage();
  failures.syncSet = true;
  assert.equal((await api.upsert(template('offline'), null)).synced, false);
  assert.equal((await api.load()).syncPending, true);
  failures.syncSet = false;
  assert.equal((await api.reconcile()).synced, true);
  assert.equal((await api.load()).syncPending, false);
});

test('Free entitlements keep templates local and enforce creation/import limits', async () => {
  const { api, areas } = createStorage();
  const options = { allowSync: false, templateLimit: 1 };
  const first = await api.dispatch('upsert', { template: template('free'), expectedRevision: null }, options);
  assert.equal(first.synced, false);
  assert.equal(first.disabled, true);
  assert.deepEqual(areas.sync, {});
  await assert.rejects(
    api.dispatch('upsert', { template: template('blocked'), expectedRevision: null }, options),
    /Free plan supports up to 1 templates/
  );
  const saved = first.template;
  const edited = await api.dispatch('upsert', {
    template: { ...saved, html: '<p>Existing templates remain editable</p>' },
    expectedRevision: saved.revision
  }, options);
  assert.equal(edited.templates[0].html, '<p>Existing templates remain editable</p>');
  await assert.rejects(
    api.dispatch('replace', { templates: [template('one'), template('two')] }, options),
    /Upgrade to Pro to import more/
  );
});

test('sync reclaims orphaned chunks left by interrupted generations', async () => {
  const base = createStorage();
  await base.api.upsert(template('safe'), null);
  base.areas.sync.etm_chunk_v1_orphan_0 = 'x'.repeat(50000);
  const saved = (await base.api.load()).templates[0];
  const result = await base.api.upsert({ ...saved, html: '<p>Updated</p>' }, saved.revision);
  assert.equal(result.synced, true);
  assert.equal(base.areas.sync.etm_chunk_v1_orphan_0, undefined);
});

test('sync compacts the active generation when overlap alone exceeds quota', async () => {
  const { api, areas } = createStorage({ quota: 2400 });
  const first = await api.upsert(template('compact', 'a'.repeat(850)), null);
  assert.equal(first.synced, true);
  const oldKeys = [...areas.sync.etm_manifest_v1.keys];
  const second = await api.upsert({ ...first.template, html: 'b'.repeat(850) }, first.template.revision);
  assert.equal(second.synced, true);
  assert.ok(oldKeys.every((key) => !(key in areas.sync)));
  assert.equal((await api.load()).templates[0].html, 'b'.repeat(850));
});

test('server-authoritative cache revisions remain stable across refreshes', async () => {
  const { api } = createStorage();
  const remote = { ...template('shared'), serverVersion: 4, updatedAt: 400 };
  await api.dispatch('replace', { templates: [remote] }, { allowSync: false, serverAuthoritative: true });
  const first = (await api.dispatch('load', {}, { allowSync: false })).templates[0];
  await api.dispatch('replace', { templates: [remote] }, { allowSync: false, serverAuthoritative: true });
  const second = (await api.dispatch('load', {}, { allowSync: false })).templates[0];
  assert.equal(first.revision, 'server:4');
  assert.equal(second.revision, first.revision);
});

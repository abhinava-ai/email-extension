const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function createStorage({ local = {}, sync = {}, quota = 102400 } = {}) {
  const areas = { local: structuredClone(local), sync: structuredClone(sync) };
  const listeners = new Set();
  const failures = { syncGet: false, syncSet: false, localSet: false };
  const writes = [];
  const storage = { onChanged: { addListener: (fn) => listeners.add(fn) } };
  for (const area of ['local', 'sync']) {
    storage[area] = {
      QUOTA_BYTES: quota,
      async get(keys) {
        if (area === 'sync' && failures.syncGet) throw new Error('Sync unavailable');
        if (keys === null) return structuredClone(areas[area]);
        return structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys])
          .filter((key) => key in areas[area]).map((key) => [key, areas[area][key]])));
      },
      async set(data) {
        if (failures[`${area}Set`]) throw new Error(`${area} write failed`);
        if (area === 'sync') {
          for (const [key, value] of Object.entries(data)) {
            if (Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(value)) > 8192) throw new Error('Per-item quota exceeded');
          }
          const size = Object.entries({ ...areas.sync, ...data }).reduce((n, [key, value]) =>
            n + Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(value)), 0);
          if (size > quota) throw new Error('Total quota exceeded');
        }
        writes.push({ area, data: structuredClone(data) });
        const changes = {};
        for (const [key, value] of Object.entries(data)) {
          if (JSON.stringify(value) !== JSON.stringify(areas[area][key])) {
            changes[key] = { oldValue: areas[area][key], newValue: structuredClone(value) };
          }
          areas[area][key] = structuredClone(value);
        }
        if (Object.keys(changes).length) for (const listener of listeners) listener(changes, area);
      },
      async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete areas[area][key]; },
      async setAccessLevel() {}
    };
  }
  const context = vm.createContext({ chrome: { storage }, TextEncoder, crypto: webcrypto, console, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'storage.js'), 'utf8'), context);
  const api = vm.runInContext('TemplateStorage', context);
  return { api, areas, failures, writes, context, storage };
}

function template(id, html = '<p>Hello</p>', updatedAt = 1) {
  return { id, name: id, html, createdAt: 1, updatedAt };
}

module.exports = { createStorage, template };

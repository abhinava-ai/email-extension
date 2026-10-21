const TemplateStorage = (() => {
  const LOCAL_KEY = 'etm_local_v1';
  const MANIFEST_KEY = 'etm_manifest_v1';
  const CHUNK_PREFIX = 'etm_chunk_v1_';
  const CHANNEL = 'ETM_STORAGE';
  const MAX_HTML_LENGTH = 500000;
  const MAX_TEMPLATES = 500;
  const encoder = new TextEncoder();
  const isWorker = typeof document === 'undefined';
  let queue = Promise.resolve();

  function validateTemplate(value) {
    if (!value || typeof value.id !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(value.id) ||
        typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 ||
        typeof value.html !== 'string' || value.html.length > MAX_HTML_LENGTH ||
        !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 ||
        !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0 ||
        (value.revision !== undefined && (typeof value.revision !== 'string' || value.revision.length > 150))) {
      throw new Error('Invalid template data. Check the backup format and template sizes.');
    }
    return {
      id: value.id, name: value.name.trim(), html: value.html,
      createdAt: value.createdAt, updatedAt: value.updatedAt,
      revision: value.revision || `legacy:${value.updatedAt}`,
      ...(Number.isSafeInteger(value.serverVersion) && value.serverVersion > 0 ? { serverVersion: value.serverVersion } : {})
    };
  }

  function normalizeSnapshot(value) {
    if (!value || !Array.isArray(value.templates) || value.templates.length > MAX_TEMPLATES ||
        !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0) {
      throw new Error('Template storage is incomplete or invalid. The local copy has been preserved.');
    }
    const templates = value.templates.map(validateTemplate);
    const ids = new Set();
    for (const item of templates) {
      if (ids.has(item.id)) throw new Error('Duplicate template IDs in storage.');
      ids.add(item.id);
    }
    const tombstones = value.tombstones || [];
    if (!Array.isArray(tombstones)) throw new Error('Invalid deletion records in storage.');
    for (const item of tombstones) {
      if (!item || typeof item.id !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(item.id) ||
          !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0 ||
          typeof item.revision !== 'string' || item.revision.length > 150 || ids.has(item.id)) {
        throw new Error('Invalid or duplicate deletion records in storage.');
      }
      ids.add(item.id);
    }
    return { version: 2, updatedAt: value.updatedAt, templates, tombstones };
  }

  const emptySnapshot = () => ({ version: 2, updatedAt: 0, templates: [], tombstones: [] });
  function fingerprint(snapshot) {
    return JSON.stringify({
      templates: snapshot.templates.slice().sort((a, b) => a.id.localeCompare(b.id)),
      tombstones: snapshot.tombstones.slice().sort((a, b) => a.id.localeCompare(b.id))
    });
  }

  function merge(left, right) {
    const records = new Map();
    for (const snapshot of [left, right]) {
      for (const item of [...snapshot.templates, ...snapshot.tombstones]) {
        const previous = records.get(item.id);
        const deleted = !Object.hasOwn(item, 'html');
        const previousDeleted = previous && !Object.hasOwn(previous, 'html');
        if (!previous || item.updatedAt > previous.updatedAt ||
            (item.updatedAt === previous.updatedAt && (
              (deleted && !previousDeleted) ||
              (deleted === previousDeleted && JSON.stringify(item) > JSON.stringify(previous))
            ))) records.set(item.id, item);
      }
    }
    const all = [...records.values()];
    return normalizeSnapshot({
      updatedAt: Math.max(left.updatedAt, right.updatedAt),
      templates: all.filter((item) => Object.hasOwn(item, 'html')),
      tombstones: all.filter((item) => !Object.hasOwn(item, 'html'))
    });
  }

  async function getLocal() {
    const result = await chrome.storage.local.get(LOCAL_KEY);
    return result[LOCAL_KEY] ? normalizeSnapshot(result[LOCAL_KEY]) : emptySnapshot();
  }

  async function writeLocal(snapshot) {
    await chrome.storage.local.set({ [LOCAL_KEY]: snapshot });
  }

  async function readSync() {
    // Never adopt a partly downloaded snapshot.
    const data = await chrome.storage.sync.get(null);
    const manifest = data[MANIFEST_KEY];
    if (!manifest) return { snapshot: emptySnapshot() };
    if (manifest.version === 2) {
      if (!Array.isArray(manifest.keys) || manifest.keys.length < 1 || manifest.keys.length > 512 ||
          new Set(manifest.keys).size !== manifest.keys.length) throw new Error('Incomplete sync manifest.');
      const serialized = manifest.keys.map((key) => {
        if (typeof key !== 'string' || !key.startsWith(CHUNK_PREFIX) || typeof data[key] !== 'string') {
          throw new Error('Sync is still downloading. The local copy has been preserved.');
        }
        return data[key];
      }).join('');
      if (encoder.encode(serialized).length !== manifest.bytes) throw new Error('Incomplete sync snapshot.');
      return { snapshot: normalizeSnapshot(JSON.parse(serialized)) };
    }
    if (manifest.version !== undefined || !Array.isArray(manifest.items) || manifest.items.length > MAX_TEMPLATES) {
      throw new Error('Unsupported sync format.');
    }
    // Original-format migration is strict: missing records cannot erase local data.
    const templates = manifest.items.map((item) => {
      if (!item || typeof item.id !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(item.id) ||
          !Number.isInteger(item.chunks) || item.chunks < 1 || item.chunks > 512) throw new Error('Invalid sync record.');
      let serialized = '';
      for (let index = 0; index < item.chunks; index += 1) {
        const key = `${CHUNK_PREFIX}${item.id}_${index}`;
        if (typeof data[key] !== 'string') throw new Error('Sync is still downloading.');
        serialized += data[key];
      }
      const template = validateTemplate(JSON.parse(serialized));
      if (template.id !== item.id) throw new Error('Mismatched synced template.');
      return template;
    });
    return { snapshot: normalizeSnapshot({ updatedAt: manifest.updatedAt, templates }) };
  }

  function splitForSync(text) {
    const chunks = [];
    let chunk = '';
    let bytes = 0;
    for (const char of text) {
      // Account for JSON escaping as well as UTF-8.
      const size = encoder.encode(JSON.stringify(char)).length - 2;
      if (bytes + size > 5500 && chunk) { chunks.push(chunk); chunk = ''; bytes = 0; }
      chunk += char;
      bytes += size;
    }
    if (chunk || !chunks.length) chunks.push(chunk);
    return chunks;
  }

  function referencedChunkKeys(manifest) {
    if (!manifest) return new Set();
    if (manifest.version === 2 && Array.isArray(manifest.keys) &&
        manifest.keys.every((key) => typeof key === 'string' && key.startsWith(CHUNK_PREFIX))) {
      return new Set(manifest.keys);
    }
    if (manifest.version === undefined && Array.isArray(manifest.items)) {
      const keys = new Set();
      for (const item of manifest.items) {
        if (!item || typeof item.id !== 'string' || !Number.isInteger(item.chunks) || item.chunks < 1) return null;
        for (let index = 0; index < item.chunks; index += 1) keys.add(`${CHUNK_PREFIX}${item.id}_${index}`);
      }
      return keys;
    }
    return null;
  }

  function storageBytes(data) {
    return Object.entries(data).reduce((sum, [key, value]) =>
      sum + encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length, 0);
  }

  async function publish(snapshot) {
    try {
      const data = await chrome.storage.sync.get(null);
      // Failed/interrupted immutable-generation writes can leave chunks that no
      // manifest references. They consume quota forever unless reclaimed.
      const referenced = referencedChunkKeys(data[MANIFEST_KEY]);
      if (referenced) {
        const orphaned = Object.keys(data).filter((key) => key.startsWith(CHUNK_PREFIX) && !referenced.has(key));
        if (orphaned.length) {
          await chrome.storage.sync.remove(orphaned);
          for (const key of orphaned) delete data[key];
        }
      }
      const generation = crypto.randomUUID();
      const serialized = JSON.stringify(snapshot);
      const chunks = splitForSync(serialized);
      const keys = chunks.map((_, index) => `${CHUNK_PREFIX}${generation}_${index}`);
      const chunkPayload = Object.fromEntries(keys.map((key, index) => [key, chunks[index]]));
      const manifest = { version: 2, keys, bytes: encoder.encode(serialized).length };
      let projected = { ...data, ...chunkPayload, [MANIFEST_KEY]: manifest };
      const quota = chrome.storage.sync.QUOTA_BYTES || 102400;
      const overQuota = () => storageBytes(projected) > quota || Object.keys(projected).length > 512;
      if (overQuota()) {
        // A new immutable generation normally overlaps the active generation.
        // If both do not fit, compact only after proving the new snapshot itself
        // fits. Local storage remains the durable recovery copy throughout.
        const activeChunks = Object.keys(data).filter((key) => key.startsWith(CHUNK_PREFIX));
        const withoutOldChunks = Object.fromEntries(Object.entries(data)
          .filter(([key]) => !key.startsWith(CHUNK_PREFIX) && key !== MANIFEST_KEY));
        projected = { ...withoutOldChunks, ...chunkPayload, [MANIFEST_KEY]: manifest };
        if (storageBytes(projected) <= quota && Object.keys(projected).length <= 512) {
          if (activeChunks.length) await chrome.storage.sync.remove(activeChunks);
        } else {
          throw new Error('Chrome Sync storage is full. Templates are saved locally; export a backup or reduce content.');
        }
      }
      if (storageBytes(projected) > quota || Object.keys(projected).length > 512) {
        throw new Error('Chrome Sync storage is full. Templates are saved locally; export a backup or reduce content.');
      }
      // Immutable generations: commit the manifest only after every chunk is stored.
      await chrome.storage.sync.set(chunkPayload);
      await chrome.storage.sync.set({ [MANIFEST_KEY]: manifest });
      const current = (await chrome.storage.sync.get(MANIFEST_KEY))[MANIFEST_KEY];
      if (JSON.stringify(current) === JSON.stringify(manifest)) {
        const stale = Object.keys(data).filter((key) => key.startsWith(CHUNK_PREFIX) && !keys.includes(key));
        if (stale.length) await chrome.storage.sync.remove(stale);
      }
      return { synced: true };
    } catch (error) {
      return { synced: false, error: error.message || 'Chrome Sync is unavailable.' };
    }
  }

  async function readMerged(options = {}) {
    const local = await getLocal();
    if (options.allowSync === false) {
      return {
        snapshot: local, source: 'local', syncAvailable: false, syncPending: false,
        syncDisabled: true, error: 'Chrome Sync requires a Pro plan.'
      };
    }
    try {
      const { snapshot: synced } = await readSync();
      const snapshot = merge(local, synced);
      const changed = fingerprint(snapshot) !== fingerprint(local);
      if (changed) await writeLocal(snapshot);
      return { snapshot, source: changed ? 'sync' : 'local', syncAvailable: true,
        syncPending: fingerprint(snapshot) !== fingerprint(synced) };
    } catch (error) {
      return { snapshot: local, source: 'local', syncAvailable: false, syncPending: true, error: error.message };
    }
  }

  async function execute(operation, payload = {}, options = {}) {
    const result = await readMerged(options);
    const snapshot = result.snapshot;
    if (operation === 'load') return { ...result, snapshot: undefined, templates: snapshot.templates };
    if (operation === 'reconcile') {
      if (result.syncDisabled) return { synced: false, disabled: true, error: result.error };
      return result.syncAvailable && result.syncPending ? publish(snapshot) : { synced: !result.syncPending, error: result.error };
    }
    const timestamp = Math.max(Date.now(), snapshot.updatedAt + 1,
      ...snapshot.templates.map((item) => item.updatedAt + 1), ...snapshot.tombstones.map((item) => item.updatedAt + 1));
    const revision = `${timestamp}:${crypto.randomUUID()}`;
    if (operation === 'upsert') {
      const template = validateTemplate(payload.template);
      const existing = snapshot.templates.find((item) => item.id === template.id);
      const deleted = snapshot.tombstones.some((item) => item.id === template.id);
      if (deleted || (existing?.revision || null) !== payload.expectedRevision) {
        throw new Error('This template was changed or deleted elsewhere. Copy your draft, then reopen the template before saving.');
      }
      if (!existing && Number.isSafeInteger(options.templateLimit) && snapshot.templates.length >= options.templateLimit) {
        throw new Error(`The Free plan supports up to ${options.templateLimit} templates. Upgrade to Pro to create unlimited templates.`);
      }
      const savedRevision = options.serverAuthoritative && template.serverVersion
        ? `server:${template.serverVersion}` : revision;
      const saved = { ...template, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp, revision: savedRevision };
      snapshot.templates = snapshot.templates.filter((item) => item.id !== saved.id).concat(saved);
      payload.saved = saved;
    } else if (operation === 'remove') {
      const existing = snapshot.templates.find((item) => item.id === payload.id);
      if (!existing) return { synced: !result.syncPending };
      if (existing.revision !== payload.expectedRevision) throw new Error('This template changed elsewhere. Refresh the list before deleting it.');
      snapshot.templates = snapshot.templates.filter((item) => item.id !== payload.id);
      snapshot.tombstones.push({ id: payload.id, updatedAt: timestamp, revision });
    } else if (operation === 'replace') {
      const imported = normalizeSnapshot({ updatedAt: timestamp, templates: payload.templates }).templates;
      if (Number.isSafeInteger(options.templateLimit) && imported.length > options.templateLimit) {
        throw new Error(`The Free plan supports up to ${options.templateLimit} templates. Upgrade to Pro to import more.`);
      }
      const incomingIds = new Set(imported.map((item) => item.id));
      snapshot.tombstones = snapshot.tombstones.filter((item) => !incomingIds.has(item.id));
      for (const item of snapshot.templates) {
        if (!incomingIds.has(item.id)) snapshot.tombstones.push({ id: item.id, updatedAt: timestamp, revision });
      }
      snapshot.templates = imported.map((item) => item.serverVersion
        ? { ...item, revision: `server:${item.serverVersion}` }
        : { ...item, updatedAt: timestamp, revision });
    } else throw new Error('Unknown storage operation.');
    snapshot.updatedAt = timestamp;
    normalizeSnapshot(snapshot);
    await writeLocal(snapshot);
    const status = result.syncAvailable ? await publish(snapshot) : {
      synced: false, disabled: Boolean(result.syncDisabled), error: result.error
    };
    return { ...status, template: payload.saved, templates: snapshot.templates };
  }

  function dispatch(operation, payload, options) {
    const task = queue.then(() => execute(operation, payload, options));
    queue = task.catch(() => {});
    return task;
  }

  async function request(operation, payload = {}) {
    if (isWorker) return dispatch(operation, payload);
    const response = await chrome.runtime.sendMessage({ type: CHANNEL, operation, payload });
    if (!response?.ok) throw new Error(response?.error || 'Template storage is unavailable. Reload the extension.');
    return response.result;
  }

  return {
    load: () => request('load'),
    upsert: (template, expectedRevision) => request('upsert', { template, expectedRevision }),
    remove: (id, expectedRevision) => request('remove', { id, expectedRevision }),
    replaceFromImport: (templates) => request('replace', { templates }),
    reconcile: () => request('reconcile'),
    dispatch, validateTemplate, MAX_HTML_LENGTH, MAX_TEMPLATES, LOCAL_KEY, MANIFEST_KEY, CHANNEL
  };
})();

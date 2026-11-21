'use strict';
/* Simulation only. Replace this adapter with a separately reviewed server API in RM-015.2. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.RMPublicDemo = factory(root.RMPublicModel);
})(typeof globalThis === 'object' ? globalThis : this, function (model) {
  const TTL = 30 * 60 * 1000;
  function createAdapter({ slug, storage, crypto, now = () => Date.now() }) {
    const config = model.venue(slug); if (!config) throw Error('Unknown restaurant');
    const key = 'rm0151:demo:' + slug;
    let current = null, persistent = true;
    const fail = code => { throw Object.assign(Error(code), { code }); };
    function clear() { current = null; try { storage.removeItem(key); } catch { persistent = false; } }
    function save(record) {
      // Try before committing the in-memory state. A browser refusing storage still permits the exercise.
      try { storage.setItem(key, JSON.stringify(record)); } catch { persistent = false; }
      current = record; return structuredClone(record);
    }
    function read(token) {
      if (!/^[a-f0-9]{64}$/.test(token || '')) return fail('not_found');
      let record = current;
      if (!record) { try { record = JSON.parse(storage.getItem(key)); } catch { persistent = false; } }
      if (!record || record.slug !== slug || record.token !== token || !['confirmed', 'cancelled'].includes(record.status)) return fail('not_found');
      if (!Number.isFinite(record.expiresAt) || now() >= record.expiresAt) { clear(); return fail('expired'); }
      if (!Number.isInteger(record.draft?.party) || record.draft.party < 1 || record.draft.party > config.maxParty || !model.validDate(record.draft.date) || !Object.hasOwn(config.services, record.draft.service) || !/^\d{2}:\d{2}$/.test(record.draft.time) || !Number.isInteger(record.revision) || !record.contact || ['firstName', 'lastName', 'email', 'phone', 'notes'].some(k => typeof record.contact[k] !== 'string' || record.contact[k].length > 500)) return fail('not_found');
      current = record; return structuredClone(record);
    }
    function check(draft, contact) { const errors = model.validate(config, draft, contact, new Date(now())); if (Object.keys(errors).length) return fail('invalid'); }
    return Object.freeze({
      create(draft, contact, existingToken) {
        if (existingToken) return read(existingToken); // Same confirmation click/retry cannot create a second demo.
        check(draft, contact);
        const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
        const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        return save({ slug, token, reference: 'DEMO-' + token.slice(0, 8).toUpperCase(), status: 'confirmed', draft: structuredClone(draft), contact: structuredClone(contact), expiresAt: now() + TTL, revision: 1 });
      },
      read,
      update(token, draft, contact, revision) {
        const record = read(token); if (record.status !== 'confirmed') return fail('cancelled');
        if (record.revision !== revision) return fail('conflict');
        check(draft, contact); return save({ ...record, draft: structuredClone(draft), contact: structuredClone(contact), revision: record.revision + 1 });
      },
      cancel(token, revision) {
        const record = read(token); if (record.status === 'cancelled') return record;
        if (record.revision !== revision) return fail('conflict');
        return save({ ...record, status: 'cancelled', revision: record.revision + 1 });
      },
      clear,
      durable: () => persistent
    });
  }
  return Object.freeze({ createAdapter, TTL });
});

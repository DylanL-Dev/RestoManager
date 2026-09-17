'use strict';

const assert = require('assert');
const AdminAuth = require('../admin-auth.js');
const values = new Map();
const storage = {
    getItem: function (key) { return values.has(key) ? values.get(key) : null; },
    setItem: function (key, value) { values.set(key, value); },
    removeItem: function (key) { values.delete(key); },
};

(async function () {
    const pin = 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const invalidPin = pin + '-invalid';
    assert.throws(function () { AdminAuth.requireSession(); });
    await AdminAuth.configure(pin, pin, storage);
    const stored = storage.getItem(AdminAuth.STORAGE_KEY);
    assert.equal(stored.includes(pin), false);
    AdminAuth.logout();
    assert.equal(await AdminAuth.authenticate(invalidPin, storage), false);
    assert.equal(await AdminAuth.authenticate(pin, storage), true);
    AdminAuth.requireSession();
    AdminAuth.logout();
    assert.throws(function () { AdminAuth.requireSession(); });
    console.log('admin-auth: PIN haché, session et protections validés');
})().catch(function (error) { console.error(error); process.exitCode = 1; });

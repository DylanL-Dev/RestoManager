'use strict';

/* Protection locale uniquement : l'empreinte ralentit l'accès occasionnel,
   mais ne remplace pas une authentification serveur contre une personne ayant
   accès aux fichiers du site ou aux outils développeur. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.AdminAuth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const STORAGE_KEY = 'restomanager_admin_config';
    let authenticated = false;

    function subtle() {
        if (!globalThis.crypto || !globalThis.crypto.subtle) {
            throw new Error('Web Crypto n’est pas disponible dans ce navigateur.');
        }
        return globalThis.crypto.subtle;
    }

    function bytesToBase64(bytes) {
        let binary = '';
        bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
        return btoa(binary);
    }

    function base64ToBytes(value) {
        return Uint8Array.from(atob(value), function (char) { return char.charCodeAt(0); });
    }

    async function derive(pin, salt) {
        const encoder = new TextEncoder();
        const material = await subtle().importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
        const bits = await subtle().deriveBits({ name: 'PBKDF2', salt: salt, iterations: 210000, hash: 'SHA-256' }, material, 256);
        return bytesToBase64(new Uint8Array(bits));
    }

    function readConfig(storage) {
        try {
            const value = storage.getItem(STORAGE_KEY);
            const config = value ? JSON.parse(value) : null;
            return config && config.salt && config.hash ? config : null;
        } catch (error) {
            return null;
        }
    }

    function validatePin(pin) {
        return typeof pin === 'string' && pin.length >= 6 && pin.length <= 128;
    }

    async function configure(pin, confirmation, storage) {
        if (readConfig(storage)) throw new Error('Un administrateur est déjà configuré.');
        if (!validatePin(pin)) throw new Error('Le PIN doit contenir au moins 6 caractères.');
        if (pin !== confirmation) throw new Error('Les deux PIN ne correspondent pas.');
        const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
        storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, salt: bytesToBase64(salt), hash: await derive(pin, salt) }));
        authenticated = true;
        return true;
    }

    async function authenticate(pin, storage) {
        const config = readConfig(storage);
        if (!config || !validatePin(pin)) return false;
        const derived = await derive(pin, base64ToBytes(config.salt));
        authenticated = derived === config.hash;
        return authenticated;
    }

    async function changePin(currentPin, newPin, confirmation, storage) {
        if (!authenticated || !(await authenticate(currentPin, storage))) throw new Error('PIN administrateur actuel invalide.');
        authenticated = false;
        storage.removeItem(STORAGE_KEY);
        return configure(newPin, confirmation, storage);
    }

    function logout() { authenticated = false; }
    function isAuthenticated() { return authenticated; }
    function requireSession() {
        if (!authenticated) throw new Error('Cette opération requiert le mode administrateur.');
    }

    return { STORAGE_KEY: STORAGE_KEY, readConfig: readConfig, configure: configure,
        authenticate: authenticate, changePin: changePin, logout: logout,
        isAuthenticated: isAuthenticated, requireSession: requireSession };
});

/* Passphrase-protected default data.
 * data/bundle.enc.json holds the gzipped bundle encrypted with AES-256-GCM; the key is derived from
 * a passphrase with PBKDF2-SHA-256. Decryption happens only in the viewer's browser, so the hosting
 * site (e.g. GitHub Pages) stores nothing readable. Made by tools/build_site.mjs. */
const Lock = (() => {
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function decrypt(enc, pass) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: enc.kdf.hash, salt: b64(enc.kdf.salt), iterations: enc.kdf.iterations },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ciphertext));
    return JSON.parse(await U.blobText(new Blob([plain])));
  }

  /** Shows the passphrase screen; resolves with the decrypted bundle, or null if the viewer skips. */
  function ask(enc) {
    return new Promise(resolve => {
      const input = U.h('input', { type: 'password', placeholder: 'Passphrase', autocomplete: 'current-password', spellcheck: 'false' });
      const msg = U.h('div', { class: 'lock-msg' });
      const go = U.h('button', { class: 'primary' }, 'Unlock');
      const skip = U.h('button', { class: 'linkish' }, 'Continue without the data');
      const box = U.h('div', { class: 'lock' }, U.h('div', { class: 'lock-card' },
        U.h('h2', {}, enc.title || 'Protected data'),
        U.h('p', {}, 'The results on this site are unpublished and stored encrypted. Enter the passphrase you were given; the data is decrypted only in this browser and kept here for later visits.'),
        U.h('form', { class: 'lock-form' }, input, go), msg, skip));
      const done = v => { box.remove(); resolve(v); };
      box.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        if (!input.value) return;
        go.disabled = true; msg.textContent = 'Decrypting…'; msg.className = 'lock-msg';
        try { done(await decrypt(enc, input.value)); }
        catch { msg.textContent = 'That passphrase did not work.'; msg.className = 'lock-msg err'; go.disabled = false; input.select(); }
      };
      skip.onclick = () => done(null);
      document.body.append(box);
      input.focus();
    });
  }

  return { decrypt, ask };
})();

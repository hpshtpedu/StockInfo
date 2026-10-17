// 私人自選股張數（和選填的損益兩平價）：只存在這個瀏覽器，用密碼加密（Web Crypto：PBKDF2-SHA256 衍生金鑰 + AES-GCM）。
// localStorage 只放 salt、iv、密文；不放密碼、不放明文張數。解鎖後的金鑰放在 sessionStorage，
// 同一分頁重新整理不用再輸入；按「鎖定」或關掉分頁就要重新輸入（瀏覽器的「還原分頁」可能例外）。
// 張數不會送到任何伺服器，也不會進公開的 /quotes。
(() => {
  const VAULT = 'pv-vault-v1';
  const SESSION = 'pv-key-v1';
  const CODES = ['2330', '00685L', '0056', '00878'];
  const enc = new TextEncoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const store = (fn) => { try { return fn(); } catch { return null; } };

  async function pbkdf2(password, salt, iterations, usage) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
    if (usage === 'bits') {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
    }
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base,
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  // 密碼對不對：跟 private-verifier.json 的雜湊比（雜湊由 scripts/make_private_verifier.py 離線產生）
  async function verify(password) {
    const res = await fetch('private-verifier.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('尚未設定密碼');
    const v = await res.json();
    const got = new Uint8Array(await pbkdf2(password, unb64(v.salt), v.iterations, 'bits'));
    const want = unb64(v.hash);
    let diff = got.length ^ want.length;
    for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got[i] ^ want[i];
    return diff === 0;
  }

  async function sessionKey() {
    const raw = store(() => sessionStorage.getItem(SESSION));
    if (!raw) return null;
    return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async function readLots() {
    const key = await sessionKey();
    const vault = store(() => JSON.parse(localStorage.getItem(VAULT)));
    if (!key || !vault?.ct) return key ? {} : null;
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.ct));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch {
      return null;
    }
  }

  // lots：{代號: 張數}；cost：{代號: 損益兩平價}（選填，0 或空白＝不算總損益），一起加密存
  async function saveLots(lots, cost = {}) {
    const key = await sessionKey();
    if (!key) throw new Error('尚未解鎖');
    const clean = { cost: {} };
    for (const c of CODES) {
      const n = Number(lots[c] ?? 0);
      if (!Number.isFinite(n) || n < 0 || n > 1e6 || Math.round(n * 1000) !== n * 1000) throw new Error(`${c} 張數不正確`);
      clean[c] = n;
      const p = Number(cost[c] ?? 0);
      if (!Number.isFinite(p) || p < 0 || p > 1e5) throw new Error(`${c} 兩平價不正確`);
      if (p > 0) clean.cost[c] = Math.round(p * 10000) / 10000;
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));  // 每次存都用新的 IV
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(clean)));
    const vault = store(() => JSON.parse(localStorage.getItem(VAULT))) ?? {};
    const ok = store(() => { localStorage.setItem(VAULT, JSON.stringify({ ...vault, v: 1, iv: b64(iv), ct: b64(ct) })); return true; });
    if (!ok) throw new Error('瀏覽器不允許儲存');
  }

  function lock() { store(() => sessionStorage.removeItem(SESSION)); }
  const unlocked = () => !!store(() => sessionStorage.getItem(SESSION));

  window.PrivateVault = {
    CODES,
    unlocked,
    lock,
    readLots,
    saveLots,
    // 密碼正確後：用這台裝置自己的 salt 衍生加密金鑰，存進 sessionStorage
    async unlock(password) {
      if (!(await verify(password))) return false;
      let vault = store(() => JSON.parse(localStorage.getItem(VAULT)));
      const salt = vault?.salt ? unb64(vault.salt) : crypto.getRandomValues(new Uint8Array(16));
      const key = await pbkdf2(password, salt, 300000);
      if (!vault?.salt) {
        vault = { v: 1, salt: b64(salt) };
        store(() => localStorage.setItem(VAULT, JSON.stringify(vault)));
      }
      const raw = await crypto.subtle.exportKey('raw', key);
      store(() => sessionStorage.setItem(SESSION, b64(raw)));
      return true;
    },
  };
})();

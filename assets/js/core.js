/* ==========================================================================
   PATRA core — dipakai landing page & panel admin
   - api(): fetch ke GAS dengan timeout, retry baca, reqId idempoten untuk tulis
   - Store: localStorage bernamespace + versi skema (aman bila diblokir)
   - Perf: catatan waktu total vs server  → ketik Perf.table() di console
   - Ikon SVG inline (tanpa pustaka eksternal), toast, util format
   ========================================================================== */
(function (w) {
  'use strict';
  const CFG = w.PATRA_CONFIG || { GAS_URL: '', FALLBACK: {} };
  const GAS_URL = String(CFG.GAS_URL || '').trim();
  const DEMO = !GAS_URL;
  const JS_BASE = ((document.currentScript && document.currentScript.src) || '').replace(/core\.js.*$/, '');

  /* ---------- Penyimpanan lokal ---------- */
  const LS_PREFIX = 'patra:v1:';
  const Store = {
    get(k, d) { try { const v = localStorage.getItem(LS_PREFIX + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) {
      const s = JSON.stringify(v);
      try { localStorage.setItem(LS_PREFIX + k, s); }
      catch (e) {
        try { Object.keys(localStorage).filter(x => x.indexOf(LS_PREFIX + 'u:') === 0).forEach(x => localStorage.removeItem(x)); localStorage.setItem(LS_PREFIX + k, s); } catch (e2) { /* jalan tanpa cache */ }
      }
    },
    del(k) { try { localStorage.removeItem(LS_PREFIX + k); } catch (e) {} },
    clearPrefix(p) { try { Object.keys(localStorage).filter(x => x.indexOf(LS_PREFIX + p) === 0).forEach(x => localStorage.removeItem(x)); } catch (e) {} }
  };
  const Session = {
    get(k, d) { try { const v = sessionStorage.getItem(LS_PREFIX + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { sessionStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { sessionStorage.removeItem(LS_PREFIX + k); } catch (e) {} }
  };
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length; }

  /* ---------- Pengukur performa ---------- */
  const Perf = {
    rows: [],
    add(action, total, server) {
      this.rows.push({ action, total, server: server == null ? null : server, net: server == null ? null : total - server, at: new Date().toLocaleTimeString() });
      if (this.rows.length > 200) this.rows.shift();
    },
    table() { console.table(this.rows.slice(-30)); }
  };

  /* ---------- API ---------- */
  const READ_ACTIONS = /^(content|adminBootstrap|importData)$/;
  const uuid = () => (w.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  let tokenProvider = () => '';
  let onAuthExpired = () => {};

  async function apiOnce(action, data, timeout, reqId) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout), t0 = performance.now();
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },          // tanpa CORS preflight
        body: JSON.stringify({ action, token: tokenProvider() || '', reqId, data: data || {} })
      });
      const text = await res.text();
      try { const j = JSON.parse(text); Perf.add(action, Math.round(performance.now() - t0), j.ms); return j; }
      catch (e) { return { success: false, network: true, retryable: res.status >= 500 || res.status === 429, message: 'Server membalas HTTP ' + res.status + ' (bukan JSON). Periksa deployment Apps Script.' }; }
    } catch (err) {
      return { success: false, network: true, retryable: true, message: err.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Koneksi terputus. Periksa internet Anda.' };
    } finally { clearTimeout(timer); }
  }
  function waitOnline(ms) {
    return new Promise(r => {
      if (navigator.onLine !== false) return r();
      const t = setTimeout(done, ms);
      function done() { clearTimeout(t); removeEventListener('online', done); r(); }
      addEventListener('online', done);
    });
  }
  async function api(action, data, opt) {
    opt = opt || {};
    if (DEMO) { await loadDemo(); const t0 = performance.now(); const r = await w.PatraDemo.handle(action, data || {}, tokenProvider()); Perf.add(action, Math.round(performance.now() - t0), r.ms); return r; }
    const isRead = READ_ACTIONS.test(action);
    const reqId = isRead ? '' : (opt.reqId || uuid());
    const tries = isRead ? 3 : 2;
    let res;
    for (let i = 0; i < tries; i++) {
      if (i) { await new Promise(r => setTimeout(r, 1200 * i)); if (navigator.onLine === false) await waitOnline(15000); }
      res = await apiOnce(action, data, isRead ? (i ? 40000 : 25000) : 60000, reqId);
      if (res.success || !res.retryable) break;
    }
    if (!res.success && res.data && res.data.code === 'AUTH') onAuthExpired(res);
    return res;
  }
  /** GET konten publik (tanpa body) — cepat & bisa di-cache browser lain. */
  async function getContent() {
    if (DEMO) return api('content');
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 20000), t0 = performance.now();
    try {
      const res = await fetch(GAS_URL + '?action=content&_=' + Date.now(), { redirect: 'follow', signal: ctrl.signal });
      const j = await res.json(); Perf.add('content', Math.round(performance.now() - t0), j.ms); return j;
    } catch (e) { return { success: false, network: true, message: 'Gagal memuat konten.' }; }
    finally { clearTimeout(timer); }
  }
  /** Kirim tanpa menunggu (klik tombol) — tidak menahan perpindahan halaman. */
  function beacon(action, data) {
    const body = JSON.stringify({ action, data: data || {} });
    if (DEMO) { loadDemo().then(() => w.PatraDemo.handle(action, data || {})); return; }
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(GAS_URL, new Blob([body], { type: 'text/plain;charset=utf-8' }))) return;
    } catch (e) {}
    fetch(GAS_URL, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body }).catch(() => {});
  }
  function warmUp() { if (!DEMO) fetch(GAS_URL + '?ping=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); }

  let demoP = null;
  function loadDemo() {
    if (w.PatraDemo) return Promise.resolve();
    if (demoP) return demoP;
    return (demoP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = JS_BASE + 'demo.js';
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }));
  }

  /** Muat skrip eksternal sekali (lazy-load pustaka berat). */
  const _scripts = {};
  function loadScript(url) {
    if (_scripts[url]) return _scripts[url];
    return (_scripts[url] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = url; s.async = true; s.onload = res;
      s.onerror = () => { delete _scripts[url]; rej(new Error('Gagal memuat ' + url)); };
      document.head.appendChild(s);
    }));
  }

  /* ---------- Ikon ---------- */
  const ICONS = {
    'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    'arrow-up-right': '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'minus': '<path d="M5 12h14"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 5-5"/>',
    'menu': '<path d="M4 7h16M4 12h16M4 17h16"/>',
    'whatsapp': '<path d="M3.5 20.5 4.8 16A8.5 8.5 0 1 1 8 19.2Z"/><path d="M9 8.6c.2-.5.5-.6.8-.6h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.7l-.5.6c-.1.2-.1.4 0 .6.6 1.1 1.5 2 2.6 2.6.2.1.4.1.6 0l.6-.5c.2-.2.5-.2.7-.1l1.6.7c.3.1.4.3.4.5v.5c0 .3-.1.6-.6.8-.6.3-1.6.5-2.9-.1a9.3 9.3 0 0 1-4.6-4.6C8.5 10.2 8.7 9.2 9 8.6Z"/>',
    'message': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    'phone': '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'star': '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/>',
    'sparkle': '<path d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10C7.4 11.4 11.4 7.4 12 2Z"/>',
    'nfc': '<path d="M6 8.3a7.4 7.4 0 0 1 0 7.4"/><path d="M9.5 6.2a11.8 11.8 0 0 1 0 11.6"/><path d="M12.9 4.1a15.9 15.9 0 0 1 0 15.8"/><path d="M16.4 2a20.2 20.2 0 0 1 0 20"/>',
    'qr': '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17.5 21H21v-3.5"/>',
    'smartphone': '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
    'tap': '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10"/><path d="M12 9.5a1.5 1.5 0 0 1 3 0v1"/><path d="M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.7 15a1.5 1.5 0 0 1 2.4-1.8L9 16"/><path d="M5 5.5a5 5 0 0 1 8.5-3.2"/>',
    'zap': '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    'shield': '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    'gem': '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6z"/>',
    'store': '<path d="M3 9 4.5 4h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 11.5V20h14v-8.5"/><path d="M10 20v-5h4v5"/>',
    'utensils': '<path d="M4 2v7a3 3 0 0 0 6 0V2M7 2v20"/><path d="M20 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2zm0 0v7"/>',
    'coffee': '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
    'bed': '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20"/><path d="M6 8v9"/>',
    'scissors': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    'stethoscope': '<path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15v1a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
    'wrench': '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.7-1.3a4 4 0 0 0-5-5l2.4 2.4-1.7 1.7z"/><path d="m3 21 6-6"/>',
    'frown': '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2M9 9h.01M15 9h.01"/>',
    'trending-up': '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    'inbox': '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    'dashboard': '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    'chart': '<path d="M3 3v18h18"/><path d="M7 15v-4M12 15V8M17 15v-6"/>',
    'pointer': '<path d="m9 9 5 12 1.8-5.2L21 14Z"/><path d="M7.2 2.2 8 5.1M5.1 8 2.2 7.2M14 4.1 12 6.2M6.2 12l-2.1 2"/>',
    'quote': '<path d="M3 21c3 0 7-1 7-8V5c0-1.3-.8-2-2-2H4c-1.3 0-2 .8-2 2v6c0 1.3.8 2 2 2h3c0 3-1 5-4 5zM15 21c3 0 7-1 7-8V5c0-1.3-.8-2-2-2h-4c-1.3 0-2 .8-2 2v6c0 1.3.8 2 2 2h3c0 3-1 5-4 5z"/>',
    'help': '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    'settings': '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.8l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    'history': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    'logout': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    'pencil': '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    'trash': '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    'filter': '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20"/>',
    'refresh': '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    'lock': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'key': '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    'grip': '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    'arrow-up': '<path d="m5 12 7-7 7 7M12 19V5"/>',
    'arrow-down': '<path d="m19 12-7 7-7-7M12 5v14"/>',
    'alert': '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
    'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    'external': '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    'calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    'database': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
    'image': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    'instagram': '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.2"/><path d="M17.5 6.5h.01"/>',
    'tiktok': '<path d="M9 12a4 4 0 1 0 4 4V2c.5 3 2.8 5 6 5"/>',
    'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    'monitor': '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    'more': '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    'file': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
    'sheet': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'
  };
  function icon(name, cls) {
    const b = ICONS[name];
    if (!b) { console.warn('Ikon hilang:', name); return ''; }
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + b + '</svg>';
  }
  function hydrateIcons(root) {
    (root || document).querySelectorAll('i[data-ic]').forEach(el => {
      const t = document.createElement('template');
      t.innerHTML = icon(el.dataset.ic, el.className);
      if (t.content.firstChild) el.replaceWith(t.content.firstChild);
    });
  }

  /* ---------- Toast ---------- */
  function toast(title, msg, type) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) { stack = document.createElement('div'); stack.className = 'toast-stack'; stack.setAttribute('role', 'status'); stack.setAttribute('aria-live', 'polite'); document.body.appendChild(stack); }
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast--error' : '');
    el.innerHTML = icon(type === 'error' ? 'alert' : 'check-circle') + '<div><b>' + esc(title) + '</b>' + (msg ? esc(msg) : '') + '</div>';
    stack.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, type === 'error' ? 5200 : 3200);
  }

  /* ---------- Util ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function normWa(v) {
    let s = String(v == null ? '' : v).replace(/[^\d]/g, '');
    if (s.indexOf('62') === 0) return s;
    if (s.indexOf('0') === 0) return '62' + s.slice(1);
    if (s.indexOf('8') === 0) return '62' + s;
    return s;
  }
  function waLink(number, text) { return 'https://wa.me/' + normWa(number) + (text ? '?text=' + encodeURIComponent(text) : ''); }
  function fmtWa(v) { const s = normWa(v); return s ? '0' + s.slice(2).replace(/(\d{3})(\d{4})(\d+)/, '$1-$2-$3') : ''; }
  function isMobile() { return w.matchMedia('(max-width: 767px)').matches; }
  function debounce(fn, ms) { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); }; }
  const fmtNum = n => new Intl.NumberFormat('id-ID').format(n || 0);
  const fmtDate = (d, opt) => { const x = new Date(d); return isNaN(x) ? '-' : x.toLocaleDateString('id-ID', opt || { day: '2-digit', month: 'short', year: 'numeric' }); };
  const fmtTime = d => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); };
  function fmtRel(d) {
    const x = new Date(d); if (isNaN(x)) return '-';
    const diff = (Date.now() - x) / 1000;
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return Math.floor(diff / 60) + ' mnt lalu';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (x >= today) return 'Hari ini, ' + fmtTime(x);
    const y = new Date(today); y.setDate(y.getDate() - 1);
    if (x >= y) return 'Kemarin, ' + fmtTime(x);
    return fmtDate(x) + ', ' + fmtTime(x);
  }

  w.Patra = { CFG, GAS_URL, DEMO, Store, Session, Perf, api, getContent, beacon, warmUp, loadScript, icon, hydrateIcons, toast, esc, normWa, waLink, fmtWa, isMobile, debounce, fmtNum, fmtDate, fmtTime, fmtRel, hashStr, uuid,
    setTokenProvider(fn) { tokenProvider = fn; }, setAuthExpired(fn) { onAuthExpired = fn; } };
  w.Perf = Perf;
})(window);

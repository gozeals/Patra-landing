/* ==========================================================================
   MODE DEMO — meniru API Apps Script di browser (data contoh di localStorage)
   Aktif otomatis bila GAS_URL di config.js masih kosong.
   Login demo:  admin@patra.id / demo1234  (Admin)  ·  cs@patra.id / demo1234 (Staf)
   ========================================================================== */
(function (w) {
  'use strict';
  const KEY = 'patra:demo:db:v1';
  const F = (w.PATRA_CONFIG || {}).FALLBACK || {};
  const STATUS = ['Baru', 'Dihubungi', 'Closing', 'Batal'];
  const JENIS = ['Restoran', 'Kafe', 'Hotel', 'Toko / Retail', 'Salon & Barbershop', 'Klinik', 'Bengkel', 'Lainnya'];
  const POSISI = ['navbar', 'hero', 'cara-kerja', 'cta', 'mengambang', 'footer', 'kontak', 'form-sukses', 'menu-hp'];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function seed() {
    const r = rnd(42), now = Date.now(), day = 864e5;
    const names = ['Bambang Sutedja', 'Siti Rahmawati', 'David Pratama', 'Ayu Lestari', 'Rizky Hidayat', 'Maya Putri', 'Andi Wijaya', 'Fitri Handayani', 'Yoga Saputra', 'Nadia Kusuma', 'Hendra Gunawan', 'Larasati Dewi', 'Fajar Nugroho', 'Citra Maharani', 'Bagus Permana', 'Intan Permata', 'Dewa Ketut', 'Rina Marlina', 'Teguh Santoso', 'Anisa Rahma'];
    const biz = ['Kopi Botanika', 'Atelier Serene Studio', 'Nusantara Logistics', 'Warung Nasi Bu Ayu', 'Barber Kingdom', 'Klinik Sehat Prima', 'Hotel Cendana', 'Toko Roti Mentari', 'Bengkel Jaya Motor', 'Salon Cantik Ayu', 'Resto Padang Sederhana', 'Kafe Senja', 'Villa Ubud Asri', 'Apotek Waras', 'Laundry Bersih'];
    const leads = [];
    for (let i = 0; i < 64; i++) {
      const t = now - Math.floor(r() * 75 * day) - (i < 4 ? 0 : 3600e3);
      const st = i < 6 ? 'Baru' : STATUS[Math.floor(r() * 4)];
      leads.push({ id: 'L' + (1000 + i), t: new Date(i < 3 ? now - i * 2.5 * 3600e3 : t).toISOString(), nama: names[i % names.length], bisnis: biz[Math.floor(r() * biz.length)],
        jenis: JENIS[Math.floor(r() * 7)], wa: '6281' + String(200000000 + Math.floor(r() * 799999999)).slice(0, 9), email: i % 3 ? '' : 'kontak' + i + '@contoh.id',
        pesan: i % 2 ? 'Mau tanya harga untuk 5 kartu, apakah bisa custom logo?' : 'Tertarik untuk cabang kami, mohon info lebih lanjut.', status: st,
        catatan: st === 'Closing' ? 'Sudah order via Lynk.id' : '', oleh: st === 'Baru' ? '' : 'Admin PATRA', sumber: 'Form Website', u: new Date(t).toISOString() });
    }
    leads.sort((a, b) => (a.t < b.t ? 1 : -1));
    const clicks = [];
    const posW = [0.42, 0.08, 0.1, 0.14, 0.18, 0.03, 0.02, 0.01, 0.02];
    for (let i = 0; i < 1400; i++) {
      const t = now - Math.floor(Math.pow(r(), 1.3) * 90 * day);
      let x = r(), p = 0; while (p < posW.length - 1 && x > posW[p]) { x -= posW[p]; p++; }
      clicks.push([t, r() < 0.74 ? 'p' : 'w', POSISI[p], r() < 0.68 ? 'm' : 'd', r() < 0.5 ? 'instagram.com' : (r() < 0.5 ? 'google.com' : '')]);
    }
    clicks.sort((a, b) => b[0] - a[0]);
    const logs = [
      { t: new Date(now - 3600e3).toISOString(), email: 'admin@patra.id', aksi: 'LOGIN', detail: 'Admin' },
      { t: new Date(now - 2 * 3600e3).toISOString(), email: 'cs@patra.id', aksi: 'UBAH_LEAD', detail: 'L1010 → Dihubungi' },
      { t: new Date(now - day).toISOString(), email: 'admin@patra.id', aksi: 'SIMPAN_PENGATURAN', detail: 'LINK_LYNK' }
    ];
    return {
      leads, clicks, logs,
      testimoni: (F.testimoni || []).map((t, i) => Object.assign({ id: 'T' + (i + 1), tampil: true, urutan: i + 1 }, t)),
      faq: (F.faq || []).map((f, i) => ({ id: 'F' + (i + 1), q: f.q, a: f.a, urutan: i + 1, aktif: true })),
      settings: Object.keys(F.settings || {}).map(k => ({ k, v: F.settings[k], d: '' })).concat([{ k: 'EMAIL_ADMIN', v: 'admin@patra.id', d: '' }, { k: 'AUTO_REPLY', v: 'Ya', d: '' }]),
      users: [
        { email: 'admin@patra.id', nama: 'Admin PATRA', peran: 'Admin', aktif: true, last: new Date(now - 3600e3).toISOString(), pass: 'demo1234' },
        { email: 'cs@patra.id', nama: 'Rani (CS)', peran: 'Staf', aktif: true, last: new Date(now - 2 * 3600e3).toISOString(), pass: 'demo1234' }
      ]
    };
  }

  let db;
  function load() { if (db) return db; try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} if (!db || !db.leads) { db = seed(); save(); } return db; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  const ok = d => ({ success: true, data: d, ms: 40 + Math.floor(Math.random() * 60) });
  const fail = (m, d) => ({ success: false, message: m, data: d || null, ms: 30 });
  const tok = u => btoa(JSON.stringify({ e: u.email, r: u.peran, n: u.nama, x: Date.now() + 8 * 3600e3 }));
  function who(t) { try { const p = JSON.parse(atob(t)); return p.x > Date.now() ? { email: p.e, role: p.r, name: p.n } : null; } catch (e) { return null; } }
  const set = () => { const m = {}; load().settings.forEach(s => m[s.k] = s.v); return m; };

  function boot(me) {
    const d = load();
    const out = { leads: d.leads, clicks: d.clicks, testimoni: d.testimoni, faq: d.faq, settings: d.settings, users: d.users.map(u => ({ email: u.email, nama: u.nama, peran: u.peran, aktif: u.aktif, last: u.last })), logs: d.logs,
      meta: { status: STATUS, jenis: JENIS, posisi: POSISI }, me, serverTime: Date.now() };
    if (me.role !== 'Admin') { delete out.users; delete out.logs; delete out.settings; }
    return out;
  }
  const log = (email, aksi, detail) => { load().logs.unshift({ t: new Date().toISOString(), email, aksi, detail: detail || '' }); };

  async function handle(action, d, token) {
    await sleep(action === 'trackClick' ? 0 : 220 + Math.random() * 260);
    const data = load(), me = who(token);
    const need = lvl => !me ? fail('Sesi berakhir.', { code: 'AUTH' }) : (lvl === 'admin' && me.role !== 'Admin' ? fail('Akses ditolak.', { code: 'FORBIDDEN' }) : null);
    let g;
    switch (action) {
      case 'content': {
        const s = set(), pub = {};
        Object.keys(F.settings || {}).forEach(k => pub[k] = s[k] !== undefined ? s[k] : F.settings[k]);
        return ok({ v: 'demo', settings: pub, faq: data.faq.filter(f => f.aktif).sort((a, b) => a.urutan - b.urutan).map(f => ({ q: f.q, a: f.a })),
          testimoni: data.testimoni.filter(t => t.tampil).sort((a, b) => a.urutan - b.urutan).map(t => ({ nama: t.nama, bisnis: t.bisnis, jenis: t.jenis, isi: t.isi, rating: t.rating, foto: t.foto })) });
      }
      case 'submitLead': {
        if (d.website) return ok({ id: 'ok' });
        const errors = {};
        if (!d.nama || d.nama.trim().length < 2) errors.nama = 'Nama wajib diisi (min. 2 karakter).';
        if (!d.bisnis || d.bisnis.trim().length < 2) errors.bisnis = 'Nama bisnis wajib diisi.';
        if (!d.jenis) errors.jenis = 'Pilih jenis usaha.';
        if (!/^62\d{8,13}$/.test(Patra.normWa(d.wa))) errors.wa = 'Nomor WhatsApp tidak valid (contoh: 0812xxxxxxx).';
        if (Object.keys(errors).length) return fail('Periksa kembali isian Anda.', { errors });
        const id = 'L' + Date.now().toString().slice(-6);
        data.leads.unshift({ id, t: new Date().toISOString(), nama: d.nama, bisnis: d.bisnis, jenis: d.jenis, wa: Patra.normWa(d.wa), email: d.email || '', pesan: d.pesan || '', status: 'Baru', catatan: '', oleh: '', sumber: 'Form Website', u: new Date().toISOString() });
        save(); return ok({ id });
      }
      case 'trackClick':
        data.clicks.unshift([Date.now(), d.jenis === 'wa' ? 'w' : 'p', d.posisi || 'lainnya', d.perangkat === 'mobile' ? 'm' : 'd', d.ref || '']); save(); return ok({});
      case 'login': {
        const u = data.users.find(x => x.email === String(d.email || '').toLowerCase().trim());
        if (!u || !u.aktif || u.pass !== d.password) return fail('Email atau password salah. (Demo: admin@patra.id / demo1234)', { code: 'BAD_LOGIN' });
        u.last = new Date().toISOString(); log(u.email, 'LOGIN', u.peran); save();
        const s = { email: u.email, role: u.peran, name: u.nama };
        return ok({ token: tok(u), user: s, exp: Date.now() + 8 * 3600e3, boot: boot(s) });
      }
      case 'adminBootstrap': if ((g = need('staf'))) return g; return ok(boot(me));
      case 'updateLead': {
        if ((g = need('staf'))) return g;
        const l = data.leads.find(x => x.id === d.id); if (!l) return fail('Lead tidak ditemukan.');
        if (d.status !== undefined) l.status = d.status; if (d.catatan !== undefined) l.catatan = d.catatan;
        l.oleh = me.name; l.u = new Date().toISOString(); log(me.email, 'UBAH_LEAD', d.id + (d.status ? ' → ' + d.status : '')); save();
        return ok({ id: l.id, oleh: l.oleh, u: l.u });
      }
      case 'deleteLead': if ((g = need('admin'))) return g; data.leads = data.leads.filter(x => x.id !== d.id); log(me.email, 'HAPUS_LEAD', d.id); save(); return ok({});
      case 'saveItem': {
        if ((g = need('admin'))) return g;
        const list = d.type === 'faq' ? data.faq : data.testimoni, it = Object.assign({}, d.item);
        let id = it.id;
        const ex = id && list.find(x => x.id === id);
        if (ex) Object.assign(ex, it); else { id = (d.type === 'faq' ? 'F' : 'T') + Date.now().toString(36).toUpperCase(); list.push(Object.assign(it, { id, urutan: list.length + 1 })); }
        log(me.email, 'SIMPAN_' + d.type.toUpperCase(), id); save(); return ok({ id });
      }
      case 'deleteItem': {
        if ((g = need('admin'))) return g;
        const k = d.type === 'faq' ? 'faq' : 'testimoni'; data[k] = data[k].filter(x => x.id !== d.id); log(me.email, 'HAPUS_' + d.type.toUpperCase(), d.id); save(); return ok({});
      }
      case 'reorder': {
        if ((g = need('admin'))) return g;
        const list = d.type === 'faq' ? data.faq : data.testimoni; d.ids.forEach((id, i) => { const x = list.find(y => y.id === id); if (x) x.urutan = i + 1; }); save(); return ok({});
      }
      case 'uploadPhoto': if ((g = need('admin'))) return g; return ok({ url: d.dataUrl });
      case 'saveSettings': {
        if ((g = need('admin'))) return g;
        const errors = {};
        Object.keys(d.settings || {}).forEach(k => {
          const v = d.settings[k];
          if (k === 'LINK_LYNK' && !/^https:\/\/\S+$/i.test(v)) errors[k] = 'Link harus diawali https://';
          if (k === 'NO_WA_ADMIN' && !/^62\d{8,13}$/.test(Patra.normWa(v))) errors[k] = 'Nomor WhatsApp tidak valid.';
        });
        if (Object.keys(errors).length) return fail('Periksa kembali pengaturan.', { errors });
        Object.keys(d.settings || {}).forEach(k => { const v = k === 'NO_WA_ADMIN' ? Patra.normWa(d.settings[k]) : d.settings[k]; const s = data.settings.find(x => x.k === k); if (s) s.v = v; else data.settings.push({ k, v, d: '' }); });
        log(me.email, 'SIMPAN_PENGATURAN', Object.keys(d.settings || {}).join(', ')); save(); return ok({});
      }
      case 'manageUser': {
        if ((g = need('admin'))) return g;
        const email = String(d.email || '').toLowerCase().trim(); const u = data.users.find(x => x.email === email);
        if (d.op === 'add') {
          if (u) return fail('Email sudah terdaftar.'); if (!d.password || d.password.length < 8) return fail('Password sementara minimal 8 karakter.');
          data.users.push({ email, nama: d.nama || email, peran: d.peran === 'Admin' ? 'Admin' : 'Staf', aktif: true, last: '', pass: d.password });
        } else if (!u) return fail('Pengguna tidak ditemukan.');
        else if (email === me.email && d.op === 'toggle') return fail('Anda tidak bisa menonaktifkan akun sendiri.');
        else if (d.op === 'toggle') u.aktif = !u.aktif;
        else if (d.op === 'update') { u.nama = d.nama || u.nama; u.peran = d.peran; }
        else if (d.op === 'reset') { if (!d.password || d.password.length < 8) return fail('Password minimal 8 karakter.'); u.pass = d.password; }
        log(me.email, 'PENGGUNA_' + String(d.op).toUpperCase(), email); save(); return ok({});
      }
      case 'changePassword': {
        if ((g = need('staf'))) return g;
        const u = data.users.find(x => x.email === me.email); if (!u || u.pass !== d.old) return fail('Password lama salah.');
        if (!d.password || d.password.length < 8) return fail('Password baru minimal 8 karakter.'); u.pass = d.password; save(); return ok({});
      }
      case 'importData':
        if ((g = need('admin'))) return g;
        return ok({ source: { name: 'Spreadsheet contoh (demo)', id: 'demo' }, dryRun: d.dryRun !== false,
          report: { Leads: { source: 12, inserted: 9, updated: 0, skipped: 3 }, Testimoni: { source: 4, inserted: 1, updated: 0, skipped: 3 }, FAQ: { source: 6, inserted: 0, updated: 0, skipped: 6 } },
          warnings: ['Mode demo: tidak ada data yang benar-benar diimpor.'] });
      default: return fail('Aksi tidak dikenal.');
    }
  }
  w.PatraDemo = { handle, reset() { localStorage.removeItem(KEY); db = null; } };
})(window);

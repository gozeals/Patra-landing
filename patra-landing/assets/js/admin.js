/* ==========================================================================
   PATRA — Panel Admin (SPA)
   - Router hash (#/halaman) → aman di iframe, tanpa reload, halaman tidak dibuang
   - Login mengembalikan seluruh data (1 panggilan); data dicache per user (SWR)
   - Filter/cari/urut/halaman dikerjakan lokal → pindah menu & data tanpa delay
   - Optimistic UI + rollback untuk ubah status, tampil/sembunyi, urutan
   ========================================================================== */
(function () {
  'use strict';
  const P = window.Patra;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = P.esc;
  const CDN = {
    chart: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
  };
  const COLORS = ['#14532D', '#1E7A46', '#75333E', '#C99A2E', '#5FA77A', '#B4F2C4', '#757873', '#A9C5B2'];
  const POS_LABEL = { navbar: 'Tombol navbar', hero: 'Hero', 'cara-kerja': 'Band Cara Kerja', cta: 'Band ajakan pesan', mengambang: 'Bar mengambang (HP)', footer: 'Footer', kontak: 'Bagian kontak', 'form-sukses': 'Setelah kirim form', 'menu-hp': 'Menu HP', lainnya: 'Lainnya' };
  const STATUS = ['Baru', 'Dihubungi', 'Closing', 'Batal'];
  const PAGE_SIZE = 15;
  const FRESH_MS = 60000;

  const S = {
    token: '', user: null, exp: 0,
    data: null, h: '', ver: 0, lastSync: 0, syncing: false,
    pages: {}, current: '', charts: {},
    v: {
      dash: { range: 30 },
      leads: { q: '', status: '', jenis: '', from: '', to: '', page: 1, sort: 't', dir: -1 },
      klik: { tab: 'p', pos: '', dev: '', range: 30, page: 1 },
      log: { q: '', aksi: '', page: 1 }
    }
  };

  P.hydrateIcons();
  P.setTokenProvider(() => S.token);
  P.setAuthExpired(() => { P.toast('Sesi berakhir', 'Silakan masuk kembali.', 'error'); logout(true); });
  if (P.DEMO) { const r = document.createElement('div'); r.className = 'demo-ribbon'; r.textContent = 'MODE DEMO — data contoh'; document.body.appendChild(r); }

  /* ======================= SESI & DATA ======================= */
  const bootKey = () => 'u:' + (S.user ? S.user.email : 'anon') + ':boot';
  const isAdmin = () => S.user && S.user.role === 'Admin';

  function start() {
    const s = P.Session.get('auth', null);
    if (s && s.token && s.exp > Date.now()) {
      Object.assign(S, { token: s.token, user: s.user, exp: s.exp });
      const c = P.Store.get(bootKey(), null);
      enterApp();
      if (c && c.data) setData(c.data);
      refresh(!c || Date.now() - c.t > FRESH_MS);
    } else showLogin();
    P.warmUp();
  }

  function setData(d) {
    const h = P.hashStr(JSON.stringify(d));
    if (h === S.h) return false;
    S.h = h; S.data = d; S.ver++;
    updateBadges();
    renderCurrent();
    return true;
  }
  /** Simpan perubahan lokal (optimistic) ke state + cache, lalu render. */
  function commitLocal() {
    S.ver++;
    P.Store.set(bootKey(), { t: Date.now(), data: S.data });
    updateBadges();
    renderCurrent();
  }

  async function refresh(force) {
    if (S.syncing || !S.token) return;
    if (!force && Date.now() - S.lastSync < FRESH_MS) return;
    S.syncing = true; setSync('busy');
    const res = await P.api('adminBootstrap');
    S.syncing = false;
    if (res.success) {
      S.lastSync = Date.now();
      P.Store.set(bootKey(), { t: Date.now(), data: res.data });
      setData(res.data);
      setSync('ok');
    } else {
      setSync('off');
      if (!S.data) renderError(res.message);
      else if (force) P.toast('Gagal menyegarkan data', res.message, 'error');
    }
  }
  function setSync(st) {
    const el = $('#syncState'), side = $('#sideStatus');
    el.classList.toggle('busy', st === 'busy');
    side.classList.toggle('off', st === 'off');
    const txt = st === 'busy' ? 'Menyinkronkan…' : st === 'off' ? 'Offline — data tersimpan' : 'Tersinkron ' + P.fmtTime(Date.now());
    $('#syncText').textContent = txt; $('#sideStatusText').textContent = st === 'busy' ? 'Sinkronisasi…' : st === 'off' ? 'Offline' : 'Tersinkron';
  }

  // Polling hemat: hanya saat tab terlihat
  setInterval(() => { if (document.visibilityState === 'visible') refresh(false); }, FRESH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(false); });

  /* ======================= LOGIN ======================= */
  function showLogin() {
    $('#appView').hidden = true; $('#loginView').hidden = false;
    $('#demoHint').hidden = !P.DEMO;
    setTimeout(() => $('#lEmail').focus(), 50);
  }
  $$('[data-pw]').forEach(b => b.addEventListener('click', () => togglePw(b)));
  function togglePw(b) {
    const i = document.getElementById(b.dataset.pw), show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    b.innerHTML = P.icon(show ? 'eye-off' : 'eye'); b.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
  }
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#lEmail').value.trim(), password = $('#lPass').value, err = $('#loginError'), btn = $('#loginBtn');
    err.hidden = true;
    if (!email || !password) { err.textContent = 'Email dan password wajib diisi.'; err.hidden = false; return; }
    const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Memeriksa…';
    const res = await P.api('login', { email, password });
    btn.disabled = false; btn.innerHTML = label;
    if (!res.success) { err.textContent = res.message || 'Gagal masuk.'; err.hidden = false; $('#lPass').select(); return; }
    Object.assign(S, { token: res.data.token, user: res.data.user, exp: res.data.exp, lastSync: Date.now() });
    P.Session.set('auth', { token: S.token, user: S.user, exp: S.exp });
    P.Store.set(bootKey(), { t: Date.now(), data: res.data.boot });
    $('#lPass').value = '';
    enterApp();
    setData(res.data.boot);
    setSync('ok');
    P.toast('Selamat datang, ' + S.user.name, '');
  });

  function logout(silent) {
    P.Session.del('auth');
    if (S.user) P.Store.del(bootKey());
    Object.keys(S.charts).forEach(k => { try { S.charts[k].destroy(); } catch (e) {} });
    Object.assign(S, { token: '', user: null, data: null, h: '', pages: {}, current: '', charts: {} });
    $('#pages').innerHTML = '';
    closeLayer();
    history.replaceState(null, '', location.pathname);
    showLogin();
    if (!silent) P.toast('Anda telah keluar', '');
  }

  /* ======================= SHELL & NAVIGASI ======================= */
  const MENU = [
    { id: 'dashboard', label: 'Dashboard', ic: 'dashboard' },
    { id: 'leads', label: 'Leads', ic: 'inbox', badge: true },
    { id: 'klik', label: 'Statistik Klik', ic: 'pointer' },
    { id: 'testimoni', label: 'Testimoni', ic: 'quote', admin: true },
    { id: 'faq', label: 'FAQ', ic: 'help', admin: true },
    { id: 'pengaturan', label: 'Pengaturan', ic: 'settings', admin: true },
    { id: 'pengguna', label: 'Pengguna', ic: 'users', admin: true },
    { id: 'log', label: 'Log Aktivitas', ic: 'history', admin: true }
  ];
  const allowed = () => MENU.filter(m => !m.admin || isAdmin());

  function enterApp() {
    $('#loginView').hidden = true; $('#appView').hidden = false;
    const initials = (S.user.name || S.user.email).split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    $('#userAv').textContent = initials; $('#userName').textContent = S.user.name; $('#userRole').textContent = S.user.role === 'Admin' ? 'Admin' : 'Staf CS';
    $('#sideNav').innerHTML = allowed().map(m => '<a class="nav-item" href="#/' + m.id + '" data-nav="' + m.id + '">' + P.icon(m.ic) + '<span>' + m.label + '</span>' + (m.badge ? '<span class="nav-badge" data-badge hidden>0</span>' : '') + '</a>').join('');
    const bn = ['dashboard', 'leads', 'klik'].map(id => MENU.find(m => m.id === id));
    $('#bottomNav').innerHTML = bn.map(m => '<a href="#/' + m.id + '" data-nav="' + m.id + '">' + P.icon(m.ic) + '<span>' + (m.id === 'klik' ? 'Statistik' : m.label) + '</span>' + (m.badge ? '<span class="nav-badge" data-badge hidden>0</span>' : '') + '</a>').join('') +
      '<button type="button" id="moreBtn" aria-label="Menu lainnya">' + P.icon('menu') + '<span>Menu</span></button>';
    $('#moreBtn').addEventListener('click', openMoreSheet);
    updateTheme();
    if (!location.hash) location.replace('#/dashboard'); else route();
  }

  function updateBadges() {
    const n = S.data ? S.data.leads.filter(l => l.status === 'Baru').length : 0;
    $$('[data-badge]').forEach(b => { b.textContent = n > 99 ? '99+' : n; b.hidden = !n; });
  }

  function openMoreSheet() {
    const items = allowed().filter(m => ['dashboard', 'leads', 'klik'].indexOf(m.id) === -1);
    const el = document.createElement('div');
    el.className = 'sheet-menu';
    el.innerHTML = '<div class="sheet-menu__panel menu-pop" style="position:static;box-shadow:none;border:0;animation:sheet-up .28s var(--ease-out)"><div class="sheet-menu__grab"></div>' +
      items.map(m => '<a href="#/' + m.id + '">' + P.icon(m.ic) + m.label + '</a>').join('') +
      '<hr><button type="button" data-act="password">' + P.icon('key') + 'Ganti password</button><button type="button" data-act="theme">' + P.icon('moon') + 'Mode gelap / terang</button>' +
      '<button type="button" class="danger" data-act="logout">' + P.icon('logout') + 'Keluar</button></div>';
    el.addEventListener('click', e => {
      const t = e.target;
      if (t === el || t.closest('a')) { el.remove(); return; }
      const b = t.closest('[data-act]'); if (!b) return;
      el.remove();
      if (b.dataset.act === 'logout') logout(); else if (b.dataset.act === 'password') openPassword(); else toggleTheme();
    });
    document.body.appendChild(el);
  }

  // Menu pengguna
  const userMenu = $('#userMenu'), userBtn = $('#userBtn');
  userBtn.addEventListener('click', e => { e.stopPropagation(); const open = userMenu.hidden; userMenu.hidden = !open; userBtn.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', e => { if (!userMenu.hidden && !e.target.closest('#userMenu')) { userMenu.hidden = true; userBtn.setAttribute('aria-expanded', 'false'); } });
  userMenu.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    userMenu.hidden = true;
    if (b.dataset.act === 'logout') logout(); else if (b.dataset.act === 'password') openPassword();
  });
  $('#refreshBtn').addEventListener('click', () => refresh(true));
  $('#themeBtn').addEventListener('click', toggleTheme);
  addEventListener('scroll', () => $('#topBar').classList.toggle('scrolled', scrollY > 4), { passive: true });

  function toggleTheme() {
    const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    P.Store.set('theme', dark ? 'dark' : 'light');
    updateTheme();
    Object.keys(S.charts).forEach(k => { try { S.charts[k].destroy(); } catch (e) {} delete S.charts[k]; });
    renderCurrent(true);
  }
  function updateTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    $('#themeBtn').innerHTML = P.icon(dark ? 'sun' : 'moon');
  }

  /* ======================= ROUTER ======================= */
  const PAGES = {};
  function route() {
    if (!S.user) return;
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    let name = parts[0] || 'dashboard';
    const ok = allowed().some(m => m.id === name);
    if (!ok) { name = 'dashboard'; history.replaceState(null, '', '#/dashboard'); }
    const def = PAGES[name];
    let el = S.pages[name];
    if (!el) {
      el = document.createElement('section'); el.className = 'page'; el.dataset.page = name;
      el.innerHTML = def.template(); P.hydrateIcons(el);
      def.init && def.init(el);
      $('#pages').appendChild(el); S.pages[name] = el;
    }
    Object.keys(S.pages).forEach(k => { S.pages[k].hidden = k !== name; });
    const changed = S.current !== name;
    S.current = name;
    $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
    const m = MENU.find(x => x.id === name);
    $('#topTitle').textContent = m ? m.label : 'Panel';
    document.title = (m ? m.label : 'Panel') + ' — Admin PATRA';
    if (changed) { el.classList.remove('page'); void el.offsetWidth; el.classList.add('page'); scrollTo(0, 0); }
    renderCurrent();
    closeLayer();
  }
  function renderCurrent(force) {
    const name = S.current, el = S.pages[name];
    if (!el || !S.data) { if (el && !S.data) skeleton(el); return; }
    if (!force && el.dataset.v === String(S.ver)) return;
    el.dataset.v = String(S.ver);
    try { PAGES[name].render(el); } catch (err) { console.error(err); }
  }
  function skeleton(el) {
    const box = $('[data-body]', el);
    if (box && !box.dataset.sk) { box.dataset.sk = '1'; box.innerHTML = '<div class="skel" style="height:120px;margin-bottom:12px"></div><div class="skel" style="height:280px"></div>'; }
  }
  function renderError(msg) {
    const el = S.pages[S.current]; if (!el) return;
    const box = $('[data-body]', el); if (!box) return;
    box.innerHTML = '<div class="panel empty">' + P.icon('alert') + '<b>Data belum bisa dimuat</b><span>' + esc(msg || '') + '</span><button class="btn btn--primary" type="button" data-retry>Coba lagi</button></div>';
    $('[data-retry]', box).addEventListener('click', () => refresh(true));
  }
  addEventListener('hashchange', route);

  /* ======================= UTIL TAMPILAN ======================= */
  const badge = s => '<span class="badge badge--' + String(s || 'baru').toLowerCase() + '">' + esc(s) + '</span>';
  const initials = n => String(n || '?').replace(/^(dr|drg|ir|h|hj)\.?\s+/i, '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const stars = r => '<span class="stars" aria-label="Rating ' + r + '">' + [1, 2, 3, 4, 5].map(i => P.icon('star', i <= r ? '' : 'off')).join('') + '</span>';
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  function trend(cur, prev) {
    if (!prev && !cur) return '<span>Belum ada data</span>';
    if (!prev) return '<span class="up">' + P.icon('trending-up', 'ic-sm') + ' baru</span><span>vs periode lalu</span>';
    const d = Math.round(((cur - prev) / prev) * 100);
    return '<span class="' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '') + d + '%</span><span>vs periode lalu</span>';
  }
  function paginate(list, page) {
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const p = Math.min(Math.max(1, page), pages);
    return { rows: list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), page: p, pages, total: list.length };
  }
  function pagerHtml(pg) {
    if (!pg.total) return '';
    const from = (pg.page - 1) * PAGE_SIZE + 1, to = Math.min(pg.total, pg.page * PAGE_SIZE);
    const nums = [];
    for (let i = 1; i <= pg.pages; i++) if (i === 1 || i === pg.pages || Math.abs(i - pg.page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
    return '<div class="pager"><span>Menampilkan ' + from + '–' + to + ' dari ' + P.fmtNum(pg.total) + '</span><div class="pager__btns">' +
      '<button type="button" data-pg="' + (pg.page - 1) + '" ' + (pg.page === 1 ? 'disabled' : '') + ' aria-label="Sebelumnya">‹</button>' +
      nums.map(n => n === '…' ? '<button type="button" disabled>…</button>' : '<button type="button" data-pg="' + n + '" class="' + (n === pg.page ? 'on' : '') + '">' + n + '</button>').join('') +
      '<button type="button" data-pg="' + (pg.page + 1) + '" ' + (pg.page === pg.pages ? 'disabled' : '') + ' aria-label="Berikutnya">›</button></div></div>';
  }
  const inRange = (t, days) => new Date(t).getTime() >= Date.now() - days * 864e5;
  const inPrev = (t, days) => { const x = new Date(t).getTime(); return x < Date.now() - days * 864e5 && x >= Date.now() - 2 * days * 864e5; };
  const waOf = l => P.waLink(l.wa, 'Halo ' + l.nama + ', terima kasih sudah menghubungi PATRA. ');
  function optionList(arr, sel, all) { return (all ? '<option value="">' + all + '</option>' : '') + arr.map(o => '<option' + (o === sel ? ' selected' : '') + '>' + esc(o) + '</option>').join(''); }
  function chartTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return { grid: dark ? 'rgba(255,255,255,.06)' : 'rgba(20,40,28,.06)', text: dark ? '#8A998F' : '#6B6F69', line: dark ? '#5FA77A' : '#14532D', fill: dark ? 'rgba(95,167,122,.18)' : 'rgba(20,83,45,.10)' };
  }
  async function ensureChart() {
    if (window.Chart) return true;
    try { await P.loadScript(CDN.chart); } catch (e) { return false; }
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = '#0B2A18';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;
    return true;
  }
  function drawChart(key, canvas, cfg) {
    if (!canvas) return;
    const ch = S.charts[key];
    if (ch && ch.canvas === canvas) { ch.data = cfg.data; ch.update('none'); return; }
    if (ch) ch.destroy();
    S.charts[key] = new Chart(canvas, cfg);
  }

  /* ======================= DASHBOARD ======================= */
  PAGES.dashboard = {
    template: () => '<div class="page-head"><div><span class="eyebrow">Ringkasan</span><h1>Operasional &amp; Konversi</h1></div>' +
      '<div class="page-head__act"><select class="select input--pill" data-range aria-label="Rentang waktu" style="min-height:44px;width:auto"><option value="7">7 hari terakhir</option><option value="30" selected>30 hari terakhir</option><option value="90">90 hari terakhir</option></select>' +
      '<a class="btn btn--primary" href="#/leads">' + P.icon('inbox') + ' Kelola Leads</a></div></div><div data-body></div>',
    init(el) { $('[data-range]', el).addEventListener('change', e => { S.v.dash.range = +e.target.value; renderCurrent(true); }); bindLeadRows($('[data-body]', el)); },
    render(el) {
      const d = S.data, days = S.v.dash.range;
      const leads = d.leads.filter(l => inRange(l.t, days)), prevLeads = d.leads.filter(l => inPrev(l.t, days));
      const clicks = d.clicks.filter(c => c[0] >= Date.now() - days * 864e5), prevClicks = d.clicks.filter(c => c[0] < Date.now() - days * 864e5 && c[0] >= Date.now() - 2 * days * 864e5);
      const cp = clicks.filter(c => c[1] === 'p'), cw = clicks.filter(c => c[1] === 'w');
      const ppc = prevClicks.filter(c => c[1] === 'p').length, pwc = prevClicks.filter(c => c[1] === 'w').length;
      const baru = d.leads.filter(l => l.status === 'Baru');
      const stale = baru.filter(l => Date.now() - new Date(l.t) > 864e5).length;
      const closing = leads.filter(l => l.status === 'Closing').length;
      const closeRate = pct(closing, leads.length);

      // Posisi tombol
      const posCount = {}; cp.forEach(c => { posCount[c[2]] = (posCount[c[2]] || 0) + 1; });
      const posArr = Object.keys(posCount).map(k => [k, posCount[k]]).sort((a, b) => b[1] - a[1]);
      // Jenis usaha
      const jenisCount = {}; leads.forEach(l => { const k = l.jenis || 'Lainnya'; jenisCount[k] = (jenisCount[k] || 0) + 1; });
      const jenisArr = Object.keys(jenisCount).map(k => [k, jenisCount[k]]).sort((a, b) => b[1] - a[1]);
      const mob = pct(cp.filter(c => c[3] === 'm').length, cp.length);

      // Insight otomatis
      const ins = [];
      if (ppc) { const g = Math.round(((cp.length - ppc) / ppc) * 100); ins.push('Klik tombol <b>Pesan</b> ' + (g >= 0 ? 'naik ' : 'turun ') + Math.abs(g) + '% dibanding ' + days + ' hari sebelumnya.'); }
      if (posArr.length) ins.push('Posisi tombol paling efektif: <b>' + esc(POS_LABEL[posArr[0][0]] || posArr[0][0]) + '</b> (' + pct(posArr[0][1], cp.length) + '% klik).');
      if (cp.length) ins.push(mob + '% klik Pesan berasal dari <b>ponsel</b> — pastikan tampilan HP selalu prima.');
      if (jenisArr.length) ins.push('Jenis usaha paling banyak bertanya: <b>' + esc(jenisArr[0][0]) + '</b>.');
      if (stale) ins.push('<b>' + stale + ' lead</b> berstatus Baru lebih dari 24 jam — segera hubungi.');
      if (!ins.length) ins.push('Belum ada aktivitas pada rentang ini.');

      const body = $('[data-body]', el);
      body.innerHTML =
        '<div class="kpis">' +
        kpi('Total Leads', P.fmtNum(leads.length), 'users', trend(leads.length, prevLeads.length)) +
        kpi('Leads Baru', P.fmtNum(baru.length), 'inbox', stale ? '<span class="down">' + stale + ' &gt; 24 jam</span><span>perlu respon</span>' : '<span>Semua tertangani</span>') +
        kpi('Klik Pesan', P.fmtNum(cp.length), 'pointer', trend(cp.length, ppc)) +
        kpi('Klik WhatsApp', P.fmtNum(cw.length), 'whatsapp', trend(cw.length, pwc)) +
        '<div class="kpi"><div class="kpi__top"><span class="kpi__label">Closing rate</span><span class="kpi__ic">' + P.icon('check-circle') + '</span></div><div class="kpi__val">' + closeRate + '%</div><div class="bar"><span style="width:' + Math.min(100, closeRate) + '%"></span></div><div class="kpi__sub">' + closing + ' dari ' + leads.length + ' lead</div></div>' +
        '</div>' +
        '<div class="insight"><span class="insight__ic"><img src="assets/img/star.svg" alt=""></span><div><b>Insight otomatis</b><ul>' + ins.map(i => '<li>' + i + '</li>').join('') + '</ul></div></div>' +
        '<div class="grid-2"><div class="panel"><div class="panel__head"><div><h2>Tren Leads</h2><p>Jumlah formulir kontak masuk per ' + (days > 30 ? 'minggu' : 'hari') + '</p></div></div><div class="chart-box"><canvas data-c="leads" aria-label="Grafik tren leads"></canvas></div></div>' +
        '<div class="panel"><div class="panel__head"><div><h2>Leads per Jenis Usaha</h2><p>' + days + ' hari terakhir</p></div></div><div class="chart-box chart-box--sm"><canvas data-c="jenis" aria-label="Grafik jenis usaha"></canvas></div><div class="legend">' +
        (jenisArr.length ? jenisArr.slice(0, 6).map((j, i) => '<div><i style="background:' + COLORS[i % COLORS.length] + '"></i><span>' + esc(j[0]) + '</span><span>' + j[1] + ' (' + pct(j[1], leads.length) + '%)</span></div>').join('') : '<div class="muted">Belum ada data</div>') + '</div></div></div>' +
        '<div class="grid-2"><div class="panel"><div class="panel__head"><div><h2>Klik Pesan per Hari</h2><p>14 hari terakhir</p></div><span class="chip">Rata-rata ' + Math.round(d.clicks.filter(c => c[1] === 'p' && c[0] >= Date.now() - 14 * 864e5).length / 14) + '/hari</span></div><div class="chart-box chart-box--sm"><canvas data-c="klik" aria-label="Grafik klik per hari"></canvas></div></div>' +
        '<div class="panel"><div class="panel__head"><div><h2>Posisi Tombol Terbanyak</h2><p>Sumber klik Pesan menurut letak tombol</p></div></div><div class="pos-list">' +
        (posArr.length ? posArr.slice(0, 6).map(p => '<div class="pos-row"><div><span>' + esc(POS_LABEL[p[0]] || p[0]) + '</span><b>' + P.fmtNum(p[1]) + ' (' + pct(p[1], cp.length) + '%)</b></div><div class="bar"><span style="width:' + pct(p[1], posArr[0][1]) + '%"></span></div></div>').join('') : '<div class="muted">Belum ada klik</div>') +
        '</div></div></div>' +
        '<div class="panel"><div class="panel__head"><div><h2>Leads Terbaru</h2><p>' + baru.length + ' lead menunggu ditindaklanjuti</p></div><a href="#/leads" class="btn btn--ghost btn--sm">Lihat semua (' + d.leads.length + ') ' + P.icon('arrow-right') + '</a></div>' +
        leadTable(d.leads.slice(0, 5), true) + '</div>';
      drawDashCharts(el, days, leads, jenisArr);
    }
  };
  function kpi(label, val, ic, sub) {
    return '<div class="kpi"><div class="kpi__top"><span class="kpi__label">' + label + '</span><span class="kpi__ic">' + P.icon(ic) + '</span></div><div class="kpi__val">' + val + '</div><div class="kpi__sub">' + sub + '</div></div>';
  }
  async function drawDashCharts(el, days, leads, jenisArr) {
    if (!(await ensureChart()) || S.current !== 'dashboard') return;
    const th = chartTheme();
    const scales = { x: { grid: { display: false }, ticks: { color: th.text, maxRotation: 0, autoSkipPadding: 12 } }, y: { beginAtZero: true, grid: { color: th.grid }, border: { display: false }, ticks: { color: th.text, precision: 0 } } };
    // Tren leads
    const byWeek = days > 30, buckets = [], labels = [];
    const n = byWeek ? Math.ceil(days / 7) : days;
    for (let i = n - 1; i >= 0; i--) {
      const end = new Date(); end.setHours(23, 59, 59, 999); end.setDate(end.getDate() - i * (byWeek ? 7 : 1));
      const startD = new Date(end); startD.setDate(startD.getDate() - (byWeek ? 7 : 1)); startD.setMilliseconds(startD.getMilliseconds() + 1);
      buckets.push([startD.getTime(), end.getTime()]);
      labels.push(byWeek ? 'Mg ' + P.fmtDate(startD, { day: 'numeric', month: 'short' }) : P.fmtDate(end, { day: 'numeric', month: 'short' }));
    }
    const vals = buckets.map(b => leads.filter(l => { const t = new Date(l.t).getTime(); return t >= b[0] && t <= b[1]; }).length);
    drawChart('leads', $('[data-c="leads"]', el), { type: 'line', data: { labels, datasets: [{ data: vals, borderColor: th.line, backgroundColor: th.fill, fill: true, cubicInterpolationMode: 'monotone', pointRadius: 0, pointHoverRadius: 5, borderWidth: 2.5 }] },
      options: { maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, scales } });
    // Jenis usaha
    drawChart('jenis', $('[data-c="jenis"]', el), { type: 'doughnut', data: { labels: jenisArr.map(j => j[0]), datasets: [{ data: jenisArr.map(j => j[1]), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 6 }] },
      options: { maintainAspectRatio: false, cutout: '68%' } });
    // Klik per hari (14 hari)
    const kl = [], kv = [];
    for (let i = 13; i >= 0; i--) {
      const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - i);
      const d1 = d0.getTime() + 864e5;
      kl.push(d0.toLocaleDateString('id-ID', { weekday: 'short' }).replace('.', ''));
      kv.push(S.data.clicks.filter(c => c[1] === 'p' && c[0] >= d0.getTime() && c[0] < d1).length);
    }
    const max = Math.max.apply(null, kv);
    drawChart('klik', $('[data-c="klik"]', el), { type: 'bar', data: { labels: kl, datasets: [{ data: kv, backgroundColor: kv.map(v => v === max && v ? th.line : (th.grid === 'rgba(20,40,28,.06)' ? '#E3E9E2' : '#26372D')), borderRadius: 8, borderSkipped: false, maxBarThickness: 36 }] },
      options: { maintainAspectRatio: false, scales } });
  }

  /* ======================= LEADS ======================= */
  function leadTable(rows, compact) {
    if (!rows.length) return '<div class="empty">' + P.icon('inbox') + '<span>Tidak ada lead yang cocok.</span></div>';
    const v = S.v.leads;
    const th = (k, label) => compact ? '<th>' + label + '</th>' : '<th class="sortable" data-sort="' + k + '">' + label + (v.sort === k ? P.icon(v.dir > 0 ? 'arrow-up' : 'arrow-down') : '') + '</th>';
    return '<div class="only-desk"><div class="table-scroll"><table class="tbl"><thead><tr>' + th('t', 'Tanggal') + th('nama', 'Nama') + th('bisnis', 'Bisnis') + (compact ? '' : th('jenis', 'Jenis')) + '<th>WhatsApp</th>' + th('status', 'Status') + (compact ? '' : th('oleh', 'Ditangani')) + '<th style="text-align:right">Aksi</th></tr></thead><tbody>' +
      rows.map(l => '<tr class="clickable" data-lead="' + esc(l.id) + '"><td class="nowrap muted">' + esc(P.fmtRel(l.t)) + '</td><td class="strong">' + esc(l.nama) + '</td><td>' + esc(l.bisnis) + '</td>' + (compact ? '' : '<td class="muted">' + esc(l.jenis) + '</td>') +
        '<td class="nowrap mono" style="font-size:13px">' + esc(P.fmtWa(l.wa)) + '</td><td>' + (compact ? badge(l.status) : '<select class="select status-select" data-status="' + esc(l.id) + '" aria-label="Ubah status ' + esc(l.nama) + '">' + optionList(STATUS, l.status) + '</select>') + '</td>' +
        (compact ? '' : '<td class="muted nowrap">' + esc(l.oleh || '—') + '</td>') +
        '<td><div class="actions"><a class="btn btn--sm wa-btn" href="' + waOf(l) + '" target="_blank" rel="noopener" data-stop>' + P.icon('whatsapp') + ' WhatsApp</a></div></td></tr>').join('') +
      '</tbody></table></div></div>' +
      '<div class="lead-cards only-mob">' + rows.map(l => '<div class="lead-card" data-lead="' + esc(l.id) + '" tabindex="0"><span class="av">' + esc(initials(l.nama)) + '</span><span class="meta"><b>' + esc(l.nama) + ' ' + badge(l.status) + '</b><small>' + esc(l.bisnis) + ' · ' + esc(P.fmtRel(l.t)) + '</small></span><a class="btn btn--icon wa-btn" href="' + waOf(l) + '" target="_blank" rel="noopener" aria-label="WhatsApp ' + esc(l.nama) + '" data-stop>' + P.icon('whatsapp') + '</a></div>').join('') + '</div>';
  }
  function bindLeadRows(root) {
    root.addEventListener('click', e => {
      if (e.target.closest('[data-stop],select')) return;
      const r = e.target.closest('[data-lead]'); if (r) openLead(r.dataset.lead);
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter') { const r = e.target.closest('.lead-card[data-lead]'); if (r) openLead(r.dataset.lead); } });
    root.addEventListener('change', e => { const s = e.target.closest('[data-status]'); if (s) setLeadStatus(s.dataset.status, s.value); });
  }
  function filteredLeads() {
    const v = S.v.leads, q = v.q.toLowerCase();
    let list = S.data.leads.filter(l =>
      (!v.status || l.status === v.status) && (!v.jenis || l.jenis === v.jenis) &&
      (!v.from || l.t.slice(0, 10) >= v.from) && (!v.to || l.t.slice(0, 10) <= v.to) &&
      (!q || (l.nama + ' ' + l.bisnis + ' ' + l.wa + ' ' + l.email + ' ' + l.pesan).toLowerCase().indexOf(q) > -1));
    const k = v.sort, dir = v.dir;
    list = list.slice().sort((a, b) => (String(a[k] || '') < String(b[k] || '') ? -dir : String(a[k] || '') > String(b[k] || '') ? dir : 0));
    return list;
  }
  PAGES.leads = {
    template: () => '<div class="page-head"><div><span class="eyebrow">Calon pelanggan</span><h1>Leads</h1><p>Semua pesan dari formulir kontak website.</p></div>' +
      '<div class="page-head__act"><button class="btn btn--outline" type="button" data-exp="xlsx">' + P.icon('sheet') + ' Excel</button><button class="btn btn--outline" type="button" data-exp="pdf">' + P.icon('file') + ' PDF</button></div></div>' +
      '<div class="toolbar"><div class="input-icon">' + P.icon('search') + '<input class="input input--pill" type="search" data-f="q" placeholder="Cari nama, bisnis, nomor…" aria-label="Cari lead"></div>' +
      '<select class="select" data-f="status" aria-label="Filter status"></select><select class="select" data-f="jenis" aria-label="Filter jenis usaha"></select>' +
      '<input class="input" type="date" data-f="from" aria-label="Dari tanggal"><input class="input" type="date" data-f="to" aria-label="Sampai tanggal">' +
      '<button class="btn btn--ghost btn--sm" type="button" data-reset>Reset</button></div><div data-body></div>',
    init(el) {
      const v = S.v.leads;
      const apply = () => { v.page = 1; renderCurrent(true); };
      $('[data-f="q"]', el).addEventListener('input', P.debounce(e => { v.q = e.target.value.trim(); apply(); }, 250));
      ['status', 'jenis', 'from', 'to'].forEach(k => $('[data-f="' + k + '"]', el).addEventListener('change', e => { v[k] = e.target.value; apply(); }));
      $('[data-reset]', el).addEventListener('click', () => { Object.assign(v, { q: '', status: '', jenis: '', from: '', to: '' }); $$('[data-f]', el).forEach(i => i.value = ''); apply(); });
      $$('[data-exp]', el).forEach(b => b.addEventListener('click', () => exportLeads(b.dataset.exp, b)));
      const body = $('[data-body]', el);
      bindLeadRows(body);
      body.addEventListener('click', e => {
        const pg = e.target.closest('[data-pg]'); if (pg && !pg.disabled) { v.page = +pg.dataset.pg; renderCurrent(true); scrollTo({ top: 0 }); return; }
        const s = e.target.closest('[data-sort]'); if (s) { if (v.sort === s.dataset.sort) v.dir *= -1; else { v.sort = s.dataset.sort; v.dir = s.dataset.sort === 't' ? -1 : 1; } renderCurrent(true); }
      });
    },
    render(el) {
      const v = S.v.leads, meta = S.data.meta || {};
      const st = $('[data-f="status"]', el), jn = $('[data-f="jenis"]', el);
      st.innerHTML = optionList(meta.status || STATUS, v.status, 'Semua status');
      jn.innerHTML = optionList(meta.jenis || [], v.jenis, 'Semua jenis');
      const list = filteredLeads(), pg = paginate(list, v.page);
      v.page = pg.page;
      const counts = STATUS.map(s => s + ': ' + S.data.leads.filter(l => l.status === s).length).join(' · ');
      $('[data-body]', el).innerHTML = '<p class="muted" style="font-size:13px;margin:-4px 0 10px">' + esc(counts) + '</p><div class="table-wrap">' + leadTable(pg.rows) + pagerHtml(pg) + '</div>';
    }
  };

  async function setLeadStatus(id, status) {
    const l = S.data.leads.find(x => x.id === id); if (!l || l.status === status) return;
    const prev = { status: l.status, oleh: l.oleh, u: l.u };
    Object.assign(l, { status, oleh: S.user.name, u: new Date().toISOString() });
    commitLocal();                                                  // instan
    const res = await P.api('updateLead', { id, status });
    if (!res.success) { Object.assign(l, prev); commitLocal(); P.toast('Status gagal disimpan', res.message, 'error'); }
    else P.toast('Status diperbarui', l.nama + ' → ' + status);
  }

  function openLead(id) {
    const l = S.data.leads.find(x => x.id === id); if (!l) return;
    const html = '<div class="overlay" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle">' +
      '<div class="drawer__head"><div><span class="eyebrow">' + esc(l.id) + '</span><h2 id="dTitle">' + esc(l.nama) + '</h2></div><button class="icon-btn" type="button" data-close aria-label="Tutup">' + P.icon('x') + '</button></div>' +
      '<div class="drawer__body"><dl class="kv"><dt>Bisnis</dt><dd>' + esc(l.bisnis) + '</dd><dt>Jenis usaha</dt><dd>' + esc(l.jenis) + '</dd><dt>WhatsApp</dt><dd class="mono">' + esc(P.fmtWa(l.wa)) + '</dd>' +
      '<dt>Email</dt><dd>' + (l.email ? '<a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' : '—') + '</dd><dt>Masuk</dt><dd>' + esc(P.fmtDate(l.t)) + ', ' + esc(P.fmtTime(l.t)) + '</dd><dt>Sumber</dt><dd>' + esc(l.sumber || '—') + '</dd>' +
      '<dt>Ditangani</dt><dd>' + esc(l.oleh || '—') + '</dd></dl>' +
      '<div><span class="label">Pesan</span><div class="msg-box" style="margin-top:6px">' + (l.pesan ? esc(l.pesan) : '<span class="muted">Tidak ada pesan.</span>') + '</div></div>' +
      '<div class="field"><label for="dStatus">Status</label><select class="select" id="dStatus">' + optionList(STATUS, l.status) + '</select></div>' +
      '<div class="field"><label for="dNote">Catatan internal</label><textarea class="textarea" id="dNote" maxlength="1000" placeholder="Contoh: sudah dikirim katalog, follow-up Jumat.">' + esc(l.catatan) + '</textarea></div></div>' +
      '<div class="drawer__foot">' + (isAdmin() ? '<button class="btn btn--ghost" type="button" data-del style="margin-right:auto;color:var(--danger)">' + P.icon('trash') + ' Hapus</button>' : '') +
      '<a class="btn btn--outline" href="' + waOf(l) + '" target="_blank" rel="noopener">' + P.icon('whatsapp') + ' Chat</a><button class="btn btn--primary" type="button" data-save>Simpan</button></div></aside>';
    const layer = openLayer(html);
    $('#dStatus', layer).focus();
    $('[data-save]', layer).addEventListener('click', async e => {
      const status = $('#dStatus', layer).value, catatan = $('#dNote', layer).value.trim();
      const prev = { status: l.status, catatan: l.catatan, oleh: l.oleh };
      Object.assign(l, { status, catatan, oleh: S.user.name, u: new Date().toISOString() });
      closeLayer(); commitLocal();
      const res = await P.api('updateLead', { id, status, catatan });
      if (!res.success) { Object.assign(l, prev); commitLocal(); P.toast('Gagal menyimpan', res.message, 'error'); } else P.toast('Lead diperbarui', l.nama);
    });
    const del = $('[data-del]', layer);
    if (del) del.addEventListener('click', async () => {
      if (!(await confirmDialog('Hapus lead ini?', 'Data ' + l.nama + ' akan dihapus permanen dari spreadsheet.', 'Hapus'))) return;
      const idx = S.data.leads.indexOf(l);
      S.data.leads.splice(idx, 1); closeLayer(); commitLocal();
      const res = await P.api('deleteLead', { id });
      if (!res.success) { S.data.leads.splice(idx, 0, l); commitLocal(); P.toast('Gagal menghapus', res.message, 'error'); } else P.toast('Lead dihapus', '');
    });
  }

  async function exportLeads(kind, btn) {
    const list = filteredLeads();
    if (!list.length) { P.toast('Tidak ada data', 'Ubah filter terlebih dahulu.', 'error'); return; }
    const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Menyiapkan…';
    try {
      const rows = list.map(l => ({ ID: l.id, Tanggal: P.fmtDate(l.t) + ' ' + P.fmtTime(l.t), Nama: l.nama, Bisnis: l.bisnis, 'Jenis Usaha': l.jenis, WhatsApp: P.fmtWa(l.wa), Email: l.email, Status: l.status, 'Ditangani Oleh': l.oleh, Catatan: l.catatan, Pesan: l.pesan }));
      const v = S.v.leads, filt = [v.status && 'Status: ' + v.status, v.jenis && 'Jenis: ' + v.jenis, v.from && 'Dari ' + v.from, v.to && 'Sampai ' + v.to, v.q && 'Cari: "' + v.q + '"'].filter(Boolean).join(' · ') || 'Semua data';
      const fname = 'patra-leads-' + new Date().toISOString().slice(0, 10);
      if (kind === 'xlsx') await exportXlsx(rows, fname, 'Leads');
      else {
        await P.loadScript(CDN.jspdf); await P.loadScript(CDN.autotable);
        const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        doc.setFillColor(20, 83, 45); doc.rect(0, 0, 842, 64, 'F');
        doc.setTextColor(196, 252, 211); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('patra', 36, 40);
        doc.setTextColor(255, 255, 255); doc.setFontSize(13); doc.text('Laporan Leads', 110, 32);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(filt + '  ·  Dicetak ' + new Date().toLocaleString('id-ID'), 110, 46);
        doc.autoTable({ startY: 84, head: [['Tanggal', 'Nama', 'Bisnis', 'Jenis', 'WhatsApp', 'Status', 'Ditangani', 'Pesan']],
          body: rows.map(r => [r.Tanggal, r.Nama, r.Bisnis, r['Jenis Usaha'], r.WhatsApp, r.Status, r['Ditangani Oleh'], r.Pesan]),
          styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' }, headStyles: { fillColor: [14, 61, 33], textColor: 255 }, alternateRowStyles: { fillColor: [245, 246, 242] },
          columnStyles: { 7: { cellWidth: 200 } }, margin: { left: 36, right: 36 } });
        doc.save(fname + '.pdf');
      }
      P.toast('File siap', rows.length + ' baris diekspor.');
    } catch (e) { P.toast('Ekspor gagal', e.message, 'error'); }
    btn.disabled = false; btn.innerHTML = label;
  }
  async function exportXlsx(rows, fname, sheet) {
    await P.loadScript(CDN.xlsx);
    const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.min(48, Math.max(k.length + 2, ...rows.slice(0, 200).map(r => String(r[k] || '').length + 1))) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, fname + '.xlsx');
  }

  /* ======================= STATISTIK KLIK ======================= */
  function filteredClicks() {
    const v = S.v.klik, since = Date.now() - v.range * 864e5;
    return S.data.clicks.filter(c => c[1] === v.tab && c[0] >= since && (!v.pos || c[2] === v.pos) && (!v.dev || c[3] === v.dev));
  }
  PAGES.klik = {
    template: () => '<div class="page-head"><div><span class="eyebrow">Telemetri tombol</span><h1>Statistik Klik</h1><p>Setiap klik tombol Pesan (ke Lynk.id) dan WhatsApp tercatat di sini.</p></div>' +
      '<div class="page-head__act"><button class="btn btn--outline" type="button" data-exp>' + P.icon('sheet') + ' Excel</button></div></div>' +
      '<div class="tabs" role="tablist"><button type="button" role="tab" data-tab="p" class="on">Klik Pesan</button><button type="button" role="tab" data-tab="w">Klik WhatsApp</button></div>' +
      '<div class="toolbar"><select class="select" data-f="range" aria-label="Rentang"><option value="7">7 hari</option><option value="30" selected>30 hari</option><option value="90">90 hari</option><option value="120">120 hari</option></select>' +
      '<select class="select" data-f="pos" aria-label="Posisi tombol"></select><select class="select" data-f="dev" aria-label="Perangkat"><option value="">Semua perangkat</option><option value="m">Ponsel</option><option value="d">Desktop</option></select></div><div data-body></div>',
    init(el) {
      const v = S.v.klik;
      $$('[data-tab]', el).forEach(b => b.addEventListener('click', () => { v.tab = b.dataset.tab; v.page = 1; $$('[data-tab]', el).forEach(x => x.classList.toggle('on', x === b)); renderCurrent(true); }));
      ['range', 'pos', 'dev'].forEach(k => $('[data-f="' + k + '"]', el).addEventListener('change', e => { v[k] = k === 'range' ? +e.target.value : e.target.value; v.page = 1; renderCurrent(true); }));
      $('[data-body]', el).addEventListener('click', e => { const pg = e.target.closest('[data-pg]'); if (pg && !pg.disabled) { v.page = +pg.dataset.pg; renderCurrent(true); } });
      $('[data-exp]', el).addEventListener('click', async e => {
        const list = filteredClicks(); if (!list.length) { P.toast('Tidak ada data', '', 'error'); return; }
        try { await exportXlsx(list.map(c => ({ Waktu: new Date(c[0]).toLocaleString('id-ID'), Jenis: c[1] === 'p' ? 'Pesan' : 'WhatsApp', Posisi: POS_LABEL[c[2]] || c[2], Perangkat: c[3] === 'm' ? 'Ponsel' : 'Desktop', Referrer: c[4] })), 'patra-klik-' + new Date().toISOString().slice(0, 10), 'Klik'); }
        catch (err) { P.toast('Ekspor gagal', err.message, 'error'); }
      });
    },
    render(el) {
      const v = S.v.klik;
      $('[data-f="pos"]', el).innerHTML = '<option value="">Semua posisi</option>' + Object.keys(POS_LABEL).map(k => '<option value="' + k + '"' + (v.pos === k ? ' selected' : '') + '>' + POS_LABEL[k] + '</option>').join('');
      const list = filteredClicks(), pg = paginate(list, v.page); v.page = pg.page;
      const m = list.filter(c => c[3] === 'm').length;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const t = list.filter(c => c[0] >= today.getTime()).length;
      $('[data-body]', el).innerHTML = '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
        kpi('Total', P.fmtNum(list.length), v.tab === 'p' ? 'pointer' : 'whatsapp', '<span>' + v.range + ' hari terakhir</span>') +
        kpi('Hari ini', P.fmtNum(t), 'calendar', '<span>sejak 00.00</span>') +
        kpi('Ponsel', pct(m, list.length) + '%', 'smartphone', '<span>' + P.fmtNum(m) + ' klik</span>') +
        kpi('Desktop', pct(list.length - m, list.length) + '%', 'monitor', '<span>' + P.fmtNum(list.length - m) + ' klik</span>') + '</div>' +
        '<div class="table-wrap">' + (pg.rows.length ? '<div class="table-scroll"><table class="tbl"><thead><tr><th>Waktu</th><th>Posisi tombol</th><th>Perangkat</th><th>Referrer</th></tr></thead><tbody>' +
          pg.rows.map(c => '<tr><td class="nowrap">' + esc(P.fmtRel(c[0])) + '</td><td>' + esc(POS_LABEL[c[2]] || c[2]) + '</td><td>' + (c[3] === 'm' ? P.icon('smartphone', 'ic-sm') + ' Ponsel' : P.icon('monitor', 'ic-sm') + ' Desktop') + '</td><td class="muted">' + esc(c[4] || 'Langsung') + '</td></tr>').join('') +
          '</tbody></table></div>' : '<div class="empty">' + P.icon('pointer') + '<span>Belum ada klik pada filter ini.</span></div>') + pagerHtml(pg) + '</div>';
      $$('td .ic', el).forEach(i => { i.style.display = 'inline'; i.style.verticalAlign = '-3px'; });
    }
  };

  /* ======================= TESTIMONI ======================= */
  PAGES.testimoni = {
    template: () => '<div class="page-head"><div><span class="eyebrow">Konten website</span><h1>Testimoni</h1><p>Testimoni yang berstatus tampil muncul di landing page sesuai urutan.</p></div>' +
      '<div class="page-head__act"><button class="btn btn--primary" type="button" data-add>' + P.icon('plus') + ' Tambah Testimoni</button></div></div><div data-body></div>',
    init(el) {
      $('[data-add]', el).addEventListener('click', () => editTesti(null));
      $('[data-body]', el).addEventListener('click', e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const id = b.closest('[data-id]').dataset.id, t = S.data.testimoni.find(x => x.id === id);
        if (b.dataset.a === 'edit') editTesti(t);
        else if (b.dataset.a === 'del') delItem('testimoni', t, t.nama);
        else if (b.dataset.a === 'up' || b.dataset.a === 'down') moveItem('testimoni', id, b.dataset.a === 'up' ? -1 : 1);
      });
      $('[data-body]', el).addEventListener('change', e => { const s = e.target.closest('[data-toggle]'); if (s) toggleItem('testimoni', s.closest('[data-id]').dataset.id, s.checked); });
    },
    render(el) {
      const list = S.data.testimoni;
      $('[data-body]', el).innerHTML = list.length ? '<div class="t-grid">' + list.map((t, i) =>
        '<article class="t-card' + (t.tampil ? '' : ' off') + '" data-id="' + esc(t.id) + '"><div class="t-card__who"><span class="av">' + (t.foto ? '<img src="' + esc(t.foto) + '" alt="" referrerpolicy="no-referrer">' : esc(initials(t.nama))) + '</span><span><b>' + esc(t.nama) + '</b><small>' + esc([t.bisnis, t.jenis].filter(Boolean).join(' · ')) + '</small></span></div>' +
        stars(t.rating) + '<p>“' + esc(t.isi) + '”</p><div class="t-card__foot"><label class="switch"><input type="checkbox" data-toggle ' + (t.tampil ? 'checked' : '') + '><span class="track"></span><span>Tampil</span></label>' +
        '<span style="display:flex;gap:6px"><button class="icon-btn" type="button" data-a="up" aria-label="Naikkan" ' + (i === 0 ? 'disabled' : '') + '>' + P.icon('arrow-up') + '</button><button class="icon-btn" type="button" data-a="down" aria-label="Turunkan" ' + (i === list.length - 1 ? 'disabled' : '') + '>' + P.icon('arrow-down') + '</button>' +
        '<button class="icon-btn" type="button" data-a="edit" aria-label="Ubah">' + P.icon('pencil') + '</button><button class="icon-btn danger" type="button" data-a="del" aria-label="Hapus">' + P.icon('trash') + '</button></span></div></article>').join('') + '</div>'
        : '<div class="panel empty">' + P.icon('quote') + '<span>Belum ada testimoni.</span></div>';
    }
  };

  function editTesti(t) {
    const it = t ? Object.assign({}, t) : { nama: '', bisnis: '', jenis: '', isi: '', rating: 5, foto: '', tampil: true };
    const jenis = (S.data.meta && S.data.meta.jenis) || [];
    const m = openModal(t ? 'Ubah Testimoni' : 'Tambah Testimoni',
      '<div class="photo-pick"><span class="av" id="tPrev">' + (it.foto ? '<img src="' + esc(it.foto) + '" alt="">' : P.icon('image')) + '</span><div><label class="btn btn--outline btn--sm" style="cursor:pointer">' + P.icon('upload') + ' Pilih foto<input type="file" accept="image/png,image/jpeg,image/webp" id="tFile" hidden></label><div class="field-hint" style="margin-top:6px">PNG/JPG/WebP, otomatis dikecilkan.</div></div></div>' +
      '<div class="form-2"><div class="field"><label for="tNama">Nama <span class="req">*</span></label><input class="input" id="tNama" maxlength="80" value="' + esc(it.nama) + '"></div>' +
      '<div class="field"><label for="tBisnis">Bisnis</label><input class="input" id="tBisnis" maxlength="80" value="' + esc(it.bisnis) + '"></div>' +
      '<div class="field"><label for="tJenis">Jenis usaha</label><select class="select" id="tJenis">' + optionList(jenis, it.jenis, '—') + '</select></div>' +
      '<div class="field"><span class="label">Rating</span><div class="star-pick" id="tStars" role="radiogroup" aria-label="Rating">' + [1, 2, 3, 4, 5].map(i => '<button type="button" role="radio" aria-checked="' + (i === it.rating) + '" aria-label="' + i + ' bintang" data-r="' + i + '" class="' + (i <= it.rating ? 'on' : '') + '">' + P.icon('star') + '</button>').join('') + '</div></div>' +
      '<div class="field full"><label for="tIsi">Isi testimoni <span class="req">*</span></label><textarea class="textarea" id="tIsi" maxlength="600">' + esc(it.isi) + '</textarea></div>' +
      '<div class="full"><label class="switch"><input type="checkbox" id="tTampil" ' + (it.tampil ? 'checked' : '') + '><span class="track"></span><span>Tampilkan di website</span></label></div></div>',
      'Simpan', async (body) => {
        it.nama = $('#tNama', body).value.trim(); it.bisnis = $('#tBisnis', body).value.trim(); it.jenis = $('#tJenis', body).value; it.isi = $('#tIsi', body).value.trim(); it.tampil = $('#tTampil', body).checked;
        if (it.nama.length < 2 || it.isi.length < 5) { P.toast('Lengkapi data', 'Nama dan isi testimoni wajib diisi.', 'error'); return false; }
        if (it._file) {
          const up = await P.api('uploadPhoto', { dataUrl: it._file });
          if (!up.success) { P.toast('Foto gagal diunggah', up.message, 'error'); return false; }
          it.foto = up.data.url; delete it._file;
        }
        const res = await P.api('saveItem', { type: 'testimoni', item: it });
        if (!res.success) { P.toast('Gagal menyimpan', res.message, 'error'); return false; }
        it.id = res.data.id;
        const ex = S.data.testimoni.find(x => x.id === it.id);
        if (ex) Object.assign(ex, it); else S.data.testimoni.push(Object.assign(it, { urutan: S.data.testimoni.length + 1 }));
        commitLocal(); P.toast('Testimoni disimpan', it.nama);
        return true;
      });
    $('#tStars', m).addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; it.rating = +b.dataset.r; $$('[data-r]', m).forEach(x => { x.classList.toggle('on', +x.dataset.r <= it.rating); x.setAttribute('aria-checked', String(+x.dataset.r === it.rating)); }); });
    $('#tFile', m).addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) { P.toast('File terlalu besar', 'Maksimal 8 MB sebelum dikompres.', 'error'); return; }
      it._file = await compressImage(f, 480);
      $('#tPrev', m).innerHTML = '<img src="' + it._file + '" alt="">';
    });
  }
  function compressImage(file, max) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => rej(new Error('Gambar tidak bisa dibaca'));
      img.src = url;
    });
  }

  /* ---------- Aksi umum Testimoni/FAQ (optimistic) ---------- */
  async function toggleItem(type, id, on) {
    const list = type === 'faq' ? S.data.faq : S.data.testimoni, it = list.find(x => x.id === id), key = type === 'faq' ? 'aktif' : 'tampil';
    it[key] = on; commitLocal();
    const res = await P.api('saveItem', { type, item: it });
    if (!res.success) { it[key] = !on; commitLocal(); P.toast('Gagal mengubah', res.message, 'error'); }
  }
  async function moveItem(type, id, dir) {
    const list = type === 'faq' ? S.data.faq : S.data.testimoni, i = list.findIndex(x => x.id === id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    const before = list.slice();
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((x, k) => { x.urutan = k + 1; });
    commitLocal();
    const res = await P.api('reorder', { type, ids: list.map(x => x.id) });
    if (!res.success) { list.splice(0, list.length, ...before); commitLocal(); P.toast('Urutan gagal disimpan', res.message, 'error'); }
  }
  async function delItem(type, it, label) {
    if (!(await confirmDialog('Hapus ' + (type === 'faq' ? 'pertanyaan' : 'testimoni') + '?', '"' + label + '" akan dihapus dari website.', 'Hapus'))) return;
    const list = type === 'faq' ? S.data.faq : S.data.testimoni, idx = list.indexOf(it);
    list.splice(idx, 1); commitLocal();
    const res = await P.api('deleteItem', { type, id: it.id });
    if (!res.success) { list.splice(idx, 0, it); commitLocal(); P.toast('Gagal menghapus', res.message, 'error'); } else P.toast('Dihapus', '');
  }

  /* ======================= FAQ ======================= */
  PAGES.faq = {
    template: () => '<div class="page-head"><div><span class="eyebrow">Konten website</span><h1>FAQ</h1><p>Pertanyaan aktif tampil di landing page sesuai urutan.</p></div>' +
      '<div class="page-head__act"><button class="btn btn--primary" type="button" data-add>' + P.icon('plus') + ' Tambah Pertanyaan</button></div></div><div data-body></div>',
    init(el) {
      $('[data-add]', el).addEventListener('click', () => editFaq(null));
      $('[data-body]', el).addEventListener('click', e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const id = b.closest('[data-id]').dataset.id, f = S.data.faq.find(x => x.id === id);
        if (b.dataset.a === 'edit') editFaq(f); else if (b.dataset.a === 'del') delItem('faq', f, f.q); else moveItem('faq', id, b.dataset.a === 'up' ? -1 : 1);
      });
      $('[data-body]', el).addEventListener('change', e => { const s = e.target.closest('[data-toggle]'); if (s) toggleItem('faq', s.closest('[data-id]').dataset.id, s.checked); });
    },
    render(el) {
      const list = S.data.faq;
      $('[data-body]', el).innerHTML = list.length ? '<div class="faq-list">' + list.map((f, i) =>
        '<div class="faq-row' + (f.aktif ? '' : ' off') + '" data-id="' + esc(f.id) + '"><div class="faq-row__order"><button type="button" data-a="up" aria-label="Naikkan" ' + (i === 0 ? 'disabled' : '') + '>' + P.icon('arrow-up') + '</button><button type="button" data-a="down" aria-label="Turunkan" ' + (i === list.length - 1 ? 'disabled' : '') + '>' + P.icon('arrow-down') + '</button></div>' +
        '<div class="faq-row__body"><b>' + esc(f.q) + '</b><p>' + esc(f.a) + '</p></div><div class="faq-row__act"><label class="switch"><input type="checkbox" data-toggle ' + (f.aktif ? 'checked' : '') + ' aria-label="Aktif"><span class="track"></span></label>' +
        '<button class="icon-btn" type="button" data-a="edit" aria-label="Ubah">' + P.icon('pencil') + '</button><button class="icon-btn danger" type="button" data-a="del" aria-label="Hapus">' + P.icon('trash') + '</button></div></div>').join('') + '</div>'
        : '<div class="panel empty">' + P.icon('help') + '<span>Belum ada FAQ.</span></div>';
    }
  };
  function editFaq(f) {
    const it = f ? Object.assign({}, f) : { q: '', a: '', aktif: true };
    openModal(f ? 'Ubah Pertanyaan' : 'Tambah Pertanyaan',
      '<div class="field"><label for="fq">Pertanyaan <span class="req">*</span></label><input class="input" id="fq" maxlength="200" value="' + esc(it.q) + '"></div>' +
      '<div class="field"><label for="fa">Jawaban <span class="req">*</span></label><textarea class="textarea" id="fa" maxlength="1000">' + esc(it.a) + '</textarea></div>' +
      '<label class="switch"><input type="checkbox" id="fon" ' + (it.aktif ? 'checked' : '') + '><span class="track"></span><span>Tampilkan di website</span></label>',
      'Simpan', async body => {
        it.q = $('#fq', body).value.trim(); it.a = $('#fa', body).value.trim(); it.aktif = $('#fon', body).checked;
        if (it.q.length < 5 || it.a.length < 2) { P.toast('Lengkapi data', 'Pertanyaan dan jawaban wajib diisi.', 'error'); return false; }
        const res = await P.api('saveItem', { type: 'faq', item: it });
        if (!res.success) { P.toast('Gagal menyimpan', res.message, 'error'); return false; }
        it.id = res.data.id;
        const ex = S.data.faq.find(x => x.id === it.id);
        if (ex) Object.assign(ex, it); else S.data.faq.push(Object.assign(it, { urutan: S.data.faq.length + 1 }));
        commitLocal(); P.toast('FAQ disimpan', ''); return true;
      });
  }

  /* ======================= PENGATURAN ======================= */
  const SET_GROUPS = [
    { t: 'Pemesanan', ic: 'arrow-up-right', f: [['LINK_LYNK', 'Link halaman Lynk.id', 'url', 'Semua tombol "Pesan" di website mengarah ke link ini.']] },
    { t: 'Kontak & Notifikasi', ic: 'whatsapp', f: [['NO_WA_ADMIN', 'Nomor WhatsApp admin', 'tel', 'Format 08… atau 62…'], ['PESAN_WA_DEFAULT', 'Pesan awal WhatsApp', 'textarea'], ['EMAIL_ADMIN', 'Email penerima notifikasi lead', 'email'], ['EMAIL_KONTAK', 'Email yang tampil di website', 'email'], ['JAM_LAYANAN', 'Jam layanan', 'text'], ['AUTO_REPLY', 'Email terima kasih otomatis', 'yn']] },
    { t: 'Teks Hero', ic: 'sparkle', f: [['HERO_JUDUL', 'Judul hero', 'text', 'Kata terakhir otomatis diberi gaya miring hijau.'], ['HERO_SUBJUDUL', 'Subjudul hero', 'textarea']] },
    { t: 'SEO & Media Sosial', ic: 'search', f: [['SEO_TITLE', 'Judul halaman (SEO)', 'text', 'Ideal ≤ 60 karakter.'], ['SEO_DESC', 'Deskripsi halaman (SEO)', 'textarea', 'Ideal ≤ 160 karakter.'], ['INSTAGRAM', 'URL Instagram', 'url'], ['TIKTOK', 'URL TikTok', 'url']] }
  ];
  PAGES.pengaturan = {
    template: () => '<div class="page-head"><div><span class="eyebrow">Konfigurasi</span><h1>Pengaturan</h1><p>Perubahan langsung dipakai website setelah disimpan.</p></div></div><div data-body></div>' +
      '<div class="panel" style="margin-top:16px"><div class="set-sec"><h3>' + P.icon('database') + ' Import Data dari Spreadsheet Lain</h3>' +
      '<p class="muted" style="font-size:14px;margin:-6px 0 14px">Pindahkan Leads, Testimoni, dan FAQ dari spreadsheet lama. Sumber hanya <b>dibaca</b>, data dicocokkan berdasarkan nama kolom, dan aman diulang (tidak menggandakan data).</p>' +
      '<div class="fields"><div class="field"><label for="impSrc">URL atau ID spreadsheet sumber</label><input class="input" id="impSrc" placeholder="https://docs.google.com/spreadsheets/d/…"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px">' + ['Leads', 'Testimoni', 'FAQ'].map(s => '<label class="switch"><input type="checkbox" data-imp="' + s + '" checked><span class="track"></span><span>' + s + '</span></label>').join('') +
      '<label class="switch"><input type="checkbox" id="impOver"><span class="track"></span><span>Perbarui data yang sudah ada</span></label></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn--outline" type="button" data-imp-run="dry">' + P.icon('search') + ' Pindai (dry-run)</button><button class="btn btn--primary" type="button" data-imp-run="real">' + P.icon('upload') + ' Jalankan Import</button></div>' +
      '<div id="impOut"></div></div></div></div>',
    init(el) {
      el.addEventListener('click', async e => {
        const b = e.target.closest('[data-imp-run]'); if (!b) return;
        const dry = b.dataset.impRun === 'dry', source = $('#impSrc', el).value.trim();
        if (!source) { P.toast('Isi sumber', 'Tempel URL spreadsheet sumber.', 'error'); return; }
        if (!dry && !(await confirmDialog('Jalankan import?', 'Data dari spreadsheet sumber akan ditambahkan ke database PATRA. Disarankan menjalankan Pindai dulu.', 'Jalankan'))) return;
        const label = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spinner"></span> Memproses…';
        const res = await P.api('importData', { source, dryRun: dry, overwrite: $('#impOver', el).checked, sheets: $$('[data-imp]', el).filter(c => c.checked).map(c => c.dataset.imp) });
        b.disabled = false; b.innerHTML = label;
        const out = $('#impOut', el);
        if (!res.success) { out.innerHTML = '<div class="alert alert--error">' + esc(res.message) + '</div>'; return; }
        const r = res.data;
        out.innerHTML = '<div class="alert alert--info" style="margin-top:4px">' + (r.dryRun ? 'Hasil pindai (belum ada yang ditulis)' : 'Import selesai') + ' — sumber: <b>' + esc(r.source.name) + '</b></div>' +
          '<table class="report"><thead><tr><th>Data</th><th>Di sumber</th><th>Ditambah</th><th>Diperbarui</th><th>Dilewati</th></tr></thead><tbody>' +
          Object.keys(r.report).map(k => '<tr><td>' + esc(k) + '</td><td>' + r.report[k].source + '</td><td>' + r.report[k].inserted + '</td><td>' + r.report[k].updated + '</td><td>' + r.report[k].skipped + '</td></tr>').join('') + '</tbody></table>' +
          (r.warnings.length ? '<ul class="muted" style="font-size:13px">' + r.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '');
        if (!r.dryRun) refresh(true);
      });
    },
    render(el) {
      if (el._dirty) return;                                  // jangan timpa isian yang belum disimpan
      const map = {}; (S.data.settings || []).forEach(s => { map[s.k] = s.v; });
      const field = f => {
        const [k, label, type, hint] = f, v = map[k] || '', id = 'set_' + k;
        let input;
        if (type === 'textarea') input = '<textarea class="textarea" id="' + id + '" data-k="' + k + '" style="min-height:90px">' + esc(v) + '</textarea>';
        else if (type === 'yn') input = '<select class="select" id="' + id + '" data-k="' + k + '"><option' + (v !== 'Tidak' ? ' selected' : '') + '>Ya</option><option' + (v === 'Tidak' ? ' selected' : '') + '>Tidak</option></select>';
        else input = '<input class="input" id="' + id + '" data-k="' + k + '" type="' + (type === 'tel' ? 'tel' : type === 'email' ? 'email' : type === 'url' ? 'url' : 'text') + '" value="' + esc(type === 'tel' && v ? '0' + P.normWa(v).slice(2) : v) + '">';
        const extra = k === 'LINK_LYNK' ? '<a class="btn btn--ghost btn--sm" href="' + esc(v) + '" target="_blank" rel="noopener" style="align-self:flex-start">' + P.icon('external') + ' Uji link</a>' : '';
        return '<div class="field" data-fk="' + k + '"><label for="' + id + '">' + label + '</label>' + input + (hint ? '<span class="field-hint">' + hint + '</span>' : '') + extra + '</div>';
      };
      $('[data-body]', el).innerHTML = '<form id="setForm" novalidate><div class="set-grid">' + SET_GROUPS.map(g => '<div class="panel set-sec"><h3>' + P.icon(g.ic) + esc(g.t) + '</h3><div class="fields">' + g.f.map(field).join('') + '</div></div>').join('') + '</div>' +
        '<div class="sticky-save"><button class="btn btn--ghost" type="reset">Batal</button><button class="btn btn--primary" type="submit">' + P.icon('check') + ' Simpan Pengaturan</button></div></form>';
      const form = $('#setForm', el);
      form.addEventListener('input', () => { el._dirty = true; });
      form.addEventListener('reset', () => { el._dirty = false; setTimeout(() => renderCurrent(true)); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const vals = {}; $$('[data-k]', form).forEach(i => { vals[i.dataset.k] = i.value.trim(); });
        $$('.field', form).forEach(f => { f.classList.remove('is-invalid'); const er = $('.field-error', f); if (er) er.remove(); });
        const btn = $('[type="submit"]', form), label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Menyimpan…';
        const res = await P.api('saveSettings', { settings: vals });
        btn.disabled = false; btn.innerHTML = label;
        if (!res.success) {
          const errs = (res.data && res.data.errors) || {};
          Object.keys(errs).forEach(k => { const f = $('[data-fk="' + k + '"]', form); if (f) { f.classList.add('is-invalid'); f.insertAdjacentHTML('beforeend', '<span class="field-error">' + P.icon('alert', 'ic-sm') + esc(errs[k]) + '</span>'); } });
          P.toast('Pengaturan belum tersimpan', res.message, 'error'); return;
        }
        Object.keys(vals).forEach(k => { const s = S.data.settings.find(x => x.k === k), v = k === 'NO_WA_ADMIN' ? P.normWa(vals[k]) : vals[k]; if (s) s.v = v; else S.data.settings.push({ k, v, d: '' }); });
        P.Store.del('content');
        el._dirty = false;
        commitLocal(); P.toast('Pengaturan disimpan', 'Website memakai pengaturan baru.');
      });
    }
  };

  /* ======================= PENGGUNA ======================= */
  PAGES.pengguna = {
    template: () => '<div class="page-head"><div><span class="eyebrow">Akses</span><h1>Pengguna</h1><p>Admin memiliki akses penuh. Staf CS hanya bisa melihat dashboard, leads, dan statistik.</p></div>' +
      '<div class="page-head__act"><button class="btn btn--primary" type="button" data-add>' + P.icon('user-plus') + ' Tambah Pengguna</button></div></div><div data-body></div>',
    init(el) {
      $('[data-add]', el).addEventListener('click', () => userModal(null));
      $('[data-body]', el).addEventListener('click', e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const u = S.data.users.find(x => x.email === b.closest('[data-email]').dataset.email);
        if (b.dataset.a === 'edit') userModal(u); else if (b.dataset.a === 'reset') resetModal(u);
      });
      $('[data-body]', el).addEventListener('change', async e => {
        const s = e.target.closest('[data-toggle]'); if (!s) return;
        const u = S.data.users.find(x => x.email === s.closest('[data-email]').dataset.email);
        u.aktif = s.checked; commitLocal();
        const res = await P.api('manageUser', { op: 'toggle', email: u.email });
        if (!res.success) { u.aktif = !s.checked; commitLocal(); P.toast('Gagal mengubah', res.message, 'error'); }
      });
    },
    render(el) {
      const list = S.data.users || [];
      $('[data-body]', el).innerHTML = '<div class="table-wrap"><div class="table-scroll"><table class="tbl"><thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Aktif</th><th>Login terakhir</th><th style="text-align:right">Aksi</th></tr></thead><tbody>' +
        list.map(u => '<tr data-email="' + esc(u.email) + '"><td class="strong">' + esc(u.nama) + (u.email === S.user.email ? ' <span class="badge badge--muted">Anda</span>' : '') + '</td><td>' + esc(u.email) + '</td>' +
          '<td>' + (u.peran === 'Admin' ? '<span class="badge badge--closing">Admin</span>' : '<span class="badge badge--baru">Staf CS</span>') + '</td>' +
          '<td><label class="switch"><input type="checkbox" data-toggle ' + (u.aktif ? 'checked' : '') + (u.email === S.user.email ? ' disabled' : '') + ' aria-label="Aktif"><span class="track"></span></label></td>' +
          '<td class="muted nowrap">' + (u.last ? esc(P.fmtRel(u.last)) : 'Belum pernah') + '</td>' +
          '<td><div class="actions"><button class="icon-btn" type="button" data-a="reset" aria-label="Reset password">' + P.icon('key') + '</button><button class="icon-btn" type="button" data-a="edit" aria-label="Ubah">' + P.icon('pencil') + '</button></div></td></tr>').join('') +
        '</tbody></table></div></div>';
    }
  };
  function userModal(u) {
    openModal(u ? 'Ubah Pengguna' : 'Tambah Pengguna',
      '<div class="field"><label for="uNama">Nama</label><input class="input" id="uNama" maxlength="80" value="' + esc(u ? u.nama : '') + '"></div>' +
      '<div class="field"><label for="uEmail">Email</label><input class="input" id="uEmail" type="email" value="' + esc(u ? u.email : '') + '" ' + (u ? 'disabled' : '') + '></div>' +
      '<div class="field"><label for="uPeran">Peran</label><select class="select" id="uPeran"' + (u && u.email === S.user.email ? ' disabled' : '') + '><option value="Staf"' + (u && u.peran === 'Staf' ? ' selected' : '') + '>Staf CS</option><option value="Admin"' + (u && u.peran === 'Admin' ? ' selected' : '') + '>Admin</option></select></div>' +
      (u ? '' : '<div class="field"><label for="uPass">Password sementara</label><input class="input" id="uPass" type="text" minlength="8" value="' + esc(genPass()) + '"><span class="field-hint">Minimal 8 karakter. Bagikan ke pengguna, lalu minta diganti setelah login.</span></div>'),
      'Simpan', async body => {
        const d = { op: u ? 'update' : 'add', email: u ? u.email : $('#uEmail', body).value.trim().toLowerCase(), nama: $('#uNama', body).value.trim(), peran: $('#uPeran', body).value };
        if (!u) d.password = $('#uPass', body).value;
        const res = await P.api('manageUser', d);
        if (!res.success) { P.toast('Gagal menyimpan', res.message, 'error'); return false; }
        if (u) Object.assign(u, { nama: d.nama || u.nama, peran: d.peran }); else S.data.users.push({ email: d.email, nama: d.nama || d.email, peran: d.peran, aktif: true, last: '' });
        commitLocal(); P.toast('Pengguna disimpan', d.email); return true;
      });
  }
  function resetModal(u) {
    openModal('Reset Password', '<p class="muted">Atur password baru untuk <b>' + esc(u.email) + '</b>. Pengguna akan keluar dari semua perangkat.</p><div class="field"><label for="rPass">Password baru</label><input class="input" id="rPass" type="text" value="' + esc(genPass()) + '"></div>', 'Reset', async body => {
      const res = await P.api('manageUser', { op: 'reset', email: u.email, password: $('#rPass', body).value });
      if (!res.success) { P.toast('Gagal', res.message, 'error'); return false; }
      P.toast('Password direset', u.email); return true;
    }, true);
  }
  function genPass() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; let s = 'Patra-'; const a = new Uint32Array(8); crypto.getRandomValues(a); a.forEach(n => { s += c[n % c.length]; }); return s; }
  function openPassword() {
    openModal('Ganti Password', '<div class="field"><label for="pOld">Password lama</label><input class="input" id="pOld" type="password" autocomplete="current-password"></div><div class="field"><label for="pNew">Password baru</label><input class="input" id="pNew" type="password" autocomplete="new-password" minlength="8"><span class="field-hint">Minimal 8 karakter.</span></div><div class="field"><label for="pNew2">Ulangi password baru</label><input class="input" id="pNew2" type="password" autocomplete="new-password"></div>', 'Simpan', async body => {
      const o = $('#pOld', body).value, n = $('#pNew', body).value;
      if (n.length < 8) { P.toast('Password terlalu pendek', 'Minimal 8 karakter.', 'error'); return false; }
      if (n !== $('#pNew2', body).value) { P.toast('Password tidak sama', 'Ulangi password baru dengan benar.', 'error'); return false; }
      const res = await P.api('changePassword', { old: o, password: n });
      if (!res.success) { P.toast('Gagal', res.message, 'error'); return false; }
      P.toast('Password diganti', ''); return true;
    }, true);
  }

  /* ======================= LOG ======================= */
  PAGES.log = {
    template: () => '<div class="page-head"><div><span class="eyebrow">Audit</span><h1>Log Aktivitas</h1><p>Riwayat login dan perubahan data oleh admin/staf (300 terbaru).</p></div></div>' +
      '<div class="toolbar"><div class="input-icon">' + P.icon('search') + '<input class="input input--pill" type="search" data-f="q" placeholder="Cari email atau detail…" aria-label="Cari log"></div><select class="select" data-f="aksi" aria-label="Jenis aksi"></select></div><div data-body></div>',
    init(el) {
      const v = S.v.log;
      $('[data-f="q"]', el).addEventListener('input', P.debounce(e => { v.q = e.target.value.trim().toLowerCase(); v.page = 1; renderCurrent(true); }, 250));
      $('[data-f="aksi"]', el).addEventListener('change', e => { v.aksi = e.target.value; v.page = 1; renderCurrent(true); });
      $('[data-body]', el).addEventListener('click', e => { const pg = e.target.closest('[data-pg]'); if (pg && !pg.disabled) { v.page = +pg.dataset.pg; renderCurrent(true); } });
    },
    render(el) {
      const v = S.v.log, logs = S.data.logs || [];
      const aksi = Array.from(new Set(logs.map(l => l.aksi))).sort();
      $('[data-f="aksi"]', el).innerHTML = optionList(aksi, v.aksi, 'Semua aksi');
      const list = logs.filter(l => (!v.aksi || l.aksi === v.aksi) && (!v.q || (l.email + ' ' + l.detail + ' ' + l.aksi).toLowerCase().indexOf(v.q) > -1));
      const pg = paginate(list, v.page); v.page = pg.page;
      $('[data-body]', el).innerHTML = '<div class="table-wrap">' + (pg.rows.length ? '<div class="table-scroll"><table class="tbl"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Detail</th></tr></thead><tbody>' +
        pg.rows.map(l => '<tr><td class="nowrap muted">' + esc(P.fmtRel(l.t)) + '</td><td>' + esc(l.email) + '</td><td><span class="chip">' + esc(l.aksi.replace(/_/g, ' ')) + '</span></td><td class="muted">' + esc(l.detail) + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty">' + P.icon('history') + '<span>Belum ada aktivitas.</span></div>') + pagerHtml(pg) + '</div>';
    }
  };

  /* ======================= LAYER: drawer, modal, konfirmasi ======================= */
  let lastFocus = null;
  function openLayer(html) {
    lastFocus = document.activeElement;
    const layer = $('#layer');
    layer.innerHTML = html;
    layer.addEventListener('click', onLayerClick);
    document.addEventListener('keydown', onLayerKey);
    document.body.style.overflow = 'hidden';
    return layer;
  }
  function onLayerClick(e) { if (e.target.closest('[data-close]')) closeLayer(); }
  function onLayerKey(e) {
    if (e.key === 'Escape') closeLayer();
    if (e.key === 'Tab') {                                     // jebakan fokus di dalam dialog
      const f = $$('#layer button:not([disabled]), #layer a[href], #layer input:not([disabled]), #layer select, #layer textarea');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function closeLayer() {
    const layer = $('#layer'); if (!layer || !layer.innerHTML) return;
    layer.innerHTML = '';
    layer.removeEventListener('click', onLayerClick);
    document.removeEventListener('keydown', onLayerKey);
    document.body.style.overflow = '';
    if (layer._resolve) { layer._resolve(false); layer._resolve = null; }
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  /** onSave(body) → true untuk menutup, false untuk tetap terbuka. */
  function openModal(title, bodyHtml, saveLabel, onSave, small) {
    const layer = openLayer('<div class="modal-wrap"><div class="overlay" data-close></div><div class="modal' + (small ? ' modal--sm' : '') + '" role="dialog" aria-modal="true" aria-labelledby="mTitle">' +
      '<div class="modal__head"><h2 id="mTitle">' + esc(title) + '</h2><button class="icon-btn" type="button" data-close aria-label="Tutup">' + P.icon('x') + '</button></div>' +
      '<form class="modal__body" novalidate>' + bodyHtml + '</form><div class="modal__foot"><button class="btn btn--ghost" type="button" data-close>Batal</button><button class="btn btn--primary" type="button" data-save>' + esc(saveLabel) + '</button></div></div></div>');
    const body = $('.modal__body', layer), save = $('[data-save]', layer);
    const run = async () => {
      const label = save.innerHTML; save.disabled = true; save.innerHTML = '<span class="spinner"></span> Menyimpan…';
      let okRes = false;
      try { okRes = await onSave(body); } catch (err) { P.toast('Terjadi kesalahan', err.message, 'error'); }
      if (okRes) closeLayer(); else { save.disabled = false; save.innerHTML = label; }
    };
    save.addEventListener('click', run);
    body.addEventListener('submit', e => { e.preventDefault(); run(); });
    const first = $('input:not([disabled]):not([type=file]),textarea,select', body); if (first) setTimeout(() => first.focus(), 30);
    return layer;
  }
  function confirmDialog(title, msg, okLabel) {
    return new Promise(resolve => {
      const layer = openLayer('<div class="modal-wrap"><div class="overlay" data-close></div><div class="modal modal--sm" role="alertdialog" aria-modal="true" aria-labelledby="cTitle"><div class="modal__body"><h2 id="cTitle" style="font-size:19px">' + esc(title) + '</h2><p class="muted">' + esc(msg) + '</p></div>' +
        '<div class="modal__foot"><button class="btn btn--ghost" type="button" data-close>Batal</button><button class="btn btn--danger" type="button" data-ok>' + esc(okLabel || 'Ya') + '</button></div></div></div>');
      layer._resolve = resolve;
      const ok = $('[data-ok]', layer); ok.focus();
      ok.addEventListener('click', () => { layer._resolve = null; closeLayer(); resolve(true); });
    });
  }

  start();
})();

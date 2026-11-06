/* ==========================================================================
   PATRA — Landing page
   Konten: cadangan (config.js) → cache perangkat → server (SWR, render bila berubah)
   ========================================================================== */
(function () {
  'use strict';
  const P = window.Patra;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let CONTENT = P.CFG.FALLBACK || { settings: {}, faq: [], testimoni: [] };

  P.hydrateIcons();
  $('#year').textContent = new Date().getFullYear();
  P.warmUp();

  /* ======================= INTRO VIDEO ======================= */
  (function intro() {
    const root = document.documentElement, box = $('#intro');
    if (!root.classList.contains('has-intro')) { box.remove(); return; }
    const video = $('#introVideo');
    let done = false, failTimer;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(failTimer);
      try { sessionStorage.setItem('patra:intro', '1'); } catch (e) {}
      box.classList.add('leaving');
      root.classList.remove('has-intro');
      box.setAttribute('aria-hidden', 'true');
      setTimeout(() => { try { video.pause(); } catch (e) {} box.remove(); revealHero(); }, 560);
    };
    $('#introSkip').addEventListener('click', finish);
    document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { finish(); document.removeEventListener('keydown', onKey); } });

    const showStatic = (ms) => { box.classList.add('static'); setTimeout(finish, ms); };
    if (root.classList.contains('intro-static')) { showStatic(1100); return; }

    const mobile = P.isMobile();
    video.src = 'assets/video/patra-logo-reveal-' + (mobile ? 'mobile' : 'desktop') + '.mp4';
    video.addEventListener('playing', () => { clearTimeout(failTimer); video.classList.add('playing'); }, { once: true });
    video.addEventListener('ended', finish);
    video.addEventListener('error', () => showStatic(900));
    failTimer = setTimeout(() => { if (!video.classList.contains('playing')) { try { video.pause(); } catch (e) {} showStatic(900); } }, 3000);
    const p = video.play();
    if (p && p.catch) p.catch(() => showStatic(900));
    setTimeout(finish, 7000);                       // pengaman: intro tidak pernah lebih dari 7 detik
  })();

  /* ======================= KONTEN DINAMIS ======================= */
  function applyContent(c) {
    const s = Object.assign({}, (P.CFG.FALLBACK || {}).settings, c.settings || {});
    const lynk = s.LINK_LYNK || 'https://lynk.id/patra';
    const wa = P.waLink(s.NO_WA_ADMIN, s.PESAN_WA_DEFAULT);
    $$('[data-order]').forEach(a => { a.href = lynk; });
    $$('[data-wa]').forEach(a => { a.href = wa; });

    if (s.HERO_JUDUL) {
      const words = s.HERO_JUDUL.trim().split(/\s+/);
      const last = words.pop();
      $('#heroTitle').innerHTML = P.esc(words.join(' ')) + (words.length ? ' ' : '') + '<em>' + P.esc(last) + '</em>';
    }
    if (s.HERO_SUBJUDUL) $('#heroSub').textContent = s.HERO_SUBJUDUL;
    $('#contactWa').textContent = P.fmtWa(s.NO_WA_ADMIN) || '-';
    if (s.EMAIL_KONTAK) { $('#contactEmail').textContent = s.EMAIL_KONTAK; $('#contactEmail').href = 'mailto:' + s.EMAIL_KONTAK; $('#footerEmail').href = 'mailto:' + s.EMAIL_KONTAK; }
    if (s.JAM_LAYANAN) $('#contactHours').textContent = s.JAM_LAYANAN;
    if (s.INSTAGRAM) $('#socIg').href = s.INSTAGRAM; else $('#socIg').hidden = true;
    if (s.TIKTOK) $('#socTt').href = s.TIKTOK; else $('#socTt').hidden = true;
    if (s.SEO_TITLE) document.title = s.SEO_TITLE;
    if (s.SEO_DESC) { const m = $('meta[name="description"]'); if (m) m.content = s.SEO_DESC; }

    renderFaq(c.faq && c.faq.length ? c.faq : (P.CFG.FALLBACK || {}).faq || []);
    renderTesti(c.testimoni && c.testimoni.length ? c.testimoni : (P.CFG.FALLBACK || {}).testimoni || []);
  }

  function renderFaq(list) {
    $('#faqList').innerHTML = list.map((f, i) =>
      '<details class="reveal in"' + (i === 0 ? ' open' : '') + '><summary>' + P.esc(f.q) + P.icon('plus') + '</summary><div class="faq__a">' + P.esc(f.a) + '</div></details>').join('');
  }

  function initials(n) { return String(n || '?').replace(/^(dr|drg|ir|h|hj)\.?\s+/i, '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase(); }
  function renderTesti(list) {
    const track = $('#testiTrack');
    track.innerHTML = list.map(t => {
      const stars = [1, 2, 3, 4, 5].map(i => P.icon('star', i <= (t.rating || 5) ? '' : 'off')).join('');
      const av = t.foto ? '<img src="' + P.esc(t.foto) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : P.esc(initials(t.nama));
      return '<article class="testi"><div class="testi__stars" role="img" aria-label="Rating ' + (t.rating || 5) + ' dari 5">' + stars + '</div>' +
        '<blockquote>“' + P.esc(t.isi) + '”</blockquote>' +
        '<div class="testi__who"><span class="avatar">' + av + '</span><span><b>' + P.esc(t.nama) + '</b><small>' + P.esc([t.bisnis, t.jenis].filter(Boolean).join(' · ')) + '</small></span></div></article>';
    }).join('');
    $('#testiDots').innerHTML = list.map((_, i) => '<span' + (i === 0 ? ' class="on"' : '') + '></span>').join('');
    updateDots();
  }

  // Tampilkan cadangan/cache segera, lalu segarkan dari server
  const cachedContent = P.Store.get('content', null);
  if (cachedContent && cachedContent.data) CONTENT = cachedContent.data;
  applyContent(CONTENT);
  const loadFresh = () => P.getContent().then(res => {
    if (!res || !res.success) return;
    const h = P.hashStr(JSON.stringify(res.data));
    P.Store.set('content', { t: Date.now(), h, data: res.data });
    if (!cachedContent || cachedContent.h !== h) { CONTENT = res.data; applyContent(CONTENT); }
  });
  if (window.requestIdleCallback) requestIdleCallback(loadFresh, { timeout: 1500 }); else setTimeout(loadFresh, 300);

  /* ======================= PELACAKAN KLIK ======================= */
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-order],[data-wa]');
    if (!a) return;
    let ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (err) {}
    P.beacon('trackClick', { jenis: a.hasAttribute('data-wa') ? 'wa' : 'pesan', posisi: a.dataset.pos || 'lainnya', perangkat: P.isMobile() ? 'mobile' : 'desktop', ref });
    if (a.closest('#mobileMenu')) closeMenu();
  });

  /* ======================= NAVBAR & MENU HP ======================= */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const menu = $('#mobileMenu'), menuBtn = $('#menuBtn');
  function openMenu() { menu.hidden = false; document.body.classList.add('menu-open'); menuBtn.setAttribute('aria-expanded', 'true'); $('#menuClose').focus(); }
  function closeMenu() { if (menu.hidden) return; menu.hidden = true; document.body.classList.remove('menu-open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.focus({ preventScroll: true }); }
  menuBtn.addEventListener('click', openMenu);
  $('#menuClose').addEventListener('click', closeMenu);
  $$('.mmenu__links a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  // Tautan menu aktif sesuai bagian yang terlihat
  const links = $$('.nav__links a');
  const secObs = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + en.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach(l => { const t = $(l.getAttribute('href')); if (t) secObs.observe(t); });

  /* ======================= ANIMASI MUNCUL ======================= */
  $$('.feat-grid, .biz-grid, .ps-grid').forEach(g => $$('.reveal', g).forEach((el, i) => el.style.setProperty('--d', (i * 70) + 'ms')));
  $$('.hero .reveal').forEach((el, i) => el.style.setProperty('--d', (i * 90) + 'ms'));
  const revObs = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); revObs.unobserve(en.target); }
  }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  function revealHero() { $$('.hero .reveal').forEach(el => el.classList.add('in')); }
  $$('.reveal').forEach(el => { if (!el.closest('.hero')) revObs.observe(el); });
  if (!document.documentElement.classList.contains('has-intro')) requestAnimationFrame(revealHero);

  /* ======================= KARTU 3D (desktop) ======================= */
  const stage = $('#cardStage'), card = $('#heroCard');
  if (stage && !reduceMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let raf = 0;
    const hero = $('.hero');
    hero.addEventListener('pointermove', e => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = stage.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--ry', (x * 14).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-y * 12).toFixed(2) + 'deg');
        card.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%');
      });
    });
    hero.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); card.style.setProperty('--mx', '30%'); });
  }

  /* ======================= BAR PESAN MENGAMBANG ======================= */
  const bar = $('#stickyBar');
  let pastHero = false, atContact = false;
  const setBar = () => {
    const show = pastHero && !atContact;
    bar.classList.toggle('show', show);
    bar.setAttribute('aria-hidden', show ? 'false' : 'true');
    $$('a', bar).forEach(a => a.tabIndex = show ? 0 : -1);
  };
  new IntersectionObserver(([en]) => { pastHero = !en.isIntersecting; setBar(); }, { threshold: 0 }).observe($('.hero__ctas'));
  new IntersectionObserver(([en]) => { atContact = en.isIntersecting; setBar(); }, { threshold: 0.15 }).observe($('#kontak'));

  /* ======================= SLIDER TESTIMONI ======================= */
  const track = $('#testiTrack');
  function step(dir) { const card0 = $('.testi', track); if (!card0) return; track.scrollBy({ left: dir * (card0.offsetWidth + 16), behavior: reduceMotion ? 'auto' : 'smooth' }); }
  $('#testiPrev').addEventListener('click', () => step(-1));
  $('#testiNext').addEventListener('click', () => step(1));
  function updateDots() {
    const tr = $('#testiTrack'), cards = $$('.testi', tr); if (!cards.length) return;
    const w = cards[0].offsetWidth + 16, i = Math.round(tr.scrollLeft / w);
    $$('#testiDots span').forEach((d, k) => d.classList.toggle('on', k === Math.min(i, cards.length - 1)));
  }
  track.addEventListener('scroll', P.debounce(updateDots, 60), { passive: true });

  /* ======================= FORM KONTAK ======================= */
  const form = $('#leadForm'), done = $('#leadDone'), submitBtn = $('#leadSubmit');
  const startedAt = Date.now();
  let cid = P.Store.get('cid', '');
  if (!cid) { cid = P.uuid(); P.Store.set('cid', cid); }
  const pesan = $('#fPesan');
  pesan.addEventListener('input', () => { $('#pesanCount').textContent = pesan.value.length + '/500'; });

  const rules = {
    nama: v => v.trim().length >= 2 || 'Nama wajib diisi (min. 2 karakter).',
    bisnis: v => v.trim().length >= 2 || 'Nama bisnis wajib diisi.',
    jenis: v => !!v || 'Pilih jenis usaha.',
    wa: v => /^62\d{8,13}$/.test(P.normWa(v)) || 'Nomor WhatsApp tidak valid (contoh: 0812xxxxxxx).',
    email: v => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Format email tidak valid.'
  };
  function setError(name, msg) {
    const f = $('.field[data-f="' + name + '"]', form); if (!f) return;
    const input = $('input,select,textarea', f);
    let err = $('.field-error', f);
    f.classList.toggle('is-invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) {
      if (!err) { err = document.createElement('span'); err.className = 'field-error'; err.id = input.id + 'Err'; f.appendChild(err); input.setAttribute('aria-describedby', err.id); }
      err.innerHTML = P.icon('alert', 'ic-sm') + P.esc(msg);
    } else if (err) { err.remove(); input.removeAttribute('aria-describedby'); }
  }
  function validateField(name) {
    const el = form.elements[name]; if (!el || !rules[name]) return true;
    const r = rules[name](el.value);
    setError(name, r === true ? '' : r);
    return r === true;
  }
  Object.keys(rules).forEach(n => {
    const el = form.elements[n];
    el.addEventListener('blur', () => { if (el.value || el.closest('.is-invalid')) validateField(n); });
    el.addEventListener('input', () => { if (el.closest('.is-invalid')) validateField(n); });
  });

  let pendingReq = null;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const bad = Object.keys(rules).filter(n => !validateField(n));
    if (bad.length) { form.elements[bad[0]].focus(); return; }
    const sent = P.Store.get('sent', []).filter(t => Date.now() - t < 3600e3);
    if (sent.length >= 3) { P.toast('Batas pengiriman tercapai', 'Silakan coba lagi nanti atau hubungi kami via WhatsApp.', 'error'); return; }

    const data = {
      nama: form.elements.nama.value.trim(), bisnis: form.elements.bisnis.value.trim(), jenis: form.elements.jenis.value,
      wa: form.elements.wa.value.trim(), email: form.elements.email.value.trim(), pesan: pesan.value.trim(),
      website: form.elements.website.value, elapsed: Date.now() - startedAt, cid, sumber: 'Form Website'
    };
    pendingReq = pendingReq || P.uuid();                  // reqId sama bila diulang → tidak dobel
    const label = submitBtn.innerHTML;
    submitBtn.setAttribute('aria-busy', 'true'); submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Mengirim…';
    const res = await P.api('submitLead', data, { reqId: pendingReq });
    submitBtn.removeAttribute('aria-busy'); submitBtn.disabled = false; submitBtn.innerHTML = label;

    if (res.success) {
      pendingReq = null;
      sent.push(Date.now()); P.Store.set('sent', sent);
      form.hidden = true; done.hidden = false; done.focus();
      form.reset(); $('#pesanCount').textContent = '0/500';
    } else if (res.data && res.data.errors) {
      Object.keys(res.data.errors).forEach(k => setError(k, res.data.errors[k]));
      const first = Object.keys(res.data.errors)[0]; if (form.elements[first]) form.elements[first].focus();
    } else {
      P.toast('Pesan belum terkirim', (res.message || 'Terjadi kesalahan.') + ' Anda juga bisa menghubungi kami via WhatsApp.', 'error');
    }
  });
  $('#leadAgain').addEventListener('click', () => { done.hidden = true; form.hidden = false; form.elements.nama.focus(); });
})();

/* The Son of God — audio dock + navbar + action bar + listen-along */
(() => {
  'use strict';

  // ---- Section manifest ----
  const SECTIONS = [
    { id: 'opening-credits',  label: 'Opening Credits',          short: 'Opening Credits',         audio: 'audio/00_Opening_Credits.mp3',     duration: 32,  listen: false, anchor: null },
    { id: 'epigraph',         label: 'Epigraph',                 short: 'Epigraph',                audio: 'audio/01_The_Epigraph.mp3',        duration: 12,  listen: true,  anchor: 'epigraph' },
    { id: 'revelation-prelude', label: 'The Revelation',         short: 'The Revelation',          audio: 'audio/02_The_Revelation.mp3',      duration: 20,  listen: true,  anchor: 'revelation-prelude' },
    { id: 'authors-testimony', label: 'Author\u2019s Testimony', short: 'Author\u2019s Testimony', audio: 'audio/03_Authors_Testimony.mp3',   duration: 23,  listen: true,  anchor: 'authors-testimony' },
    { id: 'preface',          label: 'Author\u2019s Preface',    short: 'Author\u2019s Preface',   audio: 'audio/04_Authors_Preface.mp3',     duration: 719, listen: true,  anchor: 'preface' },
    { id: 'roadmap',          label: 'Reader\u2019s Road Map',   short: 'Reader\u2019s Road Map',  audio: 'audio/05_Readers_Road_Map.mp3',    duration: 74,  listen: true,  anchor: 'roadmap' },
    { id: 'section-1',        label: 'Section 1 \u2014 The Revelation',     short: 'I',  audio: 'audio/06_Section_1.mp3', duration: 890, listen: true, anchor: 'section-1' },
    { id: 'section-2',        label: 'Section 2 \u2014 The Distinction',    short: 'II', audio: 'audio/07_Section_2.mp3', duration: 449, listen: true, anchor: 'section-2' },
    { id: 'section-3',        label: 'Section 3 \u2014 The Identity',       short: 'III', audio: 'audio/08_Section_3.mp3', duration: 434, listen: true, anchor: 'section-3' },
    { id: 'section-4',        label: 'Section 4 \u2014 The Inheritance',    short: 'IV', audio: 'audio/09_Section_4.mp3', duration: 493, listen: true, anchor: 'section-4' },
    { id: 'section-5',        label: 'Section 5 \u2014 The Recognition',    short: 'V',  audio: 'audio/10_Section_5.mp3', duration: 421, listen: true, anchor: 'section-5' },
    { id: 'section-6',        label: 'Section 6 \u2014 The Origin',         short: 'VI', audio: 'audio/11_Section_6.mp3', duration: 632, listen: true, anchor: 'section-6' },
    { id: 'section-7',        label: 'Section 7 \u2014 The Veiling',        short: 'VII', audio: 'audio/12_Section_7.mp3', duration: 439, listen: true, anchor: 'section-7' },
    { id: 'section-8',        label: 'Section 8 \u2014 The Transformation', short: 'VIII', audio: 'audio/13_Section_8.mp3', duration: 376, listen: true, anchor: 'section-8' },
    { id: 'section-9',        label: 'Section 9 \u2014 The Foundation',     short: 'IX', audio: 'audio/14_Section_9.mp3', duration: 220, listen: true, anchor: 'section-9' },
    { id: 'continue',         label: 'Continue the Journey',     short: 'Continue',                audio: 'audio/15_Continue_the_Journey.mp3', duration: 112, listen: true,  anchor: 'continue' },
    { id: 'closing-credits',  label: 'Closing Credits',          short: 'Closing Credits',         audio: 'audio/16_Closing_Credits.mp3',      duration: 27,  listen: false, anchor: null }
  ];

  const NAV_LINKS = [
    { idx: 6, label: 'I' }, { idx: 7, label: 'II' }, { idx: 8, label: 'III' },
    { idx: 9, label: 'IV' }, { idx: 10, label: 'V' }, { idx: 11, label: 'VI' },
    { idx: 12, label: 'VII' }, { idx: 13, label: 'VIII' }, { idx: 14, label: 'IX' }
  ];

  const audio = new Audio();
  audio.preload = 'metadata';
  let currentIdx = 0;
  let isPlaying = false;
  let listenAlongOn = true;
  let suppressAutoScroll = false;
  let suppressTimer = null;
  let currentSentenceEl = null;
  const timingsCache = new Map();      // section.id -> {sentences:[{start,end}, ...]} OR null (no file)
  const timingsLoading = new Set();
  const DRIFT_TOLERANCE_MS = 350;

  const STORAGE_KEY = 'boe-son-of-god-listen-state';
  const ACTION_BAR_MINIMIZED = 'boe-son-of-god-action-bar-minimized';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ---- Sentence-level prep: wrap sentences for highlighting ----
  function prepSentences() {
    const targets = [
      ...$$('.section .prose p'),
      ...$$('.section.frontispiece p')
    ];
    targets.forEach((p) => {
      // Only sentence-wrap if not already done
      if (p.dataset.sentPrepared) return;
      p.dataset.sentPrepared = '1';

      // Preserve inline children (<em>, <strong>, <a>) by walking text nodes only.
      // Strategy: clone the paragraph's HTML, split it on sentence terminators
      // while keeping tags balanced is complex; instead, use a simple text-only
      // split that preserves child tags by rebuilding via innerText pieces.
      const html = p.innerHTML;
      // Match sentences ending in . ! ? followed by whitespace/end, ignoring abbreviations is imperfect but acceptable.
      // Accept text + tags inside; only split at end-of-sentence boundaries that are at the top level.
      // Approach: traverse children, accumulating into sentence buckets.
      const sentences = splitIntoSentences(p);
      if (sentences.length === 0) return;
      p.innerHTML = '';
      sentences.forEach((nodes, i) => {
        const span = document.createElement('span');
        span.dataset.sent = String(i);
        nodes.forEach((n) => span.appendChild(n));
        p.appendChild(span);
        // Add space between sentences to preserve inline flow
        if (i < sentences.length - 1) p.appendChild(document.createTextNode(' '));
      });
    });
  }

  // Split a paragraph's children into arrays of nodes, one per sentence.
  function splitIntoSentences(p) {
    const out = [];
    let current = [];
    const children = Array.from(p.childNodes);

    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        // Split on terminators while keeping the terminator with the preceding sentence
        const parts = text.split(/(?<=[.!?\u201D\u2019])\s+(?=[A-Z\u201C\u2018\u2014])/);
        parts.forEach((part, i) => {
          if (part === '') return;
          // For all but the last part, this is a complete sentence — flush
          if (i < parts.length - 1) {
            current.push(document.createTextNode(part));
            out.push(current);
            current = [];
          } else {
            current.push(document.createTextNode(part));
          }
        });
      } else {
        // Element nodes (em, strong, a, etc) — keep with current sentence
        current.push(node.cloneNode(true));
      }
    }
    if (current.length) out.push(current);
    return out;
  }

  // ---- Timings: load JSON if present ----
  function timingsPath(sec) {
    // Derive from audio path: audio/06_Section_1.mp3 -> book/timings/06_Section_1.json
    // (book.js is loaded from book/, so relative path is timings/<basename>.json)
    if (!sec || !sec.audio) return null;
    const base = sec.audio.split('/').pop().replace(/\.mp3$/i, '');
    return `timings/${base}.json`;
  }

  async function ensureTimings(sec) {
    if (!sec) return null;
    if (timingsCache.has(sec.id)) return timingsCache.get(sec.id);
    if (timingsLoading.has(sec.id)) return null;
    timingsLoading.add(sec.id);
    try {
      const res = await fetch(timingsPath(sec));
      if (!res.ok) { timingsCache.set(sec.id, null); return null; }
      const data = await res.json();
      const sentences = Array.isArray(data) ? data : data.sentences;
      if (!Array.isArray(sentences) || !sentences.length) { timingsCache.set(sec.id, null); return null; }
      timingsCache.set(sec.id, { sentences });
      return timingsCache.get(sec.id);
    } catch (e) {
      timingsCache.set(sec.id, null);
      return null;
    } finally {
      timingsLoading.delete(sec.id);
    }
  }

  function highlightAtTime(sec, t) {
    if (!sec || !sec.anchor || !listenAlongOn) return;
    const root = document.getElementById(sec.anchor);
    if (!root) return;
    const sents = root.querySelectorAll('[data-sent]');
    if (!sents.length) return;

    const timings = timingsCache.get(sec.id);
    let activeIdx = -1;

    if (timings && timings.sentences && timings.sentences.length) {
      // ---- Real timestamps path ----
      // Apply drift tolerance: shift the boundary slightly so sentence becomes
      // active a hair before its true start (feels less laggy).
      const tol = DRIFT_TOLERANCE_MS / 1000;
      const tShifted = t + tol;
      const list = timings.sentences;
      const n = Math.min(list.length, sents.length);
      for (let i = 0; i < n; i++) {
        const s = list[i];
        const start = s.start;
        const end = (i + 1 < n) ? list[i + 1].start : (s.end || (audio.duration || 0));
        if (tShifted >= start && tShifted < end) { activeIdx = i; break; }
      }
      // Past-the-end: keep last sentence active
      if (activeIdx < 0 && t >= list[list.length - 1].start) activeIdx = Math.min(n - 1, sents.length - 1);
      if (activeIdx < 0) {
        // before first sentence — clear visual without leading the eye
        sents.forEach((el) => { el.classList.remove('sent--active'); el.classList.remove('sent--past'); });
        currentSentenceEl = null;
        return;
      }
    } else {
      // ---- Fallback: no timings yet. Auto-scroll only, no false highlight. ----
      // We do NOT pick an active sentence (would lead the eye wrong).
      // But we still want to keep the section's general area in view —
      // handled by the section-level scroll below.
      sents.forEach((el) => { el.classList.remove('sent--active'); el.classList.remove('sent--past'); });
      currentSentenceEl = null;
      // Lazily kick off a fetch so it's ready next time
      ensureTimings(sec);
      return;
    }

    const target = sents[activeIdx];
    if (target === currentSentenceEl) return;

    sents.forEach((el, i) => {
      el.classList.remove('sent--active');
      if (i < activeIdx) el.classList.add('sent--past');
      else el.classList.remove('sent--past');
    });
    target.classList.add('sent--active');
    currentSentenceEl = target;

    // Scroll the active sentence into view if it's drifted out of the comfortable zone
    if (!suppressAutoScroll) {
      const r = target.getBoundingClientRect();
      const vh = window.innerHeight;
      // Comfortable zone: 20%–55% from top
      if (r.top < vh * 0.18 || r.top > vh * 0.55) {
        const targetTop = window.scrollY + r.top - vh * 0.32;
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    }
  }

  function clearHighlights() {
    $$('[data-sent]').forEach((el) => {
      el.classList.remove('sent--active');
      el.classList.remove('sent--past');
    });
    currentSentenceEl = null;
  }

  // ---- Build navbar ----
  function buildNavbar() {
    const bar = document.createElement('header');
    bar.className = 'navbar';
    bar.id = 'navbar';

    const navLinks = NAV_LINKS.map(({ idx, label }) =>
      `<a class="navbar__link" href="#${SECTIONS[idx].anchor}" data-section-idx="${idx}">${label}</a>`
    ).join('');

    bar.innerHTML = `
      <div class="navbar__inner">
        <a class="navbar__brand" href="https://bookofelisha.org" target="_top" rel="noopener" title="Book of Elisha — Home">
          <img src="../assets/logos/wax-seal.png" alt="" />
          <span class="navbar__brand-text">Book of Elisha</span>
        </a>
        <button class="navbar__menu-btn" id="nav-menu-toggle" aria-label="Open navigation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <nav class="navbar__nav" id="navbar-nav">
          ${navLinks}
        </nav>
        <button class="navbar__contents-btn" id="nav-contents">Contents</button>
      </div>
    `;
    document.body.insertBefore(bar, document.body.firstChild);

    const onScroll = () => bar.classList.toggle('navbar--scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    $('#nav-contents').addEventListener('click', () => {
      const toc = document.getElementById('table-of-contents');
      if (toc) toc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#nav-menu-toggle').addEventListener('click', () => {
      $('#navbar-nav').classList.toggle('navbar__nav--open');
    });
    // Close mobile nav when a link is clicked, AND switch the audio dock
    // to that section so narration begins at the top of the new section.
    $$('#navbar-nav .navbar__link').forEach((l) => l.addEventListener('click', (e) => {
      $('#navbar-nav').classList.remove('navbar__nav--open');
      const idx = parseInt(l.dataset.sectionIdx, 10);
      if (!isNaN(idx)) {
        e.preventDefault();
        loadSection(idx, true, true);
      }
    }));

    // Track active section based on scroll
    window.addEventListener('scroll', updateActiveNavLink, { passive: true });
    updateActiveNavLink();
  }

  function updateActiveNavLink() {
    const links = $$('#navbar-nav .navbar__link');
    if (!links.length) return;
    let activeIdx = -1;
    NAV_LINKS.forEach(({ idx }, i) => {
      const sec = document.getElementById(SECTIONS[idx].anchor);
      if (!sec) return;
      const r = sec.getBoundingClientRect();
      if (r.top <= 120) activeIdx = i;
    });
    links.forEach((l, i) => l.classList.toggle('navbar__link--active', i === activeIdx));
  }

  // ---- Build action bar (Free Bundle / Order Paperback) ----
  function buildActionBar() {
    // Migrate old "dismissed" flag to "minimized" so existing visitors don't lose the CTA forever
    const oldDismissed = localStorage.getItem('boe-son-of-god-action-bar-dismissed');
    if (oldDismissed === '1') {
      localStorage.setItem(ACTION_BAR_MINIMIZED, '1');
      localStorage.removeItem('boe-son-of-god-action-bar-dismissed');
    }
    const startMinimized = localStorage.getItem(ACTION_BAR_MINIMIZED) === '1';

    const bar = document.createElement('aside');
    bar.className = 'action-bar' + (startMinimized ? ' action-bar--minimized' : '');
    bar.id = 'action-bar';
    bar.innerHTML = `
      <div class="action-bar__inner">
        <div class="action-bar__copy">
          <div class="action-bar__title">Loving the book?</div>
          <div class="action-bar__sub">Take it with you · Support the work</div>
        </div>
        <div class="action-bar__buttons">
          <a class="action-btn action-btn--secondary" href="https://www.bookofelisha.org/downloads/the-son-of-god" target="_top" rel="noopener">
            Free Digital Bundle
            <span class="action-btn__sub">No email. No signup.</span>
          </a>
          <a class="action-btn action-btn--primary" href="https://www.amazon.com/dp/B0GCDDFH3R?tag=bk00010a-20&th=1&psc=1&geniuslink=true" target="_top" rel="noopener">
            Order Paperback
            <span class="action-btn__sub">Fulfilled via Amazon</span>
          </a>
        </div>
        <button class="action-bar__toggle" id="action-bar-toggle" aria-label="Minimize">
          <svg class="action-bar__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <button class="action-bar__pill" id="action-bar-pill" aria-label="Show offers">
        <span class="action-bar__pill-dot" aria-hidden="true"></span>
        <span class="action-bar__pill-text">Get the book</span>
        <svg class="action-bar__pill-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
    `;
    document.body.appendChild(bar);

    function setMinimized(min) {
      bar.classList.toggle('action-bar--minimized', min);
      localStorage.setItem(ACTION_BAR_MINIMIZED, min ? '1' : '0');
      const toggle = $('#action-bar-toggle');
      if (toggle) toggle.setAttribute('aria-label', min ? 'Show offers' : 'Minimize');
    }
    $('#action-bar-toggle').addEventListener('click', () => setMinimized(true));
    $('#action-bar-pill').addEventListener('click', () => setMinimized(false));
  }

  // ---- Build end-of-book CTAs into Continue section ----
  function buildEndCta() {
    const cont = document.getElementById('continue');
    if (!cont) return;
    const block = document.createElement('div');
    block.className = 'endcta';
    block.innerHTML = `
      <div class="endcta__eyebrow">Carry it forward</div>
      <h3 class="endcta__title">Take the book with you</h3>
      <div class="endcta__buttons">
        <a class="action-btn action-btn--secondary" href="https://www.bookofelisha.org/downloads/the-son-of-god" target="_top" rel="noopener">
          Free Digital Bundle
          <span class="action-btn__sub">No email. No signup.</span>
        </a>
        <a class="action-btn action-btn--primary" href="https://www.amazon.com/dp/B0GCDDFH3R?tag=bk00010a-20&th=1&psc=1&geniuslink=true" target="_top" rel="noopener">
          Order Paperback
          <span class="action-btn__sub">Fulfilled via Amazon</span>
        </a>
      </div>
    `;
    cont.appendChild(block);
  }

  // ---- Build dock ----
  function buildDock() {
    const dock = document.createElement('div');
    dock.className = 'dock';
    dock.id = 'audio-dock';
    dock.setAttribute('role', 'region');
    dock.setAttribute('aria-label', 'Audiobook player');
    dock.innerHTML = `
      <div class="dock__inner">
        <div class="dock__label">
          <div class="dock__eyebrow">Now Playing</div>
          <div class="dock__title" id="dock-title">${SECTIONS[currentIdx].label}</div>
        </div>
        <div class="dock__center">
          <div class="dock__transport">
            <button class="dock__btn" id="dock-prev" aria-label="Previous section"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5L9 12l11 7z"/></svg></button>
            <button class="dock__btn" id="dock-back" aria-label="Back 15 seconds"><span class="dock__skip">15</span></button>
            <button class="dock__btn dock__btn--play" id="dock-play" aria-label="Play"><svg id="dock-play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l14 8-14 8z"/></svg></button>
            <button class="dock__btn" id="dock-fwd" aria-label="Forward 15 seconds"><span class="dock__skip">15</span></button>
            <button class="dock__btn" id="dock-next" aria-label="Next section"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l11 7L4 19z"/></svg></button>
          </div>
          <div class="dock__progress-row">
            <span id="dock-elapsed">0:00</span>
            <div class="dock__progress" id="dock-progress" role="slider" aria-label="Playback progress" tabindex="0">
              <div class="dock__progress-buffer" id="dock-buffer"></div>
              <div class="dock__progress-fill" id="dock-fill"></div>
            </div>
            <span id="dock-total">0:00</span>
          </div>
        </div>
        <div class="dock__right">
          <button class="dock__chip" id="dock-listen" title="Listen-along: highlight + auto-scroll">Listen-along</button>
          <button class="dock__chip" id="dock-speed" title="Playback speed">1×</button>
          <div class="dock__sections">
            <button class="dock__chip" id="dock-sections-toggle">Sections</button>
            <div class="dock__sections-menu" id="dock-sections-menu" role="menu"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(dock);

    const menu = $('#dock-sections-menu');
    SECTIONS.forEach((sec, i) => {
      const btn = document.createElement('button');
      btn.className = 'dock__sections-item';
      btn.dataset.idx = String(i);
      const num = i === 0 ? '·' : String(i).padStart(2, '0');
      btn.innerHTML = `<span class="dock__sections-item__num">${num}</span><span>${sec.label}</span><span class="dock__sections-item__time">${fmt(sec.duration)}</span>`;
      btn.addEventListener('click', () => { loadSection(i, true, true); closeSectionsMenu(); });
      menu.appendChild(btn);
    });
  }

  let bead;
  function buildBead() {
    bead = document.createElement('div');
    bead.className = 'now-playing-bead';
    bead.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bead);
  }

  function wireTocListenButtons() {
    $$('.toc__listen-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = SECTIONS.findIndex((s) => s.id === btn.dataset.sectionId);
        if (idx >= 0) loadSection(idx, true, true);
      });
    });
  }

  function loadSection(idx, autoplay, scroll) {
    if (idx < 0 || idx >= SECTIONS.length) return;
    clearHighlights();
    const sec = SECTIONS[idx];
    currentIdx = idx;
    audio.src = sec.audio;
    ensureTimings(sec);

    updateMediaSession(sec);
    $('#dock-title').textContent = sec.label;
    $('#dock-total').textContent = fmt(sec.duration);
    $('#dock-elapsed').textContent = '0:00';
    setProgress(0);

    $$('.dock__sections-item').forEach((b, i) => b.classList.toggle('dock__sections-item--active', i === idx));
    $$('.toc__listen-btn').forEach((b) => b.classList.toggle('toc__listen-btn--playing', b.dataset.sectionId === sec.id));
    $$('.section--playing').forEach((el) => el.classList.remove('section--playing'));
    if (sec.anchor) {
      const el = document.getElementById(sec.anchor);
      if (el) el.classList.add('section--playing');
    }

    // Scroll the page to the new section's heading when the user explicitly
    // changed track (prev/next, sections menu, listen button, navbar link).
    // Suppress auto-scroll briefly so the timeupdate handler doesn't fight us.
    if (scroll && sec.anchor) {
      const el = document.getElementById(sec.anchor);
      if (el) {
        suppressAutoScroll = true;
        clearTimeout(suppressTimer);
        suppressTimer = setTimeout(() => { suppressAutoScroll = false; }, 1400);
        // Account for the sticky navbar (~56px) so the heading isn't tucked under it.
        const navbarH = (document.getElementById('navbar')?.offsetHeight) || 56;
        const r = el.getBoundingClientRect();
        const targetTop = window.scrollY + r.top - navbarH - 12;
        window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      }
    }

    if (autoplay) audio.play().catch(() => {});
    persistState();
    updateBead();
  }

  function togglePlay() { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); }
  function setProgress(pct) { $('#dock-fill').style.width = pct + '%'; }
  function setBuffer() {
    if (audio.buffered.length === 0 || !audio.duration) return;
    const end = audio.buffered.end(audio.buffered.length - 1);
    $('#dock-buffer').style.width = (end / audio.duration * 100) + '%';
  }

  function updateBead() {
    if (!bead) return;
    const sec = SECTIONS[currentIdx];
    if (!sec.anchor || !isPlaying) { bead.classList.remove('now-playing-bead--visible'); return; }
    const el = document.getElementById(sec.anchor);
    if (!el) return;
    const titleEl = el.querySelector('.section__title') || el;
    const tr = titleEl.getBoundingClientRect();
    bead.style.top = Math.max(60, tr.top + tr.height / 2) + 'px';
    bead.classList.add('now-playing-bead--visible');
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        idx: currentIdx, time: audio.currentTime || 0,
        rate: audio.playbackRate || 1, listenAlong: listenAlongOn
      }));
    } catch (e) {}
  }

  function restoreState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.idx === 'number' && s.idx >= 0 && s.idx < SECTIONS.length) currentIdx = s.idx;
      if (typeof s.rate === 'number') {
        audio.playbackRate = s.rate;
        const chip = document.getElementById('dock-speed');
        if (chip) chip.textContent = s.rate + '×';
      }
      if (typeof s.listenAlong === 'boolean') listenAlongOn = s.listenAlong;
      if (typeof s.time === 'number') {
        audio.addEventListener('loadedmetadata', () => {
          if (s.time < audio.duration - 1) audio.currentTime = s.time;
        }, { once: true });
      }
    } catch (e) {}
  }

  const SPEEDS = [0.85, 1, 1.15, 1.35, 1.5];
  function cycleSpeed() {
    const cur = audio.playbackRate;
    let i = SPEEDS.indexOf(Number(cur.toFixed(2)));
    if (i < 0) i = SPEEDS.indexOf(1);
    i = (i + 1) % SPEEDS.length;
    audio.playbackRate = SPEEDS[i];
    $('#dock-speed').textContent = SPEEDS[i] + '×';
    persistState();
  }

  function closeSectionsMenu() { $('#dock-sections-menu').classList.remove('dock__sections-menu--open'); }
  function toggleSectionsMenu() { $('#dock-sections-menu').classList.toggle('dock__sections-menu--open'); }

  function wireDock() {
    $('#dock-play').addEventListener('click', togglePlay);
    $('#dock-prev').addEventListener('click', () => loadSection(Math.max(0, currentIdx - 1), true, true));
    $('#dock-next').addEventListener('click', () => loadSection(Math.min(SECTIONS.length - 1, currentIdx + 1), true, true));
    $('#dock-back').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
    $('#dock-fwd').addEventListener('click', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });

    const prog = $('#dock-progress');
    prog.addEventListener('click', (ev) => {
      const r = prog.getBoundingClientRect();
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const pct = Math.max(0, Math.min(1, x / r.width));
      if (audio.duration) audio.currentTime = pct * audio.duration;
    });

    $('#dock-speed').addEventListener('click', cycleSpeed);
    $('#dock-sections-toggle').addEventListener('click', toggleSectionsMenu);

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#dock-sections-menu') && !e.target.closest('#dock-sections-toggle')) closeSectionsMenu();
    });

    const listenBtn = $('#dock-listen');
    function syncListenChip() { listenBtn.classList.toggle('dock__chip--active', listenAlongOn); }
    listenBtn.addEventListener('click', () => {
      listenAlongOn = !listenAlongOn;
      syncListenChip();
      persistState();
      if (!listenAlongOn) clearHighlights();
    });
    syncListenChip();

    audio.addEventListener('play', () => {
      isPlaying = true;
      $('#dock-play-icon').innerHTML = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
      $('#dock-play').setAttribute('aria-label', 'Pause');
      updateBead();
    });
    audio.addEventListener('pause', () => {
      isPlaying = false;
      $('#dock-play-icon').innerHTML = '<path d="M7 4l14 8-14 8z"/>';
      $('#dock-play').setAttribute('aria-label', 'Play');
      updateBead();
    });
    audio.addEventListener('timeupdate', () => {
      if (!audio.duration) return;
      const pct = audio.currentTime / audio.duration * 100;
      setProgress(pct);
      $('#dock-elapsed').textContent = fmt(audio.currentTime);
      highlightAtTime(SECTIONS[currentIdx], audio.currentTime);
    });
    audio.addEventListener('progress', setBuffer);
    audio.addEventListener('loadedmetadata', () => { $('#dock-total').textContent = fmt(audio.duration); });
    audio.addEventListener('ended', () => {
      if (currentIdx < SECTIONS.length - 1) loadSection(currentIdx + 1, true, true);
    });

    audio.addEventListener('timeupdate', (() => {
      let last = 0;
      return () => {
        const now = Date.now();
        if (now - last > 4000) { last = now; persistState(); }
      };
    })());

    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      if (Math.abs(window.scrollY - lastY) > 4) {
        suppressAutoScroll = true;
        clearTimeout(suppressTimer);
        suppressTimer = setTimeout(() => { suppressAutoScroll = false; }, 2200);
        lastY = window.scrollY;
        updateBead();
      }
    }, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, [contenteditable]')) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); loadSection(Math.max(0, currentIdx - 1), true, true); }
      else if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); loadSection(Math.min(SECTIONS.length - 1, currentIdx + 1), true, true); }
      else if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); }
      else if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); }
    });
  }

  function observeDockHeight() {
    const dock = document.getElementById("audio-dock");
    if (!dock || !window.ResizeObserver) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        document.documentElement.style.setProperty("--dock-height", entry.contentRect.height + "px");
      }
    });
    ro.observe(dock);
  }


  // ---- Media Session API (OS Lock Screen Controls) ----
  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', togglePlay);
    navigator.mediaSession.setActionHandler('pause', togglePlay);
    
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (currentIdx > 0) loadSection(currentIdx - 1, true, true);
      else { audio.currentTime = 0; if(!audio.paused) audio.play(); }
    });
    
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      if (currentIdx < SECTIONS.length - 1) loadSection(currentIdx + 1, true, true);
    });

    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skipTime = details.seekOffset || 15;
      audio.currentTime = Math.max(0, audio.currentTime - skipTime);
    });

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skipTime = details.seekOffset || 15;
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + skipTime);
    });

    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.fastSeek && 'fastSeek' in audio) audio.fastSeek(details.seekTime);
        else audio.currentTime = details.seekTime;
      });
    } catch(e) {
      // older browsers might not support seekto
    }
  }

  function updateMediaSession(sec) {
    if (!('mediaSession' in navigator)) return;
    
    // Check if the current URL is somewhat resolving to the imagery correctly.
    // We use an absolute or relative path that points to the cover image.
    // Because the html is in 'book/', the image is at '../assets/imagery/book-cover.jpg'
    
    navigator.mediaSession.metadata = new MediaMetadata({
      title: sec.label,
      artist: 'The Son of God — Book of Elisha',
      album: 'The Son of God',
      artwork: [
        { src: 'assets/imagery/book-cover.jpg', sizes: '512x512', type: 'image/jpeg' },
        { src: 'assets/imagery/book-cover.jpg', sizes: '256x256', type: 'image/jpeg' }
      ]
    });
  }

  function init() {
    prepSentences();
    buildNavbar();
    buildDock();
    buildBead();
    buildActionBar();
    buildEndCta();
    observeDockHeight();
    wireDock();
    wireTocListenButtons();
    setInterval(updateBead, 1500);
    setupMediaSession();
    restoreState();
    loadSection(currentIdx, false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

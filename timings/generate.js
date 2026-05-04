// Generate per-sentence timings JSON for each audio track.
// Uses transformers.js (Xenova/whisper) to get word-level timestamps,
// then matches them against the canonical sentence list in sentences.json.

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.allowLocalModels = false; // pull from HF CDN
env.useBrowserCache = true;   // cache model in IndexedDB so re-runs are fast

const MODEL_NAME = 'Xenova/whisper-base.en'; // ~150 MB; good accuracy for English narration
const $ = (s) => document.querySelector(s);
const rowsEl = $('#rows');
const logEl = $('#log');

let SENTENCES = null;
let SECTIONS = [];
let pipe = null;
let stopRequested = false;
let running = false;
const results = {}; // section_id -> JSON object

function log(msg, kind) {
  const p = document.createElement('p');
  p.className = 'log__line' + (kind === 'err' ? ' log__line--err' : '');
  const t = new Date().toLocaleTimeString();
  p.textContent = `[${t}] ${msg}`;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}

async function init() {
  log('loading sentences.json…');
  const res = await fetch('sentences.json');
  SENTENCES = await res.json();
  SECTIONS = Object.entries(SENTENCES.sections).map(([id, data]) => ({ id, ...data, status: 'pending' }));
  buildRows();
  updateSummary();
  log(`loaded ${SECTIONS.length} sections, ${SECTIONS.reduce((n, s) => n + s.sentence_count, 0)} total sentences`);
}

function buildRows() {
  rowsEl.innerHTML = '';
  SECTIONS.forEach((sec, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.id = `row-${sec.id}`;
    row.innerHTML = `
      <span class="row__num">${String(i + 1).padStart(2, '0')}</span>
      <span class="row__label">${sec.audio} · ${sec.sentence_count} sentences</span>
      <div class="row__progress"><div class="row__progress-fill" id="bar-${sec.id}"></div></div>
      <span class="row__status" id="status-${sec.id}">Pending</span>
    `;
    rowsEl.appendChild(row);
  });
}

function setStatus(secId, status, label) {
  const el = document.getElementById(`status-${secId}`);
  if (!el) return;
  el.className = 'row__status row__status--' + status;
  el.textContent = label;
  const sec = SECTIONS.find(s => s.id === secId);
  if (sec) sec.status = status;
  updateSummary();
}

function setProgress(secId, pct) {
  const el = document.getElementById(`bar-${secId}`);
  if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function updateSummary() {
  let done = 0, running = 0, pending = 0, failed = 0;
  for (const s of SECTIONS) {
    if (s.status === 'done') done++;
    else if (s.status === 'running') running++;
    else if (s.status === 'error') failed++;
    else pending++;
  }
  $('#sum-done').textContent = done;
  $('#sum-running').textContent = running;
  $('#sum-pending').textContent = pending;
  $('#sum-failed').textContent = failed;
  $('#download-btn').disabled = done === 0;
}

// ---- Sentence matching (mirrors align.py) ----
function normalize(s) {
  return s.toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokenize(s) { return normalize(s).split(' ').filter(Boolean); }

function alignWordsToSentences(words, sentences, audioDur) {
  // words: [{word, start, end}, ...]
  // sentences: [string, ...]
  const out = [];
  let wi = 0;
  for (let s = 0; s < sentences.length; s++) {
    const target = tokenize(sentences[s]);
    if (!target.length) continue;
    if (wi >= words.length) break;
    const startT = words[wi].start;
    let ti = 0, endT = startT, lastMatchWi = wi, mismatches = 0;
    const startWi = wi;
    while (wi < words.length && ti < target.length) {
      const wn = normalize(words[wi].word);
      if (!wn) { wi++; continue; }
      if (wn === target[ti] || target[ti].startsWith(wn) || wn.startsWith(target[ti])) {
        endT = words[wi].end;
        lastMatchWi = wi;
        wi++; ti++;
        mismatches = 0;
      } else {
        // mismatch - skip whisper word
        wi++;
        mismatches++;
        if (mismatches > 8) break; // give up on this sentence's tail
      }
    }
    out.push({
      start: Number(startT.toFixed(3)),
      end: Number(endT.toFixed(3)),
      text: sentences[s]
    });
    // Don't let runaway mismatch eat too many words
    if (wi - startWi > target.length * 4) {
      wi = lastMatchWi + 1;
    }
  }
  return out;
}

// ---- Audio loading ----
async function loadAudio(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  // Decode to Float32 PCM 16kHz mono (Whisper's expected format)
  const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 16000, 16000);
  const audioBuf = await ctx.decodeAudioData(buf);
  // If the source is multi-channel or non-16kHz, resample manually with another OfflineAudioContext
  const out = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, audioBuf.duration * 16000, 16000);
  const src = out.createBufferSource();
  src.buffer = audioBuf;
  src.connect(out.destination);
  src.start();
  const rendered = await out.startRendering();
  return rendered.getChannelData(0);
}

// ---- Run one section ----
async function alignSection(sec) {
  setStatus(sec.id, 'running', 'Loading audio');
  setProgress(sec.id, 5);
  const audioUrl = `../audio/${sec.audio}`;
  let pcm;
  try {
    pcm = await loadAudio(audioUrl);
  } catch (e) {
    log(`  audio load failed: ${e.message}`, 'err');
    setStatus(sec.id, 'error', 'Audio fail');
    return;
  }
  setProgress(sec.id, 15);
  setStatus(sec.id, 'running', 'Transcribing');

  let result;
  try {
    result = await pipe(pcm, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: 'word',
      language: 'english',
      task: 'transcribe',
    });
  } catch (e) {
    log(`  whisper error: ${e.message}`, 'err');
    setStatus(sec.id, 'error', 'Whisper fail');
    return;
  }
  setProgress(sec.id, 80);
  setStatus(sec.id, 'running', 'Aligning');

  // result.chunks: [{ text, timestamp: [start, end] }]
  const words = (result.chunks || []).map(c => ({
    word: c.text || '',
    start: c.timestamp?.[0] ?? 0,
    end: c.timestamp?.[1] ?? 0
  })).filter(w => w.word.trim() && isFinite(w.start) && isFinite(w.end));

  if (!words.length) {
    log(`  no word timestamps produced`, 'err');
    setStatus(sec.id, 'error', 'No words');
    return;
  }

  const aligned = alignWordsToSentences(words, sec.sentences, pcm.length / 16000);

  results[sec.id] = {
    version: 1,
    audio: sec.audio,
    section_id: sec.id,
    sentence_count: aligned.length,
    duration: Number((pcm.length / 16000).toFixed(3)),
    sentences: aligned
  };
  setProgress(sec.id, 100);
  setStatus(sec.id, 'done', `Done (${aligned.length})`);
  log(`  ✓ ${sec.id}: ${aligned.length} sentences from ${words.length} words`);
}

async function startAll() {
  if (running) return;
  running = true;
  stopRequested = false;
  $('#start-btn').disabled = true;
  $('#stop-btn').disabled = false;

  if (!pipe) {
    log(`loading whisper model (${MODEL_NAME})… first time may take a few minutes`);
    pipe = await pipeline('automatic-speech-recognition', MODEL_NAME, {
      progress_callback: (p) => {
        if (p.status === 'progress' && p.file) {
          log(`  ${p.file}: ${(p.progress || 0).toFixed(1)}%`);
        }
      }
    });
    log('model loaded');
  }

  const start = Date.now();
  for (let i = 0; i < SECTIONS.length; i++) {
    if (stopRequested) { log('stopped by user'); break; }
    const sec = SECTIONS[i];
    if (sec.status === 'done') continue;
    log(`\n[${i + 1}/${SECTIONS.length}] ${sec.audio}`);
    try {
      await alignSection(sec);
    } catch (e) {
      log(`  unexpected error: ${e.message}`, 'err');
      setStatus(sec.id, 'error', 'Error');
    }
    const mins = ((Date.now() - start) / 60000).toFixed(1);
    $('#sum-time').textContent = `Elapsed: ${mins} min`;
  }

  running = false;
  $('#start-btn').disabled = false;
  $('#stop-btn').disabled = true;
  log('\n=== batch complete ===');
}

function stop() { stopRequested = true; log('stop requested — finishing current section…'); }

async function downloadZip() {
  // Use a tiny zip writer (no deps) — write each result as a JSON file.
  // Implementation: build a single ZIP via the browser's CompressionStream-free path.
  // We'll use JSZip from CDN.
  log('packaging zip…');
  const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
  const zip = new JSZip();
  let count = 0;
  for (const sec of SECTIONS) {
    const data = results[sec.id];
    if (!data) continue;
    zip.file(sec.timings_file, JSON.stringify(data, null, 2));
    count++;
  }
  if (!count) { log('  nothing to download yet', 'err'); return; }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'son-of-god-timings.zip';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  log(`  zipped ${count} timing files → son-of-god-timings.zip`);
}

$('#start-btn').addEventListener('click', startAll);
$('#stop-btn').addEventListener('click', stop);
$('#download-btn').addEventListener('click', downloadZip);

init().catch(e => log('init error: ' + e.message, 'err'));

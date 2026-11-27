"use strict";
// Sentence Puzzle. Version fallback must match meta.json and sw.js.
// Playback: sentence.audio (Fish voice-over), then oa (original), then a (Kokoro), then Web Speech.
// Naval sentences come from naval.json. Scary and Naval mp3s live under audio/ and are cached on first play.

const VERSION_FALLBACK = "15";
const STATS_KEY = "puzzle_stats";
const MASTERY_KEY = "puzzle_mastery";
const SESSION_KEY = "puzzle_session";
const DAYS_KEY = "puzzle_days";
const WORD_AUDIO_KEY = "puzzle_word_audio";
const HAPTICS_KEY = "puzzle_haptics";
const TZ = "America/New_York";

const THEMES = [
  { id: "All", en: "All", zh: "全部" },
  { id: "Lash", en: "Lash", zh: "美睫" },
  { id: "Dealer", en: "Dealer", zh: "发牌" },
  { id: "Interview", en: "Interview", zh: "面试" },
  { id: "Daily", en: "Daily", zh: "日常" },
  { id: "Scary", en: "Scary", zh: "惊悚" },
  { id: "Naval", en: "Naval", zh: "原句" }
];
const LEVELS = [
  { id: 1, en: "Short SVO", zh: "简单短句" },
  { id: 2, en: "Time / place", zh: "时间地点" },
  { id: 3, en: "Questions", zh: "疑问句" },
  { id: 4, en: "Negatives", zh: "否定句" },
  { id: 5, en: "Prepositions", zh: "介词" },
  { id: 6, en: "Clauses", zh: "从句长句" }
];
const THEME_ZH = { Lash: "美睫", Dealer: "发牌", Interview: "面试", Daily: "日常", Scary: "惊悚", Naval: "Naval", All: "全部" };

let versionMeta = { v: VERSION_FALLBACK, built: "2026-11-22" };
let reg = null;
let BANK = [];
let NAVAL = [];
let byId = new Map();
let navalLoaded = false;
let storageOk = true;
let stats = { score: 0, streak: 0, bestStreak: 0, solved: 0 };
let mastery = {};
let round = null;
let loadError = false;
let badgeDay = "";
const ui = { screen: "home", theme: "All", level: 1, board: "all", historyOpen: false };
let settingsOpen = false;
const GEAR_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.65l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.59.22-1.14.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.8 8.48a.5.5 0 0 0 .12.65l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.92 14.17a.5.5 0 0 0-.12.65l1.92 3.32c.14.24.43.34.7.22l2.39-.96c.49.41 1.04.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.8c.24 0 .45-.18.5-.42l.36-2.54c.59-.22 1.14-.53 1.63-.94l2.39.96c.27.11.56.02.7-.22l1.92-3.32a.5.5 0 0 0-.12-.65l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';
const SPEAKER_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';


const player = new Audio();
player.preload = "auto";
const wordPlayer = new Audio();
wordPlayer.preload = "auto";
let playToken = 0;
let wordPlayToken = 0;
let listening = false;

const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function readJSON(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && typeof v === "object" ? v : null;
  } catch (e) { return null; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { storageOk = false; }
}
const nyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
});
function nyToday(date) {
  return nyFmt.format(date || new Date());
}
function loadDays() {
  const v = readJSON(DAYS_KEY);
  return v || {};
}
function todayCount() {
  return loadDays()[nyToday()] | 0;
}
function bumpToday() {
  const days = loadDays();
  const k = nyToday();
  days[k] = (days[k] | 0) + 1;
  const keys = Object.keys(days).sort();
  while (keys.length > 120) delete days[keys.shift()];
  writeJSON(DAYS_KEY, days);
  renderBadge();
}
function last7() {
  const days = loadDays();
  const today = nyToday();
  const [y, m, d] = today.split("-").map(Number);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const t = new Date(Date.UTC(y, m - 1, d));
    t.setUTCDate(t.getUTCDate() - i);
    const iso = t.toISOString().slice(0, 10);
    out.push({ iso, n: days[iso] | 0 });
  }
  return out;
}
function dayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wk = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
  return wk + " " + m + "/" + d;
}

function normTok(w) {
  return String(w).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']+/g, "");
}
function sameSeq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function sameNorm(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = normTok(a[i]), y = normTok(b[i]);
    if (!x || x !== y) return false;
  }
  return true;
}
function isCorrect(words, sentence) {
  const lists = [sentence.tiles].concat(sentence.accepted || []);
  return lists.some((list) => sameSeq(words, list) || sameNorm(words, list));
}
function wordSlug(w) {
  const tok = normTok(w);
  return tok ? tok.replace(/'/g, "-") : "";
}
function wordAudioUrl(w) {
  const slug = wordSlug(w);
  return slug ? ("words/" + encodeURIComponent(slug) + ".mp3") : "";
}
function wordAudioAbs(w) {
  const rel = wordAudioUrl(w);
  return rel ? localAudioURL(rel) : "";
}
function wordAudioOn() {
  try {
    const v = localStorage.getItem(WORD_AUDIO_KEY);
    if (v === "0" || v === "off" || v === "false") return false;
  } catch (e) {}
  return true;
}
function setWordAudio(on) {
  try { localStorage.setItem(WORD_AUDIO_KEY, on ? "1" : "0"); } catch (e) {}
}
function hapticsOn() {
  try { return localStorage.getItem(HAPTICS_KEY) !== "0"; } catch (e) { return true; }
}
function setHaptics(on) {
  try { localStorage.setItem(HAPTICS_KEY, on ? "1" : "0"); } catch (e) {}
  if (!window.NovaHaptics) return;
  if (on) {
    try { NovaHaptics.init(); } catch (e) {}
  } else {
    // Defer so the iOS switch click can finish; onClickCapture may otherwise re-append the label.
    setTimeout(function () { try { NovaHaptics.stop(); } catch (e) {} }, 0);
  }
}
function clearWordHighlight() {
  document.querySelectorAll(".sent-word.on").forEach((el) => el.classList.remove("on"));
}

// Decoded clips for the sentence on screen. A tap then starts the buffer in the
// same turn instead of fetching and decoding the mp3 again.
const audioBuffers = new Map();
const audioInflight = new Map();
const warmQueue = [];
const warmQueued = new Set();
let warmScheduled = false;
let decodeChain = Promise.resolve();
let audioCtx = null;
let wordSource = null;
let sentenceSource = null;
const AUDIO_BUFFER_CAP = 96;

function audioContext() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { audioCtx = new AC(); } catch (e) { return null; }
  return audioCtx;
}
function unlockAudio() {
  const ctx = audioContext();
  if (ctx && ctx.state === "suspended") {
    try { ctx.resume().catch(() => {}); } catch (e) {}
  }
}
function decodeOne(ctx, raw) {
  const run = decodeChain.then(() => new Promise((res) => setTimeout(res, 0))).then(() => ctx.decodeAudioData(raw.slice(0)));
  decodeChain = run.then(() => {}, () => {});
  return run;
}
function rememberBuffer(url, buf) {
  if (audioBuffers.has(url)) audioBuffers.delete(url);
  audioBuffers.set(url, buf);
  while (audioBuffers.size > AUDIO_BUFFER_CAP) {
    audioBuffers.delete(audioBuffers.keys().next().value);
  }
}
function loadBuffer(url) {
  if (!url) return Promise.resolve(null);
  if (audioBuffers.has(url)) return Promise.resolve(audioBuffers.get(url));
  const pending = audioInflight.get(url);
  if (pending) return pending;
  const ctx = audioContext();
  if (!ctx) return Promise.resolve(null);
  const p = fetch(url).then((res) => {
    if (!res.ok) throw new Error(String(res.status));
    return res.arrayBuffer();
  }).then((raw) => decodeOne(ctx, raw)).then((buf) => {
    rememberBuffer(url, buf);
    return buf;
  }).catch(() => null);
  audioInflight.set(url, p);
  const clear = () => { if (audioInflight.get(url) === p) audioInflight.delete(url); };
  p.then(clear, clear);
  return p;
}
function scheduleWarm() {
  if (warmScheduled || !warmQueue.length) return;
  warmScheduled = true;
  setTimeout(() => {
    warmScheduled = false;
    let n = 0;
    while (n < 6 && warmQueue.length) {
      n++;
      const url = warmQueue.shift();
      warmQueued.delete(url);
      loadBuffer(url);
    }
    if (warmQueue.length) scheduleWarm();
  }, 0);
}
function enqueueWarm(urls) {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url || audioBuffers.has(url) || warmQueued.has(url) || audioInflight.has(url)) continue;
    warmQueued.add(url);
    warmQueue.push(url);
  }
  scheduleWarm();
}
function wordsIn(text, into) {
  const re = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*(?:[.:\-][A-Za-z0-9]+)*/g;
  const raw = String(text || "");
  let m;
  while ((m = re.exec(raw))) {
    const url = wordAudioAbs(m[0]);
    if (url) into.push(url);
  }
}
function warmSentence(s) {
  if (!s) return;
  const urls = [];
  if (wordAudioOn()) {
    const tiles = s.tiles || [];
    for (let i = 0; i < tiles.length; i++) {
      const url = wordAudioAbs(tiles[i]);
      if (url) urls.push(url);
    }
    wordsIn(s.q, urls);
    wordsIn(s.english, urls);
  }
  const field = audioField(s);
  if (field && field.url) urls.push(resolveAudioURL(field.url));
  else if (s.oa) urls.push(clipUrl(s.oa));
  if (s.a && s.a !== s.oa) urls.push(clipUrl(s.a));
  if (s.qAudio) urls.push(localAudioURL(s.qAudio));
  enqueueWarm(urls);
}
function stopNode(src) {
  if (!src) return;
  try { src.onended = null; } catch (e) {}
  try { src.stop(); } catch (e) {}
  try { src.disconnect(); } catch (e) {}
}
function stopWordSource() {
  const src = wordSource;
  wordSource = null;
  stopNode(src);
}
function stopSentenceSource() {
  const src = sentenceSource;
  sentenceSource = null;
  stopNode(src);
}
function stopWordAudio() {
  wordPlayToken++;
  stopWordSource();
  try { wordPlayer.pause(); } catch (e) {}
  try { wordPlayer.removeAttribute("src"); wordPlayer.load(); } catch (e) {}
  clearWordHighlight();
}
function playWordElement(url, token, el) {
  try { wordPlayer.pause(); } catch (e) {}
  wordPlayer.onended = () => {
    if (token !== wordPlayToken) return;
    if (el) el.classList.remove("on");
  };
  wordPlayer.onerror = () => {
    if (token !== wordPlayToken) return;
    if (el) el.classList.remove("on");
  };
  try { wordPlayer.src = url; } catch (e) { return; }
  const p = wordPlayer.play();
  if (p && p.catch) p.catch(() => { if (token === wordPlayToken && el) el.classList.remove("on"); });
}
function playWordBuffer(url, token, el) {
  const buf = audioBuffers.get(url);
  const ctx = audioContext();
  if (!buf || !ctx) return false;
  let src;
  try {
    if (ctx.state !== "running") { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); }
    src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {
    try { if (src) src.disconnect(); } catch (e2) {}
    return false;
  }
  wordSource = src;
  src.onended = () => {
    if (wordSource === src) wordSource = null;
    if (token !== wordPlayToken) return;
    if (el) el.classList.remove("on");
  };
  return true;
}
function playWord(word, el) {
  if (!wordAudioOn()) return;
  markBusy(400);
  const url = wordAudioAbs(word);
  if (!url) return;
  const token = ++wordPlayToken;
  clearWordHighlight();
  if (el) el.classList.add("on");
  try { player.pause(); } catch (e) {}
  setListening(false);
  stopSentenceSource();
  stopWordSource();
  if (playWordBuffer(url, token, el)) return;
  // This clip is not decoded yet. Play it the old way, and decode it next.
  const at = warmQueue.indexOf(url);
  if (at > 0) {
    warmQueue.splice(at, 1);
    warmQueue.unshift(url);
  }
  loadBuffer(url);
  playWordElement(url, token, el);
}
function sentenceWordsHTML(text) {
  const raw = String(text || "");
  if (!wordAudioOn()) return esc(raw);
  // Contractions (It's, that's, don't) stay one word; trailing punctuation stays outside the button.
  return raw.replace(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*(?:[.:\-][A-Za-z0-9]+)*/g, (word) => {
    if (!normTok(word)) return esc(word);
    return '<button type="button" class="sent-word" data-act="say-word" data-word="' + esc(word) + '">' + esc(word) + "</button>";
  });
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function isPlayable(s) {
  return !!(s && s.playable !== false && s.tiles && s.tiles.length >= 3);
}
function normalize(s) {
  const oa = s.oa || (s.sourceAudio ? String(s.sourceAudio).replace(/^content\//, "") : "");
  return {
    id: s.id,
    theme: s.theme,
    level: s.level | 0,
    english: s.english || "",
    chinese: s.chinese || s.zh || "",
    tiles: s.tiles || [],
    accepted: s.accepted || [],
    playable: s.playable !== false,
    audio: s.audio || null,
    d: s.d != null ? +s.d : null,
    start: s.start != null ? +s.start : null,
    end: s.end != null ? +s.end : null,
    voice: s.voice || "",
    oa: oa,
    a: s.a || "",
    sourceFile: s.sourceFile || "",
    sourceTitle: s.sourceTitle || "",
    board: s.board || s.sourceFile || "",
    boardTitle: s.boardTitle || s.sourceTitle || "",
    q: s.q || "",
    qZh: s.qZh || "",
    qAudio: s.qAudio || "",
    context: s.context || "",
    contextZh: s.contextZh || ""
  };
}
function reindex() {
  byId = new Map();
  BANK.forEach((s) => { if (isPlayable(s)) byId.set(s.id, s); });
  NAVAL.forEach((s) => { if (isPlayable(s)) byId.set(s.id, s); });
}
function findSentence(id) { return byId.get(id) || null; }
function countTheme(id) {
  if (id === "Naval") return navalLoaded ? NAVAL.filter(isPlayable).length : null;
  if (id === "All") return BANK.filter(isPlayable).length;
  return BANK.filter((s) => s.theme === id && isPlayable(s)).length;
}
function scaryBoards() {
  const map = new Map();
  BANK.forEach((s) => {
    if (s.theme !== "Scary" || !isPlayable(s)) return;
    const id = s.sourceFile || s.board || s.id;
    if (!map.has(id)) map.set(id, { id, title: s.sourceTitle || id, n: 0 });
    map.get(id).n++;
  });
  return Array.from(map.values());
}
function navalBoards() {
  const map = new Map();
  NAVAL.forEach((s) => {
    if (!isPlayable(s)) return;
    if (!map.has(s.board)) map.set(s.board, { id: s.board, title: s.boardTitle || s.board, n: 0 });
    map.get(s.board).n++;
  });
  return Array.from(map.values());
}
function interviewBoards() {
  const map = new Map();
  BANK.forEach((s) => {
    if (s.theme !== "Interview" || !isPlayable(s)) return;
    const id = s.board || s.id;
    if (!map.has(id)) map.set(id, { id, title: s.boardTitle || id, n: 0 });
    map.get(id).n++;
  });
  return Array.from(map.values());
}
function splitTitle(title) {
  const parts = String(title || "").split(" · ");
  return { en: parts[0] || title, zh: parts.slice(1).join(" · ") };
}
function selection() {
  if (ui.theme === "Naval") {
    let list = NAVAL.filter(isPlayable);
    if (ui.board && ui.board !== "all") list = list.filter((s) => s.board === ui.board);
    return list;
  }
  let list = BANK.filter(isPlayable);
  if (ui.theme !== "All") list = list.filter((s) => s.theme === ui.theme);
  if (ui.theme === "Scary") {
    if (ui.board && ui.board !== "all") list = list.filter((s) => (s.sourceFile || s.board) === ui.board);
    return list;
  }
  if (ui.theme === "Interview") {
    if (ui.board && ui.board !== "all") list = list.filter((s) => s.board === ui.board);
    return list;
  }
  return list.filter((s) => s.level === ui.level);
}
function keepOrder() {
  if (ui.theme === "Naval") return true;
  // Interview runs in PDF order, question by question, like a mock interview.
  if (ui.theme === "Interview") return true;
  if (ui.theme === "Scary" && ui.board && ui.board !== "all") return true;
  return false;
}
function masteryOf(id) {
  if (!mastery[id]) mastery[id] = { ok: 0, miss: 0, hints: 0, mastered: false, clean: false };
  return mastery[id];
}
let booted = false;
let saveSoon = false;
function saveSessionSoon() {
  if (saveSoon) return;
  saveSoon = true;
  // Write after the next paint so the tile can move before localStorage blocks.
  requestAnimationFrame(() => {
    setTimeout(() => {
      saveSoon = false;
      try { saveSession(); } catch (e) {}
    }, 0);
  });
}
function saveStats() { writeJSON(STATS_KEY, stats); }
function saveMastery() { writeJSON(MASTERY_KEY, mastery); }
function saveSession() {
  writeJSON(SESSION_KEY, {
    screen: ui.screen,
    theme: ui.theme,
    level: ui.level,
    board: ui.board,
    round: round ? {
      theme: round.theme,
      level: round.level,
      board: round.board,
      queue: round.queue,
      index: round.index,
      id: round.sentence ? round.sentence.id : null,
      placed: round.placed,
      bank: round.bank,
      bankLayout: round.bankLayout || null,
      locked: round.locked,
      phase: round.phase,
      hints: round.hints,
      scored: round.scored,
      misses: round.misses,
      feedback: round.feedback || ""
    } : null
  });
}
function levelName(id) {
  const lv = LEVELS.filter((x) => x.id === id)[0];
  return lv ? lv.en : "Level " + id;
}

function audioField(s) {
  const a = s && s.audio;
  if (!a) return null;
  if (typeof a === "string") return { url: a, start: s.start, end: s.end };
  if (typeof a === "object") {
    return {
      url: a.url || a.src || "",
      start: a.start != null ? +a.start : s.start,
      end: a.end != null ? +a.end : s.end
    };
  }
  return null;
}
function localAudioURL(url) {
  if (!url) return "";
  let raw = String(url).trim();
  if (/^(https?:|blob:|data:)/i.test(raw)) return raw;
  raw = raw.replace(/^\.\/+/, "");
  raw = raw.replace(/^(?:\.\.\/)+content\/audio\/scary\//, "audio/scary/");
  raw = raw.replace(/^content\/audio\/scary\//, "audio/scary/");
  if (raw.charAt(0) === "/") return new URL(raw, location.origin).href;
  return new URL(raw, document.baseURI).href;
}
function resolveAudioURL(url) { return localAudioURL(url); }
function clipUrl(rel) { return localAudioURL(rel); }
function voicePlan(s) {
  if (audioField(s)) return { kind: "audio", en: s.voice ? "Voice-over · " + s.voice : "Voice-over", zh: "配音" };
  if (s && s.oa) return { kind: "original", en: "Original", zh: "原声" };
  if (s && s.a) return { kind: "voice", en: "Voice", zh: "朗读" };
  return { kind: "speech", en: "Read aloud", zh: "朗读" };
}
function heardLabel(kind, voice) {
  if (kind === "audio" && voice) return "Voice-over · " + voice;
  const map = {
    audio: "Voice-over · 配音",
    original: "Original · 原声",
    voice: "Voice · 朗读",
    speech: "Read aloud · 朗读"
  };
  return map[kind] || "";
}
function stopPlayback() {
  playToken++;
  try { player.pause(); } catch (e) {}
  stopSentenceSource();
  if (window.speechSynthesis) speechSynthesis.cancel();
  setListening(false);
  stopWordAudio();
}
function playUrlBuffer(url, start, end, token) {
  const buf = audioBuffers.get(url);
  const ctx = audioContext();
  if (!buf || !ctx) return null;
  let src;
  try {
    if (ctx.state !== "running") { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); }
    stopSentenceSource();
    src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const t0 = start != null && isFinite(+start) ? Math.max(0, +start) : 0;
    const t1 = end != null && isFinite(+end) ? +end : null;
    if (t1 != null && t1 > t0) src.start(0, t0, t1 - t0);
    else if (t0 > 0) src.start(0, t0);
    else src.start(0);
  } catch (e) {
    try { if (src) src.disconnect(); } catch (e2) {}
    return null;
  }
  sentenceSource = src;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(!!ok);
    };
    src.onended = () => {
      if (sentenceSource === src) sentenceSource = null;
      if (token !== playToken) return finish(false);
      finish(true);
    };
  });
}
function playUrlElement(url, start, end, token) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(!!ok);
    };
    const el = player;
    el.onended = () => finish(true);
    el.onerror = () => finish(false);
    const t0 = start != null && isFinite(+start) ? Math.max(0, +start) : 0;
    const t1 = end != null && isFinite(+end) ? +end : null;
    const begin = () => {
      if (settled || token !== playToken) return finish(false);
      // Seeking to 0 before play delays the start. Only seek into a real clip.
      try { if (t0 > 0) el.currentTime = t0; } catch (e) {}
      const p = el.play();
      if (p && p.catch) p.catch(() => finish(false));
    };
    el.src = url;
    if (el.readyState >= 1) begin();
    else el.addEventListener("loadedmetadata", begin, { once: true });
    if (t1 != null) {
      const tick = () => {
        if (settled || token !== playToken) return;
        if (el.currentTime >= t1 - 0.04 && el.currentTime > t0) {
          try { el.pause(); } catch (e) {}
          return finish(true);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    setTimeout(() => {
      if (!settled && token === playToken && el.paused && (el.currentTime || 0) < 0.05) finish(false);
    }, 8000);
  });
}
function playUrl(url, start, end, token) {
  const via = playUrlBuffer(url, start, end, token);
  if (via) return via;
  loadBuffer(url);
  return playUrlElement(url, start, end, token);
}
function speak(text) {
  return new Promise((resolve) => {
    if (!text || !window.speechSynthesis) return resolve(false);
    let done = false;
    const finish = (ok) => { if (done) return; done = true; resolve(ok); };
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.92;
    u.onend = () => finish(true);
    u.onerror = () => finish(false);
    setTimeout(() => finish(false), 4000);
    try {
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { finish(false); }
  });
}
async function playSentence(sentence) {
  const token = ++playToken;
  try { player.pause(); } catch (e) {}
  stopSentenceSource();
  stopWordSource();
  if (window.speechSynthesis) speechSynthesis.cancel();
  const field = audioField(sentence);
  if (field && field.url) {
    const ok = await playUrl(resolveAudioURL(field.url), field.start, field.end, token);
    if (token !== playToken) return "";
    if (ok) return "audio";
  }
  if (sentence.oa) {
    const ok = await playUrl(clipUrl(sentence.oa), sentence.start, sentence.end, token);
    if (token !== playToken) return "";
    if (ok) return "original";
  }
  if (token !== playToken) return "";
  if (sentence.a && sentence.a !== sentence.oa) {
    const ok = await playUrl(clipUrl(sentence.a), null, null, token);
    if (token !== playToken) return "";
    if (ok) return "voice";
  }
  if (token !== playToken) return "";
  const spoke = await speak(sentence.english);
  if (token !== playToken) return "";
  return spoke ? "speech" : "";
}


function hasClip(s) {
  const field = audioField(s);
  if (field && field.url) return true;
  if (s && s.oa) return true;
  if (s && s.a) return true;
  return false;
}
function setListening(on) {
  listening = !!on;
  const btn = document.querySelector("[data-act=listen]");
  if (!btn) return;
  btn.classList.toggle("playing", listening);
  btn.setAttribute("aria-pressed", listening ? "true" : "false");
  btn.setAttribute("aria-label", listening ? "停止播放 Stop" : "播放原音 Play audio");
}
function onListen() {
  if (!round || !round.sentence || round.phase === "correct" || round.phase === "done") return;
  if (!hasClip(round.sentence)) return;
  if (listening) {
    stopPlayback();
    return;
  }
  const s = round.sentence;
  setListening(true);
  playSentence(s).then(() => {
    if (round && round.sentence === s) setListening(false);
  });
}

function dealTiles(sentence) {
  const ids = sentence.tiles.map((_, i) => i);
  let order = ids;
  for (let k = 0; k < 16; k++) {
    order = shuffle(ids);
    const words = order.map((i) => sentence.tiles[i]);
    if (!isCorrect(words, sentence)) return order;
  }
  if (order.length > 1) {
    const swapped = order.slice();
    const t = swapped[0]; swapped[0] = swapped[1]; swapped[1] = t;
    if (!isCorrect(swapped.map((i) => sentence.tiles[i]), sentence)) return swapped;
  }
  return order;
}
function slotCorrect(sentence, placed, pos) {
  const idx = placed[pos];
  if (idx == null) return false;
  return normTok(sentence.tiles[idx]) === normTok(sentence.tiles[pos]);
}
function allLocked(locked) {
  return Array.isArray(locked) && locked.length && locked.every(Boolean);
}
function migrateBoard(sentence, placedIn, bankIn, lockedIn) {
  const n = sentence.tiles.length;
  const bank = Array.isArray(bankIn) ? bankIn.map((i) => i | 0) : [];
  if (Array.isArray(placedIn) && placedIn.length === n && Array.isArray(lockedIn) && lockedIn.length === n) {
    return {
      placed: placedIn.map((x) => (x == null || x === "" ? null : x | 0)),
      bank: bank,
      locked: lockedIn.map(Boolean)
    };
  }
  const compact = Array.isArray(placedIn) ? placedIn.filter((x) => x != null).map((i) => i | 0) : [];
  const placed = Array(n).fill(null);
  compact.forEach((idx, pos) => { if (pos < n) placed[pos] = idx; });
  const k = (lockedIn == null || Array.isArray(lockedIn)) ? 0 : (lockedIn | 0);
  const locked = Array(n).fill(false);
  for (let i = 0; i < k && i < n; i++) locked[i] = true;
  return { placed: placed, bank: bank, locked: locked };
}
function sane(sentence, placed, bank, locked) {
  const n = sentence.tiles.length;
  if (!Array.isArray(placed) || placed.length !== n) return false;
  if (!Array.isArray(locked) || locked.length !== n) return false;
  if (!Array.isArray(bank)) return false;
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const p = placed[i];
    if (p == null) continue;
    if (p !== (p | 0) || p < 0 || p >= n || seen.has(p)) return false;
    seen.add(p);
    if (locked[i] && !slotCorrect(sentence, placed, i)) return false;
  }
  for (let i = 0; i < bank.length; i++) {
    const p = bank[i];
    if (p !== (p | 0) || p < 0 || p >= n || seen.has(p)) return false;
    seen.add(p);
  }
  return seen.size === n;
}
function bankLayoutFor(sentence, placed, bank, saved) {
  const n = sentence.tiles.length;
  if (Array.isArray(saved) && saved.length === n) {
    const seen = new Set();
    let good = true;
    for (let i = 0; i < n; i++) {
      const p = saved[i];
      if (p !== (p | 0) || p < 0 || p >= n || seen.has(p)) { good = false; break; }
      seen.add(p | 0);
    }
    if (good) return saved.map((x) => x | 0);
  }
  const out = [];
  const seen = new Set();
  const push = (p) => {
    if (p == null) return;
    p = p | 0;
    if (p < 0 || p >= n || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  (bank || []).forEach(push);
  (placed || []).forEach(push);
  for (let i = 0; i < n; i++) push(i);
  return out;
}
function beginAt(queue, index) {
  if (index >= queue.length) {
    round = {
      theme: ui.theme, level: ui.level, board: ui.board,
      queue: queue, index: index, sentence: null,
      placed: [], bank: [], locked: [], phase: "done",
      hints: 0, scored: false, misses: 0, heard: "", feedback: ""
    };
    ui.screen = "done";
    saveSession();
    render();
    return;
  }
  const sentence = findSentence(queue[index]);
  if (!sentence) { beginAt(queue, index + 1); return; }
  const dealt = dealTiles(sentence);
  round = {
    theme: ui.theme, level: ui.level, board: ui.board,
    queue: queue, index: index, sentence: sentence,
    placed: Array(sentence.tiles.length).fill(null),
    bank: dealt.slice(),
    bankLayout: dealt.slice(),
    locked: Array(sentence.tiles.length).fill(false),
    phase: "play", hints: 0, scored: false, misses: 0, heard: "", showZh: false, feedback: ""
  };
  ui.screen = "play";
  saveSession();
  render();
}
function filterMatchesRound() {
  return !!(round && round.theme === ui.theme && round.level === ui.level && round.board === ui.board);
}
async function onStart() {
  if (round && round.phase !== "done" && filterMatchesRound() && round.sentence) {
    ui.screen = "play";
    saveSession();
    render();
    return;
  }
  const list = selection();
  if (!list.length) { toast("No sentences in this set. 这组没有句子。"); render(); return; }
  const ids = list.map((s) => s.id);
  beginAt(keepOrder() ? ids : shuffle(ids), 0);
}
function snapTile(btn) {
  btn.classList.add("notrans");
  // Drop the class only after the new colors have painted, or the move fades.
  requestAnimationFrame(() => requestAnimationFrame(() => btn.classList.remove("notrans")));
}
function onPlace(i, btn) {
  if (!round || !round.sentence || round.phase === "correct" || round.phase === "done") return;
  i = i | 0;
  const at = round.bank.indexOf(i);
  if (at < 0) return;
  const slot = round.placed.indexOf(null);
  if (slot < 0) return;
  round.bank.splice(at, 1);
  round.placed[slot] = i;
  if (round.phase === "wrong") round.phase = "play";
  const node = btn && btn.dataset && btn.dataset.act === "place" ? btn : null;
  const empty = document.querySelector(".slots .slot");
  const hold = node && node.parentElement && node.parentElement.classList.contains("bank-hold") ? node.parentElement : null;
  if (node && empty && hold) {
    node.dataset.act = "unplace";
    node.dataset.slot = String(slot);
    node.removeAttribute("data-i");
    snapTile(node);
    empty.replaceWith(node);
    hold.classList.add("open");
    saveSessionSoon();
  } else {
    saveSession();
    render();
  }
  playWord(round.sentence.tiles[i]);
}
function onUnplace(slot, btn) {
  if (!round || !round.sentence || round.phase === "correct" || round.phase === "done") return;
  slot = slot | 0;
  if (slot < 0 || slot >= round.placed.length) return;
  if (round.locked[slot]) return;
  const i = round.placed[slot];
  if (i == null) return;
  round.placed[slot] = null;
  round.bank.push(i);
  if (round.phase === "wrong") round.phase = "play";
  const node = btn && btn.dataset && btn.dataset.act === "unplace" ? btn : null;
  const hold = document.querySelector('.bank-hold[data-hold="' + i + '"]');
  if (node && hold) {
    const empty = document.createElement("span");
    empty.className = "slot";
    node.replaceWith(empty);
    node.dataset.act = "place";
    node.dataset.i = String(i);
    node.removeAttribute("data-slot");
    node.classList.remove("locked");
    snapTile(node);
    hold.appendChild(node);
    hold.classList.remove("open");
    saveSessionSoon();
  } else {
    saveSession();
    render();
  }
}
function onHint() {
  if (!round || !round.sentence || round.phase === "correct" || round.phase === "done") return;
  const n = round.sentence.tiles.length;
  const need = Array.isArray(round.locked) ? round.locked.findIndex((x) => !x) : 0;
  if (need < 0 || need >= n) return;
  const fromBank = round.bank.indexOf(need);
  if (fromBank >= 0) round.bank.splice(fromBank, 1);
  else {
    const at = round.placed.indexOf(need);
    if (at >= 0) {
      if (round.locked[at]) return;
      round.placed[at] = null;
    }
  }
  const cur = round.placed[need];
  if (cur != null && cur !== need) round.bank.push(cur);
  round.placed[need] = need;
  round.locked[need] = true;
  round.hints++;
  saveSession();
  render();
}
function onCheck() {
  if (!round || !round.sentence || round.phase === "correct" || round.phase === "done") return;
  markBusy(800);
  const s = round.sentence;
  if (round.placed.some((x) => x == null)) {
    toast("Place every tile first. 请先放完所有词卡。");
    return;
  }
  const words = round.placed.map((i) => s.tiles[i]);
  if (isCorrect(words, s)) {
    round.feedback = "";
    onCorrect();
    return;
  }
  round.misses++;
  stats.streak = 0;
  const m = masteryOf(s.id);
  m.miss = (m.miss || 0) + 1;
  for (let i = 0; i < s.tiles.length; i++) {
    if (slotCorrect(s, round.placed, i)) {
      round.locked[i] = true;
      continue;
    }
    const tile = round.placed[i];
    if (tile != null) round.bank.push(tile);
    round.placed[i] = null;
  }
  round.phase = "play";
  round.feedback = "fix";
  saveMastery();
  saveStats();
  saveSession();
  render();
}
function onCorrect() {
  markBusy(800);
  const s = round.sentence;
  if (!round.scored) {
    round.scored = true;
    stats.score += 10;
    stats.streak += 1;
    stats.solved = (stats.solved || 0) + 1;
    if (stats.streak > (stats.bestStreak || 0)) stats.bestStreak = stats.streak;
    const m = masteryOf(s.id);
    m.ok = (m.ok || 0) + 1;
    m.hints = (m.hints || 0) + round.hints;
    m.mastered = true;
    if (round.hints === 0 && round.misses === 0) m.clean = true;
    saveMastery();
    saveStats();
    bumpToday();
  }
  round.phase = "correct";
  saveSession();
  render();
  playSentence(s).then((kind) => {
    if (!round || round.sentence !== s) return;
    round.heard = kind || "";
    const el = $("heard");
    if (el && kind) el.textContent = heardLabel(kind, s.voice);
  });
}
function onRetry() {
  if (!round) return;
  round.phase = "play";
  saveSession();
  render();
}
function onNext() {
  stopPlayback();
  if (!round) return;
  beginAt(round.queue, round.index + 1);
}
function onBack() {
  stopPlayback();
  ui.screen = "home";
  saveSession();
  render();
}
function onTheme(id) {
  ui.theme = id;
  ui.board = "all";
  ui.screen = "home";
  render();
}
let updateReloading = false;
let updatePending = "";
let updateApplyTimer = 0;
let updatePollTimer = 0;
let actionBusyUntil = 0;
const AUDIO_CACHE = "sentence-puzzle-audio";
const UPDATE_POLL_MS = 90000;
const UPDATE_RETRY_MS = 3000;

function markBusy(ms) {
  actionBusyUntil = Math.max(actionBusyUntil, Date.now() + (ms || 500));
}
function audioIsPlaying() {
  const playing = (el) => {
    try { return !!(el && !el.paused && !el.ended); } catch (e) { return false; }
  };
  if (listening) return true;
  if (wordSource || sentenceSource) return true;
  if (playing(player) || playing(wordPlayer)) return true;
  try { if (window.speechSynthesis && speechSynthesis.speaking) return true; } catch (e) {}
  return false;
}
function inputIsFocused() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}
function isUpdateBusy() {
  if (Date.now() < actionBusyUntil) return true;
  if (audioIsPlaying()) return true;
  if (inputIsFocused()) return true;
  return false;
}
function persistResume() {
  try { saveSession(); } catch (e) {}
  try {
    const snap = {
      screen: ui.screen,
      theme: ui.theme,
      level: ui.level,
      board: ui.board,
      id: round && round.sentence ? round.sentence.id : null,
      index: round ? round.index : 0,
      placed: round ? round.placed : null,
      bank: round ? round.bank : null,
      locked: round ? round.locked : null,
      phase: round ? round.phase : "",
      queue: round ? round.queue : null
    };
    const raw = JSON.stringify(snap);
    sessionStorage.setItem("puzzle_resume", raw);
    localStorage.setItem("puzzle_resume", raw);
  } catch (e) {}
}
function applyPendingUpdate() {
  if (!updatePending || updateReloading) return;
  if (isUpdateBusy()) {
    clearTimeout(updateApplyTimer);
    updateApplyTimer = setTimeout(applyPendingUpdate, UPDATE_RETRY_MS);
    return;
  }
  updateReloading = true;
  persistResume();
  toast("发现新版本，正在更新…");
  setTimeout(() => location.reload(), 1500);
}
function notePendingUpdate(next, current) {
  if (!next || next === current) return;
  updatePending = next;
  try {
    sessionStorage.setItem("puzzle_updated", next);
    sessionStorage.setItem("puzzle_updated_from", current);
  } catch (e) {}
  applyPendingUpdate();
}
function startUpdatePoll() {
  if (updatePollTimer) clearInterval(updatePollTimer);
  updatePollTimer = setInterval(() => {
    if (document.visibilityState === "visible") checkUpdate(false);
  }, UPDATE_POLL_MS);
}

function versionNewer(next, current) {
  if (next == null || current == null) return false;
  const a = String(next);
  const b = String(current);
  if (!a || !b) return false;
  const pa = a.split(".").map((x) => parseInt(x, 10));
  const pb = b.split(".").map((x) => parseInt(x, 10));
  if (pa.some((n) => !Number.isFinite(n)) || pb.some((n) => !Number.isFinite(n))) return false;
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}
async function freshMeta() {
  const res = await fetch("meta.json?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("meta");
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/html")) throw new Error("meta-html");
  return await res.json();
}
async function checkUpdate(manual) {
  try {
    const m = await freshMeta();
    const cur = String((versionMeta && versionMeta.v) || VERSION_FALLBACK);
    const next = m && m.v != null ? String(m.v) : "";
    if (reg) { try { await reg.update(); } catch (e) {} }
    if (next && next !== cur) {
      notePendingUpdate(next, cur);
    } else if (manual) toast("You're up to date. 已经是最新版本");
  } catch (e) {
    if (manual) toast("No network. Try again later. 没有网络，稍后再试");
  }
}
async function forceUpdate() {
  toast("Force updating… 正在强制更新…");
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
  } catch (e) {}
  try {
    for (const k of await caches.keys()) {
      if (k === AUDIO_CACHE) continue;
      if (k.startsWith("sentence-puzzle-")) await caches.delete(k);
    }
  } catch (e) {}
  try {
    const cur = String((versionMeta && versionMeta.v) || VERSION_FALLBACK);
    sessionStorage.setItem("puzzle_updated", "force");
    sessionStorage.setItem("puzzle_updated_from", cur);
  } catch (e) {}
  persistResume();
  location.reload();
}
let toastTimer = 0;
function placeToast(el) {
  const hdr = $("hdr");
  const dock = $("dock");
  const headerBottom = hdr ? hdr.getBoundingClientRect().bottom : 0;
  const dockTop = dock ? dock.getBoundingClientRect().top : window.innerHeight;
  const height = Math.max(el.offsetHeight, 44);
  let top = dockTop - height - 10;
  const minTop = headerBottom + 8;
  if (top < minTop) top = minTop;
  el.style.bottom = "auto";
  el.style.top = Math.ceil(top) + "px";
}
function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("on");
  placeToast(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 2600);
}


function currentAppearance() {
  return window.puzzleThemePref ? window.puzzleThemePref() : "light";
}
function syncSettingsUI() {
  const root = $("settings");
  if (!root) return;
  if (settingsOpen) root.removeAttribute("hidden");
  else root.setAttribute("hidden", "");
  const pref = currentAppearance();
  root.querySelectorAll(".theme-pick").forEach((el) => {
    const on = el.dataset.id === pref;
    el.classList.toggle("on", on);
    el.setAttribute("aria-checked", on ? "true" : "false");
  });
  const audioBtn = root.querySelector("[data-act=word-audio]");
  if (audioBtn) {
    const on = wordAudioOn();
    audioBtn.classList.toggle("on", on);
    audioBtn.setAttribute("aria-checked", on ? "true" : "false");
  }
  const hapBtn = root.querySelector("[data-act=haptics]");
  if (hapBtn) {
    const on = hapticsOn();
    hapBtn.classList.toggle("on", on);
    hapBtn.setAttribute("aria-checked", on ? "true" : "false");
  }
  const gear = document.querySelector(".gear");
  if (gear) gear.setAttribute("aria-expanded", settingsOpen ? "true" : "false");
}
function onWordAudioToggle() {
  setWordAudio(!wordAudioOn());
  syncSettingsUI();
  if (ui.screen === "play" && round && round.phase === "correct") render();
}
function onHapticsToggle() {
  setHaptics(!hapticsOn());
  syncSettingsUI();
}
function openSettings() {
  settingsOpen = true;
  if (ui.historyOpen) {
    ui.historyOpen = false;
    renderBadge();
  }
  syncSettingsUI();
}
function closeSettings() {
  if (!settingsOpen) return;
  settingsOpen = false;
  syncSettingsUI();
}
function onAppearance(id) {
  if (id !== "light" && id !== "dark" && id !== "auto") return;
  if (window.applyPuzzleTheme) window.applyPuzzleTheme(id);
  syncSettingsUI();
}

function headerHTML() {
  const ver = esc(versionMeta.v || VERSION_FALLBACK);
  if (ui.screen === "home") {
    return '<h1>Sentence Puzzle<span class="sub">语序拼图</span></h1>' +
      '<div class="hdr-tools"><span class="ver">v' + ver + '</span>' +
      '<button class="gear" type="button" data-act="settings" aria-label="设置 Settings" aria-haspopup="dialog" aria-expanded="' +
      (settingsOpen ? "true" : "false") + '">' + GEAR_SVG + "</button></div>";
  }
  const theme = round ? round.theme : ui.theme;
  const zh = THEME_ZH[theme] || "";
  let sub = zh;
  if (theme === "Interview") {
    const title = round && round.sentence ? (round.sentence.boardTitle || "") : "";
    const name = title ? title.split(" · ")[0] : "All parts";
    sub = (zh ? zh + " · " : "") + name;
  } else if (theme === "Scary" || theme === "Naval") {
    const title = round && round.sentence ? (round.sentence.boardTitle || "") : "";
    const name = title ? splitTitle(title).en : (ui.board === "all" ? "All stories" : "");
    sub = (zh ? zh + " · " : "") + (name || "Stories");
  } else {
    const lv = round ? round.level : ui.level;
    sub = (zh ? zh + " · " : "") + "Level " + lv + " · " + levelName(lv);
  }
  const pill = stats.score + " · streak " + stats.streak;
  return '<button class="back" type="button" data-act="back">‹ Back</button>' +
    "<h1>" + esc(theme === "All" ? "All" : theme) + '<span class="sub">' + esc(sub) + "</span></h1>" +
    '<span class="statpill">' + esc(pill) + "</span>";
}
function themeChips() {
  return THEMES.map((t) => {
    const n = countTheme(t.id);
    const sub = t.zh + " · " + (n == null ? "…" : n);
    return '<button type="button" class="chip' + (ui.theme === t.id ? " on" : "") + '" data-act="theme" data-id="' + t.id + '"><b>' +
      esc(t.en) + "</b><i>" + esc(sub) + "</i></button>";
  }).join("");
}
function levelGrid() {
  return LEVELS.map((lv) => (
    '<button type="button" class="lv' + (ui.level === lv.id ? " on" : "") + '" data-act="level" data-id="' + lv.id + '">' +
    '<span class="n">' + lv.id + '</span><span class="en">' + esc(lv.en) + '</span><span class="z">' + esc(lv.zh) + "</span></button>"
  )).join("");
}
function boardList(boards, allLabel, allZh, total) {
  const all = '<button type="button" class="board' + (ui.board === "all" ? " on" : "") + '" data-act="board" data-id="all"><b>' +
    esc(allLabel) + "</b><i>" + esc(allZh) + " · " + total + "</i></button>";
  const rows = boards.map((b) => {
    const parts = splitTitle(b.title);
    const on = ui.board === b.id ? " on" : "";
    return '<button type="button" class="board' + on + '" data-act="board" data-id="' + esc(b.id) + '"><b>' +
      esc(parts.en) + "</b><i>" + esc((parts.zh ? parts.zh + " · " : "") + b.n) + "</i></button>";
  }).join("");
  return '<div class="boards">' + all + rows + "</div>";
}
function homeMain() {
  if (loadError) {
    return '<div class="hero"><b>Couldn\'t load sentences</b><span class="zh">句子没有载入。检查网络后再打开。</span></div>';
  }
  const list = selection();
  const mastered = list.filter((s) => mastery[s.id] && mastery[s.id].mastered).length;
  let picker = "";
  if (ui.theme === "Scary") {
    const boards = scaryBoards();
    const total = boards.reduce((n, b) => n + b.n, 0);
    picker = '<div class="sec">Story<small>Grouped by story. 按故事分组，不按难度。</small></div>' +
      boardList(boards, "All stories", "全部故事", total);
  } else if (ui.theme === "Interview") {
    const boards = interviewBoards();
    const total = boards.reduce((n, b) => n + b.n, 0);
    picker = '<div class="sec">Part<small>Turning Stone dealer interview. 按 Part 分组，按顺序练。</small></div>' +
      boardList(boards.map((b) => {
        const t = String(b.title).split(" · ");
        return { id: b.id, n: b.n, title: t[0] + " – " + (t[1] || "") + " · " + t.slice(2).join(" · ") };
      }), "All parts", "全部", total);
  } else if (ui.theme === "Naval") {
    if (!navalLoaded) {
      picker = '<p class="loading">Couldn\'t load Naval. 读不到 Naval。</p>';
    } else if (!NAVAL.length) {
      picker = '<p class="loading">No Naval sentences yet. 还没有 Naval 句子。</p>';
    } else {
      const boards = navalBoards();
      const total = boards.reduce((n, b) => n + b.n, 0);
      picker = '<div class="sec">Topic<small>Grouped by topic. 按话题分组。</small></div>' +
        boardList(boards, "All topics", "全部话题", total);
    }
  } else {
    picker = '<div class="sec">Level<small>1 is short. 6 is longer. 从 1 到 6 变难。</small></div><div class="levels">' + levelGrid() + "</div>";
  }
  const note = storageOk
    ? "Saved on this phone. 进度保存在这台手机上。"
    : "This browser can't save. A reload clears the score. 无法保存时，刷新会清零。";
  return '<div class="hero"><b>Put the tiles in order</b><span class="zh">把词卡排成正确的句子</span>' +
    '<span class="en-note">Tap a tile to place it. Tap it again to take it back.</span>' +
    '<span class="zh">点词卡排序，再点一次可拿下来。</span></div>' +
    '<div class="sec">Theme<small>Choose a set. 先选主题。</small></div><div class="chips">' + themeChips() + "</div>" +
    picker +
    '<div class="session"><div class="row"><span class="k">This session</span><span class="v">Score ' + stats.score + " · streak " + stats.streak + "</span></div>" +
    '<div class="zh">本次 · 得分 · 连对</div>' +
    '<div class="row" style="margin-top:4px"><span class="k">Best ' + (stats.bestStreak || 0) + "</span><span class=\"v\">Mastered " + mastered + "/" + list.length + "</span></div>" +
    '<div class="zh">最高连对 · 已掌握</div>' +
    '<div class="note">' + esc(note) + "</div></div>";
}
const ASK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';
function askHTML(s, showZh) {
  if (s.q) {
    const btn = s.qAudio
      ? '<button type="button" class="ask-play" data-act="ask" aria-label="听问题 Play question">' + ASK_SVG + "</button>"
      : "";
    return '<div class="ask"><div class="ask-k">Interviewer asks · 面试官问' + btn + "</div>" +
      '<p class="ask-q">' + sentenceWordsHTML(s.q) + "</p>" +
      (showZh && s.qZh ? '<p class="ask-zh">' + esc(s.qZh) + "</p>" : "") + "</div>";
  }
  if (s.context) {
    return '<div class="ask"><div class="ask-k">When to say it · 什么时候说</div>' +
      '<p class="ask-q ask-ctx">' + esc(s.context) + "</p>" +
      (showZh && s.contextZh ? '<p class="ask-zh">' + esc(s.contextZh) + "</p>" : "") + "</div>";
  }
  return "";
}
function onAsk() {
  if (!round || !round.sentence || !round.sentence.qAudio) return;
  stopPlayback();
  markBusy(600);
  const token = ++playToken;
  playUrl(localAudioURL(round.sentence.qAudio), null, null, token);
}
function playMain() {
  const s = round.sentence;
  const total = round.queue.length;
  const num = Math.min(total, round.index + 1);
  const pct = total ? (100 * num / total) : 0;
  const prog = '<div class="prog"><span>' + num + " / " + total + '</span><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
  if (round.phase === "correct") {
    const plan = voicePlan(s);
    const heard = round.heard ? heardLabel(round.heard, s.voice) : (plan.en + " · " + plan.zh);
    return prog +
      '<div class="msg good">That\'s right.<span class="zh">正确。</span></div>' +
      askHTML(s, true) +
      '<div class="result"><div class="oktag">CORRECT</div><p class="sent">' + sentenceWordsHTML(s.english) + "</p>" +
      '<p class="cn">' + esc(s.chinese) + "</p>" +
      '<button class="replay" type="button" data-act="replay">▶ Replay · 再听一遍</button>' +
      '<p class="heard" id="heard">' + esc(heard) + "</p></div>" +
      '<div class="scorebox"><div><b>' + stats.score + '</b><span>Score 得分</span></div>' +
      "<div><b>" + stats.streak + '</b><span>Streak 连对</span></div>' +
      "<div><b>" + num + "/" + total + "</b><span>Progress 进度</span></div></div>";
  }
  let msg = "";
  if (round.feedback === "fix") {
    msg = '<div class="msg bad">Wrong tiles went back to the bank. Correct tiles stay locked.<span class="zh">错的词卡已放回词库，对的已锁定在原位。把空位从词库补上再检查。</span></div>';
  }
  const placed = s.tiles.map((_, pos) => {
    const index = round.placed[pos];
    if (index == null) return '<span class="slot"></span>';
    const locked = !!round.locked[pos];
    const word = s.tiles[index];
    const cls = "tile" + (locked ? " locked" : "");
    return '<button type="button" class="' + cls + '" data-act="unplace" data-slot="' + pos + '">' + esc(word) + "</button>";
  }).join("");
  const inBank = new Set(round.bank);
  const layout = round.bankLayout && round.bankLayout.length === s.tiles.length ? round.bankLayout : round.bank;
  const bank = layout.map((index) => {
    const word = esc(s.tiles[index]);
    const here = inBank.has(index);
    const btn = here
      ? '<button type="button" class="tile" data-act="place" data-i="' + index + '">' + word + "</button>"
      : "";
    return '<span class="bank-hold' + (here ? "" : " open") + '" data-hold="' + index + '">' +
      '<span class="bank-sizer" aria-hidden="true">' + word + "</span>" + btn + "</span>";
  }).join("");
  const zhOpen = !!round.showZh;
  const zhText = s.chinese || s.zh || "";
  const meaning = '<div class="meaning"><button type="button" class="meaning-btn" data-act="zh" aria-expanded="' +
    (zhOpen ? "true" : "false") + '">提示</button>' +
    (zhOpen ? '<p class="meaning-zh" id="meaning-zh">' + esc(zhText || "No Chinese for this sentence. 这句没有中文。") + "</p>" : "") +
    "</div>";
  const listenBtn = hasClip(s)
    ? '<button type="button" class="listen' + (listening ? " playing" : "") + '" data-act="listen" aria-label="' +
      (listening ? "停止播放 Stop" : "播放原音 Play audio") + '" aria-pressed="' + (listening ? "true" : "false") + '">' +
      SPEAKER_SVG + "</button>"
    : "";
  return prog + askHTML(s, zhOpen) +
    '<div class="prompt"><div class="prompt-row"><b>Put the tiles in order</b>' + listenBtn + '</div>' +
    '<div class="zh">Tap a tile to place it. Tap a placed tile to take it out. 点选排序，再点可撤回。</div></div>' +
    msg + '<div class="board-play"><div class="slots">' + placed + "</div></div>" +
    '<div class="bank">' + bank + "</div>" + meaning;
}
function doneMain() {
  return '<div class="hero"><b>Set complete</b><span class="zh">这组练完了</span></div>' +
    '<div class="scorebox"><div><b>' + stats.score + '</b><span>Score 得分</span></div>' +
    "<div><b>" + stats.streak + '</b><span>Streak 连对</span></div>' +
    "<div><b>" + (stats.bestStreak || 0) + "</b><span>Best 最高</span></div></div>";
}
function dockHTML() {
  if (ui.screen === "done") {
    return '<div class="actions"><button class="btn primary" type="button" data-act="again">Practice again · 再来一组</button></div>' +
      '<button class="wide ghost" type="button" data-act="back">Home · 回首页</button>';
  }
  if (ui.screen === "play" && round && round.phase === "correct") {
    const last = round.index + 1 >= round.queue.length;
    const label = last ? "Finish · 完成" : "Next · 下一句";
    return '<button class="wide primary" type="button" data-act="next">' + label + "</button>";
  }
  if (ui.screen === "play" && round) {
    const primary = '<button class="btn primary" type="button" data-act="check">Check · 检查</button>';
    const off = allLocked(round.locked) ? " disabled" : "";
    return '<div class="actions">' + primary +
      '<button class="btn ghost" type="button" data-act="hint"' + off + '>Next word<span class="z">提示下一个词</span></button></div>';
  }
  return '<button class="go" type="button" data-act="start">Start · 开始练习</button>' +
    '<button class="wide ghost" type="button" data-act="update">Check for update · 检查更新</button>';
}
let badgeCache = "";
function renderBadge() {
  const host = $("today");
  if (!host) return;
  badgeDay = nyToday();
  const n = todayCount();
  const open = ui.historyOpen;
  const badgeKey = badgeDay + "|" + n + "|" + (open ? "1" : "0");
  if (badgeKey === badgeCache && host.firstChild) return;
  badgeCache = badgeKey;
  const rows = last7().map((d, i) => (
    '<li class="' + (i === 0 ? "today" : "") + '"><span>' + esc(dayLabel(d.iso)) + "</span><b>" + d.n + "</b></li>"
  )).join("");
  host.innerHTML = '<div id="today-pop"' + (open ? "" : " hidden") + ">" +
    '<p class="pop-h">Last 7 days</p><p class="zh">最近 7 天 · 纽约时间</p><ul>' + rows + "</ul></div>" +
    '<button type="button" id="today-badge" data-act="badge" aria-expanded="' + (open ? "true" : "false") + '" aria-live="polite">' +
    "Today " + n + " · 今天 " + n + " 句</button>";
}
function render() {
  const main = $("main");
  const y = main ? main.scrollTop : 0;
  $("hdr").innerHTML = headerHTML();
  let body = "";
  if (ui.screen === "play" && round && round.sentence) body = playMain();
  else if (ui.screen === "done") body = doneMain();
  else { ui.screen = "home"; body = homeMain(); }
  main.innerHTML = body;
  main.classList.toggle("arrange", ui.screen === "play" && round && round.sentence && round.phase !== "correct" && round.phase !== "done");
  $("dock").innerHTML = dockHTML();
  $("app").dataset.screen = ui.screen;
  main.scrollTop = y;
  renderBadge();
  syncSettingsUI();
  if (round && round.sentence && (ui.screen === "play" || ui.screen === "done")) warmSentence(round.sentence);
}

function restore(data) {
  if (!data) return;
  if (THEMES.some((t) => t.id === data.theme)) ui.theme = data.theme;
  if (data.level >= 1 && data.level <= 6) ui.level = data.level;
  if (data.board) ui.board = data.board;
  const saved = data.round;
  if (!saved || !saved.queue) return;
  const sentence = saved.id ? findSentence(saved.id) : null;
  if (saved.phase !== "done" && !sentence) return;
  if (sentence) {
    const board = migrateBoard(sentence, saved.placed || [], saved.bank || [], saved.locked);
    if (!sane(sentence, board.placed, board.bank, board.locked)) {
      const redealt = dealTiles(sentence);
      round = {
        theme: saved.theme || ui.theme,
        level: saved.level || ui.level,
        board: saved.board || ui.board,
        queue: saved.queue,
        index: saved.index | 0,
        sentence: sentence,
        placed: Array(sentence.tiles.length).fill(null),
        bank: redealt.slice(),
        bankLayout: redealt.slice(),
        locked: Array(sentence.tiles.length).fill(false),
        phase: saved.scored ? "correct" : "play",
        hints: saved.hints | 0,
        scored: !!saved.scored,
        misses: saved.misses | 0,
        heard: "",
        feedback: ""
      };
    } else {
      const phase = saved.phase === "wrong" ? "play" : (saved.phase || "play");
      round = {
        theme: saved.theme || ui.theme,
        level: saved.level || ui.level,
        board: saved.board || ui.board,
        queue: saved.queue,
        index: saved.index | 0,
        sentence: sentence,
        placed: board.placed,
        bank: board.bank,
        bankLayout: bankLayoutFor(sentence, board.placed, board.bank, saved.bankLayout),
        locked: board.locked,
        phase: phase,
        hints: saved.hints | 0,
        scored: !!saved.scored,
        misses: saved.misses | 0,
        heard: "",
        feedback: saved.feedback || (phase === "play" && board.placed.some((x) => x == null) && board.locked.some(Boolean) ? "fix" : "")
      };
    }
  } else {
    round = {
      theme: saved.theme || ui.theme,
      level: saved.level || ui.level,
      board: saved.board || ui.board,
      queue: saved.queue,
      index: saved.index | 0,
      sentence: sentence,
      placed: saved.placed || [],
      bank: saved.bank || [],
      bankLayout: saved.bankLayout || null,
      locked: Array.isArray(saved.locked) ? saved.locked : [],
      phase: saved.phase || "play",
      hints: saved.hints | 0,
      scored: !!saved.scored,
      misses: saved.misses | 0,
      heard: "",
      feedback: ""
    };
  }
  if (data.screen === "play" || data.screen === "done") ui.screen = data.screen;
}
function bind() {
  document.body.addEventListener("click", (e) => {
    const badge = e.target.closest("[data-act=badge]");
    if (badge) {
      ui.historyOpen = !ui.historyOpen;
      renderBadge();
      return;
    }
    if (ui.historyOpen && !e.target.closest("#today-pop")) {
      ui.historyOpen = false;
      renderBadge();
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "settings") { settingsOpen ? closeSettings() : openSettings(); return; }
    if (act === "settings-close") { closeSettings(); return; }
    if (act === "appearance") { onAppearance(b.dataset.id); return; }
    if (act === "word-audio") { onWordAudioToggle(); return; }
    if (act === "haptics") { onHapticsToggle(); return; }
    if (act === "say-word") { playWord(b.dataset.word || b.textContent, b); return; }
    if (act === "theme") onTheme(b.dataset.id);
    else if (act === "level") { ui.level = b.dataset.id | 0; ui.screen = "home"; render(); }
    else if (act === "board") { ui.board = b.dataset.id; ui.screen = "home"; render(); }
    else if (act === "start" || act === "again") onStart();
    else if (act === "back") onBack();
    else if (act === "check") onCheck();
    else if (act === "hint") onHint();
    else if (act === "listen") onListen();
    else if (act === "ask") onAsk();
    else if (act === "zh") {
      if (round && round.sentence && round.phase !== "correct" && round.phase !== "done") {
        round.showZh = !round.showZh;
        render();
      }
    }
    else if (act === "retry") onRetry();
    else if (act === "next") onNext();
    else if (act === "place") onPlace(b.dataset.i, b);
    else if (act === "unplace") onUnplace(b.dataset.slot, b);
    else if (act === "replay") {
      if (round && round.sentence) {
        const s = round.sentence;
        playSentence(s).then((kind) => {
          const el = $("heard");
          if (el && kind) el.textContent = heardLabel(kind, s.voice);
        });
      }
    } else if (act === "update") forceUpdate();
  });
}
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  const had = !!sw.controller;
  sw.addEventListener("controllerchange", () => {
    // Reload only if a controller already existed (a new worker took over).
    // First claim must not reload, and must not set the 已更新 flag.
    // Mid-action / audio / focused input: defer via the pending updater.
    if (had && !updateReloading) {
      const cur = String((versionMeta && versionMeta.v) || VERSION_FALLBACK);
      notePendingUpdate(updatePending || cur, cur);
    }
  });
  const v = (versionMeta && versionMeta.v) || VERSION_FALLBACK;
  sw.register("sw.js?v=" + v, { scope: "./", updateViaCache: "none" }).then((r) => {
    reg = r;
    r.update().catch(() => {});
  }).catch(() => {});
}
async function boot() {
  bind();
  document.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });
  const flushSession = () => { if (booted) { try { saveSession(); } catch (e) {} } };
  window.addEventListener("pagehide", flushSession);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSession();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
  });
  if (window.matchMedia) {
    try {
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (currentAppearance() === "auto" && window.applyPuzzleTheme) window.applyPuzzleTheme();
      });
    } catch (e) {}
  }
  renderBadge();
  setInterval(() => {
    const t = nyToday();
    if (t !== badgeDay) renderBadge();
  }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      renderBadge();
      checkUpdate(false);
    }
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) checkUpdate(false); });
  try {
    const m = await freshMeta();
    if (m && m.v) versionMeta = m;
  } catch (e) {}
  try {
    const data = await (await fetch("sentences.json")).json();
    BANK = (data.sentences || []).map(normalize);
  } catch (e) { loadError = true; }
  try {
    const naval = await (await fetch("naval.json")).json();
    NAVAL = (naval.sentences || []).map(normalize).filter(isPlayable);
    navalLoaded = true;
  } catch (e) { navalLoaded = false; }
  reindex();
  const savedStats = readJSON(STATS_KEY);
  if (savedStats) stats = Object.assign(stats, savedStats);
  mastery = readJSON(MASTERY_KEY) || {};
  const saved = readJSON(SESSION_KEY);
  if (saved) restore(saved);
  booted = true;
  render();
  try {
    const updatedTo = sessionStorage.getItem("puzzle_updated");
    const fromVersion = sessionStorage.getItem("puzzle_updated_from") || "";
    if (updatedTo) {
      sessionStorage.removeItem("puzzle_updated");
      sessionStorage.removeItem("puzzle_updated_from");
      const shown = String(versionMeta.v || "");
      // Only toast after a real version bump. First SW claim and force-same-version must stay quiet.
      if (fromVersion && shown && versionNewer(shown, fromVersion)) {
        setTimeout(() => toast("已更新到最新版"), 400);
      }
    }
    if (versionMeta.v) localStorage.setItem("puzzle_v", String(versionMeta.v));
  } catch (e) {}
  if (hapticsOn() && window.NovaHaptics) {
    try { NovaHaptics.init(); } catch (e) {}
  }
  registerSW();
  startUpdatePoll();
  try {
    window.__puzzleCheckUpdate = () => checkUpdate(false);
    window.__puzzleIsBusy = isUpdateBusy;
    window.__puzzlePendingUpdate = () => updatePending;
    window.__puzzleTestHoldAudio = async (on, url) => {
      if (!on) {
        try { wordPlayer.loop = false; } catch (e) {}
        stopWordAudio();
        applyPendingUpdate();
        return;
      }
      wordPlayer.loop = true;
      wordPlayer.src = url;
      markBusy(200);
      await wordPlayer.play();
    };
  } catch (e) {}
}
boot();

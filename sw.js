// Sentence Puzzle service worker. Register with scope "./".
// Cache name is unique to this app. Version must match meta.json "v".
const VERSION = "7";
const PREFIX = "sentence-puzzle-";
const CACHE = PREFIX + "v" + VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./feel.js",
  "./fonts/PlayfairDisplay-VariableFont_wght.ttf",
  "./manifest.json",
  "./meta.json",
  "./sentences.json",
  "./naval.json",
  "./apple-touch-icon.png",
  "./icons/favicon-16.png",
  "./icons/favicon-32.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

function scopePath() {
  return new URL(self.registration.scope).pathname;
}

function inScope(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(scopePath());
}

function isAudioPath(pathname) {
  return /\.mp3$/i.test(pathname);
}

async function audioUrls() {
  const res = await fetch(new URL("sentences.json", self.registration.scope), { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const out = [];
  for (const s of data.sentences || []) {
    const raw = typeof s.audio === "string" ? s.audio : (s.audio && (s.audio.url || s.audio.src));
    if (!raw || /^(https?:|blob:|data:)/i.test(raw)) continue;
    // Precache the small Fish voice-over clips only. Naval and Scary are cached on first play.
    if (!/^audio\/(?:lash|dealer|daily)\//.test(raw)) continue;
    out.push(new URL(raw, self.registration.scope).href);
  }
  return out;
}

async function putOk(cache, url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok && res.status === 200) await cache.put(url, res);
  } catch (e) {}
}

async function cacheFullAudio(cache, url) {
  try {
    if (await cache.match(url.href)) return;
    const res = await fetch(url.href, { cache: "no-store" });
    if (res.ok && res.status === 200) await cache.put(url.href, res);
  } catch (e) {}
}

function audioHeaders(cached, length) {
  const headers = new Headers();
  headers.set("Content-Type", cached.headers.get("content-type") || "audio/mpeg");
  headers.set("Content-Length", String(length));
  headers.set("Accept-Ranges", "bytes");
  return headers;
}

async function fulfillRange(req, cached) {
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  const header = (req.headers.get("range") || "").trim();
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (match[1] === "" && match[2] === "")) {
    return new Response(buf, { status: 200, headers: audioHeaders(cached, size) });
  }
  let start = 0;
  let end = size - 1;
  if (match[1] === "") {
    const n = parseInt(match[2], 10) || 0;
    start = Math.max(0, size - n);
  } else {
    start = parseInt(match[1], 10);
    if (match[2] !== "") end = parseInt(match[2], 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": "bytes */" + size }
    });
  }
  end = Math.min(end, size - 1);
  const slice = buf.slice(start, end + 1);
  const headers = audioHeaders(cached, slice.byteLength);
  headers.set("Content-Range", "bytes " + start + "-" + end + "/" + size);
  return new Response(slice, { status: 206, headers: headers });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const urls = await audioUrls();
    await Promise.all(urls.map((url) => putOk(cache, url)));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "GET_VERSION") {
    const msg = { type: "VERSION", version: VERSION };
    const port = event.ports && event.ports[0];
    if (port) port.postMessage(msg);
    else if (event.source) event.source.postMessage(msg);
  } else if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!inScope(url)) return;
  event.respondWith(fromCache(event, req, url));
});

function fetchTimeout(resource, ms, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(resource, Object.assign({}, init, { signal: ctrl.signal })).finally(() => clearTimeout(timer));
}

async function cachedShell(cache, req, url, nav, meta, audio) {
  if (audio) {
    const hit = await cache.match(url.href) || await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
  }
  const hit = await cache.match(meta ? url.pathname : req, { ignoreSearch: true });
  if (hit) return hit;
  if (nav) return await cache.match("./index.html") || await cache.match("./");
  return null;
}

async function fromCache(event, req, url) {
  const cache = await caches.open(CACHE);
  const nav = req.mode === "navigate";
  const meta = url.pathname.endsWith("/meta.json");
  const audio = isAudioPath(url.pathname);
  const offline = self.navigator && self.navigator.onLine === false;
  if (offline) {
    const cached = await cachedShell(cache, req, url, nav, meta, audio);
    if (cached) {
      if (audio && req.headers.has("range")) return fulfillRange(req, cached);
      return cached;
    }
  }
  try {
    if (audio && req.headers.has("range")) {
      const cached = await cache.match(url.href);
      if (cached) return fulfillRange(req, cached);
      const fresh = await fetchTimeout(req, 8000);
      event.waitUntil(cacheFullAudio(cache, url));
      return fresh;
    }
    const fresh = meta
      ? await fetchTimeout(url.pathname, 8000, { cache: "no-store" })
      : await fetchTimeout(req, 8000);
    if (fresh.ok && fresh.status === 200 && fresh.type !== "opaque") {
      const ct = (fresh.headers.get("content-type") || "").toLowerCase();
      if (!(meta && ct.includes("text/html"))) {
        try { await cache.put(meta ? url.pathname : req, fresh.clone()); } catch (err) {}
      }
    }
    return fresh;
  } catch (e) {
    if (audio) {
      const cached = await cache.match(url.href) || await cache.match(req, { ignoreSearch: true });
      if (cached) {
        if (req.headers.has("range")) return fulfillRange(req, cached);
        return cached;
      }
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (nav) {
      const home = await cache.match("./index.html") || await cache.match("./");
      if (home) return home;
    }
    return Response.error();
  }
}

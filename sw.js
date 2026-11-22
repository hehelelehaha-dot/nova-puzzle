// Sentence Puzzle service worker. Register with scope "./".
// Cache name is unique to this app. Version must match meta.json "v".
// Shell lives in a versioned cache; audio lives in a long-lived cache.
const V = "11";
const PREFIX = "sentence-puzzle-";
const SHELL = PREFIX + V;
const MEDIA = PREFIX + "audio";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./feel.js",
  "./haptics.js",
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

function isMetaPath(pathname) {
  return pathname === "meta.json" || pathname.endsWith("/meta.json");
}

function isSwPath(pathname) {
  return pathname === "sw.js" || pathname.endsWith("/sw.js");
}

function shellKey(req, url) {
  if (req.mode === "navigate") return "./index.html";
  const rel = url.pathname.slice(scopePath().length);
  if (!rel) return "./index.html";
  return "./" + rel;
}

function isHtml(res) {
  return (res.headers.get("content-type") || "").toLowerCase().includes("text/html");
}

async function putOk(cache, url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok && res.status === 200 && !isHtml(res) || (res.ok && !isMetaPath(String(url)))) {
      const meta = isMetaPath(String(url));
      if (meta && isHtml(res)) return;
      await cache.put(url, res);
    }
  } catch (e) {}
}

async function evictCachedWords() {
  try {
    const media = await caches.open(MEDIA);
    const keys = await media.keys();
    await Promise.all(keys.map((req) => {
      try {
        const u = new URL(req.url);
        if (u.pathname.includes("/words/")) return media.delete(req);
      } catch (e) {}
      return Promise.resolve(false);
    }));
  } catch (e) {}
}

async function migrateAudio(oldName) {
  if (oldName === MEDIA || oldName === SHELL) return;
  try {
    const old = await caches.open(oldName);
    const media = await caches.open(MEDIA);
    for (const req of await old.keys()) {
      const u = new URL(req.url);
      if (!isAudioPath(u.pathname)) continue;
      if (await media.match(u.href)) continue;
      const hit = await old.match(req);
      if (hit) await media.put(u.href, hit);
    }
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

async function cacheFullAudio(cache, url) {
  try {
    if (await cache.match(url.href)) return;
    const res = await fetch(url.href, { cache: "no-store" });
    if (res.ok && res.status === 200) await cache.put(url.href, res);
  } catch (e) {}
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map((f) => fetch(f, { cache: "no-store" }).then((r) => {
      if (r.ok && r.status === 200) {
        const meta = f === "./meta.json";
        if (meta && isHtml(r)) return;
        return cache.put(f, r);
      }
    }).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      for (const k of keys) {
        if (k === SHELL || k === MEDIA) continue;
        if (k.startsWith(PREFIX)) {
          await migrateAudio(k);
          await caches.delete(k);
        }
      }
      await evictCachedWords();
    } catch (err) {}
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "GET_VERSION") {
    const msg = { type: "VERSION", version: V };
    const port = event.ports && event.ports[0];
    if (port) port.postMessage(msg);
    else if (event.source) event.source.postMessage(msg);
  } else if (data.type === "SKIP_WAITING" || data.t === "skip") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!inScope(url)) return;
  if (isSwPath(url.pathname)) return;
  if (isAudioPath(url.pathname)) {
    event.respondWith(fromAudio(event, req, url));
    return;
  }
  event.respondWith(fromShell(req, url));
});

async function fromAudio(event, req, url) {
  const cache = await caches.open(MEDIA);
  try {
    let hit = await cache.match(url.href) || await cache.match(req, { ignoreSearch: true });
    if (!hit) {
      let fresh;
      try {
        fresh = await fetch(url.href, { cache: "no-store" });
      } catch (err) {
        return fetch(req);
      }
      if (!fresh.ok) {
        try { return await fetch(req); } catch (err) { return fresh; }
      }
      try { await cache.put(url.href, fresh.clone()); } catch (err) {}
      hit = fresh;
    }
    if (req.headers.has("range")) return fulfillRange(req, hit.clone());
    return hit;
  } catch (err) {
    try { return await fetch(req); } catch (e2) { return Response.error(); }
  }
}

async function fromShell(req, url) {
  const cache = await caches.open(SHELL);
  const key = shellKey(req, url);
  const meta = isMetaPath(url.pathname);
  try {
    const fresh = await fetch(req.mode === "navigate" ? "./index.html" : req, { cache: "no-store" });
    if (fresh.ok) {
      if (!(meta && isHtml(fresh))) {
        try { await cache.put(key, fresh.clone()); } catch (err) {}
      } else if (meta) {
        const hit = await cache.match(key, { ignoreSearch: true });
        if (hit && !isHtml(hit)) return hit;
        return Response.error();
      }
    }
    return fresh;
  } catch (err) {
    const hit = await cache.match(key, { ignoreSearch: true }) || await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (meta) return Response.error();
    if (req.mode === "navigate") {
      return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
    }
    return (await cache.match("./index.html")) || Response.error();
  }
}

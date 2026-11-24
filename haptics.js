/* Nova 点击震动 (tap haptics). Settings toggle: localStorage puzzle_haptics ("0" = off, default on).
 *
 * iPhone (Safari and the home-screen app, iOS 18+): there is no Vibration API. The only web haptic is the
 * system tick of <input type="checkbox" switch>. Since iOS 26.5 (WebKit fc1ef83) the tick plays only for a
 * trusted click, so label.click() from JS no longer works. We lay a transparent <label> for a hidden switch
 * over each button: her real tap lands on the label, the browser forwards it to the switch, and the phone
 * ticks once (on finger lift). The app never sees the label's click: we stop it in the capture phase and call
 * host.click() so every onclick, <summary> toggle and e.target stays exactly as before.
 * Needs Settings > Sounds & Haptics > System Haptics on.
 *
 * A single finger tap can produce more than one click (the label, a forwarded switch click, a host.click()
 * replay, and on iOS a delayed ~300ms click). After a tile is placed the board re-renders, so that delayed
 * click can land on a different tile in the same spot. We act on the first trusted pointerup, then ignore
 * further events at that point / pointer id for ~350ms. init() is idempotent and will not stack listeners.
 *
 * Android Chrome: navigator.vibrate(8) on pointerdown, at most one pulse per 35 ms so quick taps stay crisp.
 */
(function (w, d) {
  "use strict";
  var TAP = 'button,[role="button"],summary,.tile';
  var SKIP = 'a,input,select,textarea,label,[contenteditable],[data-no-haptic],.lock';
  var LIFT = 'button,[role="button"],a,input,select,textarea,label,summary';
  var MIN_GAP_MS = 35, PULSE_MS = 8, LOCK_MS = 350, LOCK_DIST2 = 40 * 40;
  var last = 0, mo = null, ro = null, on = false, replaying = false;
  var locks = [];
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var canVibrate = typeof navigator.vibrate === "function" && !isIOS;

  function enabled() { try { return localStorage.getItem("puzzle_haptics") !== "0"; } catch (e) { return true; } }

  function pruneLocks(now) {
    var i, next = [];
    for (i = 0; i < locks.length; i++) if (now - locks[i].t < LOCK_MS) next.push(locks[i]);
    locks = next;
  }
  function eventXY(e) {
    if (e.clientX != null && e.clientY != null) return { x: e.clientX, y: e.clientY };
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    return t ? { x: t.clientX, y: t.clientY } : { x: 0, y: 0 };
  }
  function recentlyHandled(e) {
    var now = performance.now();
    pruneLocks(now);
    var xy = eventXY(e);
    var pid = e.pointerId;
    var i, l, dx, dy;
    // Only key on screen position. pointerId is reused across distinct mouse
    // clicks and sequential taps, so a pointerId lock would swallow the next
    // real tap (e.g. unplace, then speaker) inside the 350ms window.
    for (i = 0; i < locks.length; i++) {
      l = locks[i];
      dx = xy.x - l.x; dy = xy.y - l.y;
      if (dx * dx + dy * dy < LOCK_DIST2) return true;
    }
    return false;
  }
  function markHandled(e) {
    var xy = eventXY(e);
    locks.push({ t: performance.now(), x: xy.x, y: xy.y, pointerId: e.pointerId });
  }
  /* A new finger/mouse down is a new gesture (e.g. toggling the speaker off).
     Drop nearby locks so we don't treat it as the delayed ghost click. */
  function onPointerDownClear(e) {
    if (!on) return;
    if (e.button != null && e.button !== 0) return;
    var now = performance.now();
    pruneLocks(now);
    var xy = eventXY(e);
    var next = [], i, l, dx, dy;
    for (i = 0; i < locks.length; i++) {
      l = locks[i];
      dx = xy.x - l.x; dy = xy.y - l.y;
      if (dx * dx + dy * dy >= LOCK_DIST2) next.push(l);
    }
    locks = next;
  }

  /* Android */
  function onDown(e) {
    if (e.pointerType === "mouse") return;
    var t = e.target.closest && e.target.closest(TAP);
    if (!t || t.closest(SKIP) || t.disabled) return;
    var now = performance.now(); if (now - last < MIN_GAP_MS) return; last = now;
    try { navigator.vibrate(PULSE_MS); } catch (err) {}
  }

  function labelOf(t) {
    if (!t || !t.closest) return null;
    if (t.matches && t.matches("label[data-hx]")) return t;
    return t.closest("label[data-hx]");
  }
  function replay(host) {
    if (!host || host.disabled) return;
    // host.click() is synchronous; let that untrusted event reach the app,
    // but keep swallowing later ghost clicks at the same spot.
    replaying = true;
    try { host.click(); }
    finally { replaying = false; }
  }

  /* iPhone: act on the first trusted pointerup so we don't wait ~300ms for click. */
  function onPointerUpCapture(e) {
    if (!on) return;
    var lab = labelOf(e.target);
    if (!lab) return;
    if (recentlyHandled(e)) return;
    var host = lab.parentElement;
    if (!host || host.disabled) return;
    markHandled(e);
    replay(host);
  }

  /* Swallow the label click, the forwarded switch click, and any delayed ghost click
     at the same spot so only the one replayed host.click() reaches the app.
     The ghost click is hit-tested again after the UI updates, so it may land on
     whatever just appeared there (a new tile, or the settings backdrop). A real
     second tap clears this lock on pointerdown. */
  function onClickCapture(e) {
    var t = e.target;
    if (!t || !t.matches) return;
    if (t.matches("input[data-hx-sw]")) { e.stopImmediatePropagation(); return; }
    if (replaying) return; // our host.click() replay — do not swallow it

    if (recentlyHandled(e)) {
      e.stopImmediatePropagation();
      return;
    }
    var lab = labelOf(t);
    if (!lab) return;
    e.stopImmediatePropagation();
    var host = lab.parentElement;
    if (host && !host.disabled) {
      markHandled(e);
      replay(host);
    }
  }

  function armIOS(el) {
    if (el.querySelector(":scope > label[data-hx]") || el.closest(SKIP) || el.closest("label[data-hx]")) return;
    var lab = d.createElement("label");
    lab.setAttribute("data-hx", ""); lab.setAttribute("aria-hidden", "true");
    lab.style.cssText = "position:absolute;inset:0;z-index:0;margin:0;padding:0;border:0;background:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;border-radius:inherit";
    var sw = d.createElement("input");
    sw.type = "checkbox"; sw.setAttribute("switch", ""); sw.setAttribute("data-hx-sw", ""); sw.tabIndex = -1;
    sw.style.cssText = "position:absolute;left:0;top:0;width:1px;height:1px;margin:0;opacity:0;pointer-events:none";
    lab.appendChild(sw);
    // Position and touch-action live in CSS. Reading getComputedStyle here forced a
    // layout on every new button, which is what made a tile tap feel stuck.
    el.querySelectorAll(LIFT).forEach(function (c) {      // inner controls (e.g. 🔊 on a word card) stay tappable
      if (c.closest("label[data-hx]")) return;
      if (!c.style.position) c.style.position = "relative";
      if (!c.style.zIndex) c.style.zIndex = "1";
    });
    el.appendChild(lab);
  }
  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(TAP)) armIOS(root);
    root.querySelectorAll(TAP).forEach(armIOS);
  }
  function clearOverlays() {
    d.querySelectorAll("label[data-hx]").forEach(function (l) { l.remove(); });
  }
  function hostOf(n) { return n && n.nodeType === 1 ? n.closest(TAP) : null; }
  var syncScheduled = false;
  function syncLabels() {
    if (!on || !isIOS) return;
    d.querySelectorAll(TAP).forEach(function (el) {
      if (el.closest(SKIP) || el.closest("label[data-hx]")) return;
      if (!el.querySelector(":scope > label[data-hx]")) armIOS(el);
    });
  }
  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(function () { syncScheduled = false; syncLabels(); });
  }
  function unbind() {
    d.removeEventListener("pointerdown", onDown, true);
    w.removeEventListener("click", onClickCapture, true);
    w.removeEventListener("pointerup", onPointerUpCapture, true);
    w.removeEventListener("pointerdown", onPointerDownClear, true);
    w.removeEventListener("resize", scheduleSync);
    if (w.visualViewport) w.visualViewport.removeEventListener("resize", scheduleSync);
    if (mo) { mo.disconnect(); mo = null; }
    if (ro) { ro.disconnect(); ro = null; }
  }

  w.NovaHaptics = {
    init: function () {
      if (!enabled()) return;
      if (on) { // idempotent: never stack listeners or overlays on re-render / boot
        if (isIOS && !canVibrate) { scan(d.body); syncLabels(); }
        return;
      }
      on = true;
      if (canVibrate) { d.addEventListener("pointerdown", onDown, { passive: true, capture: true }); return; }
      if (!isIOS) return;
      clearOverlays();
      w.addEventListener("click", onClickCapture, true);
      w.addEventListener("pointerup", onPointerUpCapture, true);
      w.addEventListener("pointerdown", onPointerDownClear, true);
      scan(d.body);
      mo = new MutationObserver(function (list) {
        list.forEach(function (m) {
          m.addedNodes.forEach(scan);
          var h = hostOf(m.target);                         // button text replaced (e.g. 速度 1x → 0.85x) wipes the label: re-arm
          if (h && !h.querySelector(":scope > label[data-hx]")) armIOS(h);
        });
      });
      mo.observe(d.body, { childList: true, subtree: true });
      if (typeof ResizeObserver === "function") {
        ro = new ResizeObserver(function () { scheduleSync(); });
        ro.observe(d.body);
        var app = d.getElementById("app") || d.getElementById("main");
        if (app) ro.observe(app);
      }
      w.addEventListener("resize", scheduleSync);
      if (w.visualViewport) w.visualViewport.addEventListener("resize", scheduleSync);
    },
    stop: function () {
      on = false;
      unbind();
      clearOverlays();
      locks = [];
    },
    isIOS: isIOS, canVibrate: canVibrate
  };
})(window, document);

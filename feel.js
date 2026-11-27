"use strict";
// Haptics live in haptics.js (iPhone switch tick + Android vibrate).
// iOS Safari only shows CSS :active press states when the page has a touch
// listener, so this empty passive one turns on the spring press look in style.css.
(function () {
  window.puzzleFeel = function () {};
  try { document.addEventListener("touchstart", function () {}, { passive: true }); } catch (e) {}
})();

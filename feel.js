"use strict";
// Soft haptic on tile select. iOS Safari does not support navigator.vibrate;
// the CSS press scale still provides visual feedback there.
(function () {
  function feel() {
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate(12);
    } catch (e) {}
  }
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "place" || act === "unplace") feel();
  }, true);
  window.puzzleFeel = feel;
})();

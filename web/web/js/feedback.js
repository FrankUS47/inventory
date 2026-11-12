/* 掃描結果的聲音與震動回饋。 */
window.AI = window.AI || {};
AI.feedback = (function () {
  let ctx = null;
  function beep(freq, ms) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + ms / 1000);
    } catch (e) {}
  }
  function vib(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
  return {
    play(status) {
      if (status === "found") { beep(880, 120); vib(60); }
      else if (status === "duplicate") { beep(520, 200); vib([60, 60, 60]); }
      else { beep(220, 350); vib([200, 80, 200]); }
    },
  };
})();

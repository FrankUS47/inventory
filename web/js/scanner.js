/* 相機掃描(html5-qrcode,已隨程式附上,不需外部網路)。 */
window.AI = window.AI || {};
AI.scanner = (function () {
  let cam = null, fileScanner = null, running = false;
  let lastCode = "", lastAt = 0;
  const F = window.Html5QrcodeSupportedFormats;
  const cfg = {
    formatsToSupport: F ? [F.QR_CODE, F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E,
      F.ITF, F.CODABAR, F.DATA_MATRIX, F.PDF_417, F.AZTEC] : undefined,
    useBarCodeDetectorIfSupported: true,
    verbose: false,
  };

  function support() {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return "目前不是 HTTPS 安全連線,瀏覽器不允許直接開相機。請改用 https:// 網址,或使用「拍照辨識」/手動輸入。";
    }
    return "";
  }

  async function start(onCode) {
    const msg = support();
    if (msg) throw new Error(msg);
    cam = cam || new Html5Qrcode("reader", cfg);
    await cam.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: (w, h) => ({ width: Math.floor(Math.min(w, 420) * 0.9), height: Math.floor(Math.min(h, 420) * 0.6) }),
      },
      (text) => {
        const now = Date.now(), same = text === lastCode && now - lastAt < 3000;
        lastCode = text; lastAt = now;      // 相機持續對著同一個碼時不重複送出
        if (!same) onCode(text);
      },
      () => {}
    );
    running = true;
  }

  async function stop() {
    if (cam && running) { try { await cam.stop(); } catch (e) {} }
    running = false;
    const el = document.getElementById("reader");
    if (el) el.innerHTML = "";
  }

  async function scanFile(file) {
    fileScanner = fileScanner || new Html5Qrcode("fileReader", cfg);
    return fileScanner.scanFile(file, false);
  }

  return { start, stop, scanFile, support, isRunning: () => running };
})();

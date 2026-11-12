/* 條碼解碼:優先用瀏覽器內建 BarcodeDetector(Android Chrome 有),否則用 zxing-wasm(已隨程式附上)。
   zxing-wasm 對高解析度照片裡的小標籤、模糊、旋轉都比 html5-qrcode 強很多。 */
window.AI = window.AI || {};
AI.decoder = (function () {
  const FORMATS = ["QRCode", "Code128", "Code39", "Code93", "EAN-13", "EAN-8", "UPC-A", "UPC-E",
    "ITF", "Codabar", "DataMatrix", "PDF417", "Aztec"];
  let ready = null, native = null, nativeTried = false, lastFormat = "";

  function b64ToBuf(b64) {
    const bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  function init() {
    if (ready) return ready;
    ready = (async () => {
      let bin;
      if (window.AI_WASM_B64) bin = b64ToBuf(window.AI_WASM_B64);          // 單檔離線版
      else bin = await (await fetch("vendor/zxing_reader.wasm")).arrayBuffer(); // 伺服器版
      ZXingWASM.setZXingModuleOverrides({ wasmBinary: bin });
    })();
    ready.catch(() => { ready = null; });
    return ready;
  }

  async function getNative() {
    if (nativeTried) return native;
    nativeTried = true;
    try {
      if ("BarcodeDetector" in window) {
        const sup = await BarcodeDetector.getSupportedFormats();
        if (sup.length) native = new BarcodeDetector({ formats: sup });
      }
    } catch (e) { native = null; }
    return native;
  }

  /** 解碼一張 canvas,回傳文字或 null。hard=true 時用最費力的模式(拍照用)。 */
  async function decodeCanvas(canvas, hard) {
    const nd = await getNative();
    if (nd) {
      try {
        const r = await nd.detect(canvas);
        if (r.length && r[0].rawValue) { lastFormat = r[0].format || ""; return r[0].rawValue; }
      } catch (e) {}
    }
    await init();
    const id = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    const r = await ZXingWASM.readBarcodes(id, {
      formats: FORMATS, tryHarder: !!hard, tryRotate: !!hard, tryInvert: !!hard,
      tryDownscale: true, maxNumberOfSymbols: 1,
    });
    if (r.length) { lastFormat = (r[0].format || "").replace(/^(Micro|rMQR)QRCode$/, "QRCode"); return r[0].text; }
    return null;
  }

  function drawScaled(src, w, h, maxSide) {
    const s = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    c.getContext("2d", { willReadFrequently: true }).drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  /** 解碼一張照片檔:先用原解析度(小標籤需要),再試縮小版本。 */
  async function decodeFile(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) { bmp = await createImageBitmap(file); }
    try {
      const seen = new Set();
      for (const side of [4096, 2400, 1600]) {
        const c = drawScaled(bmp, bmp.width, bmp.height, side);
        const key = c.width + "x" + c.height;
        if (seen.has(key)) continue;
        seen.add(key);
        const t = await decodeCanvas(c, true);
        if (t) return t;
      }
    } finally { if (bmp.close) bmp.close(); }
    return null;
  }

  return { init, decodeCanvas, decodeFile, drawScaled, hasNative: () => !!native, lastFormat: () => lastFormat };
})();

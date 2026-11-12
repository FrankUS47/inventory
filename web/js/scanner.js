/* 相機即時掃描:getUserMedia 取得影像 → 定時截圖 → AI.decoder 解碼。含對焦、縮放、手電筒。 */
window.AI = window.AI || {};
AI.scanner = (function () {
  let stream = null, track = null, video = null, running = false, busy = false, timer = null;
  let lastCode = "", lastAt = 0, onCodeCb = null;

  function support() {
    if (location.protocol === "content:")
      return "這個檔案是用「檔案管理員/content://」方式開啟,Chrome 不允許這種網址使用相機(網址列也不會出現可授權的圖示)。請改開網站上的網頁版,再從「設定/同步」載入清單檔。";
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return "目前不是 HTTPS 安全連線(或此瀏覽器不支援),不能直接開相機。請改用 https:// 網址,或使用「拍照辨識」/手動輸入。";
    }
    return "";
  }

  function explain(e) {
    const n = (e && e.name) || "";
    if (n === "NotAllowedError" || n === "PermissionDeniedError")
      return "相機權限被拒絕。請點網址列左側的圖示(鎖頭/設定)→「權限」→ 相機 → 允許,再重新整理頁面。若是從 LINE/臉書內開啟,請改用 Chrome / Safari 開啟。";
    if (n === "NotFoundError" || n === "DevicesNotFoundError") return "找不到相機裝置。";
    if (n === "NotReadableError" || n === "TrackStartError") return "相機被其他 App 占用,請關閉其他使用相機的程式後再試。";
    if (n === "SecurityError") return "瀏覽器因安全性限制不允許使用相機(需要 HTTPS)。";
    return "無法開啟相機:" + (n || "未知錯誤") + (e && e.message ? "(" + e.message + ")" : "");
  }

  async function openStream() {
    const tries = [
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: "environment" }, audio: false },
      { video: true, audio: false },
    ];
    let last;
    for (const c of tries) {
      try { return await navigator.mediaDevices.getUserMedia(c); }
      catch (e) { last = e; if (e.name === "NotAllowedError" || e.name === "SecurityError") break; }
    }
    throw last;
  }

  async function setupControls() {
    const box = document.getElementById("zoomBox"), z = document.getElementById("zoom"), tb = document.getElementById("btnTorch");
    box.hidden = true; z.hidden = true; tb.hidden = true;
    let caps = {};
    try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) {}
    try {
      if (caps.focusMode && caps.focusMode.indexOf("continuous") >= 0)
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
    } catch (e) {}
    if (caps.zoom) {
      z.min = caps.zoom.min; z.max = caps.zoom.max; z.step = caps.zoom.step || 0.1;
      z.value = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 2)); // 預設放大 2 倍,小標籤較容易讀
      try { await track.applyConstraints({ advanced: [{ zoom: Number(z.value) }] }); } catch (e) {}
      z.oninput = () => track.applyConstraints({ advanced: [{ zoom: Number(z.value) }] }).catch(() => {});
      z.hidden = false; box.hidden = false;
    }
    if (caps.torch) {
      let on = false;
      tb.onclick = async () => {
        on = !on;
        try { await track.applyConstraints({ advanced: [{ torch: on }] }); } catch (e) {}
        tb.textContent = on ? "手電筒:開" : "手電筒:關";
      };
      tb.textContent = "手電筒:關"; tb.hidden = false; box.hidden = false;
    }
  }

  async function loop() {
    if (!running) return;
    if (!busy && video.readyState >= 2 && video.videoWidth) {
      busy = true;
      try {
        const c = AI.decoder.drawScaled(video, video.videoWidth, video.videoHeight, 1920);
        const text = await AI.decoder.decodeCanvas(c, false);
        if (text) {
          const now = Date.now(), same = text === lastCode && now - lastAt < 3000;
          lastCode = text; lastAt = now;       // 相機持續對著同一個碼時不重複送出
          if (!same && onCodeCb) onCodeCb(text);
        }
      } catch (e) {} finally { busy = false; }
    }
    timer = setTimeout(loop, 120);
  }

  async function start(onCode) {
    const msg = support();
    if (msg) throw new Error(msg);
    onCodeCb = onCode;
    lastCode = ""; lastAt = 0;           // 重新開相機時重置防重複
    try { stream = await openStream(); } catch (e) { throw new Error(explain(e)); }
    track = stream.getVideoTracks()[0];
    const host = document.getElementById("reader");
    host.innerHTML = "";
    video = document.createElement("video");
    video.setAttribute("playsinline", ""); video.muted = true; video.autoplay = true;
    video.style.width = "100%";
    host.appendChild(video);
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    await setupControls();
    AI.decoder.init().catch(() => {});       // 預先載入解碼器
    running = true;
    loop();
  }

  async function stop() {
    running = false;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = track = null;
    const host = document.getElementById("reader");
    if (host) host.innerHTML = "";
    const box = document.getElementById("zoomBox");
    if (box) box.hidden = true;
  }

  return { start, stop, support, isRunning: () => running };
})();

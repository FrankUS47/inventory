/* 相機即時掃描:getUserMedia 取得影像 → 定時截圖 → AI.decoder 解碼。含對焦、縮放、手電筒。 */
window.AI = window.AI || {};
AI.scanner = (function () {
  let stream = null, track = null, video = null, running = false, busy = false, timer = null, paused = false;
  let lastCode = "", lastAt = 0, onCodeCb = null;

  function support() {
    if (location.protocol === "content:")
      return "這個檔案是用「檔案管理員/content://」方式開啟,Chrome 不允許這種網址使用相機(網址列也不會出現可授權的圖示)。請改開網站上的網頁版,再從「設定/同步」載入清單檔。";
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return "目前不是 HTTPS 安全連線(或此瀏覽器不支援),不能直接開相機。請改用 https:// 網址,或手動輸入編號。";
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
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false },
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
      z.value = caps.zoom.min;           // 預設不放大(視野較大、較好對準);小標籤可自行拉滑桿
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

  // ---- 對準框:只辨識框內的區域(比較快、不會誤讀旁邊的標籤),可拖曳移動、滑桿調大小 ----
  let aim = { on: true, w: 0.6, shape: "sq", cx: 0.5, cy: 0.5 }, aimEl = null;
  try { Object.assign(aim, JSON.parse(localStorage.getItem("ai_aim") || "{}")); } catch (e) {}
  function saveAim() { try { localStorage.setItem("ai_aim", JSON.stringify(aim)); } catch (e) {} }
  function aimFrac() {            // 框占影像的比例 {w,h}(0~1)
    const vw = (video && video.videoWidth) || 16, vh = (video && video.videoHeight) || 9;
    const ratio = aim.shape === "wide" ? 0.4 : 1;
    let w = aim.w, h = aim.w * ratio * vw / vh;
    if (h > 1) { w = w / h; h = 1; }
    return { w, h };
  }
  function layoutAim() {
    if (!aimEl) return;
    aimEl.hidden = !aim.on;
    const f = aimFrac();
    aim.cx = Math.min(1 - f.w / 2, Math.max(f.w / 2, aim.cx)); aim.cy = Math.min(1 - f.h / 2, Math.max(f.h / 2, aim.cy));
    aimEl.style.width = f.w * 100 + "%"; aimEl.style.height = f.h * 100 + "%";
    aimEl.style.left = (aim.cx - f.w / 2) * 100 + "%"; aimEl.style.top = (aim.cy - f.h / 2) * 100 + "%";
  }
  function setupAim(host) {
    const box = document.getElementById("aimBox"), size = document.getElementById("aimSize");
    const shape = document.getElementById("btnAimShape"), on = document.getElementById("btnAimOn");
    aimEl = document.createElement("div"); aimEl.className = "aim"; host.appendChild(aimEl);
    box.hidden = false; size.value = Math.round(aim.w * 100);
    shape.textContent = aim.shape === "wide" ? "長方形(條碼)" : "方形(QR)";
    on.textContent = aim.on ? "框內辨識:開" : "框內辨識:關";
    size.oninput = () => { aim.w = Number(size.value) / 100; layoutAim(); saveAim(); };
    shape.onclick = () => { aim.shape = aim.shape === "sq" ? "wide" : "sq"; shape.textContent = aim.shape === "wide" ? "長方形(條碼)" : "方形(QR)"; layoutAim(); saveAim(); };
    on.onclick = () => { aim.on = !aim.on; on.textContent = aim.on ? "框內辨識:開" : "框內辨識:關"; layoutAim(); saveAim(); };
    let drag = null;
    aimEl.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: aim.cx, cy: aim.cy }; aimEl.setPointerCapture(e.pointerId); e.preventDefault(); });
    aimEl.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = host.getBoundingClientRect();
      aim.cx = drag.cx + (e.clientX - drag.x) / r.width; aim.cy = drag.cy + (e.clientY - drag.y) / r.height;
      layoutAim();
    });
    const end = () => { if (drag) { drag = null; saveAim(); } };
    aimEl.addEventListener("pointerup", end); aimEl.addEventListener("pointercancel", end);
    video.addEventListener("loadedmetadata", layoutAim);
    layoutAim();
  }
  function grab(maxSide) {        // 取要辨識的畫面:框內(開)或整張
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!aim.on) return AI.decoder.drawScaled(video, vw, vh, maxSide);
    const f = aimFrac(), sw = f.w * vw, sh = f.h * vh;
    const sx = Math.max(0, Math.min(vw - sw, aim.cx * vw - sw / 2)), sy = Math.max(0, Math.min(vh - sh, aim.cy * vh - sh / 2));
    return AI.decoder.drawCrop(video, sx, sy, sw, sh, maxSide);
  }

  const ONE_D = /(code39|itf|codabar)/i;   // 沒有檢查碼的一般條碼才需要連續兩次讀到相同內容
  let frames = 0, lastMs = 0, lastRead = "", pending = null, lastVt = -1, lastVtAt = 0, restarting = false;

  function showStatus() {
    AI.ui.scanStatus(paused
      ? "⏸ 已暫停:請按上方「確認盤點」或「取消」才會繼續掃描"
      : "● 辨識中 · 已處理 " + frames + " 張 · " + lastMs + "ms · 最近讀到:" + (lastRead || "(尚無)"));
  }

  async function loop() {
    if (!running) return;
    if (!busy && !paused && video.readyState >= 2 && video.videoWidth) {
      busy = true;
      try {
        const t0 = Date.now();
        const hard = frames % 3 === 2;           // 每 3 張有 1 張用「最費力模式」(旋轉/反白/加強),專門救小標籤、模糊、歪斜
        const c = grab(hard ? 2560 : (lastMs > 700 ? 1600 : 1920));
        // 解碼最多等 3 秒,避免某一張畫面卡住後整個掃描就停了
        const text = await Promise.race([
          AI.decoder.decodeCanvas(c, hard),
          new Promise((res) => setTimeout(() => res(null), hard ? 5000 : 3000)),
        ]);
        frames++; if (!hard) lastMs = Date.now() - t0;
        if (text) {
          lastRead = text;
          const now = Date.now(), same = text === lastCode && now - lastAt < 3000;
          lastCode = text; lastAt = now;       // 相機持續對著同一個碼時不重複送出
          if (!same) {
            // 一般條碼(1D)容易誤讀,需連續兩次讀到相同內容才接受;QR code 直接接受
            const fmt = String(AI.decoder.lastFormat() || "").replace(/[^a-z0-9]/gi, "");
            if (ONE_D.test(fmt) && !(pending && pending.text === text && now - pending.t < 4000)) {
              pending = { text, t: now };
              lastCode = ""; lastAt = 0;           // 還沒確認,不算「已觸發」
            } else {
              pending = null;
              if (onCodeCb) onCodeCb(text);
            }
          }
        }
      } catch (e) {} finally { busy = false; }
    }
    // 相機畫面停住(例如被其他 App 搶走相機)超過 4 秒就自動重新啟動
    if (!paused && video) {
      const now = Date.now();
      if (video.currentTime !== lastVt) { lastVt = video.currentTime; lastVtAt = now; }
      else if (now - lastVtAt > 4000 && !restarting) { restart(); return; }
    }
    showStatus();
    timer = setTimeout(loop, 120);
  }

  async function restart() {
    restarting = true;
    AI.ui.scanStatus("相機畫面停住了,重新啟動中…");
    const cb = onCodeCb;
    clearTimeout(timer); running = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    try { await start(cb); } catch (e) { AI.ui.scanStatus("相機無法重新啟動:" + e.message); }
    restarting = false;
  }

  async function start(onCode) {
    const msg = support();
    if (msg) throw new Error(msg);
    onCodeCb = onCode;
    lastCode = ""; lastAt = 0; paused = false; frames = 0; lastRead = ""; pending = null; lastVt = -1; lastVtAt = Date.now();   // 重新開相機時重置
    try { stream = await openStream(); } catch (e) { throw new Error(explain(e)); }
    track = stream.getVideoTracks()[0];
    const host = document.getElementById("reader");
    host.innerHTML = "";
    video = document.createElement("video");
    video.setAttribute("playsinline", ""); video.muted = true; video.autoplay = true;
    video.style.width = "100%";
    host.appendChild(video);
    setupAim(host);
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
    const ab = document.getElementById("aimBox");
    if (ab) ab.hidden = true;
    aimEl = null;
    AI.ui.scanStatus("");
  }

  // 暫停:保留畫面但不辨識(等使用者按確認)。繼續時,仍在鏡頭前的同一個碼不會立刻重複觸發。
  function pause() { paused = true; }
  function resume() { paused = false; lastAt = Date.now(); }

  return { start, stop, pause, resume, support, isRunning: () => running };
})();

/* 主流程:模式切換、掃描、同步。 */
(function () {
  const $ = AI.ui.$;
  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const STANDALONE = !!window.AI_EMBED;      // 單檔離線版
  let mode = STANDALONE ? "offline" : store.get("ai_mode", "online");
  let busy = false;
  let fileName = "inventory_result.csv";

  function showInfo(code) {
    const r = { status: "info", code, format: AI.decoder.lastFormat() };
    AI.ui.result(r); AI.ui.history(r); AI.feedback.play("found");
  }

  // ---------- 掃描 ----------
  const needConfirm = () => $("needConfirm").checked;
  function resumeScan() { AI.ui.actions([]); AI.scanner.resume(); }

  // 掃到(或手動輸入)一個碼:預設先查詢並顯示品名,等使用者按「確認盤點」才記錄
  async function doScan(code, fromCamera) {
    code = String(code || "").trim();
    if (!code || busy) return;
    busy = true;
    try {
      if (mode === "offline" && !AI.local.hasData()) { AI.scanner.pause(); showInfo(code); AI.ui.actions([{ label: "繼續掃描", cls: "primary", fn: resumeScan }]); return; }
      const who = $("who").value.trim();
      if (needConfirm()) {
        AI.scanner.pause();
        const r = mode === "offline" ? AI.local.lookup(code, who) : await AI.api.json("/api/scan", { code, who, dry: true });
        if (fromCamera !== false && AI.scanner.isRunning()) r.format = AI.decoder.lastFormat();
        AI.ui.result(r); AI.ui.stats(r); AI.feedback.play(r.status);
        if (r.status === "found") {
          AI.ui.actions([
            { label: "✔ 確認盤點", cls: "ok", fn: () => confirmRecord(r, who) },
            { label: "取消", fn: () => { AI.ui.result({ status: "idle", message: "已取消,請掃描下一筆" }); resumeScan(); } },
          ]);
        } else {
          AI.ui.history(r);
          AI.ui.actions([{ label: "繼續掃描", cls: "primary", fn: resumeScan }]);
        }
        if (mode === "offline") refreshOfflineInfo();
        return;
      }
      const r = mode === "offline" ? AI.local.scan(code, who) : await AI.api.json("/api/scan", { code, who });
      AI.ui.result(r); AI.ui.history(r); AI.ui.stats(r); AI.feedback.play(r.status);
      if (mode === "offline") refreshOfflineInfo();
    } catch (e) {
      if (e.noBackend) { switchToOffline(); if (!AI.local.hasData()) { showInfo(code); AI.ui.actions([{ label: "繼續掃描", cls: "primary", fn: resumeScan }]); return; } }
      AI.ui.result({ status: "error", message: e.message }); AI.feedback.play("error");
      AI.ui.actions([{ label: "繼續掃描", cls: "primary", fn: resumeScan }]);
    } finally { busy = false; }
  }

  async function confirmRecord(r, who) {
    if (busy) return;
    busy = true;
    try {
      const res = mode === "offline" ? AI.local.scan(r.code, who) : await AI.api.json("/api/scan", { code: r.code, who });
      AI.ui.result(res); AI.ui.history(res); AI.ui.stats(res); AI.feedback.play(res.status);
      if (mode === "offline") refreshOfflineInfo();
      resumeScan();
    } catch (e) {
      AI.ui.result({ status: "error", message: e.message });
      AI.ui.actions([{ label: "重試", cls: "ok", fn: () => confirmRecord(r, who) }, { label: "取消", fn: resumeScan }]);
    } finally { busy = false; }
  }

  // ---------- 相機 ----------
  async function toggleCam() {
    const btn = $("btnCam");
    if (AI.scanner.isRunning()) { await AI.scanner.stop(); btn.textContent = "開啟相機"; return; }
    try {
      $("camHint").hidden = true;
      await AI.scanner.start((txt) => doScan(txt, true));
      btn.textContent = "關閉相機";
    } catch (e) {
      $("camHint").hidden = false;
      $("camHint").textContent = (e && e.message) || "無法開啟相機,請確認已允許瀏覽器使用相機。";
    }
  }

  // ---------- 模式 ----------
  function applyMode() {
    AI.ui.mode(mode);
    $("onlineBox").hidden = STANDALONE || mode !== "online";
    $("offlineBox").hidden = mode !== "offline";
    document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === mode; });
    if (mode === "offline") { refreshOfflineInfo(); AI.ui.stats(AI.local.hasData() ? AI.local.stats() : null); }
    else refreshInfo();
  }
  function refreshOfflineInfo() {
    const i = AI.local.info();
    $("offInfo").textContent = i
      ? "手機上的清單:" + i.file + "(" + i.downloaded + " 下載),已盤 " + i.scanned + "/" + i.total + ",待同步 " + i.queue + " 筆掃描"
      : "手機上還沒有清單,請先按 ① 下載(需連到後台)。";
    if (i) AI.ui.stats(i);
  }
  function switchToOffline() {
    mode = "offline"; store.set("ai_mode", mode); applyMode();
  }
  async function refreshInfo() {
    try { const i = await AI.api.json("/api/info"); fileName = i.file; AI.ui.stats(i); AI.ui.msg(""); }
    catch (e) {
      if (e.noBackend) { switchToOffline(); AI.ui.msg(e.message); return; }
      AI.ui.stats(null); AI.ui.msg(e.message);
    }
  }

  // ---------- 網頁內建清單(web/inventory_data.json,測試用;真正的清單請改用手機載入) ----------
  async function loadBuiltin(force) {
    try {
      const res = await fetch("inventory_data.json", { cache: "no-store" });
      if (!res.ok) return;
      const ds = await res.json();
      if (!ds || !Array.isArray(ds.rows)) return;
      $("btnLoadBuiltin").hidden = false;
      ds.id = ds.id || "builtin"; ds.columns = ds.columns || [];
      ds.downloaded = ds.downloaded || AI.nowStr(); ds.file = (ds.file || "inventory_data.json") + "(網頁內建)";
      if (!force && AI.local.hasData()) return;      // 手機上已有清單就不覆蓋
      if (force && AI.local.queueSize() && !confirm("手機上還有未同步的掃描,載入會清掉它們。確定?")) return;
      AI.local.setDataset(ds);
      AI.ui.msg("已載入網頁內建清單:" + ds.rows.length + " 筆。"); refreshOfflineInfo();
    } catch (e) { /* 沒有內建清單檔就略過 */ }
  }

  // ---------- 從手機載入清單檔 ----------
  let pendingCsv = null;
  async function onDataFile(ev) {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    try {
      const r = await AI.importer.read(f);
      pendingCsv = r;
      const opts = r.headers.map((h, i) => '<option value="' + i + '">' + AI.ui.esc(h || "(欄位" + (i + 1) + ")") + "</option>").join("");
      $("selKey").innerHTML = opts; $("selName").innerHTML = opts;
      $("selKey").value = AI.importer.guessKey(r.headers); $("selName").value = AI.importer.guessName(r.headers);
      $("importBox").hidden = false;
      AI.ui.msg("請確認編號欄與品名欄,再按「載入這份清單」。");
    } catch (e) { AI.ui.msg("載入失敗:" + e.message); }
  }
  function importOk() {
    try {
      const ds = AI.importer.build(pendingCsv, Number($("selKey").value), Number($("selName").value));
      if (AI.local.queueSize() && !confirm("手機上還有未同步的掃描,載入新清單會清掉它們。確定?")) return;
      AI.local.setDataset(ds); pendingCsv = null; $("importBox").hidden = true;
      AI.ui.msg("已載入清單:" + ds.rows.length + " 筆。" + (ds.warn ? " ⚠ " + ds.warn : "")); refreshOfflineInfo();
    } catch (e) { AI.ui.msg("載入失敗:" + e.message); }
  }

  // ---------- 未盤點 ----------
  let cache = [];
  async function loadList() {
    try {
      cache = mode === "offline" ? AI.local.uncounted() : (await AI.api.json("/api/uncounted")).items;
      AI.ui.list(cache, $("filter").value);
    } catch (e) { $("listInfo").textContent = e.message; }
  }

  // ---------- 離線:下載 / 同步 / 匯出 ----------
  async function downloadData() {
    if (AI.local.queueSize() && !confirm("手機上還有 " + AI.local.queueSize() + " 筆尚未同步的掃描,重新下載會清掉它們。確定?")) return;
    try {
      AI.local.setDataset(await AI.api.json("/api/dataset"));
      AI.ui.msg("已下載清單到手機。"); refreshOfflineInfo();
    } catch (e) { AI.ui.msg(e.message); }
  }
  async function sync() {
    const scans = AI.local.scans();
    if (!scans.length) return AI.ui.msg("沒有待同步的掃描。");
    try {
      const r = await AI.api.json("/api/sync", { scans, who: $("who").value.trim() });
      const nf = r.results.filter((x) => x.status === "notfound").map((x) => x.code);
      AI.local.clearQueue(); refreshOfflineInfo();
      AI.ui.msg("同步完成:" + scans.length + " 筆;找不到 " + nf.length + " 筆" + (nf.length ? "(" + nf.slice(0, 10).join("、") + ")" : "") +
        "。後台目前已盤 " + r.scanned + "/" + r.total + "。");
    } catch (e) { AI.ui.msg("同步失敗:" + e.message + "(資料仍在手機上,不會遺失)"); }
  }

  // ---------- 初始化 ----------
  function init() {
    $("who").value = store.get("ai_who", "");
    $("needConfirm").checked = store.get("ai_confirm", "1") === "1";
    $("needConfirm").addEventListener("change", () => store.set("ai_confirm", $("needConfirm").checked ? "1" : "0"));
    $("pin").value = store.get("ai_pin", "");
    AI.api.pin = $("pin").value;
    $("who").addEventListener("change", () => store.set("ai_who", $("who").value.trim()));
    $("pin").addEventListener("change", () => { AI.api.pin = $("pin").value; store.set("ai_pin", AI.api.pin); applyMode(); });

    document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", async () => {
      document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
      ["scan", "list", "set"].forEach((t) => { $("tab-" + t).hidden = t !== b.dataset.tab; });
      if (b.dataset.tab !== "scan" && AI.scanner.isRunning()) await toggleCam();
      if (b.dataset.tab === "list") loadList();
    }));
    document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => {
      mode = r.value; store.set("ai_mode", mode); applyMode();
    }));

    AI.ui.pickHandler = (key) => { if (!busy) doScan(key, false); };
    $("btnCam").addEventListener("click", toggleCam);
    $("btnManual").addEventListener("click", () => { doScan($("manual").value); $("manual").value = ""; });
    $("manual").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btnManual").click(); });
    $("filter").addEventListener("input", () => AI.ui.list(cache, $("filter").value));

    $("btnDownloadData").addEventListener("click", downloadData);
    $("btnLoadFile").addEventListener("click", () => $("dataIn").click());
    $("btnLoadBuiltin").addEventListener("click", () => loadBuiltin(true));
    $("dataIn").addEventListener("change", onDataFile);
    $("btnImportOk").addEventListener("click", importOk);
    $("btnSync").addEventListener("click", sync);
    const stamp = () => AI.nowStr().replace(/[: ]/g, "").replace(/-/g, "");
    async function exportCsv(text, name) {
      const file = new File([text], name, { type: "text/csv" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
      } catch (e) { if (e && e.name === "AbortError") return; }
      AI.saveBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), name);
      AI.ui.msg("已下載 " + name + ",請用檔案管理員/LINE/USB 傳回電腦。");
    }
    $("btnExportCsv").addEventListener("click", () => {
      if (!AI.local.scans().length) return AI.ui.msg("沒有掃描紀錄可匯出。");
      exportCsv(AI.local.csv(), "phone_result_" + stamp() + ".csv");
    });
    $("btnExportFull").addEventListener("click", () => {
      if (!AI.local.hasData()) return AI.ui.msg("手機上沒有清單。");
      exportCsv(AI.local.csvFull(), "inventory_full_" + stamp() + ".csv");
    });
    $("btnClear").addEventListener("click", () => {
      if (confirm("清除手機上的清單與未同步的掃描紀錄?(無法復原)")) { AI.local.clear(); refreshOfflineInfo(); AI.ui.stats(null); }
    });
    $("btnDlUncounted").addEventListener("click", async () => {
      try { AI.saveBlob(await AI.api.blob("/download/uncounted.csv"), "uncounted.csv"); } catch (e) { AI.ui.msg(e.message); }
    });
    $("btnDlResult").addEventListener("click", async () => {
      try { AI.saveBlob(await AI.api.blob("/download/result"), fileName); } catch (e) { AI.ui.msg(e.message); }
    });

    if (STANDALONE) {
      AI.local.useEmbedded(window.AI_EMBED);
      ["modeBox", "onlineBox", "pinLabel", "btnDownloadData", "btnSync", "btnLoadFile"].forEach((id) => { $(id).hidden = true; });
      document.querySelector("h1").textContent = "財產盤點(離線版)";
      document.title = "財產盤點(離線版)";
    }
    const s = AI.scanner.support();
    if (s) { $("camHint").hidden = false; $("camHint").textContent = s; }
    applyMode();
  }
  async function diag() {
    const el = $("diag"), parts = ["版本 2.5", "安全連線:" + (window.isSecureContext ? "是" : "否(不能直接開相機)"),
      "模式:" + (STANDALONE ? "單檔離線版" : "伺服器版")];
    parts.push("比對規則:" + (AI.normKey("a-1_2") === "A12" ? "忽略橫線(新)" : "舊版,請更新 matcher.js"));
    if (bundled) parts.push("網頁內建清單 " + bundled.file + " " + bundled.rows.length + " 筆" + (bundled.warn ? " ⚠ " + bundled.warn : ""));
    if (location.protocol === "content:") parts.push("開啟方式:content://(Chrome 不允許授權相機)");
    el.textContent = parts.join(" ｜ ") + " ｜ 解碼器:載入中…";
    try {
      await AI.decoder.init();
      await ZXingWASM.readBarcodes(new ImageData(8, 8), { formats: ["QRCode"] });   // 實際啟動一次 wasm
      parts.push("解碼器:就緒" + (AI.decoder.hasNative() ? "(含內建偵測器)" : ""));
    } catch (e) { parts.push("解碼器:失敗 " + ((e && e.message) || e)); }
    el.textContent = parts.join(" ｜ ");
  }
  // 沒有後台(例如放在 GitHub 的靜態網頁)時,自動讀取網頁旁的 data/assets.csv;有後台(筆電版)則不使用
  let bundled = null;
  async function bootstrap() {
    if (!STANDALONE) {
      try { await AI.api.req("/api/info"); }
      catch (e) {
        if (e.noBackend) {
          try {
            const res = await fetch("data/assets.csv?_=" + Date.now(), { cache: "no-store" });
            if (res.ok) {
              const csv = AI.importer.parseBuffer(await res.arrayBuffer(), "assets.csv");
              bundled = AI.importer.build(csv, AI.importer.guessKey(csv.headers), AI.importer.guessName(csv.headers), "bundled-" + csv.hash);
              AI.local.useEmbedded(bundled);
            }
          } catch (e2) { bundled = null; }
          mode = "offline"; store.set("ai_mode", mode);
          applyMode();
        }
      }
    }
    diag();
  }
  init();
  bootstrap();
  loadBuiltin(false);
})();

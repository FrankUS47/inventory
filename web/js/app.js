/* 主流程:模式切換、掃描、同步。 */
(function () {
  const $ = AI.ui.$;
  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  let mode = store.get("ai_mode", "online");
  let busy = false;
  let fileName = "inventory_result.csv";

  // ---------- 掃描 ----------
  async function doScan(code) {
    code = String(code || "").trim();
    if (!code || busy) return;
    busy = true;
    try {
      const who = $("who").value.trim();
      const r = mode === "offline" ? AI.local.scan(code, who) : await AI.api.json("/api/scan", { code, who });
      AI.ui.result(r); AI.ui.history(r); AI.ui.stats(r); AI.feedback.play(r.status);
      if (mode === "offline") refreshOfflineInfo();
    } catch (e) {
      AI.ui.result({ status: "error", message: e.message }); AI.feedback.play("error");
    } finally { busy = false; }
  }

  // ---------- 相機 ----------
  async function toggleCam() {
    const btn = $("btnCam");
    if (AI.scanner.isRunning()) { await AI.scanner.stop(); btn.textContent = "開啟相機"; return; }
    try {
      $("camHint").hidden = true;
      await AI.scanner.start(doScan);
      btn.textContent = "關閉相機";
    } catch (e) {
      $("camHint").hidden = false;
      $("camHint").textContent = (e && e.message) || "無法開啟相機,請確認已允許瀏覽器使用相機。";
    }
  }
  async function onFile(ev) {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    if (AI.scanner.isRunning()) await toggleCam();
    try { doScan(await AI.scanner.scanFile(f)); }
    catch (e) { AI.ui.result({ status: "error", message: "照片中沒有辨識到 QR code/條碼,請靠近一點、對焦後再拍。" }); }
  }

  // ---------- 模式 ----------
  function applyMode() {
    AI.ui.mode(mode);
    $("onlineBox").hidden = mode !== "online";
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
  async function refreshInfo() {
    try { const i = await AI.api.json("/api/info"); fileName = i.file; AI.ui.stats(i); AI.ui.msg(""); }
    catch (e) { AI.ui.stats(null); AI.ui.msg(e.message); }
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

    $("btnCam").addEventListener("click", toggleCam);
    $("fileIn").addEventListener("change", onFile);
    $("btnManual").addEventListener("click", () => { doScan($("manual").value); $("manual").value = ""; });
    $("manual").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btnManual").click(); });
    $("filter").addEventListener("input", () => AI.ui.list(cache, $("filter").value));

    $("btnDownloadData").addEventListener("click", downloadData);
    $("btnSync").addEventListener("click", sync);
    $("btnExportCsv").addEventListener("click", () => {
      if (!AI.local.scans().length) return AI.ui.msg("沒有掃描紀錄可匯出。");
      AI.saveBlob(new Blob([AI.local.csv()], { type: "text/csv;charset=utf-8" }), "phone_result_" + AI.nowStr().replace(/[: ]/g, "").replace(/-/g, "") + ".csv");
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

    const s = AI.scanner.support();
    if (s) { $("camHint").hidden = false; $("camHint").textContent = s; }
    applyMode();
  }
  init();
})();

/* 從手機載入清單檔:支援電腦產生的 inventory_data.json,或直接載入 CSV(UTF-8 / Big5 皆可)。
   清單檔只在手機本機讀取,不會上傳到任何地方。 */
window.AI = window.AI || {};
AI.importer = (function () {
  const STATUS_COLS = ["盤點狀態", "盤點時間", "盤點次數", "盤點人", "盤點裝置"];

  function decode(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) {}
    try { return new TextDecoder("big5").decode(buf); } catch (e) {}
    return new TextDecoder("utf-8").decode(buf);
  }

  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = ""; rows.push(row); row = [];
      } else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ""));
  }

  async function read(file) {
    const text = decode(await file.arrayBuffer());
    if (/\.json$/i.test(file.name) || text.trim()[0] === "{") {
      const ds = JSON.parse(text);
      if (!ds || !Array.isArray(ds.rows)) throw new Error("不是有效的清單檔");
      ds.id = ds.id || "json-" + Date.now();
      ds.columns = ds.columns || [];
      ds.downloaded = ds.downloaded || AI.nowStr();
      ds.file = ds.file || file.name;
      return { type: "json", ds };
    }
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("CSV 內容太少,請確認第一列是欄位標題");
    return { type: "csv", headers: rows[0].map((s) => s.trim()), rows: rows.slice(1), file: file.name };
  }

  function guess(headers, names, fallback) {
    for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return i; }
    return Math.min(fallback, headers.length - 1);
  }
  const guessKey = (h) => guess(h, ["財產編號", "財產代碼", "編號", "條碼", "資產編號"], 0);
  const guessName = (h) => guess(h, ["品名", "財產名稱", "名稱", "品項"], 1);

  function build(csv, keyIdx, nameIdx) {
    const h = csv.headers;
    const extra = h.map((n, i) => i).filter((i) => i !== keyIdx && i !== nameIdx && h[i] && STATUS_COLS.indexOf(h[i]) < 0).slice(0, 4);
    const ti = h.indexOf("盤點時間");
    const rows = csv.rows.map((r) => ({
      k: (r[keyIdx] || "").trim(), n: (r[nameIdx] || "").trim(),
      x: extra.map((i) => (r[i] || "").trim()), t: ti >= 0 ? (r[ti] || "").trim() : "",
    })).filter((r) => r.k);
    if (!rows.length) throw new Error("選的編號欄沒有資料");
    return { id: "csv-" + Date.now(), columns: extra.map((i) => h[i]), rows, file: csv.file, downloaded: AI.nowStr() };
  }

  return { read, build, guessKey, guessName };
})();

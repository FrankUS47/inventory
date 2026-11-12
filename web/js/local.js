/* 離線模式:清單與掃描紀錄存在手機瀏覽器的 localStorage。 */
(function () {
  const KEY = "ai_offline_v1";
  let st = null, index = null;

  function load() {
    if (st) return st;
    try { st = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { st = null; }
    if (!st) st = { ds: null, scans: [] };
    return st;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); }
    catch (e) { throw new Error("手機儲存空間寫入失敗(是否為無痕模式?)"); }
  }
  function buildIndex() {
    index = new Map();
    load().ds.rows.forEach((r, i) => {
      const k = AI.normKey(r.k);
      if (!k) return;
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(i);
    });
  }
  function stats() {
    const rows = load().ds ? load().ds.rows : [];
    return { total: rows.length, scanned: rows.filter((r) => r.t).length };
  }
  function extras(r) {
    const o = {}, cols = load().ds.columns;
    cols.forEach((c, i) => { o[c] = r.x[i]; });
    return o;
  }

  AI.local = {
    hasData() { return !!load().ds; },
    datasetId() { const d = load().ds; return d ? d.built || "" : ""; },
    queueSize() { return load().scans.length; },
    info() { const s = load(); return s.ds ? { file: s.ds.file, downloaded: s.ds.downloaded, ...stats(), queue: s.scans.length } : null; },
    stats,
    setDataset(ds) { load(); st.ds = ds; st.scans = []; index = null; save(); },
    clear() { st = { ds: null, scans: [] }; index = null; save(); },
    clearQueue() { load().scans = []; save(); },
    // 單檔離線版:資料嵌在 HTML 內;同一份資料(id 相同)保留手機上的進度,新版資料則重置
    useEmbedded(ds) {
      load();
      if (!st.ds || st.ds.id !== ds.id) { st.ds = ds; st.scans = []; index = null; save(); }
    },

    scan(code, who) {
      const s = load();
      if (!s.ds) throw new Error("尚未下載清單,請到「設定」先下載");
      if (!index) buildIndex();
      const when = AI.nowStr();
      let rids = null;
      for (const k of AI.candidates(code)) { if (index.has(k)) { rids = index.get(k); break; } }
      s.scans.push({ code, ts: when, who: who || "" });
      if (!rids) { save(); return { status: "notfound", code, ...stats() }; }
      const i = rids.find((j) => !s.ds.rows[j].t);
      const row = s.ds.rows[i === undefined ? rids[0] : i];
      const prev = row.t;
      if (!prev) row.t = when;
      save();
      return {
        status: prev ? "duplicate" : "found", code, key: row.k, name: row.n,
        extras: extras(row), time: row.t, first_time: row.t, multi: rids.length, ...stats(),
      };
    },

    uncounted() {
      const s = load();
      return s.ds ? s.ds.rows.filter((r) => !r.t).map((r) => ({ key: r.k, name: r.n, extras: extras(r) })) : [];
    },
    scans() { return load().scans.slice(); },

    csvFull() {
      const s = load(), q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      const head = ["財產編號", "品名"].concat(s.ds.columns, ["盤點狀態", "盤點時間"]);
      const lines = [head.map(q).join(",")];
      s.ds.rows.forEach((r) => lines.push([r.k, r.n].concat(r.x, [r.t ? "已盤點" : "", r.t || ""]).map(q).join(",")));
      return "\ufeff" + lines.join("\r\n");
    },

    csv() {
      const s = load();
      const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      const lines = [["掃描內容", "盤點時間", "盤點人"].map(q).join(",")];
      s.scans.forEach((x) => lines.push([x.code, x.ts, x.who].map(q).join(",")));
      return "﻿" + lines.join("\r\n");
    },
  };
})();

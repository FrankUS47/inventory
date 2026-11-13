/* 與後台 inventory/matcher.py 邏輯相同(離線模式在手機端比對用)。 */
window.AI = window.AI || {};

AI.normKey = function (v) {
  let s = String(v == null ? "" : v).trim();
  if (/^-?\d+\.0+$/.test(s)) s = s.split(".")[0];
  return s.replace(/[\s\-_]+/g, "").toUpperCase();
};

AI.candidates = function (raw) {
  raw = String(raw || "").trim();
  const out = [];
  const add = (x) => { const n = AI.normKey(x); if (n && out.indexOf(n) < 0) out.push(n); };
  add(raw);
  const re = /[?&][^=&#]+=([^&#]+)/g;
  let m;
  while ((m = re.exec(raw))) {
    try { add(decodeURIComponent(m[1])); } catch (e) { add(m[1]); }
  }
  raw.split(/[\s\/:;,|=\\]+/).reverse().forEach(add);
  return out;
};

/* 編輯距離(Levenshtein),用來在「找不到」時列出最接近的清單編號 */
AI.editDistance = function (a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let min = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = v; if (v < min) min = v;
    }
    if (min > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
};
/* rows: [{k,n}];回傳最接近的最多 n 筆 */
AI.nearest = function (code, rows, n) {
  const c = AI.normKey(code);
  if (c.length < 6) return [];
  const limit = Math.max(2, Math.floor(c.length * 0.2));
  const out = [];
  rows.forEach((r) => {
    const d = AI.editDistance(c, AI.normKey(r.k), limit);
    if (d <= limit) out.push({ key: r.k, name: r.n, dist: d });
  });
  return out.sort((a, b) => a.dist - b.dist).slice(0, n || 3);
};

AI.nowStr = function () {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
    p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
};

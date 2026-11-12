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

AI.nowStr = function () {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
    p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
};

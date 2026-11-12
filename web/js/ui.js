/* 畫面顯示。 */
window.AI = window.AI || {};
AI.ui = (function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TAG = { info: "ℹ 尚未載入清單", found: "✔ 盤點成功", duplicate: "⚠ 已盤點過", notfound: "✘ 查無資料", error: "✘ 無法完成" };

  function extrasHtml(ex) {
    return Object.keys(ex || {}).filter((k) => ex[k]).map((k) => esc(k) + ":" + esc(ex[k])).join(" ｜ ");
  }

  return {
    $, esc,
    stats(s) { $("stats").textContent = s ? "已盤 " + s.scanned + " / 共 " + s.total : "—"; },
    mode(m) {
      const b = $("modeBadge");
      b.textContent = m === "offline" ? "離線" : "連線";
      b.className = "badge" + (m === "offline" ? " off" : "");
    },
    result(r) {
      const el = $("result");
      if (r.status === "idle") { el.className = "card idle"; el.textContent = r.message; return; }
      el.className = "card " + r.status;
      let html = '<div class="tag">' + TAG[r.status] + "</div>";
      if (r.status === "notfound") {
        html += '<div class="name">找不到此筆資料</div>' +
          '<div class="meta">掃到的內容:' + esc(r.code) + "</div>" +
          '<div class="meta">這個編號不在財產清單中,請確認標籤是否正確,或另行登記。</div>';
      } else if (r.status === "info") {
        html += '<div class="name">無法比對</div>' +
          '<div class="meta">掃到的內容:' + esc(r.code) + (r.format ? "(" + esc(r.format) + ")" : "") + "</div>" +
          '<div class="meta">手機上還沒有財產清單。請到「設定/同步」載入清單檔後再掃描。</div>';
      } else if (r.status === "error") {
        html += '<div class="meta">' + esc(r.message) + "</div>";
      } else {
        html += '<div class="name">' + esc(r.name || "(無品名)") + "</div>" +
          '<div class="meta">' + esc(r.key) + (r.row ? "(第 " + r.row + " 列)" : "") + "</div>";
        const ex = extrasHtml(r.extras);
        if (ex) html += '<div class="meta">' + ex + "</div>";
        if (r.status === "duplicate") html += '<div class="meta">首次盤點時間:' + esc(r.first_time) + "</div>";
        else html += '<div class="meta">盤點時間:' + esc(r.time) + "</div>";
        if (r.multi > 1) html += '<div class="meta">⚠ 清單中此編號有 ' + r.multi + " 筆,請人工確認</div>";
      }
      el.innerHTML = html;
    },
    history(r) {
      const li = document.createElement("li");
      const t = new Date(), p = (n) => String(n).padStart(2, "0");
      li.innerHTML = '<span>' + p(t.getHours()) + ":" + p(t.getMinutes()) + ":" + p(t.getSeconds()) + "</span><b>" +
        esc(r.status === "notfound" || r.status === "info" ? r.code : r.name || r.key) + '</b><span class="s-' + r.status + '">' +
        { found: "成功", duplicate: "重複", notfound: "找不到", info: "已讀取" }[r.status] + "</span>";
      $("history").prepend(li);
      while ($("history").children.length > 30) $("history").lastChild.remove();
    },
    list(items, filter) {
      const f = AI.normKey(filter || "");
      const shown = items.filter((it) => !f || AI.normKey([it.key, it.name, Object.values(it.extras || {}).join("")].join("")).indexOf(f) >= 0);
      $("listInfo").textContent = "未盤點 " + items.length + " 筆" + (f ? "(符合 " + shown.length + " 筆)" : "");
      $("list").innerHTML = shown.slice(0, 500).map((it) =>
        "<li><b>" + esc(it.key) + " " + esc(it.name) + "</b><small>" + extrasHtml(it.extras) + "</small></li>").join("");
    },
    msg(t) { $("msg").textContent = t || ""; },
  };
})();

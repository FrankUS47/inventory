/* 畫面顯示。 */
window.AI = window.AI || {};
AI.ui = (function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TAG = { found: "✔ 盤點成功", duplicate: "⚠ 已盤點過", notfound: "✘ 清單中找不到", error: "✘ 發生錯誤" };

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
      el.className = "card " + r.status;
      let html = '<div class="tag">' + TAG[r.status] + "</div>";
      if (r.status === "notfound") {
        html += '<div class="name">' + esc(r.code) + '</div><div class="meta">找不到這個編號,請確認標籤或另行登記</div>';
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
        esc(r.status === "notfound" ? r.code : r.name || r.key) + '</b><span class="s-' + r.status + '">' +
        { found: "成功", duplicate: "重複", notfound: "找不到" }[r.status] + "</span>";
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

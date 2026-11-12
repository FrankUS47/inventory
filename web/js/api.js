/* 與後台溝通。 */
window.AI = window.AI || {};
AI.api = {
  pin: "",
  async req(path, body) {
    const opt = { headers: { "X-Pin": AI.api.pin } };
    if (body !== undefined) {
      opt.method = "POST";
      opt.headers["Content-Type"] = "application/json";
      opt.body = JSON.stringify(body);
    }
    let res;
    try { res = await fetch(path, opt); }
    catch (e) { throw new Error("連不上後台(Wi-Fi 或筆電程式是否還在?)"); }
    if (!res.ok) {
      let msg = "後台錯誤 " + res.status;
      try { msg = (await res.json()).error || msg; } catch (e) {}
      const err = new Error(msg);
      if (res.status === 404 || res.status === 405 || res.status === 501) {
        err.noBackend = true;
        err.message = "這個網頁沒有連到後台(例如放在 GitHub 的網頁)。已切換成離線模式,請到「設定/同步」載入清單檔。";
      }
      throw err;
    }
    return res;
  },
  async json(path, body) { return (await AI.api.req(path, body)).json(); },
  async blob(path) { return (await AI.api.req(path)).blob(); },
};

AI.saveBlob = function (blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
};

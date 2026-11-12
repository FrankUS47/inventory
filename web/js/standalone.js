/* 獨立離線版專用:把內嵌的清單載入手機,固定使用離線模式,隱藏需要後台的功能。 */
(function () {
  if (!AI.embedded) return;
  try { localStorage.setItem("ai_mode", "offline"); } catch (e) {}
  const e = AI.embedded;
  try {
    if (!AI.local.hasData()) {
      AI.local.setDataset(Object.assign({}, e.dataset, { built: e.built }));
    } else if (AI.local.datasetId() !== e.built) {
      if (AI.local.queueSize() > 0) {
        alert("手機上還有尚未匯出的掃描紀錄,所以沿用舊清單。請先到「設定」匯出 CSV,再清除離線資料,新清單才會載入。");
      } else {
        AI.local.setDataset(Object.assign({}, e.dataset, { built: e.built }));
      }
    }
  } catch (err) { alert(err.message); }
  const st = document.createElement("style");
  st.textContent = "#modeBox,#btnDownloadData,#btnSync{display:none!important}";
  document.head.appendChild(st);
})();

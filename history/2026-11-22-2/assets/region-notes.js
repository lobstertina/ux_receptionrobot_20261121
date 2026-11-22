/* ============================================================
   資訊備註模式：把工程標註拆到「畫面區塊」上（登錄表；各模組資料在 assets/region-notes/<模組字母>.js）
   殼層 index.html 依 page-map.js 的 AREAS 自動載入 assets/region-notes/<area.id>.js（文件區 pin 不載入），
   檔案不存在也不會壞，只是那個模組的頁照舊顯示整頁標註。

   group＝一個主頁（例如 B1.1）連同它所有狀態頁碼：
     { id, main, codes: [...], file, page: { features, hints }, regions: [...] }
   - main：主頁碼；codes 其餘頁碼是狀態頁碼，資訊備註模式下在左側選單縮排列在主頁碼底下
     （點了直接選中對應區塊的那個狀態），也可點右側狀態卡頭切換。
   - file：這一頁的 HTML 檔名（對照用，殼層不靠它換頁）。
   - page：點畫面空白處（沒選區塊）時顯示的「整頁通則」。
   - regions[].id 對應頁面 HTML 上的 data-note-region="…"；同一個 id 可以標在多個元素上，會一起框起來。
     regions[] = { id, label, fields?: [{ id, label }], states: [...] }
     fields：這個區塊用到的輸入欄位（id 對到 assets/field-rules.js 的 FIELDS），面板會列出、點了跳 G1。
   - states[] = { label, code, fill?, click?, features: [...四區...], hints?: [...測試值...] }
     code：點狀態卡頭要切到的頁碼（要在 codes 裡）；
     fill：{ "CSS 選擇器": "值" }，切過去後填進畫面的示範值；
     click：[{ selector, text? }]，切過去後依序點這些元素（等它出現才點，最多 15 秒），帶出只能靠操作才看得到的狀態。
   - features 的區塊 title 只能是四種，照這個順序：前端驗證 → 前端互動 → 顯示規則 → API
     （寫法同 page-map.js 的 FEATURE_NOTES；條目可寫字串或 { text, page }／{ text, api }／{ text, href }）。
   - hints 格式同 page-map.js 的 TEST_HINTS：{ title, inputs: [...], result, inputsLabel? }。
   內容從 page-map.js 的 FEATURE_NOTES／TEST_HINTS 重新分配到區塊，不另立新規格；之後改標註兩邊要一起改。
   覆蓋檢查：node scripts/check-region-notes.cjs；對照現行標註：node scripts/dump-notes.cjs <頁碼>
   ============================================================ */
(function () {
  "use strict";

  var groups = [];
  var byCode = {};

  window.WfRegionNotes = {
    groups: groups,
    /** 各模組檔呼叫：登記一批 group */
    register: function (list) {
      (list || []).forEach(function (group) {
        if (!group || !group.codes) return;
        group.regions = group.regions || [];
        group.page = group.page || {};
        groups.push(group);
        group.codes.forEach(function (code) {
          byCode[code] = group;
        });
      });
    },
    /** 某個頁碼屬於哪個 group（沒拆區塊回傳 null） */
    groupFor: function (code) {
      return byCode[code] || null;
    },
    /** 是不是某個主頁的狀態頁碼（資訊備註模式下左側選單縮排列在主頁碼底下） */
    isStateCode: function (code) {
      var group = byCode[code];
      return !!group && group.main !== code;
    },
    /** 舊名（相容既有專案）：同 isStateCode */
    isHiddenInNotes: function (code) {
      return this.isStateCode(code);
    },
  };
})();

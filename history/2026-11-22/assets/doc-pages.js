/* ============================================================
   文件頁資料（照專案填；畫法在 assets/doc-render.js，不用改）
   - 四種文件頁各讀一段：IA → G4 資訊架構、API_GAPS → G5 API 缺口清單、
     MODULE_ERRORS → G6 模組錯誤處理、UX_RULES → G7 專案 UX 準則。
   - pages 寫頁碼陣列，文件頁每張卡下方會出現可點的頁碼按鈕；check.mjs 會檢查頁碼都在 PAGES。
   - 寫法規則見 skill 的 references/資訊架構與keypage.md、references/API錯誤碼對帳.md。
   ============================================================ */
window.WfDocPages = (function () {
  "use strict";

  /**
   * IA：資訊架構（產品 → 功能模組 → 頁面）＋每頁方框結構。
   *   product  選填：最上層名稱；留空用 wireframe.config.js 的專案名稱
   *   modules  [{ code: "A", title: "帳號", pages: [頁面…] }]，陣列順序＝畫面由左到右
   *   頁面     { name: "頁名（照規格小節標題）", code?: "A1.1（已定頁碼才寫）",
   *              key?: "key page 的理由（寫是哪個判準：第一眼記住／最常用／產品方最想推）",
   *              boxes: ["頂部導覽", { label: "今日課程卡", size: "l" }, …] }
   *   boxes    由上而下的區塊名稱；size 選填 s／m／l，表示這塊大約多高
   */
  var IA = { product: "", modules: [] };

  /**
   * API_GAPS：API 缺口清單（API 錯誤碼對帳找到的缺口與矛盾）。
   *   { id, title, kind: "缺口"|"矛盾", source: "規格檔名 第 N 行或文件連結",
   *     summary: "畫面需要什麼、規格目前怎麼寫",
   *     decision: ["畫面先怎麼做（已依建議做法定案）"], ask: ["待後端確認的事"], pages: ["B1.1-3"] }
   */
  var API_GAPS = [];

  /**
   * MODULE_ERRORS：模組錯誤處理（一個模組的錯誤怎麼分層、每層使用者看到什麼）。
   *   [{ code: "B", title: "模組名", sections: [
   *      { id, title, summary, bullets: [...], table?: { headers: [...], rows: [[...]] }, pages: [...] } ] }]
   */
  var MODULE_ERRORS = [];

  /**
   * UX_RULES：專案 UX 準則（本案定下、跨頁都要照做的規則）。
   *   [{ code: "全站" 或模組字母, title: "通用", rules: [
   *      { id, title, summary?, bullets: [...], pages: [...] } ] }]
   */
  var UX_RULES = [];

  return { IA: IA, API_GAPS: API_GAPS, MODULE_ERRORS: MODULE_ERRORS, UX_RULES: UX_RULES };
})();

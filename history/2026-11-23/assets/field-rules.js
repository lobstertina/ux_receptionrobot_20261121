/* ============================================================
   全站欄位驗證規則（唯一資料來源）
   - 每個輸入欄位（文字、數字、密碼、Email、手機、日期、搜尋、多行、驗證碼…）都在這裡登記一筆；
     G1 欄位驗證規則頁、右側工程標註「前端驗證」區的欄位連結都讀這份。
   - 畫面上的輸入框寫 data-wf-field="<id>" 對到這裡；usedOn 列出用到它的頁碼（含狀態頁），右側標註靠它反查。
   - 各頁工程標註不重寫欄位規則與錯誤句，一律以這份為準。
   ============================================================ */
window.WfFieldRules = (function () {
  "use strict";

  /* ---------------- 以下為資料 ---------------- */

  /**
   * FIELDS 欄位定義：
   *   id          必填：英文小寫 kebab-case，也是 G1 頁的錨點（#id）與畫面 data-wf-field 的值
   *   title       必填：欄位名稱
   *   usedOn      必填：用到此欄位的頁碼陣列（含狀態頁）
   *   modified    必填：最後修改日期 YYYY-MM-DD
   *   keywords    選填：搜尋關鍵字（同義詞、API 欄位名、常見輸入值）
   *   placeholder 選填：框內提示字（擬真範例，例：0912 345 678）
   *   widget      選填：G1 預覽用的輸入框 { type: "text"|"textarea"|"password"|"email"|"tel"|"number"|"search"|"date", label?, maxlength? }
   *   focus       選填：聚焦時的行為（字串陣列）
   *   typing      選填：輸入中的限制（字串陣列）
   *   submit      選填：點「送出」按鈕時的檢查（字串陣列）
   *   errors      選填：錯誤顯示方式 [{ sample: "輸入值", message: "錯誤句" }]；sample "" 代表空白
   *
   * 範例（複製後改值）：
   * {
   *   id: "email",
   *   title: "電子郵件",
   *   keywords: ["email", "信箱"],
   *   placeholder: "name@example.com",
   *   widget: { type: "email" },
   *   modified: "2026-01-01",
   *   usedOn: ["A1.1", "A1.1-2"],
   *   focus: ["開啟 Email 鍵盤"],
   *   typing: ["去掉前後空白"],
   *   submit: ["必填", "需含 @ 與網域"],
   *   errors: [{ sample: "abc", message: "請輸入完整的 Email，例：name@example.com" }],
   * }
   */
  var FIELDS = [
    {
      id: "visitor-phone",
      title: "訪客手機號碼",
      keywords: ["手機", "phone", "報到查詢"],
      placeholder: "例：0912 345 678",
      widget: { type: "tel" },
      modified: "2026-11-21",
      usedOn: ["A1.2", "A1.2-6"],
      focus: ["只能用畫面上的數字鍵盤輸入，不叫出系統鍵盤"],
      typing: ["只收數字，最多 10 碼", "自動去掉空白與連字號"],
      submit: ["必填", "09 開頭的 10 碼數字"],
      errors: [
        { sample: "", message: "請輸入手機號碼" },
        { sample: "0912", message: "請輸入 09 開頭的 10 碼手機號碼" },
      ],
    },
    {
      id: "host-name",
      title: "要找的人",
      keywords: ["員工", "被約人", "搜尋"],
      placeholder: "例：陳怡君",
      widget: { type: "search" },
      modified: "2026-11-23",
      usedOn: ["A1.5", "A1.5-2", "A1.5-3"],
      focus: ["叫出系統中文鍵盤"],
      typing: ["輸入 1 個字以上即時搜尋", "去掉前後空白", "只能輸入中文或英文（英文字間可有空白）；不能有注音符號、數字和標點符號", "注音選字途中不檢查，選完字才檢查"],
      submit: ["送出前要從結果選一位員工", "含注音符號、數字或標點符號時不能送出"],
      errors: [
        { sample: "", message: "請選擇要找的人" },
        { sample: "陳1", message: "姓名只能輸入中文或英文" },
        { sample: "ㄔㄣ", message: "姓名只能輸入中文或英文" },
        { sample: "陳，", message: "姓名只能輸入中文或英文" },
      ],
    },
    {
      id: "visitor-name",
      title: "訪客姓名",
      keywords: ["姓名", "name"],
      placeholder: "例：王小明",
      widget: { type: "text", maxlength: 20 },
      modified: "2026-11-21",
      usedOn: ["A1.5", "A1.5-2", "A1.5-3"],
      focus: ["叫出系統中文鍵盤"],
      typing: ["最多 20 字", "去掉前後空白"],
      submit: ["必填"],
      errors: [{ sample: "", message: "請輸入您的姓名" }],
    },
    {
      id: "visitor-company",
      title: "公司名稱",
      keywords: ["公司", "company"],
      placeholder: "例：光年資訊",
      widget: { type: "text", maxlength: 30 },
      modified: "2026-11-21",
      usedOn: ["A1.5", "A1.5-2", "A1.5-3"],
      typing: ["最多 30 字", "去掉前後空白"],
      submit: ["選填"],
    },
  ];

  /* ---------------- 以下不用改 ---------------- */

  /** 條目可寫字串或 { text } */
  function lineText(item) {
    return typeof item === "string" ? item : (item && item.text) || "";
  }

  function hasPlaceholder(field) {
    return !!(field && field.placeholder);
  }

  function listedFields() {
    return FIELDS.slice();
  }

  /** 右側工程標註：本頁用到的欄位 */
  function notesFor(code) {
    return FIELDS.filter(function (f) {
      return (f.usedOn || []).indexOf(code) !== -1;
    }).map(function (f) {
      return { id: f.id, label: f.title };
    });
  }

  function fieldById(id) {
    for (var i = 0; i < FIELDS.length; i += 1) if (FIELDS[i].id === id) return FIELDS[i];
    return null;
  }

  /** G1 搜尋用：欄位名稱、關鍵字、規則、錯誤句、頁碼 */
  function searchText(field) {
    var widget = field.widget || {};
    var chunks = [field.title, field.placeholder || "", widget.label || "", (field.keywords || []).join(" ")];
    [field.focus, field.typing, field.submit].forEach(function (list) {
      (list || []).forEach(function (item) { chunks.push(lineText(item)); });
    });
    (field.errors || []).forEach(function (err) {
      chunks.push(err.sample || "", err.message || "");
    });
    (field.usedOn || []).forEach(function (code) { chunks.push(code); });
    return chunks.join(" ").toLowerCase();
  }

  return {
    FIELDS: FIELDS,
    lineText: lineText,
    hasPlaceholder: hasPlaceholder,
    listedFields: listedFields,
    notesFor: notesFor,
    fieldById: fieldById,
    searchText: searchText,
  };
})();

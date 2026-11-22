/* ============================================================
   頁面登錄表（殼層的唯一資料來源）
   - 左側選單、右側工程標註、網址 ?p= 都讀這份。
   - 同一頁的狀態（A1.1-2）必須指向同一份 HTML，用 ?p= 切換。
   - 加頁步驟：建 HTML → 登錄 PAGES → 掛進 AREAS → 寫 FEATURE_NOTES／TEST_HINTS → 輸入欄位登記到 field-rules.js → 跑 node scripts/check.mjs
   - 資訊備註模式（依畫面區塊看標註）：頁面元素加 data-note-region，區塊資料寫在 assets/region-notes/<模組>.js（格式見 assets/region-notes.js），
     跑 node scripts/check-region-notes.cjs 檢查有沒有漏分配
   - 「以下為資料」區塊照專案改；「以下不用改」區塊是共用邏輯。
   ============================================================ */
window.WfPageMap = (function () {
  "use strict";

  /* ---------------- 以下為資料 ---------------- */

  /**
   * PAGES：每個頁碼一筆。
   *   file     必填：pages/ 底下的 HTML 檔名（unplanned:true 的頁可省略）；模板內建的元件示範頁寫 "../starters/components.html"
   *   label    必填：頁名（選單、工程標註標題顯示「頁碼 頁名」）
   *   flow     必填：所屬流程（A1）；文件頁＝自己的頁碼（G0）
   *   area     必填：所屬功能大項（A）；文件頁＝"G"
   *   kind     選填："doc"＝文件頁（畫布整片顯示、不套裝置外框）；省略＝一般畫面
   *   device   選填："app"|"web"，覆寫 wireframe.config.js 的 mode；文件頁寫 "app" 時放進 App 外框顯示，寫 "web" 時整片顯示並出現寬度標示
   *   tag      選填：選單右側小標籤（例："新增"）
   *   hideCode 選填：選單只顯示頁名、不顯示頁碼（文件頁用）
   *   unplanned 選填：true＝尚未繪製（屬於本專案流程、已有頁碼、這輪還沒畫）；
   *            選單顯示頁碼＋頁名＋灰色「尚未繪製」、不可點；可以不寫 file。
   *            defaultPage／flowStarts 不可指向它；FEATURE_NOTES 指到它時不要加 page，
   *            改寫文字「A1.3 頁名（尚未繪製）」。
   *   stage    選填："happy"＝這一頁只畫了順向流程，例外狀態還沒補（寫在不帶 -N 的頁碼：這條流程裡每一頁都標，狀態頁不寫）；
   *            check.mjs 暫不要求狀態頁下限，只提醒。補完例外狀態就整個拿掉。
   */
  var PAGES = {
    G0: { file: "version-log.html", label: "版本紀錄", flow: "G0", area: "G", kind: "doc", hideCode: true },
    G1: { file: "field-rules.html", label: "欄位驗證規則", flow: "G1", area: "G", kind: "doc", hideCode: true },
    // 元件與互動示範（模板內建，檔案在 starters/；可點的示範＋叫用片段）
    G2: { file: "../starters/components.html", label: "元件與互動示範", flow: "G2", area: "G", kind: "doc", device: "app", hideCode: true },
    // Web 元件與互動示範（同一份檔的 Web 區塊，整片畫布顯示、有寬度標示）
    G3: { file: "../starters/components.html", label: "Web 元件與互動示範", flow: "G3", area: "G", kind: "doc", device: "web", hideCode: true },
    // 專案文件（資料在 assets/doc-pages.js）：資訊架構、API 錯誤碼對帳的產出、本案 UX 準則
    G4: { file: "ia.html", label: "資訊架構", flow: "G4", area: "G", kind: "doc", hideCode: true },
    G5: { file: "api-gaps.html", label: "API 缺口清單", flow: "G5", area: "G", kind: "doc", hideCode: true },
    G6: { file: "module-errors.html", label: "模組錯誤處理", flow: "G6", area: "G", kind: "doc", hideCode: true },
    G7: { file: "ux-guideline.html", label: "專案 UX 準則", flow: "G7", area: "G", kind: "doc", hideCode: true },
    "A1.1": { file: "welcome.html", label: "歡迎頁", flow: "A1", area: "A" },
    "A1.1-2": { file: "welcome.html", label: "暫停服務", flow: "A1", area: "A" },
    "A1.2": { file: "checkin.html", label: "報到查詢頁", flow: "A1", area: "A" },
    "A1.2-2": { file: "checkin.html", label: "查無會議", flow: "A1", area: "A" },
    "A1.2-3": { file: "checkin.html", label: "多場會議", flow: "A1", area: "A" },
    "A1.2-4": { file: "checkin.html", label: "會議已取消", flow: "A1", area: "A" },
    "A1.2-5": { file: "checkin.html", label: "查詢失敗", flow: "A1", area: "A" },
    "A1.2-6": { file: "checkin.html", label: "手機號碼欄位錯誤", flow: "A1", area: "A" },
    "A1.3": { file: "meeting-confirm.html", label: "會議確認頁", flow: "A1", area: "A" },
    "A1.3-2": { file: "meeting-confirm.html", label: "提早抵達", flow: "A1", area: "A" },
    "A1.3-3": { file: "meeting-confirm.html", label: "通知送出失敗", flow: "A1", area: "A" },
    "A1.4": { file: "waiting.html", label: "通知等候頁", flow: "A1", area: "A" },
    "A1.4-2": { file: "waiting.html", label: "已改請行政協助", flow: "A1", area: "A" },
    "A1.5": { file: "find-person.html", label: "找人通知頁", flow: "A1", area: "A" },
    "A1.5-2": { file: "find-person.html", label: "查無此人", flow: "A1", area: "A" },
    "A1.5-3": { file: "find-person.html", label: "姓名欄位錯誤", flow: "A1", area: "A" },
  };

  /**
   * AREAS：左側選單結構（功能大項 → 流程 → 頁）。
   *   pin:true 的大項置頂、不可收合（文件頁用）。
   *   PAGES 每一筆都必須在這裡出現剛好一次，反之亦然（assertCoverage 會檢查）。
   */
  var AREAS = [
    { id: "G", title: "文件", pin: true, pages: ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7"] },
    {
      id: "A",
      title: "A 訪客接待",
      flows: [
        { id: "A1", title: "A1 報到", pages: ["A1.1", "A1.1-2", "A1.2", "A1.2-2", "A1.2-3", "A1.2-4", "A1.2-5", "A1.2-6", "A1.3", "A1.3-2", "A1.3-3", "A1.4", "A1.4-2", "A1.5", "A1.5-2", "A1.5-3"] },
      ],
    },
  ];

  /** CODE_ALIASES：舊頁碼 → 新頁碼。迭代改碼時保留舊連結可開。 */
  var CODE_ALIASES = {};

  /**
   * FEATURE_NOTES：右側工程標註。key＝頁碼（本頁與每個狀態頁碼都要有），value＝區塊陣列。
   *   區塊：{ title: "…", bullets?: [...], body?: "…" }
   *   title 只能是四種，固定此順序、每種最多一個、沒內容不放（資訊備註模式的區塊狀態卡也用這四區）：
   *     前端驗證 → 前端互動 → 顯示規則 → API
   *     前端驗證＝打 API 之前前端自己擋的檢查。輸入欄位的規則一律登記在 assets/field-rules.js（殼層自動在本區列出本頁用到的欄位），
   *               這裡只寫不屬於任何單一輸入欄位的送出前檢查（例：「至少要勾一筆才能匯出」）。
   *     前端互動＝操作後畫面怎麼反應：點擊、跳頁、返回與關閉的去向、彈窗開關、展開收合、轉場。
   *     顯示規則＝依資料、角色或 API 回應顯示什麼：API 回應後的錯誤畫面、載入、空狀態、資料取法與排序、業務規則；
   *               多角色頁第一條寫「角色：…」；有非預設狀態時最後一條寫「狀態：…」列出狀態頁碼。
   *     API＝打哪支 API、帶什麼、取什麼、會回的錯誤碼、規格依據；後端未定的寫「待後端確認：…」。
   *   不寫：佈局依據（骨架、參考）、與設計檔或規格檔的對應（Figma、_refs、規格頁、依據規格）、待設計師確認、修改歷程；
   *   這些記在進度檔（本頁備註、「## 待設計師確認」）或專案決策紀錄。
   *   條目可以是字串，或物件：
   *     { text: "…", page: "A1.2" }        → 點了跳到殼層內該頁
   *     { text: "…", api: "listPlans" }    → 連到 apiDocBase + api（apiDocBase 留空則只顯示文字）
   *     { text: "…", href: "https://…" }   → 外部連結
   */
  var FEATURE_NOTES = {
    "A1.1": [
      { title: "前端互動", bullets: [
        { text: "點「我要報到」→ A1.2 報到查詢頁。", page: "A1.2" },
        { text: "點「需要協助？找真人」→ 通知行政人員，進 A1.4-2 已改請行政協助。", page: "A1.4-2" },
        "點語言「中文／EN」→ 全頁文案即時切換，之後各頁沿用所選語言。",
        "訪客走近（感測到有人）→ 播放語音問候，表情眨眼。[AI 假設] 迎賓機器人產業慣例",
        "任一頁 60 秒沒有操作 → 清除已輸入資料，回到本頁並恢復中文。",
      ] },
      { title: "顯示規則", bullets: [
        "公司名稱、日期與時間取機器人系統時間，每分鐘更新。",
        { text: "狀態：A1.1-2 暫停服務。", page: "A1.1-2" },
      ] },
    ],
    "A1.1-2": [
      { title: "顯示規則", bullets: [
        "機器人連不上網路 → 隱藏兩個入口與找真人，顯示「暫時無法報到」與行政分機；恢復連線自動回 A1.1。[AI 假設] 斷線時仍留一條找得到人的路",
      ] },
    ],
    "A1.2": [
      { title: "前端驗證", bullets: ["條碼辨識失敗（看不清、不是邀請條碼）→ 不送出查詢，掃描框下方提示「請把條碼再靠近一點」。[AI 假設] 掃描產業慣例"] },
      { title: "前端互動", bullets: [
        "相機辨識到邀請條碼 → 自動查詢今日會議，不必再按按鈕。",
        "點數字鍵盤 → 在手機號碼欄輸入；「清除」清空、「⌫」刪一碼；超過 10 碼不再輸入。",
        "點「查詢會議」→ 按鈕顯示查詢中，查到今天一場會議 → A1.3 會議確認頁。",
        { text: "點「回首頁」→ A1.1 歡迎頁，清除已輸入號碼。", page: "A1.1" },
        { text: "點「需要協助？找真人」→ 通知行政人員，進 A1.4-2 已改請行政協助。", page: "A1.4-2" },
      ] },
      { title: "顯示規則", bullets: [
        "手機號碼只用於本次查詢，離開本頁即清除。",
        "查無今日會議或條碼無效 → A1.2-2；同一號碼今天 2 場以上 → A1.2-3；會議已取消或已結束 → A1.2-4；查詢沒有回應 → A1.2-5。",
        "狀態：A1.2-2 查無會議、A1.2-3 多場會議、A1.2-4 會議已取消、A1.2-5 查詢失敗、A1.2-6 手機號碼欄位錯誤。",
      ] },
      { title: "API", bullets: ["待後端確認：查詢今日會議（帶條碼內容或手機號碼；取會議 id、時間、會議室、被約員工姓名與部門、訪客姓名與公司、會議狀態）。"] },
    ],
    "A1.2-2": [
      { title: "前端互動", bullets: [
        { text: "點「改用要找的人名字」→ A1.5 找人通知頁。", page: "A1.5" },
        { text: "點「重新查詢」→ 回 A1.2，清空手機號碼。", page: "A1.2" },
      ] },
    ],
    "A1.2-3": [
      { title: "前端互動", bullets: [{ text: "點任一場會議 → A1.3 會議確認頁，帶入該場資料。", page: "A1.3" }] },
      { title: "顯示規則", bullets: ["今天的會議依開始時間排序，每場顯示時間、會議室、被約員工與部門；已結束的不列。[AI 假設] 只列還沒結束的才不會選錯"] },
    ],
    "A1.2-4": [
      { title: "顯示規則", bullets: ["會議已取消或已結束 → 顯示原訂時間與被約員工，說明已取消，提供改用要找的人名字與重新查詢。"] },
    ],
    "A1.2-5": [
      { title: "顯示規則", bullets: ["查詢逾時（10 秒）或系統錯誤 → 顯示「暫時查不到會議資料」，點「再試一次」回 A1.2。[AI 假設] 10 秒為一般等待上限"] },
    ],
    "A1.3": [
      { title: "前端互動", bullets: [
        "點「確認報到」→ 按鈕顯示送出中，報到並通知被約員工，成功 → A1.4 通知等候頁。",
        { text: "點「不是我的會議」→ 回 A1.2 報到查詢頁，清除查詢結果。", page: "A1.2" },
        { text: "點「回首頁」→ A1.1 歡迎頁。", page: "A1.1" },
        { text: "點「需要協助？找真人」→ 通知行政人員，進 A1.4-2 已改請行政協助。", page: "A1.4-2" },
      ] },
      { title: "顯示規則", bullets: [
        "訪客姓名只顯示第一與最後一個字，中間以「＊」遮住。",
        "時間顯示「今天 開始–結束」；被約員工顯示姓名與部門。",
        "狀態：A1.3-2 提早抵達、A1.3-3 通知送出失敗。",
      ] },
      { title: "API", bullets: ["待後端確認：報到並通知被約員工（帶會議 id；成功回通知 id；被約員工公務手機收到含訪客姓名、公司、會議時間與會議室的訊息）。"] },
    ],
    "A1.3-2": [
      { title: "顯示規則", bullets: ["現在時間比會議開始早 30 分鐘以上 → 按鈕上方提示提早抵達與會議時間，仍可確認報到；通知訊息註明「提早抵達」。"] },
    ],
    "A1.3-3": [
      { title: "前端互動", bullets: [
        "點「再試一次」→ 重送報到與通知，成功 → A1.4。",
        { text: "點「改請行政同事協助」→ 通知行政人員，進 A1.4-2。", page: "A1.4-2" },
      ] },
      { title: "顯示規則", bullets: ["報到或通知送出失敗 → 按鈕上方紅字「通知沒有送出去，陳怡君還不知道您已抵達。」，主按鈕改「再試一次」，次按鈕改「改請行政同事協助」。"] },
    ],
    "A1.4": [
      { title: "前端互動", bullets: [
        "點「再通知一次」→ 再送一次通知，畫面底部輕提示「已再通知陳怡君」。",
        "員工回覆後 30 秒沒有操作 → 回 A1.1 歡迎頁並清除資料。[AI 假設] 讓下一位訪客看到乾淨畫面",
        { text: "點「完成，回首頁」→ A1.1 歡迎頁。", page: "A1.1" },
        { text: "點「需要協助？找真人」→ 通知行政人員，進 A1.4-2 已改請行政協助。", page: "A1.4-2" },
      ] },
      { title: "顯示規則", bullets: [
        "通知狀態依序出現：通知已送出 → 員工已讀 → 員工回覆，各列顯示當下時間。",
        "員工回覆的文字原文顯示在狀態下方。",
        "等候區與會議室路線依會議室帶入。[AI 假設] 由行政事先為每間會議室設定路線",
        "被約員工 3 分鐘沒有回覆 → 自動通知行政人員，切到 A1.4-2。[AI 假設] 接待產業慣例",
        "狀態：A1.4-2 已改請行政協助。",
      ] },
      { title: "API", bullets: ["待後端確認：取得通知狀態（帶通知 id；取已送出、已讀時間與員工回覆文字；每 5 秒更新或由推播通知）。"] },
    ],
    "A1.4-2": [
      { title: "顯示規則", bullets: ["改請行政協助（員工未回覆、通知失敗、找不到人、點找真人）→ 標題改「已改請行政同事協助，請稍候」，狀態列改顯示行政人員的通知進度與回覆，不顯示「再通知一次」。"] },
      { title: "API", bullets: ["待後端確認：通知行政人員（帶會議 id 或訪客姓名、要找的人、原因；取行政人員回覆文字）。"] },
    ],
    "A1.5": [
      { title: "前端互動", bullets: [
        "在「要找的人」輸入字 → 即時列出姓名相符的員工（姓名、部門），點一位即選取，主按鈕文字改成「通知〈姓名〉」。",
        "點「通知〈姓名〉」→ 按鈕顯示通知中，通知該員工後進 A1.4 通知等候頁。",
        { text: "點「回首頁」→ A1.1 歡迎頁，清除已輸入資料。", page: "A1.1" },
        { text: "點「需要協助？找真人」→ 通知行政人員，進 A1.4-2 已改請行政協助。", page: "A1.4-2" },
      ] },
      { title: "顯示規則", bullets: [
        "搜尋結果只顯示姓名與部門，不顯示分機與手機。[AI 假設] 公共螢幕不露員工聯絡方式",
        "狀態：A1.5-2 查無此人、A1.5-3 姓名欄位錯誤。",
      ] },
      { title: "API", bullets: ["待後端確認：搜尋員工（帶關鍵字；取員工 id、姓名、部門）；通知員工（帶員工 id、訪客姓名與公司；成功回通知 id）。"] },
    ],
    "A1.5-2": [
      { title: "前端互動", bullets: [{ text: "點「請行政同事協助」→ 通知行政人員，進 A1.4-2。", page: "A1.4-2" }] },
      { title: "顯示規則", bullets: ["搜尋無結果 → 結果區顯示「找不到〈關鍵字〉」與「請行政同事協助」。"] },
    ],
    "A1.5-3": [
      { title: "顯示規則", bullets: ["沒填姓名就送出 → 姓名欄顯示欄位錯誤（規則與錯誤句見 G1 訪客姓名）。"] },
    ],
  };

  var TEST_HINTS = {
    "A1.2": [
      { title: "用手機號碼查到會議", inputs: ["0912345678"], result: "按鈕顯示查詢中，進 A1.3 會議確認頁" },
      { title: "掃描條碼", inputsLabel: "操作", inputs: ["點掃描畫面"], result: "進 A1.3 會議確認頁" },
      { title: "查無會議", inputs: ["0900000000"], result: "顯示「查不到您今天的會議」（A1.2-2）" },
      { title: "多場會議", inputs: ["0911111111"], result: "列出今天 2 場會議讓訪客選（A1.2-3）" },
      { title: "會議已取消", inputs: ["0922222222"], result: "顯示「這場會議已取消」（A1.2-4）" },
      { title: "查詢失敗", inputs: ["0933333333"], result: "顯示「暫時查不到會議資料」（A1.2-5）" },
    ],
    "A1.2-6": [
      { title: "手機號碼格式錯誤", inputs: ["0912"], result: "手機號碼欄下方顯示「請輸入 09 開頭的 10 碼手機號碼」" },
    ],
    "A1.4": [
      { title: "再通知一次", inputsLabel: "操作", inputs: ["點「再通知一次」"], result: "底部輕提示「已再通知陳怡君」" },
    ],
    "A1.5": [
      { title: "選人並通知", inputs: ["點「陳建宏」", "姓名：王小明"], result: "按鈕變「通知陳建宏」，送出後進 A1.4" },
    ],
    "A1.5-3": [
      { title: "沒填姓名", inputs: ["姓名留空，點通知"], result: "姓名欄下方顯示「請輸入您的姓名」" },
    ],
  };

  /**
   * ROLES：檢視角色（選填）。後台依角色顯示不同按鈕、欄位時填，例：["主管", "編輯", "客服"]。
   *   頁面元素寫 data-wf-roles="主管,編輯"＝只有這些角色看得到；沒寫＝所有角色都看得到。
   *   殼層上方列出現「檢視角色」切換（第一個＝預設角色），網址 ?role=編輯 可直接指定。
   *   留空：殼層改列目前頁用到的角色；check.mjs 會檢查頁面用到的角色都在這裡。
   */
  var ROLES = ["來訪客戶", "被約員工", "行政人員"];

  /* ---------------- 以下不用改 ---------------- */

  function resolve(code) {
    return CODE_ALIASES[code] || code;
  }

  function spec(code) {
    code = resolve(code);
    var item = PAGES[code];
    if (!item) return null;
    return {
      p: code,
      file: item.file || "",
      label: item.label || "",
      flow: item.flow || "",
      area: item.area || "",
      kind: item.kind || "screen",
      device: item.device || "",
      tag: item.tag || "",
      hideCode: !!item.hideCode,
      unplanned: !!item.unplanned,
    };
  }

  function fileNameOf(raw) {
    return String(raw || "").split("#")[0].split("?")[0].split("/").pop();
  }

  /** 由檔名反查頁碼：同檔多個狀態時回傳第一個（預設狀態）。 */
  function specFromFile(raw) {
    var name = fileNameOf(raw);
    var codes = Object.keys(PAGES);
    for (var i = 0; i < codes.length; i += 1) {
      if (fileNameOf(PAGES[codes[i]].file) === name) return spec(codes[i]);
    }
    return null;
  }

  function featuresFor(code) {
    return FEATURE_NOTES[resolve(code)] || [];
  }

  function hintsFor(code) {
    return TEST_HINTS[resolve(code)] || [];
  }

  function listedCodes() {
    var listed = [];
    AREAS.forEach(function (area) {
      (area.pages || []).forEach(function (c) { listed.push(c); });
      (area.flows || []).forEach(function (flow) {
        (flow.pages || []).forEach(function (c) { listed.push(c); });
      });
    });
    return listed;
  }

  /** 第一頁：該流程在選單裡列的第一個「已繪製」頁（跳過 unplanned） */
  function firstPageOfFlow(flowId) {
    var found = "";
    AREAS.forEach(function (area) {
      (area.flows || []).forEach(function (flow) {
        if (flow.id !== flowId || found) return;
        (flow.pages || []).forEach(function (c) {
          if (!found && PAGES[c] && !PAGES[c].unplanned) found = c;
        });
      });
    });
    return found;
  }

  /** 檢查 PAGES 與 AREAS 一一對應；對不上會在主控台報錯，並回傳差異。 */
  function assertCoverage() {
    var listed = listedCodes();
    var seen = {};
    var dup = [];
    listed.forEach(function (c) {
      if (seen[c]) dup.push(c);
      seen[c] = true;
    });
    var missingInMenu = Object.keys(PAGES).filter(function (c) { return !seen[c]; });
    var missingInMap = Object.keys(seen).filter(function (c) { return !PAGES[c]; });
    if (missingInMenu.length || missingInMap.length || dup.length) {
      console.error("頁面登錄表與選單對不上", { 選單漏列: missingInMenu, 登錄表沒有: missingInMap, 選單重複: dup });
    }
    return { missingInMenu: missingInMenu, missingInMap: missingInMap, duplicated: dup };
  }

  return {
    PAGES: PAGES,
    AREAS: AREAS,
    CODE_ALIASES: CODE_ALIASES,
    FEATURE_NOTES: FEATURE_NOTES,
    TEST_HINTS: TEST_HINTS,
    ROLES: ROLES,
    spec: spec,
    specFromFile: specFromFile,
    fileNameOf: fileNameOf,
    featuresFor: featuresFor,
    hintsFor: hintsFor,
    listedCodes: listedCodes,
    firstPageOfFlow: firstPageOfFlow,
    assertCoverage: assertCoverage,
  };
})();

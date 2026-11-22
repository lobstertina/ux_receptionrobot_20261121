# ux_receptionrobot_20261121
This is the project that I co-work with AI for the first time by using Claude and Figma

---

# 灰階線框殼層模板

把多張灰階線框頁串成一個可點擊的原型：左邊是頁面選單、中間是畫布、右邊是工程標註，上方可以切換版本。

右上角有兩種檢視模式（見「3c. 兩種模式與資訊備註」）：

- **Prototype**（預設）：畫面可點、可換頁，右側不放工程標註——給客戶與 PM 試走流程。
- **資訊備註**（網址 `?mode=notes`）：畫面不能互動；點畫面上的區塊，右側只顯示該區塊所有狀態的工程標註——給工程師看規格。

- **App 模式**：中間是 iPhone 外框（375×812，自動等比縮放）。
- **Web 模式**：沒有外框，整個中間畫布就是網頁；左右面板開合會改變畫布寬度，網頁靠一般 CSS media query（依畫面寬度套用不同樣式的規則）自然變成手機版／平板版／桌機版，上方列即時顯示「目前 1280px · 桌機版」。

線框有兩種呈現，用 `wireframe.config.js` 的 `visualMode` 一個開關切換：`"gray"`＝灰階（預設）、`"client"`＝元件稿（套上客戶元件庫的外觀，寫在 `assets/client-theme.css`）。兩種呈現的頁面 HTML、頁碼、狀態頁、工程標註、三種寬度與檢查工具都一樣。

完整規格（給 AI 照做）：wireframe-generator 的 `references/輸出格式.md`（殼層檔案、加一頁、資料格式）與 `references/建殼層.md`（外掛內位置 `skills/wireframe-generator/references/`）。

---

## 1. 檔案結構

殼層一律放在**專案資料夾最上層**（與 `project.md` 同一層），不另包子資料夾、不改名：

```
<專案資料夾>/
├── project.md              專案說明（專案既有的檔）
├── index.html              殼層（不用改）：上方列、選單、畫布、工程標註
├── wireframe.config.js     專案設定（每個專案改這份）
├── assets/
│   ├── page-map.js         頁面登錄表：PAGES／AREAS／CODE_ALIASES／FEATURE_NOTES／TEST_HINTS
│   ├── field-rules.js      欄位驗證規則：FIELDS
│   ├── doc-pages.js        文件頁資料：資訊架構、API 缺口清單、模組錯誤處理、專案 UX 準則
│   ├── doc-render.js       文件頁的畫法（不用改）
│   ├── proto.js            內頁共用互動 WfProto（不用改）
│   ├── proto-keyboard.js   App 頁選配的模擬鍵盤（不用改）
│   ├── notes-mode.js       兩種模式切換與資訊備註右側面板（殼層用，不用改）
│   ├── notes-frame.js      資訊備註模式的內頁那一側：框選區塊、擋互動（proto.js 自動載入，不用改）
│   ├── region-notes.js     區塊備註登錄表＋資料格式說明（不用改）
│   ├── region-notes/       每個模組一個檔：A.js、B.js…＝該模組各頁的畫面區塊與各狀態的四區標註
│   ├── shared.css          灰階線框元件（按鈕、輸入欄、卡片…）
│   ├── client-theme.css    客戶外觀層（元件稿模式才載入；灰階模式留空）：第 1 層設計變數覆蓋、第 2 層逐元件外觀
│   ├── shell.css           殼層外觀（不用改）
│   └── shell/shell-saas.css  殼層外框 SaaS 外觀（不用改；品牌色改 wireframe.config.js 的 shellBrandColor）
├── pages/                  一個流程（或一頁）一份 HTML
│   ├── version-log.html    G0 版本紀錄（文件頁）
│   ├── field-rules.html    G1 欄位驗證規則（文件頁）
│   ├── ia.html             G4 資訊架構（文件頁：產品 → 功能模組 → 頁面＋每頁方框結構、key page）
│   ├── api-gaps.html       G5 API 缺口清單（文件頁：API 錯誤碼對帳找到的缺口與矛盾）
│   ├── module-errors.html  G6 模組錯誤處理（文件頁：每個模組的錯誤分層與使用者看到什麼）
│   ├── ux-guideline.html   G7 專案 UX 準則（文件頁：本案跨頁都要照做的規則）
│   └── a1-start.html       A1.1 佔位頁（第一頁畫好後刪掉，並移除它在 PAGES 的登錄）
├── starters/               新頁骨架：app-page.html、web-page.html（都帶最小表單骨架）、chat-page.html（AI 對話頁）；元件與互動示範：components.html（G2＝App 元件、G3＝Web 元件）
├── history/
│   ├── changelog.js        版本紀錄（snapshot.mjs 自動維護）
│   └── <版本代號>/          每個版本的完整快照
└── scripts/
    ├── check.mjs           交件前檢查（讀原始碼）
    ├── check-region-notes.cjs  資訊備註覆蓋檢查（每條整頁標註都分配到區塊、區塊 id 頁面上找得到）
    ├── dump-notes.cjs      印出某頁現行的整頁標註（拆區塊時對照用）
    ├── render-check.mjs    畫面檢查（開瀏覽器量每個狀態：紅色用途、字級、溢出、點了有沒有反應…）
    ├── shot.mjs            截圖（四種寬度＋框架圖，照命名規則存 _screens/）
    ├── snapshot.mjs        存版本快照
    ├── walk.mjs            互動走查（照步驟檔自動點一遍，輸出操作／預期／實際／結果）
    └── walk.example.json   走查步驟檔範例（元件示範頁 G2：浮層、對話元件、表單 blur／送出中）
```

`PAGES`（每個頁碼對應哪份檔、選單顯示什麼名稱）、`AREAS`（大項與流程怎麼分組）、`FEATURE_NOTES`（右側工程標註：前端驗證、前端互動、顯示規則、API 四區）、`TEST_HINTS`（右側測試值情境）、`FIELDS`（每個輸入欄位的規則，G1 欄位驗證規則頁）都是登錄表裡的資料名稱，照原樣使用。

## 2. 初始化（新專案）

1. 把 `wireframe-shell/` **裡面的所有檔案與資料夾**複製到**專案資料夾最上層**（與 `project.md` 同一層）。不要另包一層子資料夾、不要改名；專案裡已有同名檔（例如 `README.md`）時不要覆蓋。
2. 打開 `wireframe.config.js`，填：
   - `projectName` 專案名稱（上方列顯示，專案標＝第一個字的灰階方塊）
   - `mode` 填 `"app"` 或 `"web"`
   - `defaultPage` 預設打開哪一頁、`flowStarts` 各流程起點
   - `apiDocBase` API 文件網址前綴（沒有就留空）
   - `visualMode` 線框呈現：`"gray"` 灰階（預設）或 `"client"` 元件稿（做法見 wireframe-generator 的 `references/元件稿模式.md`）
   - `webBreakpoints` Web 斷點（預設 ≤640 手機版、641–1099 平板版、≥1100 桌機版）
   - `shellBrandColor` 外殼品牌色（選填，留空＝中性灰）
   - `notesDraftKeys`／`notesDraftPrefixes` 資訊備註模式切狀態前要清掉的分頁暫存（頁面有把操作結果存進 sessionStorage 才要填，見「3c」）
3. 打開 `assets/page-map.js`，把 A 大項、A1 流程換成真的名稱。
4. 用 `starters/` 的骨架建立第一頁，然後**刪掉 `pages/a1-start.html`**，並把 PAGES 裡指向它的那筆換成真正的頁（或移除，AREAS 同步）。如果流程起點 A1.1 這輪不畫，就把 A1.1 設為 `unplanned: true`（尚未繪製）、拿掉 `file`，`defaultPage`／`flowStarts` 指向第一個畫好的頁。
5. 執行 `node scripts/check.mjs` 與 `node scripts/check-region-notes.cjs`，全過再開始加頁。

## 3. 加一頁

1. **建 HTML**：複製 `starters/app-page.html`（App）或 `starters/web-page.html`（Web）到 `pages/`，取新檔名（全小寫、單字用連字號相連，例如 `login-phone.html`）。
2. **登錄 PAGES**：在 `assets/page-map.js` 的 `PAGES` 加一筆：
   `"A1.2": { file: "login-code.html", label: "驗證碼", flow: "A1", area: "A" }`
   （`file`＝對應的 HTML 檔、`label`＝選單顯示的頁名、`flow`＝所屬流程、`area`＝所屬大項）
   同一頁的狀態（`A1.2-2`）指向**同一份** HTML。
   流程裡已經有頁碼、但這輪還沒畫的頁（**尚未繪製**），一樣登錄、不用 `file`：
   `"A1.3": { label: "設定暱稱", flow: "A1", area: "A", unplanned: true }`
   選單會顯示「A1.3 設定暱稱」＋灰色標籤「尚未繪製」，不能點。`defaultPage`／`flowStarts` 不可指向它。
   不在本線框範圍的頁（例如第三方結帳頁）是**流程外**，不編頁碼、不登錄。
3. **掛進 AREAS**：把頁碼加進對應流程的 `pages` 陣列。
4. **寫標註**：右側工程標註只有四區＋測試值情境——`FEATURE_NOTES` 的「前端驗證 → 前端互動 → 顯示規則 → API」（照此順序、沒內容不放；前端互動＝操作後畫面怎麼反應，顯示規則＝依資料、角色、API 回應顯示什麼；有非預設狀態時顯示規則最後一條寫「狀態：…」），`TEST_HINTS`（測試值情境：給 PM 照著操作出各種情境）。不寫佈局依據、參考來源、與設計檔或規格檔的對應、待設計師確認、修改歷程、進度註記、元件對應（記在進度檔 `ux-progress.md` 或專案決策紀錄）。
   **輸入欄位**：每個輸入框（含搜尋、日期、多行、驗證碼）都在 `assets/field-rules.js` 的 `FIELDS` 登記一筆（`usedOn` 寫用到的頁碼），畫面上的輸入框寫 `data-wf-field="<欄位 id>"`；右側「前端驗證」區自動列出本頁用到的欄位、點了跳 G1，頁面標註不重寫欄位規則。
5. **標畫面區塊**：工程師要個別看標註的區塊，在 HTML 元素加 `data-note-region="區塊 id"`，再把第 4 步寫好的標註分配到 `assets/region-notes/<模組字母>.js`（見「3c」）。
6. **跑檢查**：`node scripts/check.mjs`、`node scripts/check-region-notes.cjs --require <主頁碼>` 與 `node scripts/render-check.mjs`。

頁內切狀態：

```js
WfProto.registerPage({
  defaultCode: "A1.1",
  apply: function (code, ctx) {
    // code＝目前頁碼；ctx.source＝"menu"（從選單點進來）／"boot"（第一次載入）／"flow"（從流程按鈕跳進來）
  },
});
```

或在元素上寫 `data-show-when="A1.1-2 A1.1-3"`，只有那些頁碼才顯示。
換頁：`WfProto.go("檔名.html")`、`WfProto.goCode("A1.2")`、`WfProto.goBack("A1.1")`，或在按鈕寫 `data-wf-go`／`data-wf-code`／`data-wf-back`（分別是：跳到某檔、跳到某頁碼、返回）。

## 3b. 互動原型（每頁補齊點擊／回饋／載入／錯誤／進退場／對話）

順向流程畫完後，每一頁把「使用者每個動作之後畫面會怎麼變」補齊。原則：**頁面只宣告、行為由共用層掛**——頁面 HTML 只寫有哪些欄位、規則是什麼、點了去哪；blur／input／submit 驗證、載入中、輕提示、轉場、鎖定輸入全部由 `assets/proto.js` 的 `WfProto` 做，頁面自己寫 `addEventListener("submit"` 的次數應為 0（`check.mjs` 會提醒）。畫面上不放「展示用／模擬／示意／本原型未涵蓋／Mock」字樣（`check.mjs` 會擋），每顆可見按鈕都要有真實反應。

### 表單（有輸入框的頁一律）

輸入框包在 `<form>` 裡（Enter＝送出），主按鈕 `type="submit"`（置底區的按鈕用 `form="表單 id"` 指過去），頁尾呼叫：

```js
WfProto.initForm({
  form: "form-main", submitBtn: "submit-main",
  fields: [{ id: "phone", rules: ["required", { test: function (v) { return /^09\d{8}$/.test(v); }, message: "請輸入 09 開頭的 10 碼手機號碼" }] }],
  loadingLabel: "送出中", delay: 700,
  onSubmit: function (values) { return values.phone === "0900000000" ? "A1.1-3" : "A1.2"; }, // 回傳頁碼或檔名就換頁；null 留在本頁
  // 以下選填，不寫＝維持預設行為
  lockForm: true,        // 載入中整表單鎖定：欄位 disabled＋.is-busy（預設 true；false 只鎖按鈕）
  clearOnInput: true,    // 錯誤出現後一重新輸入就清掉（預設：改對才清）
  blurSkipEmpty: true,   // 空欄位離開不報錯，按送出才報「請輸入○○」（預設：空欄位離開就報）
  gateRules: true,       // 條件未全過時主按鈕灰（只套 .is-disabled 樣式，不加 disabled／aria-disabled）但仍可點、點了跑完整驗證（預設永遠不灰）；也可給 [{ id, rules }] 或 function (values)
});
```

預設行為：離開欄位檢查、送出時完整檢查並擋住、捲到第一個錯誤欄位、通過後按鈕「送出中」＋三顆跳動圓點、整表單鎖定、700ms 後換頁。非表單但「語意上在送資料」的按鈕手動 `var restore = WfProto.setButtonLoading(btn, "送出中", { lockForm: true })`，失敗時呼叫 `restore()` 還原。純導覽（返回、略過）不進載入中。

### 對話頁（AI 對話）

`starters/chat-page.html` 是骨架；元件示範在 G2 第 19 區。頁面放 `.chat-feed`（對話流）與 `<form class="chat-composer">`（輸入列：多行輸入 1 行起自動長高、最多約 4 行；空白時送出鈕 disabled；Enter 送出、Shift+Enter 換行、中文選字時 Enter 不送出；字數上限用 `maxlength`、不顯示計數），頁尾：

```js
var chat = WfProto.chat.feed("chat-feed", {
  composer: "chat-composer",
  // sent＝實際送出的字（多選組已勾的項目會併成「A、B：文字」）；api＝chat 本身；info.picked＝已勾項目陣列、info.text＝使用者打的原文
  onSend: function (sent, api, info) { … },
});
chat.respond("回覆全文", { wait: [{ text: "正在理解問題", ms: 800 }, { text: "正在整理回答", ms: 900 }] });
```

使用者泡泡在 `onSend` 之前已自動加上。多選組還開著、使用者改打字送出時：已勾的項目與文字併成一則「價格、成分：也在意包裝」送出（泡泡與 `sent` 都是併後的字），沒點的選項組收起；要分開處理就用 `info.picked`（`["價格", "成分"]`）與 `info.text`（`"也在意包裝"`）。

| API | 做什麼 |
|---|---|
| `chat.addBubble(role, html)` | 加泡泡：`"ai"` 靠左、`"user"` 靠右、`"system"` 置中灰字；回傳元素 |
| `chat.addTyping()` | 打字中泡泡（三點 6px、1 秒循環、位移 −4px）；回覆出現時 `remove()` |
| `chat.waitThen(steps, cb)` | 等待文案逐段換（`[{ text, ms }]`，換字淡出 200ms；減少動態不淡出）；頁面隱藏時暫停；走完移除泡泡並呼叫 `cb`；回傳 `{ stop }` |
| `chat.typeInto(el, text, { first: 60, per: 24 }, done)` | 逐字出現＋尾端游標、每長一字捲到底；`\n` 換行；減少動態時整段一次出現 |
| `chat.lockComposer(true/false)` | 回覆中鎖定：輸入框／送出／其他按鈕 disabled＋`.is-reply-locked`、收鍵盤；`data-wf-chat-keep` 的按鈕（掃描入口）不鎖；解鎖後送出鈕可點與否由輸入框有無文字決定 |
| `chat.scrollToBottom({ threshold: 48 })` | 距底部不到 48px 才自動捲（使用者往上看舊訊息時不搶捲）；`force: true` 一律捲 |
| `chat.addChoices({ type: "single"｜"multi", options, onPick, confirmLabel, skip, onSkip, title })` | 追問膠囊靠左排、換行左對齊：單選點一顆就送出、整組收起；多選包外框、至少一項才可按框內靠右的確認鈕；`skip` 放外框外靠右；使用者改打字送出時，多選組已勾的項目併進這次送出（「A、B：文字」）、還沒點的選項組收起 |
| `chat.addInlineRetry(text, label, onRetry, { countdown })` | 已送出後失敗：對話流內純文字＋底線按鈕；`countdown: 10` 先倒數「10 秒後可再試」才可點（429） |
| `chat.respond(text, { wait, typingMs, type, done })` | 鎖定 → 等待文案 → 打字中 → 逐字 → 解鎖，一行搞定 |

錯誤三型：使用者輸入有問題→欄位錯誤（`initForm`）；動作沒送出去、畫面可還原→`WfProto.toast`（文字退回輸入框）；已送出後失敗→`chat.addInlineRetry`。

### 輕提示、轉場、減少動態

- 桌機 hover（只在 Web 頁 `.site` 底下、`@media (hover: hover)` 有滑鼠的裝置才套，觸控裝置不套；shared.css 3h 段）：主按鈕底色加深、次要／文字型按鈕淺灰底＋邊框加深、膠囊淺灰底＋邊框加深、文字鈕變深並加底線，過渡 150ms；已選的膠囊、停用與載入中的按鈕不變。按下（`:active`）回饋 App／Web 都有：縮 0.98、主按鈕底色更深。
- `WfProto.toast(text)` 停留 3 秒（可復原 5 秒）、淡入淡出 200ms；重複觸發重播。
- 換頁轉場：`data-wf-transition="push｜cover｜none"`（預設 push；同頁狀態切換不轉場）。
- 系統「減少動態」開著時：三點靜止、逐字一次出現、等待文案直接換字、輕提示直接出現與消失、轉場改 200ms 淡入淡出；內容與流程不變。網址 `motion=0` 全關（截圖用）。

### 走查與檢查

`walk.mjs` 新增動作 `blur`（讓欄位失去焦點，真正觸發 blur 驗證）、`hover`（滑鼠移到元素上，驗 hover 態）；檢查 `attr`（disabled／class／任何屬性）、`focused`、`scrollBottom`、`style`（`getComputedStyle` 的值：`is` 完全相等、`has` 包含、`not` 不等於；量 hover 的底色、動畫結束後的 opacity、transform）、`rect`（座標比對、容差 0.6px；`is` 期望值或 `sameAs` 另一元素），步驟檔頂層 `"reduced": true` 用減少動態跑一次；範例見 `scripts/walk.example.json` 後半。走查網址預設自帶 `motion=0`（動畫全關），要量有動畫的狀態（hover 過渡、淡出中的 opacity）時步驟檔的 `url` 自帶 `motion=1`。

```json
{ "op": "滑到主按鈕", "do": [{ "hover": "#submit-main" }, { "wait": 200 }],
  "expect": "底色加深（桌機 hover）",
  "check": { "style": { "sel": "#submit-main", "prop": "background-color", "is": "rgb(17, 17, 17)" } } }
```
```json
{ "op": "載入中按鈕", "do": [{ "click": "#submit-main" }],
  "check": { "style": [{ "sel": "#submit-main .bdots span", "prop": "animation-name", "is": "wf-bdot" },
                       { "sel": "#form-main", "prop": "opacity", "not": "1" }] } }
````check.mjs`：畫面不放後設字樣（擋）、有輸入框的頁要有 `<form>`＋`initForm`／`WfProto.chat`（提醒）。`render-check.mjs`：R26 表單送出鈕點了 600ms 內要有載入中或欄位錯誤（提醒）、R27 同一流程各頁置底主按鈕 top 要一致（提醒）。

## 3c. 兩種模式與資訊備註（依畫面區塊看標註）

右上角分段控制切換，網址帶 `?mode=notes` 直接進資訊備註（可以把連結傳給工程師）。

| | Prototype（預設） | 資訊備註 |
|---|---|---|
| 畫面 | 可點、可換頁、可輸入 | 不能互動、不換頁（內頁自己發出的換頁一律擋掉）；滑過可點的區塊蓋半透明品牌色底＋名稱，點下去只留品牌色框（不顯示名稱），區塊不在可視範圍時畫面自動捲到看得到；頁內再嵌的 iframe 不接點擊，由外層區塊接；文件頁照常可捲動、可點 |
| 右側 | 不放工程標註 | 一律展開，不提供收合開關。已拆區塊的頁：先列「畫面區塊」與「整頁通則」，點區塊後只顯示該區塊的狀態卡（預設全部收合，只顯示序號、名稱、頁碼）；點卡片頭切畫面到這個狀態（不展開），卡片右側箭頭展開／收合四區標註＋測試值，上方「全部展開／全部收合」只動備註、不換畫面；畫面上的狀態標「畫面中」。還沒拆區塊的頁：照舊顯示整頁標註，上方提示「這頁還沒拆成畫面區塊」 |
| 左側選單 | 列出所有頁碼與狀態頁碼 | 狀態頁碼縮排列在主頁碼底下；點主頁碼＝整頁通則，點狀態頁碼＝直接選中對應區塊的那個狀態並切畫面 |

**切狀態（點狀態卡頭）的規則**：

- 狀態可帶 `fill`（填示範值）與 `click: [{ selector, text? }]`（依序點元素，等它出現才點，最多 15 秒），帶出只能靠操作才看得到的狀態。
- 切之前先清掉 `wireframe.config.js` 登記的示範暫存：`notesDraftKeys`（完整 key）、`notesDraftPrefixes`（表單草稿的 key 前綴；資訊備註模式下內頁離開時也會刪掉剛存的草稿）。頁面有把操作結果存進分頁暫存時要登記，不然切回「未填」狀態還看得到剛才的值。
- 同一頁碼（同一份檔）、而且上一個狀態有填值／點擊或剛清過暫存時，內頁整份重新導向（不用重新整理，免得瀏覽器把表單填過的值還原回來），載完先以「從選單點進來」重套狀態，再跑這個狀態的填值／點擊。
- 自檢：瀏覽器 console 跑 `await WfShell.selfCheck("A1")`（只查 A1、A1.x、A1-x 這些 group，不會比到 A10；不給＝全部），逐狀態切換、每 300ms 看一次該區塊框不框得到，最多等 8 秒（有點擊步驟再加時間）；回傳 `{ checked, misses }`，`misses` 要是空的。

**怎麼拆區塊**（每頁畫完、整頁標註寫好之後做）：

1. （畫頁時就做）在頁面元素加 `data-note-region="區塊 id"`：id 用英文小寫＋連字號，同頁不重複；同一個 id 可以標在多個元素上（框線會包住全部）。一頁通常 3～8 塊，照使用者會分開理解的單位切（導覽列、篩選列、列表、單一表單欄位、置底操作），不整頁一塊、也不每個按鈕一塊。`starters/app-page.html`、`web-page.html` 已經標好示範。
2. 整頁標註寫好、`check.mjs` 過了之後，跑 `node scripts/dump-notes.cjs A1.1` 印出這一頁（含狀態頁）現行的整頁標註。
3. 在 `assets/region-notes/<模組字母>.js` 登記一個 group（一個主頁連同它的狀態頁碼），把每一條標註**原文照抄**分到「整頁通則」或某個區塊的某個狀態（一條只放一處；跟兩塊以上有關的放整頁通則）；格式寫在 `assets/region-notes.js` 開頭。新模組照抄 `region-notes/A.js` 改字母即可，殼層依 `AREAS` 自動載入。
4. 跑 `node scripts/check-region-notes.cjs --require A1.1`：主頁碼要已拆區塊，每條標註、每個測試值（標題＋結果一起比對）、每個用到的欄位都要分配到，每個狀態頁碼都要被某個區塊狀態引用，區塊 id 頁面上要找得到，exit 0 才算拆完。
5. 開 `index.html?mode=notes`，console 跑 `await WfShell.selfCheck("A1.1")`，`misses` 為空才算畫面也框得到。
6. 拆的時候發現某個區塊需要載入中／載入失敗／空狀態，但原型和標註都沒有：不自己新增，列進「缺漏狀態清單」（頁碼｜區塊｜缺哪個狀態｜為什麼會發生）交設計師決定。

**標註寫法**（整頁標註與區塊備註都適用）：只寫驗證邏輯與互動，一條一句「條件 → 結果」。

- 不寫：視覺（顏色、尺寸、px、字級、圓角、圖示檔名）、Figma／設計稿、日期或規格版本、理由與歷史（「原本…改成…」）、文件行號出處、原型怎麼模擬（那屬於測試值）。
- 畫面文案只在規則本身就是「顯示哪一句」時才寫。
- 例：「驗證碼過期或已使用：清空並停用格子，紅字「…」，原「重新發送（Ns）」改成主鈕「重新發送驗證碼」。」→「驗證碼過期或已使用：清空並停用格子，主按鈕改為「重新發送驗證碼」。」

區塊資料的內容一律來自 `page-map.js` 的 `FEATURE_NOTES`／`TEST_HINTS`，不另寫新規格；之後改標註，兩邊要一起改（覆蓋檢查會抓出對不上的地方）。

**外殼品牌色**：`wireframe.config.js` 的 `shellBrandColor` 填一個色碼（例 `"#2563EB"`），上方列專案標、選單選取、模式切換、資訊備註的框線都換成這個色（色階自動算）；留空＝中性灰。只影響殼層外框，不影響線框內頁。

## 4. 怎麼開

- **直接雙擊 `index.html`**（瀏覽器以本機檔案開啟，網址開頭是 `file://`）就能用：設定與資料都用 `<script>` 載入，殼層與內頁用 postMessage（瀏覽器內不同畫框互傳訊息的機制）溝通。
- 也可以用任何靜態伺服器，例如在本資料夾執行 `python3 -m http.server 8000`，開 `http://localhost:8000/`。
- 指定頁：`index.html?p=A1.1-2`；指定版本：`index.html?p=A1.1&v=<版本代號>`。
- 指定檢視模式：`mode=notes`＝資訊備註；沒寫＝Prototype（只帶 `notes=1` 沒寫 `mode` 時也進資訊備註，截圖腳本的「標註」圖用這個）。
- 指定面板開合（截圖驗收用，優先於上次手動開合的狀態）：`menu=0|1` 左側頁面選單收合／展開、`notes=0|1` 右側工程標註收合／展開（`notes=1` 且沒寫 `mode` 時會同時進資訊備註模式，畫面不能點）。
  例：`index.html?p=A1.2&menu=0&notes=1`。
- 模擬寬度（Web 截手機寬用）：`w=620`＝畫面固定 620 寬、置中；檢視角色：`role=編輯`（頁面有用 `data-wf-roles` 時，上方列出現「檢視角色」切換）。
- 關閉轉場與動畫：`motion=0`＝換頁直接切換、浮層直接出現（殼層會帶給內頁）。**截圖一律帶上**，才不會拍到動畫中途。
- 暫時切換線框呈現（比對兩版用，不改設定檔）：`visual=gray` 或 `visual=client`。
- 從左側選單切到同一份檔的另一個狀態時，表單欄位、狀態下拉、選取、浮層會先回到預設值，再交給頁面的 `apply`；跨狀態要保留的區塊加 `data-wf-no-reset`。

## 5. 存版本

```
node scripts/snapshot.mjs 2026-10-15 "客戶審閱版" "A1.1 輸入手機：初版" "A1.2 驗證碼：初版"
```

第一個參數是版本代號（用日期，例如 `2026-10-15`；同一天第二版加 `-2`），不可與已存在的版本重複。
會把目前的 `pages/`、`assets/`、`starters/` 複製到 `history/2026-10-15/`，並在 `history/changelog.js` 最前面加一筆。版本紀錄的日期欄取版本代號裡的日期（`2026-10-15-2` 的日期是 2026-10-15），不用存檔當下的系統日期；代號不是日期格式時才用系統日期。
**每個版本都要有快照**；版本下拉只列出有快照的版本，第一項固定是「目前版本（工作中）」。
什麼時候存、哪些異動要寫、每條怎麼寫：照 wireframe-generator 的 `references/版本紀錄規則.md`（第一次存版本每頁一條「頁碼 頁名：初版」；之後每條「頁碼 頁名：改了什麼（因為哪個決定）」，設計師自己的迭代與自檢修正不寫）。

## 6. 交件前

```
node scripts/check.mjs
```

全部通過（結束代碼 exit 0，代表沒有錯誤）才交件。元件稿模式另外檢查：頁面 HTML 不直接寫色碼（一律用 `client-theme.css` 的變數）、`client-theme.css` 的色碼只寫在設計變數、本頁用到的元件都在元件對照表登記；字級小於 14px 只提醒。檢查內容：PAGES 與 AREAS 一一對應、檔案存在（尚未繪製的主頁與狀態頁都不需要 file，略過）、`defaultPage`／`flowStarts` 不指向尚未繪製的頁、頁碼格式（不用 A0）、灰階、畫板內零標註、標註資料參照、工程標註區塊標題（前端驗證、前端互動、顯示規則、API 四種；照順序、不重複）、工程標註不寫佈局依據、參考來源、設計檔或規格檔對應、待設計師確認與修改歷程、每個輸入框都有 `data-wf-field` 且登記在 `FIELDS`（`usedOn` 含該頁）、頁面標註不重寫欄位規則、每個版本都有快照、用到的 class 都有定義、inline 不寫死間距與字級、多角色頁的「角色：」條與 `data-wf-roles` 對得上、工程標註格式（API 區列取用欄位；API 區列的錯誤碼要在顯示規則寫到對應畫面，沒寫只提醒）、狀態頁下限（列表頁——用了資料表格或頁名有「列表」——要有載入中／空資料／載入失敗，有篩選再加篩選無結果；詳情頁——頁名有「詳情」「明細」或 API 的 GET 路徑帶 {id}／:id——要有載入中／找不到這筆資料／載入失敗；API 區寫了 GET 但分不出來的照列表頁，有欄位要有欄位錯誤，有 409 要有衝突狀態；PAGES 寫 `stage: "happy"` 的頁還在順向流程段，只提醒）、文件頁資料連到的頁碼都存在、規格的角色都在 `ROLES`、欄位寫法（必填不加星號、提示字「例：…」、日期時間用選擇器）、工程標註內容（紅色只給錯誤、前端驗證區不只寫「詳見 G1」）、走查步驟檔放 `_walk/`、統計卡名稱等於它篩的狀態值；另外會提醒（不擋）頁名是否與 `specs/` 需求規格的小節標題一致（沒有 `specs` 資料夾就略過）。

```
node scripts/check-region-notes.cjs --require <本次交的主頁碼…>
```

資訊備註覆蓋檢查：`--require` 列的主頁碼一定要已拆區塊（不加時沒拆的頁只列出、不擋）；已拆區塊的頁，每一條整頁標註、測試值、用到的欄位都分配到區塊，區塊 id 在頁面上找得到，區塊標題只用四區且照順序，每個狀態頁碼都被某個區塊狀態引用；exit 0 才交件。最後會列出還沒拆區塊的頁碼（只列出、不擋）。

```
node scripts/render-check.mjs
```

開瀏覽器把每個頁碼與狀態實際打開（Web 1440／900／420、App 390），量瀏覽器算出來的結果：主控台錯誤、水平溢出、一字一行、紅色只用在錯誤與危險動作、字級、沒套到元件的原生按鈕與下拉、元件尺寸異常、底部按鈕超過 3 顆、直接開主頁碼或狀態頁碼就有輕提示、空狀態按鈕重複、筆數矛盾、角色切換沒作用、點了沒反應（工程標註寫「流程外」的按鈕與連結也要給回饋）、後台頁 1440×900 首屏資料列數、後台頁主要動作位置、直接開每個狀態頁碼畫面要和預設畫面不同且看得到該狀態的元素、統計卡數字等於點下去的筆數、篩選下拉有欄位名稱、空資料／篩選無結果／載入中／載入失敗的狀態頁看不到資料列且說明提到的按鈕看得到、提示句不加底色色塊、狀態不只靠圓點、看不到原生檔案控制項、骨架有灰條、「新增」打開的抽屜標題不寫「編輯」。元件稿模式下，紅色檢查改為「客戶危險色只用在錯誤與危險按鈕」，字級只提醒不擋。

執行條件：在專案資料夾執行 `npm i -D playwright-core`，本機要裝 Google Chrome（腳本自動找；裝在別處就用環境變數 `WF_CHROME` 指定路徑）。找不到 Playwright 或瀏覽器時 exit 2，交件說明標明「畫面未經機器檢查」，改照自檢清單人工看。

兩支檢查全過不代表完成：數字前後一致、按鈕依該筆狀態變、空狀態文案仍要照 wireframe-generator 的交件前自檢逐條看。

互動走查（頁內有表單送出、狀態切換、彈窗、分頁或展開收合時）：

```
node scripts/walk.mjs scripts/walk.example.json
```

步驟檔（JSON）每步寫操作、動作（點擊、填值、按鍵、換頁碼、切角色…）、預期與檢查條件，格式寫在 `scripts/walk.mjs` 開頭說明。專案自己的步驟檔一律放 `_walk/<頁面檔名>.json`（`scripts/` 只放殼層附的腳本與範例，`check.mjs` 會擋）。網址自動帶 `motion=0`；結果寫成「操作／預期／實際／結果」Markdown 表。需要 Playwright（`npm i -D playwright-core`＋本機 Google Chrome）；找不到時自動改產出手動走查清單（exit 2），請照表手動點並標明「互動未經自動化驗證」。

截圖：

```
node scripts/shot.mjs A1.1           # 本頁與每個狀態頁碼，Web 四種寬度、App 兩種，存進 _screens/
node scripts/shot.mjs A1.1 --frame   # 主頁大版面畫完：只截 _screens/A1.1-框架.png，進度檔記「框架待確認」
```

檔名由腳本決定（`<頁碼>-桌機.png`、`<頁碼>-平板.png`、`<頁碼>-手機.png`、`<頁碼>-手機-標註.png`，App 專案只有後兩種；多角色的主頁碼另截有差異的角色），網址都帶 `motion=0`。找 Playwright 與瀏覽器的方式同 `render-check.mjs`；截圖一律用這支，不另寫截圖程式。`--frame` 只在主頁大版面畫完時用：本頁已有狀態頁時會拒絕。

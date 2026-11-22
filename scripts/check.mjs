#!/usr/bin/env node
/* ============================================================
   交件前檢查（零相依，Node 18+）
   用法：node scripts/check.mjs [專案資料夾]（沒給＝本腳本上一層）
   全部通過 exit 0；任何一項不過 exit 1，並列出問題。
   本腳本讀原始碼；畫面實際算出來的顏色、字級、溢出、點了有沒有反應，由 scripts/render-check.mjs 開瀏覽器檢查。
   兩支都過，也只代表機器量得出來的問題沒有了——交件前仍要照 skill 的自檢清單逐條看。

   檢查項目：
   1 設定檔：wireframe.config.js 可讀、mode 合法、defaultPage／flowStarts 存在且不是「尚未繪製」
   2 登錄表：PAGES 與 AREAS 一一對應（不漏、不重複）
   3 檔案：PAGES 每筆的 file 都存在於 pages/（unplanned:true＝尚未繪製的頁略過；
     尚未繪製的主頁與其狀態頁都不需要 file，「同一頁的狀態指向同一份 HTML」也不比對）
   4 頁碼格式：A1.1、A1.1-2；流程與頁從 1 起（禁 A0、A1.0、-1）；文件頁 G0、G1…
   5 參照：FEATURE_NOTES／TEST_HINTS／CODE_ALIASES／FIELDS.usedOn／文件頁資料（assets/doc-pages.js）指到的頁碼都存在；
     PAGES 的 stage 只能是 "happy"（只畫了順向流程，例外狀態還沒補）
   5b 工程標註區塊：FEATURE_NOTES 的 title 只能是四種（前端驗證、前端互動、顯示規則、API），
      不另設其他區；同一頁照此順序、不重複（擋）；
      該頁有非預設狀態時，顯示規則最後一條要是「狀態：…」（只警告不擋）
      （其他規則提到的「前端行為」＝前端互動＋顯示規則兩區、「API 備註」＝API 區）
   5c 工程標註只寫四區內容（擋）：條目不寫佈局依據（「骨架：…」）、修改歷程（「定案」「原本…現在／改為…」）、
      參考來源與設計檔、規格檔的對應（「Figma」「參考：」「_refs/」「手改版」「依據規格：」「規格頁：」）、
      「待設計師確認：」、進度註記（「本輪未畫」）；這些記在進度檔（本頁備註、「## 待設計師確認」）或專案決策紀錄
   6 色值（依 wireframe.config.js 的 visualMode 分流）
     灰階模式（"gray"，預設）：pages/*.html、starters/*.html 與 assets/*.css 內所有色值都是灰階
     （十六進位與 rgb()/hsl() 查 CSS 與 script；英文色名只查 CSS：<style>、style 屬性、
       .css 檔、fill／stroke 等顏色屬性，不查 script 與畫面文字）
     唯一例外＝錯誤色：--wf-color-error（#d32f2f）只准出現在「錯誤類或危險動作規則」——
       CSS 規則的 selector 含 error／invalid／danger（例 .field.is-error、.field__error、[aria-invalid]、.btn--danger），
       或 :root 裡定義 --wf-color-error 那一行；HTML 屬性則要所在標籤的 class／id 含 error／invalid／danger。
       其他地方出現這個色值或 var(--wf-color-error) 一樣擋。
     元件稿模式（"client"）：色值只能來自 assets/client-theme.css 的變數——
       pages/*.html、starters/*.html 不准直接寫任何色碼（灰階也不行），一律用 var(--…)；
       client-theme.css 只准在變數定義（--名稱: 值）裡寫色碼，元件規則用 var(--…)；
       shared.css、shell.css 是產品檔，照灰階模式檢查（客戶外觀只寫在 client-theme.css）；
       var(--wf-color-error)（客戶危險色）仍只准用在錯誤類或危險動作規則。
       client-theme.css 的規則要以 html（或 :root、body）開頭（擋）；中間夾 .site、.admin 這類內層容器的列提醒（彈出層會漏掉）。
   7 畫板內零標註：一般畫面（非文件頁）沒有標註類 class 與標註類字串
     （「說明：」「備註：」只在一行或一段文字的開頭才算，「付款說明：」不算）
   8 版本快照：changelog.js 每一筆都有 history/<id>/ 快照
   10 字級：pages/*.html、starters/*.html 與 assets/ 底下的 CSS（shell.css 是殼層外框不算；
      client-theme.css 只在元件稿模式才套用，也只在元件稿模式才掃）的 font-size（含 font 簡寫、--fs-* 變數定義、
      var(--fs-*) 用法）小於 12px → 擋；12～13px → 提醒並列出位置，確認只用於註記。
      該行寫了「wf-allow-small」註解＝已確認是註記用途，不提醒。規則見 shared/線框視覺基本盤.md
      元件稿模式：字級照客戶元件庫，小於 14px 一律只提醒、不擋（列進交件說明）
   11 線框密度（只警告不擋）：一般畫面的 HTML 檔裡，有框的表單元件（.input、.select、.textarea、
      .input-group、.choice-card；放在 .form--filled 裡的不算）超過 6 個 → 提醒改用無框淡底版
   12 檢視角色：page-map.js 的 ROLES 有填時，pages/*.html 裡 data-wf-roles 用到的角色都要在 ROLES 裡（擋）
   13 樣式名稱都有定義（擋）：pages/*.html、starters/*.html 標籤上的 class，都要在 assets/*.css 或該頁 <style> 有定義，
      或是殼層互動腳本（assets/proto*.js）用到的掛鉤名稱；is-／has-／js- 開頭的狀態與掛鉤名稱不查。
      用了不存在的 class，元件會整列沒套樣式（變成原生下拉、帶框的原生按鈕）
   14 頁面自寫的字級與間距（擋）：一般畫面的 HTML——
      style 屬性不寫死間距（margin／padding／gap）與字級（font-size／font／line-height）；
      頁面 <style> 裡的 margin／padding／gap 要是 4 的倍數；字級小於 14px 要在該行加 wf-allow-small
   15 多角色頁（擋）：ROLES 有 2 個以上角色時——顯示規則卡寫了角色差異（「角色：」），該頁 HTML 要用 data-wf-roles 實作；
      HTML 用了 data-wf-roles，顯示規則卡要有「角色：」那一條；頁面沒有 data-wf-roles 差異時不寫「角色：」，
      寫了「角色：各角色看到的相同」這類沒資訊的句子就擋；主頁大版面階段（只有前端互動／顯示規則、還沒有狀態頁）不要求「角色：」那一條（流程畫面時再寫）
   16 工程標註格式（擋）：API 區每支 API 寫出取用（或送出）的欄位（DELETE 除外）；
      API 區列的錯誤碼（4xx、5xx），同一頁（含狀態頁）或全站共用狀態（Z）的顯示規則要寫到對應畫面（只提醒不擋，
      完整對帳照 skill 的 references/API錯誤碼對帳.md）
   24 輸入欄位登記（擋）：一般畫面的每個輸入框（input、textarea；勾選框、圓鈕、隱藏欄位除外）
      要有 data-wf-field="<id>"（寫在輸入框或外層元素），id 要在 FIELDS 登記、該欄位 usedOn 要含這份檔的頁碼；
      FIELDS 每筆要有 modified；工程標註任何一區不重寫欄位規則——不抄 FIELDS 的錯誤句，
      前端驗證區不寫「<欄位名>必填／格式／長度…」這類單一欄位規則
   17 元件對照表（只在元件稿模式，擋）：project.md 的「元件對照表位置」（沒寫＝專案資料夾的 元件對照表.md）要存在；
      表格「對應」欄只能填 對應／部分／沒有；一般畫面 HTML 用到的線框元件（shared.css 定義的 class 區塊名，
      版面工具 site、container、section、stack、visually-hidden、text-* 等不算）都要在「線框 class」欄登記
      （登記 .data-table 涵蓋 .data-table__*、.data-table--*；登記 .admin 涵蓋 .admin-bar 這類同名開頭的區塊）
   23 統計卡用詞（擋）：可點的統計卡（data-wf-filter-set="欄位=單一值"）卡上的名稱要和篩選的狀態值同一個詞
      （例：卡寫「待處理」、狀態值是「未處理」＝不一致）；篩多個值的彙總卡（未結案＝待付款|待出貨）不比
   25 畫面不放後設字樣（擋）：一般畫面的可見文字（含 placeholder、aria-label、title、alt、data-wf-toast 的輕提示字）
      不得出現「展示用」「模擬」「示意」「互動展示」「本原型未涵蓋」「Mock」——每顆可見按鈕都要有真實反應，
      流程外的按鈕用一句使用者真的會看到的結果句當輕提示（例：已加入購物車），不寫後設說明
   26 互動宣告（只提醒不擋）：一般畫面有 <input>／<textarea>（勾選框、圓鈕、隱藏欄位除外）時，
      輸入框要包在 <form> 裡（或按鈕用 form= 指到它），且頁面要呼叫 WfProto.initForm 或 WfProto.chat——
      blur／input／submit 驗證、Enter 送出、載入中、鎖定輸入才會由共用層掛上；頁面自己寫 addEventListener("submit" 也提醒
   9 頁名一致（只警告不擋）：專案根目錄有 specs/*.md 時，蒐集各檔「## 各頁內容與操作」底下的
     「###」小節標題；PAGES 中非文件頁的主頁碼（沒有 -N 結尾）label 要等於某個小節標題，
     或寫成「<小節標題>的某狀態」。狀態頁（-N 結尾）的 label 等於任一小節標題＝規格的這一頁
     以狀態頁實作，算對上。
     主頁碼與狀態頁都對不上的小節標題、對不上的主頁碼 label，列在「提醒」。沒有 specs 資料夾就略過。
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => path.relative(root, p) || ".";
const problems = [];
const passed = [];

function section(name, list) {
  if (list.length) problems.push({ name, list });
  else passed.push(name);
}

/** 在假的 window 裡執行專案的 JS 資料檔 */
function loadGlobal(file, globalName, sandbox = { window: {}, console: { error() {}, log() {} } }) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return { error: `找不到 ${file}` };
  try {
    vm.runInNewContext(fs.readFileSync(full, "utf8"), sandbox, { filename: file });
  } catch (err) {
    return { error: `${file} 執行錯誤：${err.message}` };
  }
  return { value: sandbox.window[globalName] };
}

/* ---------- 1 設定檔 ---------- */
const cfgErr = [];
const cfgLoad = loadGlobal("wireframe.config.js", "WfConfig");
const config = cfgLoad.value || {};
if (cfgLoad.error) cfgErr.push(cfgLoad.error);
else if (!cfgLoad.value) cfgErr.push("wireframe.config.js 沒有定義 window.WfConfig");
if (config.mode && !["app", "web"].includes(config.mode)) cfgErr.push(`mode 只能是 "app" 或 "web"，目前是 "${config.mode}"`);
if (!config.projectName) cfgErr.push("projectName 未填");
// 線框呈現：gray＝灰階（預設）、client＝元件稿（套客戶外觀層 assets/client-theme.css）
if (config.visualMode !== undefined && !["gray", "client"].includes(config.visualMode)) cfgErr.push(`visualMode 只能是 "gray" 或 "client"，目前是 "${config.visualMode}"`);
const CLIENT = config.visualMode === "client";
if (CLIENT && !fs.existsSync(path.join(root, "assets", "client-theme.css"))) cfgErr.push("visualMode 是 \"client\"（元件稿），但找不到 assets/client-theme.css（客戶外觀層）");

/* ---------- 2–5 登錄表 ---------- */
const mapLoad = loadGlobal("assets/page-map.js", "WfPageMap");
const map = mapLoad.value;
const mapErr = [];
const fileErr = [];
const codeErr = [];
const refErr = [];
const cardErr = [];
const warnings = []; // 只提醒、不擋
// 工程標註只允許這四種標題，且依此順序（與資訊備註模式的區塊狀態卡相同）
const CARD_TITLES = ["前端驗證", "前端互動", "顯示規則", "API"];
// 舊區名 → 新區名（錯誤訊息提示用）
const OLD_TITLES = { 前端行為: "前端互動（操作後畫面反應）或顯示規則（依資料／角色／API 回應顯示什麼）", 錯誤狀態: "顯示規則", 前端檢查: "前端驗證", "API 備註": "API" };
// 其他規則沿用舊稱：「前端行為」＝前端互動＋顯示規則、「API 備註」＝API（cardBullets 依此對應）
const TITLE_ALIAS = { 前端行為: ["前端互動", "顯示規則"], "API 備註": ["API"] };
const titleIs = (t, name) => (TITLE_ALIAS[name] || [name]).includes(String(t || "").trim());
// 5c 工程標註不寫的字樣：[比對規則, 說明]（這些記在進度檔本頁備註、「## 待設計師確認」或專案決策紀錄）
const NOTE_HISTORY_RULES = [
  [/^\s*骨架[：:]|^\s*佈局[：:]/, "佈局依據（「骨架：…」）"],
  [/定案/, "修改歷程（「定案」）"],
  [/原本.{0,40}(現在|改成|改為|改用)/, "修改歷程（「原本…現在／改為…」）"],
  [/figma|手改|_refs\/|參考[：:]|參考來源|依.{0,4}參考|設計稿/i, "參考來源或設計檔對應（「Figma」「參考：」「_refs/」「手改版」「設計稿」）"],
  [/依據規格[：:]|規格頁[：:]/, "規格檔對應（「依據規格：」「規格頁：」）"],
  [/待設計師確認/, "「待設計師確認：」（記進進度檔「## 待設計師確認」）"],
  [/本輪(未|沒|還沒)/, "進度註記（「本輪未畫」）"],
];
const historyErr = [];
const STAGES = ["happy"]; // PAGES 的 stage：happy＝只畫了順向流程，例外狀態還沒補
if (mapLoad.error || !map) {
  mapErr.push(mapLoad.error || "assets/page-map.js 沒有定義 window.WfPageMap");
} else {
  const PAGES = map.PAGES || {};
  const cov = map.assertCoverage();
  cov.missingInMenu.forEach((c) => mapErr.push(`${c} 在 PAGES 但沒掛進 AREAS（選單漏列）`));
  cov.missingInMap.forEach((c) => mapErr.push(`${c} 在 AREAS 但 PAGES 沒有登錄`));
  (cov.duplicated || []).forEach((c) => mapErr.push(`${c} 在 AREAS 出現不只一次`));

  const isUnplanned = (c) => !!(PAGES[c] && PAGES[c].unplanned);
  if (config.defaultPage && !PAGES[config.defaultPage]) cfgErr.push(`defaultPage "${config.defaultPage}" 不在 PAGES`);
  else if (config.defaultPage && isUnplanned(config.defaultPage))
    cfgErr.push(`defaultPage "${config.defaultPage}" 是尚未繪製（unplanned）的頁，打不開；請改指向已畫好的頁`);
  Object.entries(config.flowStarts || {}).forEach(([flow, code]) => {
    if (!PAGES[code]) cfgErr.push(`flowStarts.${flow} = "${code}" 不在 PAGES`);
    else if (isUnplanned(code))
      cfgErr.push(`flowStarts.${flow} = "${code}" 是尚未繪製（unplanned）的頁，打不開；請改指向該流程已畫好的第一頁，或整行拿掉（自動用第一個已畫好的頁）`);
  });

  // 3 檔案存在（尚未繪製的頁不需要 file）
  for (const [code, item] of Object.entries(PAGES)) {
    if (item.unplanned && !item.file) continue;
    if (!item.file) fileErr.push(`${code} 沒有 file（還沒畫的頁請加 unplanned: true）`);
    else if (!fs.existsSync(path.join(root, "pages", item.file))) {
      if (!item.unplanned) fileErr.push(`${code} 的檔案 pages/${item.file} 不存在`);
    }
  }

  // 4 頁碼格式
  const SCREEN = /^([A-Z])([1-9]\d*)\.([1-9]\d*)(?:-([2-9]|[1-9]\d+))?$/;
  const DOC = /^G\d+$/;
  for (const [code, item] of Object.entries(PAGES)) {
    if (item.kind === "doc") {
      if (!DOC.test(code)) codeErr.push(`${code}：文件頁頁碼要用 G0、G1、G2…`);
      if (item.area !== "G") codeErr.push(`${code}：文件頁 area 要是 "G"`);
      continue;
    }
    const m = code.match(SCREEN);
    if (!m) {
      codeErr.push(`${code}：格式不符（應為 A1.1 或 A1.1-2；流程與頁從 1 起，不用 A0／A1.0，預設狀態不寫 -1）`);
      continue;
    }
    if (m[1] === "G") codeErr.push(`${code}：G 大項保留給文件頁，畫面請用其他字母`);
    if (item.area !== m[1]) codeErr.push(`${code}：area 應為 "${m[1]}"，目前是 "${item.area}"`);
    if (item.flow !== m[1] + m[2]) codeErr.push(`${code}：flow 應為 "${m[1] + m[2]}"，目前是 "${item.flow}"`);
    if (item.device && !["app", "web"].includes(item.device)) codeErr.push(`${code}：device 只能是 "app" 或 "web"`);
    // 同頁狀態必須與預設狀態同一份 HTML
    if (m[4]) {
      const base = `${m[1]}${m[2]}.${m[3]}`;
      // 尚未繪製（unplanned）的主頁與其狀態頁都不需要 file，不比對
      if (PAGES[base] && !item.unplanned && !PAGES[base].unplanned && PAGES[base].file !== item.file) codeErr.push(`${code}：同一頁的狀態要跟 ${base} 指向同一份 HTML（${PAGES[base].file}）`);
      if (!PAGES[base]) codeErr.push(`${code}：找不到預設狀態 ${base}`);
    }
  }
  (map.AREAS || []).forEach((area) => {
    (area.flows || []).forEach((flow) => {
      (flow.pages || []).forEach((c) => {
        if (PAGES[c] && PAGES[c].flow !== flow.id) codeErr.push(`${c} 掛在 AREAS 的 ${flow.id} 底下，但 PAGES 寫 flow "${PAGES[c].flow}"`);
      });
    });
  });

  // 5 參照
  const exists = (c) => !!PAGES[c] || !!(map.CODE_ALIASES || {})[c];
  Object.keys(map.FEATURE_NOTES || {}).forEach((c) => { if (!exists(c)) refErr.push(`FEATURE_NOTES 的 ${c} 不在 PAGES`); });
  Object.keys(map.TEST_HINTS || {}).forEach((c) => { if (!exists(c)) refErr.push(`TEST_HINTS 的 ${c} 不在 PAGES`); });
  Object.entries(map.CODE_ALIASES || {}).forEach(([from, to]) => {
    if (!PAGES[to]) refErr.push(`CODE_ALIASES ${from} → ${to}，但 ${to} 不在 PAGES`);
    else if (isUnplanned(to)) refErr.push(`CODE_ALIASES ${from} → ${to}，但 ${to} 尚未繪製（unplanned），打不開`);
  });
  Object.entries(map.FEATURE_NOTES || {}).forEach(([c, cards]) => {
    (cards || []).forEach((card) => {
      if (!card.title) refErr.push(`FEATURE_NOTES ${c} 有一張卡沒有 title`);
      (card.bullets || []).forEach((b) => {
        if (b && typeof b === "object" && b.page && !exists(b.page)) refErr.push(`FEATURE_NOTES ${c} 連到不存在的頁 ${b.page}`);
        else if (b && typeof b === "object" && b.page && isUnplanned(b.page))
          refErr.push(`FEATURE_NOTES ${c} 用 page 連到尚未繪製的 ${b.page}；請拿掉 page，文字寫「${b.page} ${PAGES[b.page].label}（尚未繪製）」`);
      });
    });
  });
  // 5 參照：PAGES 的 stage、文件頁資料（API 缺口清單、模組錯誤處理、專案 UX 準則、資訊架構）連到的頁碼
  Object.entries(PAGES).forEach(([c, item]) => {
    if (item.stage !== undefined && !STAGES.includes(item.stage)) refErr.push(`${c}：stage 只能是 "happy"（例外狀態還沒補）；補完例外就整個拿掉`);
    if (item.stage !== undefined && /-\d+$/.test(c)) refErr.push(`${c}：stage 寫在不帶 -N 的頁碼（這條流程每一頁的預設狀態那一筆），狀態頁不寫`);
  });
  if (fs.existsSync(path.join(root, "assets", "doc-pages.js"))) {
    const docLoad = loadGlobal("assets/doc-pages.js", "WfDocPages");
    if (docLoad.error) refErr.push(docLoad.error);
    else if (docLoad.value) {
      const D = docLoad.value;
      const check = (where, codes) => (codes || []).forEach((code) => { if (!exists(code)) refErr.push(`${where} 連到不存在的頁 ${code}`); });
      (D.API_GAPS || []).forEach((g) => check(`API 缺口清單「${g.title}」`, g.pages));
      (D.MODULE_ERRORS || []).forEach((m) => (m.sections || []).forEach((sec) => check(`模組錯誤處理「${m.title}／${sec.title}」`, sec.pages)));
      (D.UX_RULES || []).forEach((m) => (m.rules || []).forEach((r) => check(`專案 UX 準則「${m.title}／${r.title}」`, r.pages)));
      ((D.IA && D.IA.modules) || []).forEach((m) => (m.pages || []).forEach((pg) => { if (pg.code && !exists(pg.code)) warnings.push(`資訊架構「${m.title}／${pg.name}」寫的頁碼 ${pg.code} 還不在 PAGES（還沒畫可以先不寫 code）`); }));
    }
  }
  // 5b 功能標註區塊：標題只能四種、照順序、不重複
  const baseOf = (code) => String(code).replace(/-\d+$/, "");
  const hasStates = (code) => Object.keys(PAGES).some((k) => k !== baseOf(code) && baseOf(k) === baseOf(code));
  const bulletText = (b) => (b && typeof b === "object" ? String(b.text || "") : String(b || ""));
  Object.entries(map.FEATURE_NOTES || {}).forEach(([c, cards]) => {
    const seen = new Set();
    let lastIdx = -1;
    let lastTitle = "";
    (cards || []).forEach((card) => {
      const t = String(card.title || "").trim();
      if (!t) return; // 沒有 title 已在第 5 項報過
      const idx = CARD_TITLES.indexOf(t);
      if (idx === -1) {
        cardErr.push(`${c}：區塊標題「${t}」不合規；只能用 ${CARD_TITLES.join("、")} 四種，不另設其他區${OLD_TITLES[t] ? `（「${t}」的內容併入「${OLD_TITLES[t]}」）` : ""}；依主題分區（要依畫面區塊看，寫在 assets/region-notes/）；待後端確認寫在 API，待設計師確認記進度檔「## 待設計師確認」`);
        return;
      }
      if (seen.has(t)) {
        cardErr.push(`${c}：「${t}」區重複了；同一頁每種區只放一個，內容請合併`);
        return;
      }
      if (idx < lastIdx) cardErr.push(`${c}：「${t}」不可排在「${lastTitle}」後面；順序固定為 ${CARD_TITLES.join(" → ")}`);
      seen.add(t);
      if (idx > lastIdx) { lastIdx = idx; lastTitle = t; }
      if (card.block) warnings.push(`${c}「${t}」卡還留著 block 欄位；卡片已不依區塊分，請拿掉`);
      // 5c 條目只寫四區內容：不寫佈局依據、修改歷程、參考來源、設計檔與規格檔對應、待設計師確認
      (card.bullets || []).concat(card.body || []).forEach((b) => {
        const txt = bulletText(b).trim();
        const hit = NOTE_HISTORY_RULES.find(([re]) => re.test(txt));
        if (hit) historyErr.push(`${c}「${t}」：「${txt.slice(0, 40)}」寫了${hit[1]}；工程標註只寫前端驗證、前端互動、顯示規則、API，這類內容改記在進度檔（本頁備註、「## 待設計師確認」）或專案決策紀錄`);
      });
    });
    if (hasStates(c)) {
      const display = (cards || []).find((card) => String(card.title || "").trim() === "顯示規則");
      const bullets = (display && display.bullets) || [];
      const last = bulletText(bullets[bullets.length - 1]).trim();
      if (!/^狀態[：:]/.test(last))
        warnings.push(`${c}：本頁有非預設狀態，請在「顯示規則」最後一條寫「狀態：…」列出所有非預設狀態與頁碼`);
    }
  });
  const rulesLoad = loadGlobal("assets/field-rules.js", "WfFieldRules");
  if (rulesLoad.error) refErr.push(rulesLoad.error);
  else if (rulesLoad.value) {
    const ids = new Set();
    (rulesLoad.value.FIELDS || []).forEach((f) => {
      if (!f.id || !f.title) refErr.push(`FIELDS 有一筆缺 id 或 title`);
      if (ids.has(f.id)) refErr.push(`FIELDS id 重複：${f.id}`);
      ids.add(f.id);
      (f.usedOn || []).forEach((c) => { if (!exists(c)) refErr.push(`FIELDS「${f.title}」usedOn 的 ${c} 不在 PAGES`); });
    });
  }
}
section("設定檔", cfgErr);
section("PAGES 與 AREAS 一一對應", mapErr);
section("每個 file 都存在", fileErr);
section("頁碼格式", codeErr);
section("標註資料參照", refErr);
section("工程標註區塊（前端驗證→前端互動→顯示規則→API、不重複）", cardErr);
section("工程標註只寫四區內容（不寫佈局依據、修改歷程、參考來源、設計檔與規格檔對應、待設計師確認）", historyErr);

/* ---------- 6 灰階 ---------- */
const COLOR_NAMES = "red|blue|green|yellow|orange|purple|pink|brown|navy|teal|cyan|magenta|gold|coral|tomato|crimson|lime|olive|maroon|violet|indigo|aqua|fuchsia|salmon|khaki|beige|turquoise|orchid|plum|tan|chocolate|firebrick|skyblue|royalblue|steelblue|seagreen|darkred|darkblue|darkgreen";
const nameRe = new RegExp(`(?<![-\\w.#])(${COLOR_NAMES})(?![-\\w])`, "gi");

function isGrayHex(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map((x) => x.toLowerCase());
  return r === g && g === b;
}
function isGrayFunc(fn) {
  const lower = fn.toLowerCase();
  const nums = lower.replace(/^[a-z]+\(/, "").replace(/\)$/, "").split(/[\s,/]+/).filter(Boolean);
  if (lower.startsWith("rgb")) {
    const [r, g, b] = nums.map((n) => (n.endsWith("%") ? Math.round(parseFloat(n) * 2.55) : parseFloat(n)));
    return r === g && g === b;
  }
  if (lower.startsWith("hsl")) return parseFloat(nums[1]) === 0;
  return false; // lab/lch/oklch… 一律視為彩色
}

const grayErr = [];
// 錯誤色例外：只認這一個色值（含同色的 rgb／rgba），與它的變數名
const ERROR_TOKEN = "--wf-color-error";
const ERROR_HEX = "#d32f2f";
const ERROR_SCOPE = /error|invalid|danger/i; // selector（或標籤 class／id）含這些字才算錯誤類或危險動作規則
const isErrorColor = (c) => {
  const v = c.toLowerCase().replace(/\s+/g, "");
  return v === ERROR_HEX || /^rgba?\(211,47,47(,[\d.]+%?)?\)$/.test(v);
};

/** 從一段 CSS 拆出「selector＋宣告」；@media 等外層會被略過，只取最內層規則。不在任何規則裡的文字（style 屬性）selector 為 "" */
function cssDecls(text) {
  const out = [];
  const rules = [];
  const rest = text.replace(/([^{}]*)\{([^{}]*)\}/g, (_, sel, body) => { rules.push({ sel: sel.trim(), body }); return ""; });
  // 一層 @media 拿掉內層後會剩下「@media (...) { }」，再跑一次清掉
  const leftover = rest.replace(/[^{}]*\{\s*\}/g, "");
  rules.forEach(({ sel, body }) => body.split(";").forEach((d) => out.push({ sel, decl: d })));
  if (leftover.trim()) leftover.split(";").forEach((d) => out.push({ sel: "", decl: d }));
  return out;
}

/**
 * 只檢查「會變成顏色」的地方，回傳 [{ text, css, scope }]：
 *   css:true  ＝ CSS 區（<style>、style=""、SVG/HTML 顏色屬性、.css 整檔）→ 色碼＋英文色名都查
 *   css:false ＝ <script> → 只查色碼（#hex、rgb()…），不查英文色名（變數名、文案常出現 gold、red…）
 *   scope     ＝ HTML 屬性所在標籤的 class＋id（判斷是不是錯誤類元素）；CSS 檔與 <style> 由 selector 判斷
 * 畫面文字一律不查。
 */
function colorRegions(file, src) {
  if (file.endsWith(".css")) return [{ text: src, css: true, rules: true }];
  const out = [];
  src.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => { out.push({ text: css, css: true, rules: true }); return ""; });
  src.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_, js) => { out.push({ text: js, css: false, scope: "" }); return ""; });
  // 屬性只從標籤裡找（script 內容先拿掉，避免 JS 字串被誤當屬性）
  const markup = src.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  markup.replace(/<[a-z][^>]*>/gi, (tag) => {
    const scope = [(tag.match(/\sclass="([^"]*)"/i) || [])[1] || "", (tag.match(/\sid="([^"]*)"/i) || [])[1] || ""].join(" ");
    tag.replace(/\sstyle="([^"]*)"/gi, (_, s) => { out.push({ text: s, css: true, scope }); return ""; });
    tag.replace(/\s(?:fill|stroke|stop-color|color|bgcolor|flood-color|lighting-color)="([^"]*)"/gi, (_, s) => { out.push({ text: s, css: true, scope }); return ""; });
    return "";
  });
  return out;
}

/** 檢查一段文字裡的色值；errorOk＝這段屬於錯誤類規則，允許錯誤色；anyColor＝連灰階色碼也算（元件稿模式的頁面 HTML） */
function scanColors(text, css, errorOk, bad, misuse, anyColor = false) {
  const flag = (c, gray) => {
    if (anyColor) { bad.add(c); return; }
    if (gray) return;
    if (isErrorColor(c)) { if (!errorOk) misuse.add(c); return; }
    bad.add(c);
  };
  text = text.replace(/url\((?:'[^']*'|"[^"]*"|[^)]*)\)/gi, (u) => {
    // data URI 裡的 SVG 也要檢查（%23 是 #）
    const decoded = decodeURIComponent(u.replace(/%23/gi, "#"));
    (decoded.match(/#[0-9a-f]{3,8}\b/gi) || []).forEach((h) => flag(h, [3, 4, 6, 8].includes(h.length - 1) && isGrayHex(h)));
    return "";
  });
  (text.match(/#[0-9a-f]{3,8}\b/gi) || []).forEach((h) => { if ([3, 4, 6, 8].includes(h.length - 1)) flag(h, isGrayHex(h)); });
  (text.match(/\b(?:rgba?|hsla?|lab|lch|oklab|oklch|color)\([^)]*\)/gi) || []).forEach((fn) => flag(fn, isGrayFunc(fn)));
  if (css) {
    // 英文色名只在 CSS 裡算；引號內字串（content:"…"、字型名）不算
    const bare = text.replace(/"[^"]*"|'[^']*'/g, "");
    (bare.match(nameRe) || []).forEach((n) => bad.add(n));
    if (anyColor) (bare.match(/(?<![-\w.#])(white|black|gray|grey|silver|whitesmoke|gainsboro)(?![-\w])/gi) || []).forEach((n) => bad.add(n));
  }
  if (!errorOk && new RegExp(`var\\(\\s*${ERROR_TOKEN}\\b`).test(text)) misuse.add(`var(${ERROR_TOKEN})`);
}

const pagesDir = path.join(root, "pages");
const htmlFiles = fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir).filter((f) => f.endsWith(".html")).map((f) => path.join(pagesDir, f)) : [];
const startersDir = path.join(root, "starters");
const starterFiles = fs.existsSync(startersDir) ? fs.readdirSync(startersDir).filter((f) => f.endsWith(".html")).map((f) => path.join(startersDir, f)) : [];
const cssFiles = fs.existsSync(path.join(root, "assets")) ? fs.readdirSync(path.join(root, "assets")).filter((f) => f.endsWith(".css")).map((f) => path.join(root, "assets", f)) : [];
const clientTheme = path.join(root, "assets", "client-theme.css");
for (const file of [...htmlFiles, ...starterFiles, ...cssFiles]) {
  const src = fs.readFileSync(file, "utf8");
  const bad = new Set();
  const misuse = new Set(); // 錯誤色用在非錯誤類、非危險動作規則
  const isTheme = file === clientTheme;
  if (isTheme && !CLIENT) continue; // 灰階模式不載入客戶外觀層，不檢查
  // 元件稿模式：頁面 HTML 不准寫任何色碼（要用 client-theme.css 的變數）
  const pageNoLiteral = CLIENT && file.endsWith(".html");
  for (const region of colorRegions(file, src)) {
    const text = region.text.replace(/\/\*[\s\S]*?\*\//g, "");
    if (region.rules) {
      // CSS：逐條宣告判斷所在 selector
      for (const { sel, decl } of cssDecls(text)) {
        const isTokenDef = new RegExp(`^\\s*${ERROR_TOKEN}\\s*:`).test(decl);
        if (isTheme) {
          // 客戶外觀層：色碼只准寫在變數定義（--名稱: 值），元件規則一律 var(--…)
          if (/^\s*--[\w-]+\s*:/.test(decl)) continue;
          scanColors(decl, true, true, bad, misuse, true);
          if (!ERROR_SCOPE.test(sel) && new RegExp(`var\\(\\s*${ERROR_TOKEN}\\b`).test(decl)) misuse.add(`var(${ERROR_TOKEN})`);
          continue;
        }
        scanColors(decl, true, isTokenDef || ERROR_SCOPE.test(sel), bad, misuse, pageNoLiteral);
      }
    } else {
      // script 不判斷 selector：錯誤色只在含 error／invalid／danger 的那一行允許
      if (!region.css) text.split("\n").forEach((line) => scanColors(line, false, ERROR_SCOPE.test(line), bad, misuse, pageNoLiteral));
      else scanColors(text, true, ERROR_SCOPE.test(region.scope || ""), bad, misuse, pageNoLiteral);
    }
  }
  if (bad.size) {
    if (isTheme) grayErr.push(`${rel(file)}：元件規則直接寫了色碼 ${[...bad].join("、")}；色碼只寫在最上方的設計變數（--名稱: 值），元件規則改用 var(--…)`);
    else if (pageNoLiteral) grayErr.push(`${rel(file)}：元件稿模式頁面不准直接寫色碼 ${[...bad].join("、")}；改用 var(--…)（變數由 assets/client-theme.css 定義）`);
    else grayErr.push(`${rel(file)}：${[...bad].join("、")}`);
  }
  if (misuse.size) grayErr.push(`${rel(file)}：${CLIENT ? "危險色" : "錯誤色"} ${[...misuse].join("、")} 只能用在錯誤類或危險動作規則（selector 含 error／invalid／danger，例 .field.is-error、.field__error、.notice--error、.btn--danger）`);
}
// 元件稿：客戶外觀層的規則要寫在最外層選擇器（html／body 開頭），否則被搬到 <body> 的抽屜、對話框會漏掉外觀
if (CLIENT && fs.existsSync(clientTheme)) {
  const themeCss = fs.readFileSync(clientTheme, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const sels = new Set();
  themeCss.replace(/([^{}@]+)\{[^{}]*\}/g, (_, sel) => { sel.split(",").map((x) => x.trim()).filter(Boolean).forEach((x) => sels.add(x)); return ""; });
  const notOuter = [...sels].filter((x) => !/^(html|:root|body)\b/.test(x) && !/^(from|to|\d+%)$/.test(x));
  if (notOuter.length) grayErr.push(`assets/client-theme.css：規則要以 html[data-wf-visual="client"] 開頭（寫在最外層），這些沒有：${notOuter.slice(0, 5).join("、")}`);
  const inner = [...sels].filter((x) => /\s\.(site|admin|scr|container)\b[^,]*\s/.test(x));
  if (inner.length) warnings.push(`assets/client-theme.css：${inner.slice(0, 4).join("、")} 寫在內層容器（.site、.admin…）底下；抽屜、對話框、輕提示開啟時被搬到 <body> 最外層，會漏掉這些外觀——確認這個元件不會出現在彈出層，否則拿掉內層容器`);
}
section(CLIENT ? "色值（元件稿：頁面不寫色碼、客戶外觀層色碼只在變數、產品檔維持灰階）" : "灰階（pages/、starters/、assets/*.css）", grayErr);

/* ---------- 12 檢視角色：page-map.js 有 ROLES 時，頁面 data-wf-roles 用到的角色都要在 ROLES 裡 ---------- */
const roleErr = [];
const ROLES = (map && Array.isArray(map.ROLES)) ? map.ROLES : [];
if (ROLES.length) {
  for (const file of htmlFiles) {
    const src = fs.readFileSync(file, "utf8");
    const used = new Set();
    src.replace(/data-wf-roles="([^"]*)"/g, (_, v) => { v.split(/[,，、\s]+/).filter(Boolean).forEach((r) => used.add(r)); return ""; });
    const unknown = [...used].filter((r) => !ROLES.includes(r));
    if (unknown.length) roleErr.push(`${rel(file)} 的 data-wf-roles 用到 ROLES 沒有的角色：${unknown.join("、")}（ROLES：${ROLES.join("、")}）`);
  }
}
section("檢視角色（data-wf-roles 都在 ROLES 裡）", roleErr);

/* ---------- 7 畫板內零標註（只查一般畫面，文件頁略過） ---------- */
const annotErr = [];
const docFiles = new Set(map ? Object.values(map.PAGES || {}).filter((p) => p.kind === "doc").map((p) => p.file) : []);
const screenFiles = htmlFiles.filter((f) => !docFiles.has(path.basename(f))); // 一般畫面（非文件頁）的 HTML
for (const file of htmlFiles) {
  const name = path.basename(file);
  if (docFiles.has(name)) continue;
  const src = fs.readFileSync(file, "utf8");
  const tokens = [];
  src.replace(/class="([^"]*)"/g, (_, v) => { tokens.push(...v.split(/\s+/).filter(Boolean)); return ""; });
  const badClass = [...new Set(tokens.filter((t) => !/^(badge|status)--/.test(t) && /annot|note|callout|remark|memo/i.test(t)))];
  const badText = [];
  src.split("\n").forEach((line, i) => {
    // 「說明：」「備註：」只有出現在開頭才算標註：一行去空白後的開頭，或標籤後一段文字的開頭
    //  例：「說明：此欄必填」「<p>備註：…</p>」→ 擋；「付款說明：」「退款說明：」→ 不擋
    const leads = line.split(/<[^>]*>/).map((t) => t.trim());
    const leadNote = leads.some((t) => /^(說明|備註)[：:]/.test(t));
    if (/待裁決|待確認|動線來源|TODO|TBD/.test(line) || leadNote) badText.push(`第 ${i + 1} 行「${line.trim().slice(0, 40)}」`);
  });
  if (badClass.length) annotErr.push(`${name} 標註類 class：${badClass.join("、")}`);
  badText.forEach((t) => annotErr.push(`${name} 標註類字串：${t}`));
}
section("畫板內零標註", annotErr);

/* ---------- 8 版本快照 ---------- */
const snapErr = [];
const logLoad = loadGlobal("history/changelog.js", "WfChangelog");
if (logLoad.error) snapErr.push(logLoad.error);
else {
  ((logLoad.value || {}).versions || []).forEach((v) => {
    const dir = path.join(root, "history", v.id);
    const need = ["snapshot.js", "assets/page-map.js", "pages"];
    const missing = need.filter((n) => !fs.existsSync(path.join(dir, n)));
    if (missing.length) snapErr.push(`版本 ${v.id} 缺快照：history/${v.id}/ 少了 ${missing.join("、")}（請用 scripts/snapshot.mjs 存版本）`);
  });
}
section("每個版本都有快照", snapErr);

/* ---------- 10 字級（小於 12 擋、12～13 提醒） ---------- */
// 可讀文字 ≥14px；12～13px 只給「不看也不影響操作」的字（免責聲明、狀態詞、版本號、圖說）。規則見 shared/線框視覺基本盤.md「字級」
const fontErr = [];
const fontFiles = [...htmlFiles, ...starterFiles];
// assets/ 底下的 CSS：shell.css 是殼層外框不算；client-theme.css 只在元件稿模式套用，也只在那時掃
cssFiles.filter((f) => path.basename(f) !== "shell.css" && (CLIENT || f !== clientTheme)).sort((a, b) => (a === clientTheme) - (b === clientTheme)).forEach((f) => fontFiles.push(f));
// 先收集 shared.css 與各頁 :root 裡的字級變數，讓 var(--fs-xxx) 也算得出實際大小
const fsTokens = {};
function collectTokens(src) {
  src.replace(/(--[\w-]+)\s*:\s*([\d.]+)(px|rem)\b/g, (_, name, num, unit) => { fsTokens[name] = unit === "rem" ? parseFloat(num) * 16 : parseFloat(num); return ""; });
}
fontFiles.forEach((f) => collectTokens(fs.readFileSync(f, "utf8")));
/** 把一個 font-size 值換算成 px；算不出來（calc、百分比、em 以外的關鍵字）回傳 null */
function toPx(raw) {
  const v = String(raw).trim();
  let m = v.match(/^([\d.]+)px$/i);
  if (m) return parseFloat(m[1]);
  m = v.match(/^([\d.]+)r?em$/i);
  if (m) return parseFloat(m[1]) * 16; // em 以 16px 估算
  m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
  if (m) return fsTokens[m[1]] !== undefined ? fsTokens[m[1]] : m[2] ? toPx(m[2]) : null;
  return null;
}
let allowedSmall = 0;
const screenHtml = new Set(screenFiles); // 一般畫面的 HTML：12～13px 由第 14 項擋，這裡不重複提醒
for (const file of fontFiles) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const allowed = /wf-allow-small/.test(line);
    const code = line.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
    const found = [];
    // font-size: X
    code.replace(/font-size\s*:\s*([^;}"'!]+)/gi, (_, v) => { found.push(v.trim()); return ""; });
    // font: 600 11px/1.4 …（簡寫）
    code.replace(/(?<![-\w])font\s*:\s*([^;}"']+)/gi, (_, v) => { const m = v.match(/(?:^|\s)([\d.]+(?:px|r?em))(?:\/|\s|$)/i); if (m) found.push(m[1]); return ""; });
    // 字級變數定義：--fs-xxx: 11px
    code.replace(/(--fs-[\w-]+)\s*:\s*([^;}"']+)/gi, (_, n, v) => { found.push(v.trim()); return ""; });
    found.forEach((v) => {
      const px = toPx(v);
      if (px === null) return;
      const where = `${rel(file)} 第 ${i + 1} 行「${line.trim().slice(0, 60)}」`;
      if (CLIENT && px < 14) {
        // 元件稿：字級照客戶元件庫，只提醒（列進交件說明）
        if (!allowed) warnings.push(`元件稿字級 ${px}px：${where}——照客戶元件庫不擋；小於 14px 的地方列進交件說明提醒設計師`);
        return;
      }
      if (px < 12) fontErr.push(`${where}：${px}px 小於 12px（任何文字最小 12px；內文、標籤、錯誤訊息、欄位說明至少 14px）`);
      else if (px < 14) {
        if (allowed) allowedSmall += 1;
        else if (screenHtml.has(file)) return;
        else warnings.push(`字級 ${px}px：${where}——12～13px 只能用在「不看也不影響操作」的字（免責聲明、狀態詞、版本號、圖說）；內文、標籤、按鈕、欄位標籤、錯誤訊息、欄位說明文字請改 14px 以上。確定屬於前者，就在該行加註解 wf-allow-small`);
      }
    });
  });
}
section(CLIENT ? "字級（元件稿照客戶元件庫，小於 14px 只提醒）" : "字級（小於 12px 擋）", fontErr);

/* ---------- 11 線框密度（只警告不擋） ---------- */
// 一頁有框的表單元件太多，畫面會變成滿滿的框線。規則見 shared/線框視覺基本盤.md 第 4.2 節
// 算法：輸入框、下拉、多行、合併輸入框、選取卡各算 1 個；
//   放在 .form--filled（無框淡底版）裡的不算；合併輸入框裡的 .input／.select、驗證碼格子不另算
const FRAME_LIMIT = 6; // 超過這個數就提醒
const FRAMED = ["input", "select", "textarea", "input-group", "choice-card"];
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
function countFramedControls(src) {
  const html = src.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const stack = []; // 目前開著的標籤：{ tag, filled（在無框版裡）, inner（在合併輸入框或驗證碼格子裡） }
  let count = 0;
  html.replace(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g, (_, close, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (close) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      return "";
    }
    const cls = ((attrs.match(/\sclass="([^"]*)"/i) || [])[1] || "").split(/\s+/).filter(Boolean);
    const parent = stack[stack.length - 1] || { filled: false, inner: false };
    const filled = parent.filled || cls.includes("form--filled");
    if (!filled && !parent.inner && cls.some((c) => FRAMED.includes(c))) count += 1;
    const ctx = { tag, filled, inner: parent.inner || cls.includes("input-group") || cls.includes("code-cells") };
    if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(attrs)) stack.push(ctx);
    return "";
  });
  return count;
}
for (const file of htmlFiles) {
  const name = path.basename(file);
  if (docFiles.has(name)) continue;
  const n = countFramedControls(fs.readFileSync(file, "utf8"));
  if (n > FRAME_LIMIT)
    warnings.push(`${name}：有框的表單元件 ${n} 個（輸入框、下拉、多行、選取卡，超過 ${FRAME_LIMIT} 個），線框過多，考慮改用 filled 版本——把欄位密集的那個 .form 加上 .form--filled（無框淡灰底，同一區塊不混用）；規則見 shared/線框視覺基本盤.md 第 4.2 節`);
}


/* ---------- 13 樣式名稱都有定義 ---------- */
// 從 CSS 文字收集定義過的 class（只看 selector，不看宣告內容與註解）
function cssClasses(text) {
  const set = new Set();
  let t = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\((?:'[^']*'|"[^"]*"|[^)]*)\)/g, "");
  // 反覆拿掉最內層宣告區塊，剩下的都是 selector 與 @ 規則
  for (let i = 0; i < 4; i += 1) t = t.replace(/\{[^{}]*\}/g, "{}");
  (t.match(/\.(-?[A-Za-z_][\w-]*)/g) || []).forEach((c) => set.add(c.slice(1)));
  return set;
}
const definedClasses = new Set();
cssFiles.forEach((f) => cssClasses(fs.readFileSync(f, "utf8")).forEach((c) => definedClasses.add(c)));
// 殼層互動腳本用到的掛鉤名稱（沒有樣式、只給腳本找元素用，例：upload__pick）
const assetsDir = path.join(root, "assets");
const protoFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter((f) => /^proto.*\.js$/.test(f)).map((f) => path.join(assetsDir, f)) : [];
protoFiles.forEach((f) => {
  const js = fs.readFileSync(f, "utf8");
  (js.match(/(["'`])(?:(?!\1)[^\n\\])*\1/g) || []).forEach((lit) => {
    (lit.match(/\.([A-Za-z_][\w-]*)/g) || []).forEach((c) => definedClasses.add(c.slice(1))); // selector 字串：".upload__pick"
    (lit.match(/[A-Za-z][\w]*(?:__|--)[\w-]+/g) || []).forEach((c) => definedClasses.add(c)); // classList 參數："is-open"、"upload__pick"
  });
});
const classErr = [];
for (const file of [...htmlFiles, ...starterFiles]) {
  const src = fs.readFileSync(file, "utf8");
  const own = new Set();
  src.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => { cssClasses(css).forEach((c) => own.add(c)); return ""; });
  const markup = src.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const missing = new Map(); // class → 第一次出現的行號
  const lines = markup.split("\n");
  lines.forEach((line, i) => {
    line.replace(/\sclass="([^"]*)"/g, (_, v) => {
      v.split(/\s+/).filter(Boolean).forEach((c) => {
        if (/^(is|has|js)-/.test(c) || definedClasses.has(c) || own.has(c)) return;
        if (!missing.has(c)) missing.set(c, i + 1);
      });
      return "";
    });
  });
  if (missing.size) classErr.push(`${rel(file)}：${[...missing].map(([c, n]) => `${c}（約第 ${n} 行）`).join("、")}——assets/*.css 與本頁 <style> 都沒有定義；改用 shared.css 現有元件的 class（各元件的 class 見套件 shared/knowledge/components 各篇），真的要新樣式就寫在本頁 <style>`);
}
section("樣式名稱都有定義（class 對得到 CSS）", classErr);

/* ---------- 14 頁面自寫的字級與間距 ---------- */
const authorErr = [];
const SPACING_PROP = /^(margin|padding)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/;
/** 一個間距值裡不是 4 的倍數的 px（rem 以 16px 換算）；calc、var、auto、百分比略過 */
function badSpacing(value) {
  if (/calc|var\(/.test(value)) return [];
  const bad = [];
  (value.match(/-?[\d.]+(px|rem)\b/g) || []).forEach((v) => {
    const px = Math.abs(parseFloat(v) * (v.endsWith("rem") ? 16 : 1));
    if (px % 4 !== 0) bad.push(v);
  });
  return bad;
}
for (const file of screenFiles) {
  const src = fs.readFileSync(file, "utf8");
  const name = path.basename(file);
  const lines = src.split("\n");
  // style 屬性
  lines.forEach((line, i) => {
    line.replace(/<([a-z][\w-]*)\b[^>]*\sstyle="([^"]*)"/gi, (_, tag, style) => {
      const hard = style.split(";").map((d) => d.trim()).filter(Boolean).filter((d) => {
        const prop = d.split(":")[0].trim().toLowerCase();
        return SPACING_PROP.test(prop) || /^font(-size)?$/.test(prop) || prop === "line-height";
      });
      if (hard.length) authorErr.push(`${name} 第 ${i + 1} 行 <${tag} style="${style}">：寫死間距或字級（${hard.join("；")}）；改用元件 class 與間距變數，真的要調就寫在本頁 <style>（shared/線框視覺基本盤.md 第 1、2 節）`);
      return "";
    });
  });
  // 頁面 <style>
  src.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (whole, css, idx) => {
    const startLine = src.slice(0, idx).split("\n").length;
    css.split("\n").forEach((line, j) => {
      const code = line.replace(/\/\*[\s\S]*?\*\//g, "");
      code.replace(/([\w-]+)\s*:\s*([^;}]+)/g, (_, prop, val) => {
        prop = prop.toLowerCase();
        if (SPACING_PROP.test(prop)) {
          const bad = badSpacing(val);
          if (bad.length) authorErr.push(`${name} 第 ${startLine + j} 行「${line.trim().slice(0, 60)}」：間距 ${bad.join("、")} 不是 4 的倍數（只用 4／8／12／16／20／24／28／32／40／48／64／72）`);
        }
        if (prop === "font-size" && !/wf-allow-small/.test(line)) {
          const px = toPx(val.replace(/!important/, "").trim());
          if (px !== null && px >= 12 && px < 14 && CLIENT) warnings.push(`元件稿字級 ${px}px：${name} 第 ${startLine + j} 行——照客戶元件庫不擋；列進交件說明提醒設計師`);
          else if (px !== null && px >= 12 && px < 14) authorErr.push(`${name} 第 ${startLine + j} 行「${line.trim().slice(0, 60)}」：字級 ${px}px；內文、標籤、按鈕、錯誤句至少 14px，只有「不看也不影響操作」的字（免責聲明、狀態詞、版本號、圖說）可用 12～13px，並在該行加註解 wf-allow-small`);
        }
        return "";
      });
    });
    return "";
  });
}
section("頁面自寫的字級與間距（inline 不寫死、間距 4 的倍數、字級 ≥14px）", authorErr);

/* ---------- 15 多角色頁 ---------- */
const multiRoleErr = [];
const cardBullets = (code, title) =>
  (((map && map.FEATURE_NOTES) || {})[code] || []).filter((c) => titleIs(c.title, title)).flatMap((c) => (c.bullets || []).map((b) => (b && typeof b === "object" ? String(b.text || "") : String(b || ""))));
const roleLine = (code) => [code, String(code).replace(/-\d+$/, "")].map((c) => cardBullets(c, "前端行為").find((t) => /^角色[：:]/.test(t.trim()))).find(Boolean) || "";
if (map && ROLES.length >= 2) {
  const mainCodes = Object.entries(map.PAGES || {}).filter(([c, p]) => p.kind !== "doc" && !p.unplanned && p.file && !/-\d+$/.test(c) && fs.existsSync(path.join(root, "pages", p.file)));
  for (const [code, p] of mainCodes) {
    const src = fs.readFileSync(path.join(root, "pages", p.file), "utf8");
    const usesRoles = /data-wf-roles="/.test(src);
    const note = roleLine(code);
    const same = /相同|一樣|無差異|沒有差異/.test(note);
    // 主頁大版面階段（只有前端互動／顯示規則、還沒有狀態頁）：「角色：」條等流程畫面時再寫，這裡不要求（同狀態頁下限的判斷）
    const cards = (map.FEATURE_NOTES || {})[code] || [];
    const hasStates = Object.keys(map.PAGES || {}).some((c) => c !== code && c.replace(/-\d+$/, "") === code);
    const mainLayoutOnly = !hasStates && cards.length > 0 && cards.every((k) => titleIs(k.title, "前端行為"));
    if (note && !same && !usesRoles) multiRoleErr.push(`${code}：顯示規則卡寫了角色差異，但 pages/${p.file} 沒有任何 data-wf-roles——角色限制只寫在標註、畫面沒實作；把只有部分角色看得到的按鈕、欄位加上 data-wf-roles="角色,角色"`);
    else if (!note && usesRoles && !mainLayoutOnly) multiRoleErr.push(`${code}：畫面用了 data-wf-roles，顯示規則卡第一條要寫「角色：<各角色看得到、做得到什麼>」`);
    // 各角色看到、做得到的都一樣（頁面沒有 data-wf-roles）就不寫「角色：」；寫了「相同」類句子等於沒資訊，擋
    else if (note && same && !usesRoles) multiRoleErr.push(`${code}：顯示規則卡寫了「${note.trim()}」——各角色看到的、做得到的都一樣時不寫「角色：」，刪掉這一條；只有內容或操作因角色不同時才寫`);
  }
}
section("多角色頁（角色條與 data-wf-roles 對得上）", multiRoleErr);

/* ---------- 16 工程標註格式 ---------- */
const noteFmtErr = new Set();
if (map) {
  const ENDPOINT = /\b(GET|POST|PUT|PATCH|DELETE)\s+\/[^\s：:；;，,（(]*/g;
  const HAS_FIELDS = /欄位|取|回傳|參數|body|送出|帶入|同\s*[A-Z]\d|[A-Za-z_]\w*\s*[、,，]\s*[A-Za-z_]\w*|[（(]\s*[A-Za-z_]\w*\s*[）)]/;
  const ERROR_CODE_NUM = /(?<![\d.,])[45]\d\d(?![\d,])/g;
  const unmatchedCodes = new Set();
  const familyOf = (c) => String(c).replace(/-\d+$/, "");
  const displayHas = (base, num) => Object.keys(map.FEATURE_NOTES || {}).some((c) => (familyOf(c) === base || /^Z/.test(c)) && cardBullets(c, "前端行為").some((t) => new RegExp(`(?<!\\d)${num}(?!\\d)`).test(t)));
  Object.keys(map.FEATURE_NOTES || {}).forEach((code) => {
    const base = String(code).replace(/-\d+$/, "");
    cardBullets(code, "API 備註").forEach((t) => {
      const methods = t.match(ENDPOINT) || [];
      if (methods.length && !methods.every((m) => m.startsWith("DELETE")) && !HAS_FIELDS.test(t.replace(ENDPOINT, "")))
        noteFmtErr.add(`${base} API 區「${t.slice(0, 50)}」沒寫取用欄位；寫成「方法 路徑：用途；欄位 a、b、c」（只列本頁畫面用到的欄位）`);
      // API 區列的錯誤碼：同一頁家族（主頁碼＋狀態頁）或全站共用狀態（Z）的顯示規則要寫到這個碼
      (t.match(ERROR_CODE_NUM) || []).forEach((num) => {
        if (!displayHas(base, num)) unmatchedCodes.add(`${base} API 區列了 ${num}，但本頁與全站共用狀態（Z）的顯示規則都沒寫 ${num} 會看到什麼`);
      });
    });
  });
  unmatchedCodes.forEach((m) => warnings.push(`${m}（照 references/API錯誤碼對帳.md 補顯示規則或列進 API 缺口清單）`));
}
section("工程標註格式（API 區列取用欄位）", [...noteFmtErr]);

/* ---------- 18 狀態頁下限 ---------- */
// 裝資料的頁、有欄位的頁、顯示規則寫了 409 的頁，至少要有哪些狀態頁（規則見 skill 的 references/流程畫面.md「裝資料的頁」）
const stateMinErr = [];
const stateMinNote = [];
const happyNote = [];
if (map) {
  const PAGES = map.PAGES || {};
  const STATE_KINDS = {
    loading: { name: "載入中", re: /載入中|讀取中/ },
    empty: { name: "空資料", re: /空資料|無資料|沒有資料|尚無|還沒有|空狀態|空清單/ },
    notFound: { name: "找不到這筆資料", re: /找不到|不存在|已刪除|已下架|404/ },
    filtered: { name: "篩選無結果", re: /篩選無結果|搜尋無結果|查無|無結果|沒有符合/ },
    failed: { name: "載入失敗（整頁）", re: /載入失敗|讀取失敗|無法載入|連線失敗|系統錯誤|伺服器錯誤/ },
    fieldError: { name: "欄位錯誤", re: /欄位錯誤|驗證錯誤|格式錯誤|必填未填|錯誤提示/ },
    conflict: { name: "衝突（409）", re: /衝突|已被.*(修改|更新|處理|刪除)|他人|409|已存在|重複/ },
  };
  const mains = Object.entries(PAGES).filter(([c, p]) => p.kind !== "doc" && !p.unplanned && p.file && !/-\d+$/.test(c) && fs.existsSync(path.join(root, "pages", p.file)));
  for (const [code, p] of mains) {
    const src = fs.readFileSync(path.join(root, "pages", p.file), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    const cards = (map.FEATURE_NOTES || {})[code] || [];
    const states = Object.entries(PAGES).filter(([c]) => c !== code && c.replace(/-\d+$/, "") === code).map(([c, s]) => String(s.label || ""));
    // 主頁大版面段（只有前端互動／顯示規則、還沒有狀態頁）：例外狀態之後才補，這裡不擋
    if (!states.length && cards.length > 0 && cards.every((k) => titleIs(k.title, "前端行為"))) {
      stateMinNote.push(code);
      continue;
    }
    // 順向流程段（PAGES 寫 stage: "happy"）：例外狀態晚一點補，這裡只提醒
    if (p.stage === "happy") {
      happyNote.push(code);
      continue;
    }
    // 裝資料的頁（與流程畫面.md 一致）分兩種：
    //   列表頁（一次顯示多筆）＝用了資料表格或頁名有「列表」→ 載入中／空資料／載入失敗（有篩選加篩選無結果）
    //   詳情頁（一次顯示一筆）＝頁名有「詳情」「明細」，或 API 區的 GET 路徑帶 {id}／:id → 載入中／找不到這筆資料／載入失敗
    //   API 區寫了 GET 但判斷不出是哪種 → 先照列表頁檢查，訊息說明怎麼讓腳本認成詳情頁
    const getBullets = cardBullets(code, "API 備註").filter((t) => /\bGET\b/.test(t));
    const label = String(p.label || "");
    const listHint = /data-wf-table\b/.test(src) || /列表/.test(label);
    const detailHint = /詳情|明細/.test(label) || getBullets.some((t) => /\bGET\s+\S*(\{[^}\s]+\}|\/:[A-Za-z_]\w*)/.test(t));
    const dataKind = listHint ? "list" : detailHint ? "detail" : getBullets.length ? "guess" : "";
    const isList = dataKind === "list" || dataKind === "guess";
    const hasFilter = /data-wf-filter\b|class="[^"]*\b(filter-bar|search)\b/.test(src);
    const hasFields = /class="[^"]*\bfield__label\b/.test(src);
    const errBullets = cardBullets(code, "前端行為");
    const has409 = errBullets.some((t) => /^\s*409\b/.test(t));
    const need = [];
    if (isList) { need.push("loading", "empty", "failed"); if (hasFilter) need.push("filtered"); }
    if (dataKind === "detail") need.push("loading", "notFound", "failed");
    if (hasFields) need.push("fieldError");
    if (has409) need.push("conflict");
    const missing = need.filter((k) => !states.some((l) => STATE_KINDS[k].re.test(l)));
    if (missing.length) {
      const why = [{ list: "列表頁", detail: "詳情頁", guess: "裝資料的頁，判斷不出列表或詳情、先照列表頁檢查；一次只顯示一筆的頁，頁名寫「詳情」或 API 的 GET 路徑帶 {id}，就會改照詳情頁檢查" }[dataKind] || "", hasFields ? "有輸入欄位" : "", has409 ? "顯示規則有 409" : ""].filter(Boolean).join("、");
      stateMinErr.push(`${code}「${p.label}」（${why}）缺狀態頁：${missing.map((k) => STATE_KINDS[k].name).join("、")}——PAGES 的狀態頁 label 寫出狀態種類（例：「載入中」「空資料」「找不到這筆資料」「篩選無結果」「載入失敗」「欄位錯誤」「已被他人修改」），並在顯示規則寫出每個狀態、最後一條「狀態：」列出頁碼`);
    }
    // 列表讀取（GET）失敗用輕提示：讀不到資料時畫面要給整頁或區塊的失敗狀態＋重試，不是一閃而過的輕提示
    errBullets.forEach((t) => {
      if (/^\s*(5\d\d|403)\b/.test(t) && /輕提示/.test(t) && /\bGET\b/.test(t) && !/POST|PATCH|PUT|DELETE/.test(t))
        stateMinErr.push(`${code} 顯示規則「${t.slice(0, 50)}」：讀取資料（GET）失敗不用輕提示；500 給整頁或區塊的「載入失敗＋再試一次」狀態頁、403 給無權限擋板（輕提示只用在送出動作失敗）`);
    });
  }
  // 規格 API spec 寫了 409，線框任何一頁的顯示規則都沒有處理
  const specsDirS = path.join(root, "specs");
  if (fs.existsSync(specsDirS)) {
    const with409 = fs.readdirSync(specsDirS).filter((f) => f.endsWith(".md")).filter((f) => {
      const sec = fs.readFileSync(path.join(specsDirS, f), "utf8").split(/^##\s+/m).find((s) => /^API spec/.test(s)) || "";
      return /(?<!\d)409(?!\d)/.test(sec);
    });
    const handled = Object.keys(map.FEATURE_NOTES || {}).some((c) => cardBullets(c, "前端行為").some((t) => /^\s*409\b/.test(t)));
    if (with409.length && !handled && mains.length) stateMinErr.push(`規格 ${with409.map((f) => "specs/" + f).join("、")} 的 API spec 有 409（衝突），但沒有任何頁的顯示規則寫 409：寫在會送出更新的那一頁，並畫衝突狀態頁`);
  }
}
section(`狀態頁下限（列表頁：載入中／空資料／載入失敗，有篩選加篩選無結果；詳情頁：載入中／找不到這筆資料／載入失敗；有欄位：欄位錯誤；409：衝突）${stateMinNote.length ? `；主頁大版面段略過 ${stateMinNote.join("、")}` : ""}${happyNote.length ? `；順向流程段（stage: happy）略過 ${happyNote.join("、")}` : ""}`, stateMinErr);
if (happyNote.length) warnings.push(`${happyNote.join("、")} 還在順向流程段（stage: "happy"），例外狀態還沒補；補完狀態頁後拿掉 stage，狀態頁下限才會檢查`);

/* ---------- 19 角色清單對照規格 ---------- */
// 規格「## 使用者與情境」出現的角色都要進 ROLES（檢視角色），否則某些角色看不到什麼就沒有畫出來
const roleSpecErr = [];
let roleSpecNote = "";
{
  const specsDirR = path.join(root, "specs");
  const specRoles = new Map(); // 角色 → 出處
  if (map && fs.existsSync(specsDirR)) {
    for (const f of fs.readdirSync(specsDirR).filter((x) => x.endsWith(".md"))) {
      const text = fs.readFileSync(path.join(specsDirR, f), "utf8");
      const sec = (text.split(/^##\s+/m).find((s) => /^使用者與情境/.test(s)) || "").split(/\r?\n/);
      sec.forEach((line) => {
        // 明列：「- 角色清單：主管、編輯、客服」
        const m = line.match(/^\s*-\s*角色清單\s*[：:]\s*(.+?)\s*$/);
        if (m) m[1].replace(/（[^）]*）|\([^)]*\)/g, "").split(/[、,，/／\s]+/).filter((r) => r && !/^(無|—)$/.test(r)).forEach((r) => specRoles.set(r, `specs/${f} 角色清單`));
        // 沒有角色清單行的舊規格：從「主要使用者／其他角色」行抓「N 位主管」「客服 2 人」這種人數寫法
        if (/^\s*-\s*(主要使用者|其他角色)\s*[：:]/.test(line) && !/[：:]\s*無\b/.test(line)) {
          const body = line.replace(/（[^）]*）/g, (s) => (/設計師|推薦|依據|同 /.test(s) ? "" : s));
          body.replace(/\d+\s*(?:位|名)\s*([一-鿿]{2,4}?)(?=[（(、,，；;\s]|$|可|只|不)/g, (_, r) => { specRoles.set(r, `specs/${f} 使用者與情境`); return ""; });
          body.replace(/([一-鿿]{2,4})\s*\d+\s*人/g, (_, r) => { specRoles.set(r, `specs/${f} 使用者與情境`); return ""; });
        }
      });
    }
  }
  const ROLES_ALL = (map && Array.isArray(map.ROLES)) ? map.ROLES : [];
  if (specRoles.size >= 2) {
    const missing = [...specRoles.keys()].filter((r) => !ROLES_ALL.some((x) => x === r || x.includes(r) || r.includes(x)));
    if (missing.length) roleSpecErr.push(`規格提到的角色沒有進 page-map.js 的 ROLES：${missing.map((r) => `${r}（${specRoles.get(r)}）`).join("、")}；ROLES 目前是 ${ROLES_ALL.length ? ROLES_ALL.join("、") : "空的"}。規格的每個角色都要能在殼層「檢視角色」切換；看不到某頁或某按鈕的角色，用 data-wf-roles 或無權限擋板表達`);
    else roleSpecNote = `規格角色 ${[...specRoles.keys()].join("、")} 都在 ROLES`;
  } else roleSpecNote = specRoles.size ? "規格只有 1 個角色" : "規格沒有可比對的角色寫法";
}
section(`角色清單（規格的角色都在 ROLES）${roleSpecErr.length ? "" : "：" + roleSpecNote}`, roleSpecErr);

/* ---------- 20 欄位寫法（必填不加星號、框內提示字、日期時間用選擇器） ---------- */
const fieldWriteErr = [];
{
  const DATE_LABEL = /日期|時間|生日|期限|截止|到期|時段|上架時|下架時/;
  for (const file of screenFiles) {
    const name = path.basename(file);
    const src = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
    const lineOf = (idx) => src.slice(0, idx).split("\n").length;
    // 必填加星號（規則：必填不加標示，只在選填欄位名稱後加「（選填）」）
    src.replace(/<label\b[^>]*>([\s\S]*?)<\/label>/gi, (whole, inner, idx) => {
      const txt = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
      if (/[*＊]|[（(]必填[）)]/.test(txt)) fieldWriteErr.push(`${name} 約第 ${lineOf(idx)} 行 欄位標籤「${txt.slice(0, 20)}」標了必填記號；必填不加星號，只在選填欄位名稱後加「（選填）」`);
      return "";
    });
    // 框內提示字：文字輸入框「例：…」；下拉、組合框、日期這類挑選欄位「請選擇〔對象〕」；搜尋框不限
    src.replace(/<(input|textarea)\b([^>]*)>/gi, (whole, tag, attrs, idx) => {
      const ph = (attrs.match(/\splaceholder="([^"]*)"/i) || [])[1];
      if (ph === undefined || !ph.trim()) return "";
      const cls = (attrs.match(/\sclass="([^"]*)"/i) || [])[1] || "";
      const type = ((attrs.match(/\stype="([^"]*)"/i) || [])[1] || "text").toLowerCase();
      if (type === "search" || /search|filter|combobox__input|listbox/.test(cls)) return "";
      if (!/^\s*(例[：:]|請選擇)/.test(ph)) fieldWriteErr.push(`${name} 約第 ${lineOf(idx)} 行 <${tag} placeholder="${ph}">：框內提示字寫一個擬真範例「例：…」（挑選類欄位寫「請選擇〔對象〕」），不寫「請輸入…」或格式代碼（格式要求寫在 .field__help）`);
      return "";
    });
    // 日期時間欄位要用日期選擇元件（data-wf-datepicker：single／datetime／range）
    const parts = src.split(/(?=<div\b[^>]*class="[^"]*\bfield\b[^"]*")/i);
    let offset = 0;
    parts.forEach((seg) => {
      const at = offset;
      offset += seg.length;
      const lab = seg.match(/<label\b[^>]*class="[^"]*\bfield__label\b[^"]*"[^>]*>([\s\S]*?)<\/label>/i);
      if (!lab) return;
      const txt = lab[1].replace(/<[^>]+>/g, "").replace(/\s+/g, "");
      if (!DATE_LABEL.test(txt)) return;
      const block = seg.split(/<div\b[^>]*class="[^"]*\bfield\b/i)[0] || seg;
      if (!/<input\b(?![^>]*type="(checkbox|radio|hidden)")/i.test(block)) return;
      if (/data-wf-datepicker|date-field/.test(block)) return;
      fieldWriteErr.push(`${name} 約第 ${lineOf(at)} 行 欄位「${txt.slice(0, 20)}」是日期或時間，卻是一般文字框；改用日期選擇元件（.date-field＋data-wf-datepicker="single"，含時刻用 "datetime"，起訖用 "range"），寫法見元件示範與互動樣式〈日期與時間選擇〉`);
    });
  }
  // 欄位驗證規則（FIELDS）的提示字同一規則
  const frL = loadGlobal("assets/field-rules.js", "WfFieldRules");
  ((frL.value && frL.value.FIELDS) || []).forEach((f) => {
    // 這裡的 placeholder 只寫範例值本身（殼層顯示時不加「例：」也可）；擋的是「請輸入…」「選擇…」這類指令句
    if (f.placeholder && /^\s*(請輸入|請填寫|輸入|填寫|選擇)/.test(f.placeholder)) fieldWriteErr.push(`field-rules.js「${f.title}」placeholder「${f.placeholder}」：提示字寫擬真範例（例：王小明），不寫「請輸入…」「選擇…」這類指令句（挑選類寫「請選擇〔對象〕」）`);
  });
}
section("欄位寫法（必填不加星號、框內提示字「例：…」、日期時間用選擇器）", fieldWriteErr);

/* ---------- 21 工程標註內容 ---------- */
const noteBodyErr = [];
if (map) {
  const frN = loadGlobal("assets/field-rules.js", "WfFieldRules");
  const fieldsText = JSON.stringify((frN.value && frN.value.FIELDS) || []);
  const allCodes = Object.keys(map.FEATURE_NOTES || {});
  allCodes.forEach((code) => {
    const all = CARD_TITLES.flatMap((t) => cardBullets(code, t));
    // 紅色只給錯誤與危險動作：標註不可建議把非錯誤的狀態做成紅色
    all.forEach((t) => {
      if (/紅色|紅字|--wf-color-error|錯誤色/.test(t) && !/錯誤|危險|刪除|移除|停用|作廢|撤銷|取消訂單|取消訂閱|清空|永久|封鎖|終止|失敗|驗證|不可逆|無效|不符|格式/.test(t.replace(/--wf-color-error/g, "")))
        noteBodyErr.push(`${code}「${t.slice(0, 50)}」：紅色只給錯誤與危險動作；提醒、超時、逾期這類強調用灰階（實心標籤、字重、圖示），標註也不寫「正式版改紅色」`);
    });
    // 前端驗證區只寫「詳見 G1」：欄位連結殼層會自動列出，不用另寫
    const checks = cardBullets(code, "前端驗證");
    if (checks.length && checks.every((t) => /詳見|請見|^見\s*G\d|參考\s*G\d/.test(t)))
      noteBodyErr.push(`${code} 前端驗證區只有指向 G1 的句子；本頁用到的欄位殼層會自動列出，這一區的條目只寫不屬於任何單一輸入欄位的送出前檢查，沒有就不寫`);
    // 測試值裡出現的驗證錯誤句，要在 FIELDS 或前端驗證區找得到（不可只寫在測試值）
    const checkText = checks.join("\n");
    ((map.TEST_HINTS || {})[code] || []).forEach((h) => {
      const r = String((h && h.result) || "");
      if (!/錯誤|不可|不得|需在|須在|要晚於|要早於|超過|不足/.test(r)) return;
      (r.match(/「([^」]{4,})」/g) || []).map((q) => q.slice(1, -1)).forEach((q) => {
        if (!/需|須|要|不可|不得|請|超過|不足|晚於|早於|錯誤|格式/.test(q)) return;
        if (!checkText.includes(q) && !fieldsText.includes(q))
          noteBodyErr.push(`${code} 測試值「${h.title}」的錯誤句「${q}」在 FIELDS 與前端驗證區都找不到；輸入欄位的錯誤句登記在 FIELDS，其他送出前檢查寫在前端驗證區，測試值只放輸入與結果`);
      });
    });
  });
}
section("工程標註內容（紅色只給錯誤、前端驗證區不只寫「詳見 G1」、測試值的錯誤句有規則來源）", noteBodyErr);

/* ---------- 24 輸入欄位登記 ---------- */
// 每個輸入框的規則只寫在 assets/field-rules.js（G1 欄位驗證規則頁），各頁標註引用、不重寫
const fieldRegErr = [];
if (map) {
  const frR = loadGlobal("assets/field-rules.js", "WfFieldRules");
  const FIELDS_R = (frR.value && frR.value.FIELDS) || [];
  const byId = new Map(FIELDS_R.map((f) => [f.id, f]));
  FIELDS_R.forEach((f) => {
    if (f.id && !f.modified) fieldRegErr.push(`FIELDS「${f.title || f.id}」沒寫 modified（最後修改日期 YYYY-MM-DD）`);
  });
  // 頁碼 ← 檔名：一份 HTML 對到哪些頁碼（含狀態頁）
  const codesOfFile = (name) => Object.entries(map.PAGES || {}).filter(([, p]) => p.file === name).map(([c]) => c);
  const SKIP_TYPES = /^(checkbox|radio|hidden|range|color|button|submit|reset|image)$/i;
  /** 找出一份 HTML 裡的輸入框，回傳 [{ line, tag, field }]；field＝輸入框或最近一層外層元素的 data-wf-field */
  function inputsOf(src) {
    const html = src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " ")).replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, " "));
    const stack = []; // { tag, field }
    const found = [];
    html.replace(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g, (whole, close, rawTag, attrs, idx) => {
      const tag = rawTag.toLowerCase();
      if (close) {
        const i = stack.map((x) => x.tag).lastIndexOf(tag);
        if (i >= 0) stack.length = i;
        return "";
      }
      const own = (attrs.match(/\sdata-wf-field="([^"]*)"/i) || [])[1];
      const inherited = stack.length ? stack[stack.length - 1].field : "";
      const field = own !== undefined ? own : inherited;
      if (tag === "input" || tag === "textarea") {
        const type = ((attrs.match(/\stype="([^"]*)"/i) || [])[1] || "text").toLowerCase();
        if (!SKIP_TYPES.test(type)) found.push({ line: html.slice(0, idx).split("\n").length, tag, field });
      }
      if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(attrs)) stack.push({ tag, field });
      return "";
    });
    return found;
  }
  for (const file of screenFiles) {
    const name = path.basename(file);
    const codes = codesOfFile(name);
    const reported = new Set();
    inputsOf(fs.readFileSync(file, "utf8")).forEach(({ line, tag, field }) => {
      if (!field) {
        fieldRegErr.push(`${name} 第 ${line} 行 <${tag}> 沒有 data-wf-field：每個輸入框都要在 assets/field-rules.js 的 FIELDS 登記一筆，並在輸入框（或外層元素）寫 data-wf-field="<欄位 id>"`);
        return;
      }
      const f = byId.get(field);
      if (!f) {
        if (!reported.has(field)) fieldRegErr.push(`${name} 第 ${line} 行 data-wf-field="${field}"：FIELDS 沒有這個 id，請登記到 assets/field-rules.js`);
        reported.add(field);
        return;
      }
      if (codes.length && !codes.some((c) => (f.usedOn || []).includes(c)) && !reported.has(field)) {
        fieldRegErr.push(`FIELDS「${f.title}」的 usedOn 沒有 ${name} 的頁碼（${codes.join("、")}），G1 與右側標註會漏掉這頁`);
        reported.add(field);
      }
    });
  }
  // 工程標註不重寫欄位規則
  const familyR = (c) => String(c).replace(/-\d+$/, "");
  const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const seen = new Set(); // 同一家族（主頁碼＋狀態頁）共用同一個陣列時只報一次
  Object.keys(map.FEATURE_NOTES || {}).forEach((code) => {
    const mine = FIELDS_R.filter((f) => (f.usedOn || []).some((c) => familyR(c) === familyR(code)));
    if (!mine.length) return;
    CARD_TITLES.forEach((t) => {
      cardBullets(code, t).forEach((txt) => {
        mine.forEach((f) => {
          // API 回應後畫面顯示同一句錯誤（例：400 驗證碼不正確）屬於顯示規則，不算重寫
          const apiResult = t !== "前端驗證" && /(?<!\d)[45]\d\d(?!\d)|API|後端/.test(txt);
          const msg = !apiResult && (f.errors || []).map((e) => String(e.message || "")).find((m) => m.length >= 4 && txt.includes(m));
          const rule = t === "前端驗證" && f.title && new RegExp(`${esc(f.title)}.{0,8}(必填|選填|格式|長度|字數|上限|下限|最多|最少|至少|不可空白|不得空白|位數|碼數)`).test(txt);
          const key = `${familyR(code)}|${f.id}|${txt}`;
          if ((msg || rule) && !seen.has(key)) {
            seen.add(key);
            fieldRegErr.push(`${familyR(code)}「${t}」：「${txt.slice(0, 40)}」重寫了欄位「${f.title}」的規則${msg ? `（錯誤句「${msg}」）` : ""}；欄位規則只寫在 G1（assets/field-rules.js），右側前端驗證區會自動列出欄位連結`);
          }
        });
      });
    });
  });
}
section("輸入欄位登記（每個輸入框有 data-wf-field 且登記在 FIELDS、標註不重寫欄位規則）", fieldRegErr);

/* ---------- 23 統計卡用詞 ---------- */
// 同一個概念全頁用同一個詞：統計卡點下去篩的是哪個狀態，卡上就寫那個狀態名
const statWordErr = [];
for (const file of screenFiles) {
  const src = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const lineOf = (idx) => src.slice(0, idx).split("\n").length;
  src.replace(/<(button|a|div)\b([^>]*\bdata-wf-filter-set="([^"]*)"[^>]*)>([\s\S]*?)<\/\1>/gi, (whole, tag, attrs, setv, inner, idx) => {
    if (!/stat-card/.test(attrs)) return "";
    const m = /^[^=]+=(.*)$/.exec(setv);
    const val = m ? m[1].trim() : "";
    if (!val || /[|,，、]/.test(val)) return ""; // 全部、或多個值的彙總卡不比
    const lab = /class="[^"]*\bstat-card__label\b[^"]*"[^>]*>([\s\S]*?)<\//.exec(inner);
    const label = lab ? lab[1].replace(/<[^>]+>/g, "").replace(/\s+/g, "") : "";
    if (label && label !== val && !label.includes(val))
      statWordErr.push(`${path.basename(file)} 約第 ${lineOf(idx)} 行 統計卡寫「${label}」，點下去篩的是「${val}」：同一件事用同一個詞（卡名改成「${val}」，或把狀態值改成「${label}」並全頁一致）`);
    return "";
  });
}
section("統計卡用詞（卡名與篩選的狀態值一致）", statWordErr);

/* ---------- 22 走查步驟檔位置 ---------- */
// 走查步驟檔（walk.mjs 的輸入 JSON）一律放專案資料夾的 _walk/；scripts/ 只放殼層附的腳本與範例
const walkPosErr = [];
{
  const scriptsDir = path.join(root, "scripts");
  if (fs.existsSync(scriptsDir)) {
    fs.readdirSync(scriptsDir).filter((f) => f.endsWith(".json") && f !== "walk.example.json").forEach((f) => {
      const txt = fs.readFileSync(path.join(scriptsDir, f), "utf8");
      if (/"steps"\s*:/.test(txt)) walkPosErr.push(`scripts/${f} 是走查步驟檔，要放 _walk/${f}（走查結果會寫在步驟檔旁邊，一起留在 _walk/）`);
    });
  }
}
section("走查步驟檔放在 _walk/", walkPosErr);

/* ---------- 25 畫面不放後設字樣（擋） ---------- */
// 線框是可操作的原型，畫面上不寫「這裡只是示意」這類話；每顆可見按鈕都要有真實反應
const META_WORDS = /展示用|模擬|示意|互動展示|本原型未涵蓋|mock/i;
const metaErr = [];
for (const file of screenFiles) {
  const name = path.basename(file);
  const raw = fs.readFileSync(file, "utf8");
  // 去掉註解與 script／style／template（保留換行，行號才對）
  const html = raw.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " ")).replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, " "));
  const lineOf = (idx) => html.slice(0, idx).split("\n").length;
  const hits = [];
  // 使用者看得到（或讀得到）的屬性值：框內提示字、無障礙名稱、滑過提示、圖片替代字、輕提示字
  html.replace(/\s(placeholder|aria-label|title|alt|data-wf-toast|data-wf-delete-title|data-wf-delete-desc)="([^"]*)"/gi, (whole, attr, val, idx) => {
    if (META_WORDS.test(val)) hits.push(`第 ${lineOf(idx)} 行 ${attr}="${val.trim().slice(0, 30)}"`);
    return "";
  });
  // 標籤之間的文字
  html.replace(/>([^<]+)</g, (whole, txt, idx) => {
    const t = txt.replace(/\s+/g, " ").trim();
    if (t && META_WORDS.test(t)) hits.push(`第 ${lineOf(idx)} 行「${t.slice(0, 30)}」`);
    return "";
  });
  hits.forEach((h) => metaErr.push(`${name} ${h}`));
}
section("畫面不放後設字樣（展示用／模擬／示意／互動展示／本原型未涵蓋／Mock；流程外按鈕改用結果句輕提示）", metaErr);

/* ---------- 26 互動宣告（只提醒不擋）：有輸入框的頁要有 <form>＋initForm 或 WfProto.chat ---------- */
{
  const SKIP_INPUT = /^(checkbox|radio|hidden|range|color|button|submit|reset|image|file)$/i;
  for (const file of screenFiles) {
    const name = path.basename(file);
    const raw = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    const html = raw.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
    const scripts = (raw.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []).join("\n");
    const inputs = [];
    html.replace(/<(input|textarea)\b([^>]*)>/gi, (whole, tag, attrs, idx) => {
      const type = ((attrs.match(/\stype="([^"]*)"/i) || [])[1] || "text");
      if (tag.toLowerCase() === "input" && SKIP_INPUT.test(type)) return "";
      if (/\sform="/i.test(attrs)) { inputs.push({ idx, inForm: true }); return ""; }
      // 在不在 <form> 裡：數這個位置之前開了幾個 <form>、關了幾個 </form>
      const before = html.slice(0, idx);
      const opens = (before.match(/<form\b/gi) || []).length;
      const closes = (before.match(/<\/form>/gi) || []).length;
      inputs.push({ idx, inForm: opens > closes });
      return "";
    });
    if (!inputs.length) continue;
    const outside = inputs.filter((i) => !i.inForm).length;
    const usesForm = /WfProto\s*\.\s*initForm\s*\(/.test(scripts);
    const usesChat = /WfProto\s*\.\s*chat\s*\.\s*feed\s*\(/.test(scripts);
    const ownSubmit = /addEventListener\(\s*["']submit["']/.test(scripts);
    if (outside) warnings.push(`${name} 有 ${outside} 個輸入框不在 <form> 裡（輸入框包進 <form>，主按鈕 type="submit" 或用 form= 指到表單，Enter 才等於送出）`);
    if (!usesForm && !usesChat) warnings.push(`${name} 有輸入框但沒有呼叫 WfProto.initForm（或對話頁的 WfProto.chat.feed）：blur／input／submit 驗證、載入中、鎖定輸入要由共用層掛（寫法見 README「互動原型」）`);
    if (ownSubmit) warnings.push(`${name} 頁面自己寫了 addEventListener("submit"：改用 WfProto.initForm 的 onSubmit（行為只掛共用層，每頁才一致）`);
  }
}

/* ---------- 17 元件對照表（只在元件稿模式） ---------- */
// 元件稿每一頁用到的線框元件，都要在元件對照表登記它對應的客戶元件（對應／部分／沒有），格式見 skill 的 references/元件稿模式.md
const mapTableErr = [];
let mapTableNote = "";
if (CLIENT) {
  // 位置：project.md 的「元件對照表位置」；沒寫＝專案資料夾最上層的 元件對照表.md
  let tablePath = path.join(root, "元件對照表.md");
  const projMd = path.join(root, "project.md");
  if (fs.existsSync(projMd)) {
    const m = fs.readFileSync(projMd, "utf8").match(/^\s*-\s*元件對照表位置\s*[：:]\s*(.+?)\s*$/m);
    if (m && m[1] && !/^(無|待補)$/.test(m[1])) tablePath = path.resolve(root, m[1].replace(/^`|`$/g, ""));
  }
  if (!fs.existsSync(tablePath)) mapTableErr.push(`找不到元件對照表 ${rel(tablePath)}（元件稿模式要先建表：產品元件 ↔ 客戶元件，標對應／部分／沒有）`);
  else {
    const md = fs.readFileSync(tablePath, "utf8").split(/\r?\n/);
    const registered = new Set();
    let head = null;
    md.forEach((line, i) => {
      if (!/^\s*\|/.test(line)) { head = null; return; }
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return; // 分隔列
      if (!head) { head = cells; return; }
      const col = (name) => head.findIndex((h) => h.includes(name));
      const ci = col("線框 class"), mi = col("對應");
      if (ci < 0) return; // 不是元件對照表的表格
      (cells[ci] || "").replace(/\.([A-Za-z][\w-]*)/g, (_, c) => { registered.add(c.replace(/(__|--).*$/, "")); return ""; });
      const v = (cells[mi] || "").replace(/[`*]/g, "");
      if (mi >= 0 && !/^(對應|部分|沒有|不適用)$/.test(v)) mapTableErr.push(`${rel(tablePath)} 第 ${i + 1} 行「對應」欄是「${v}」；只能填 對應／部分／沒有（版面工具填 不適用）`);
    });
    if (!registered.size) mapTableErr.push(`${rel(tablePath)} 找不到含「線框 class」「對應」欄的表格`);
    // 線框元件＝shared.css 定義的 class 區塊名；版面與文字工具不算元件
    const sharedDefined = new Set();
    const sharedPath = path.join(root, "assets", "shared.css");
    if (fs.existsSync(sharedPath)) cssClasses(fs.readFileSync(sharedPath, "utf8")).forEach((c) => sharedDefined.add(c.replace(/(__|--).*$/, "")));
    const UTIL = /^(site|site-main|container|section|row|stack|cluster|grid|visually-hidden|text-[\w-]+|wf-[\w-]+)$/;
    const covered = (b) => [...registered].some((t) => b === t || b === t + "s" || b.startsWith(t + "-"));
    for (const file of screenFiles) {
      // 含 <script> 裡組字串產生的標籤（例：'<span class="badge">'），列表常由腳本產生
      const src = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
      const blocks = new Set();
      src.replace(/\sclass="([^"]*)"/g, (_, v) => { v.split(/\s+/).filter(Boolean).forEach((c) => { if (!/^(is|has|js)-/.test(c)) blocks.add(c.replace(/(__|--).*$/, "")); }); return ""; });
      const missing = [...blocks].filter((b) => sharedDefined.has(b) && !UTIL.test(b) && !covered(b));
      if (missing.length) mapTableErr.push(`${rel(file)} 用到的元件沒在元件對照表登記：${missing.map((b) => "." + b).join("、")}（在「線框 class」欄補上，並標對應／部分／沒有）`);
    }
    if (!mapTableErr.length) mapTableNote = `${rel(tablePath)}，登記 ${registered.size} 個線框 class 區塊`;
  }
  section(`元件對照表（本頁用到的元件都已登記${mapTableNote ? "：" + mapTableNote : ""}）`, mapTableErr);
}

/* ---------- 9 頁名一致（只警告不擋） ---------- */
// 線框的頁名要照抄需求規格每頁小節的標題（規則見 shared/頁面編碼規則.md「頁名」）
let pageNameNote = "";
const specsDir = path.join(root, "specs");
if (!fs.existsSync(specsDir) || !fs.statSync(specsDir).isDirectory()) {
  pageNameNote = "略過（專案根目錄沒有 specs 資料夾）";
} else if (!map) {
  pageNameNote = "略過（page-map.js 讀不到）";
} else {
  const specFiles = fs.readdirSync(specsDir).filter((f) => f.endsWith(".md"));
  const titles = new Set();
  for (const f of specFiles) {
    let inPages = false;
    fs.readFileSync(path.join(specsDir, f), "utf8").split(/\r?\n/).forEach((line) => {
      if (/^##\s/.test(line)) inPages = line.replace(/^##\s+/, "").trim() === "各頁內容與操作";
      else if (inPages && /^###\s/.test(line)) titles.add(line.replace(/^###\s+/, "").trim());
    });
  }
  if (!specFiles.length) pageNameNote = "略過（specs 資料夾裡沒有 .md）";
  else if (!titles.size) pageNameNote = "略過（specs 裡找不到「## 各頁內容與操作」底下的 ### 小節）";
  else {
    // 主頁碼 label 對到哪個小節標題（等於，或「<小節標題>的某狀態」）
    const matchedTitle = (label) => [...titles].find((t) => label === t || label.startsWith(t + "的"));
    const mismatched = [];
    const covered = new Set(); // 已在線框找到對應頁的小節標題
    const stateImpl = []; // 規格頁以狀態頁實作：[頁碼, 頁名]
    for (const [code, item] of Object.entries(map.PAGES || {})) {
      if (item.kind === "doc") continue; // 文件頁不查
      const label = String(item.label || "").trim();
      if (/-\d+$/.test(code)) {
        // 狀態頁：label 寫狀態名不檢查；等於某小節標題＝規格的這一頁以狀態頁實作
        if (titles.has(label)) {
          covered.add(label);
          if (!item.unplanned) stateImpl.push([code, label]);
        }
        continue;
      }
      const t = matchedTitle(label);
      if (t) covered.add(t);
      else mismatched.push(`${code}「${label}」`);
    }
    const uncovered = [...titles].filter((t) => !covered.has(t));
    if (mismatched.length)
      warnings.push(`頁名對不上需求規格的小節標題：${mismatched.join("、")}；規格小節標題有：${[...titles].join("、")}（label 要照抄小節標題，或寫成「<小節標題>的某狀態」）`);
    if (uncovered.length)
      warnings.push(`規格頁在線框找不到對應頁：${uncovered.join("、")}（主頁碼的 label 照抄小節標題；在線框裡實作成另一頁的狀態時，狀態頁的 label 照抄小節標題）`);
    if (!mismatched.length && !uncovered.length)
      pageNameNote = `通過（對照 specs/ ${specFiles.length} 份、${titles.size} 個小節標題${stateImpl.length ? `；其中 ${stateImpl.map(([c, l]) => `「${l}」以 ${c} 狀態實作`).join("、")}` : ""}）`;
  }
}

/* ---------- 結果 ---------- */
console.log(`檢查專案：${root}`);
passed.forEach((n) => console.log(`  ✓ ${n}`));
if (pageNameNote) console.log(`  · 頁名一致：${pageNameNote}`);
problems.forEach(({ name, list }) => {
  console.log(`  ✗ ${name}（${list.length} 項）`);
  list.forEach((l) => console.log(`      - ${l}`));
});
if (warnings.length) {
  console.log(`  ! 提醒（不擋，${warnings.length} 項）`);
  warnings.forEach((w) => console.log(`      - ${w}`));
}
if (problems.length) {
  console.log(`\n未通過：${problems.length} 類問題`);
  process.exit(1);
}
console.log(`\n全部通過（${passed.length} 項）`);

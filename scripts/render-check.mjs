#!/usr/bin/env node
/* ============================================================
   畫面檢查（Node 18+；需要 Playwright＋Chromium／Chrome，找法同 walk.mjs）
   用法：node scripts/render-check.mjs [專案資料夾] [--only A1.1,B1.1]
         沒給專案資料夾＝本腳本上一層（殼層根目錄）
   結果：全部通過 exit 0；有任何一項「擋」exit 1；
         找不到 Playwright 或瀏覽器 → exit 2（交件說明標「畫面未經機器檢查」，改照自檢清單人工看）

   check.mjs 讀原始碼；本腳本把每一頁實際開起來，讀「瀏覽器算出來的結果」，
   所以 class 取什麼名字都騙不過去。逐一開 PAGES 裡每個一般畫面頁碼（文件頁、尚未繪製的頁略過），
   Web 在 1440／900／420 三種寬度、App 在 390 寬各開一次，檢查：

   擋（任何一項不過 exit 1）
   依 wireframe.config.js 的 visualMode 分流：灰階模式（"gray"，預設）照下列規則；
   元件稿模式（"client"）只有 R5、R6 不同（各條寫明），其餘相同。

   R1 主控台錯誤：頁面載入時出現 JS 錯誤或 console.error
   R2 水平溢出：整頁出現橫向捲動；或元素超出畫面右緣（放在可橫捲容器裡的不算）
   R3 一字一行：有文字被擠到每行只剩一個字（表格欄位太窄最常見）
   R4 列尾操作看不到：寬度 ≥1100 時，表格列上的按鈕要不橫向捲動就看得到；
      較窄時，列上按鈕被不能捲動的容器切掉也算
   R5 紅色用途：算出來的顏色（文字、底色、框線、陰影、外框、SVG 填色）是紅色時，
      只准三種用途——錯誤文字（role=alert、或錯誤句）、錯誤框（欄位 aria-invalid，或同一欄位裡有錯誤句）、
      危險動作（按鈕文字是刪除、移除、停用這類不可逆動作，或登出確認）。其他非灰階顏色一律擋
      元件稿模式：改查「客戶危險色只用在錯誤與危險按鈕」——算出來等於客戶危險色（client-theme.css 給
      --wf-color-error 的值）的地方，只准上面三種用途；客戶的品牌色、其他顏色不擋
   R6 字級：任何文字算出來小於 12px；按鈕、連結、輸入框、欄位標籤、表格內容、錯誤句小於 14px
      元件稿模式：字級照客戶元件庫，量到的結果只列「提醒」、不擋（列進交件說明）
   R7 原生樣式：按鈕、下拉、輸入框沒有套到任何元件樣式（瀏覽器預設的灰框按鈕、原生下拉）
   R8 元件尺寸異常：單行輸入框、下拉、按鈕高度超過 72px（例：搜尋框被撐成一大塊）
   R9 底部按鈕：抽屜、對話框、面板底部同時看得到的按鈕超過 3 顆
   R10 一打開就有輕提示：主頁碼與每個狀態頁碼「直接開」就看得到輕提示（使用者還沒操作）；
       頁名寫了輕提示、成功的狀態頁（專門展示輕提示的頁）不算
   R11 空狀態按鈕重複：看得到空狀態時，同一個動作出現兩顆深色實心按鈕（例：頁首與空狀態各一顆「新增」），
       或空狀態裡有 2 顆以上實心按鈕
   R12 筆數矛盾：同一個畫面上「共 N 筆／項／則／件」出現不同的 N
   R13 角色切換沒作用：page-map.js 的 ROLES 有 2 個以上角色、本頁顯示規則卡有「角色：」（只有各角色內容或操作不同才寫），
       但切換各角色看到的畫面完全相同；沒寫「角色：」的頁不檢查
   R14 點了沒反應：每個狀態看得到的按鈕、連結與選單項目（同一份 HTML 同樣子的只點一次），
       點了以後畫面、頁碼都沒有任何變化（全站頂列、已選中的項目、關閉鈕、表單送出鈕不點）。
       工程標註寫「流程外」的按鈕與連結也要給回饋（例：輕提示「流程外（示意）」），點了沒反應一樣擋
   R15 首屏資料列數：Web 後台頁（.site--admin）的主頁碼，1440×900 打開時表格有 5 列以上資料，
       首屏（不捲動）完整看得到的資料列少於 5 列（排版模式庫 Web-後台列表頁）
   R16 主要動作位置：Web 後台頁標題（h1）所在的標題列裡有實心主按鈕（.btn--primary）時，
       它要在標題列右半邊、而且是那一列最右邊的按鈕（1440 寬量）
   R17 狀態頁打不開：逐一「直接開」每個狀態頁碼（網址 ?p=A1.1-2，不先開主頁），畫面要和主頁碼的預設畫面不同；
       頁名寫了狀態種類時，要看得到該狀態應有的元素——
       載入中→骨架或 aria-busy；空資料／篩選無結果→空狀態；載入失敗→錯誤或空狀態框裡的失敗句；
       欄位錯誤→aria-invalid 或欄位錯誤句；對話框／確認→對話框；抽屜→抽屜
   R18 統計卡與篩選結果：可點的統計卡（.stat-card、[data-wf-stat]、data-wf-filter-value 的卡）上寫的數字，
       要等於點下去後表格看得到的筆數（表格有分頁時比對「共 N 筆」，沒有分頁時數表格列；量不到就略過）
   R19 篩選下拉沒有欄位標籤：篩選列（.filter-bar、[data-wf-filter]）裡的下拉，要有看得到的欄位名稱
       （.filter-select__label、label，或選中文字寫成「狀態：全部」；只有 aria-label 看不到，不算）；只寫「全部」看不出篩的是哪一欄（1440 寬量）

   R20 狀態頁顯示條件：頁名是篩選無結果、空資料、載入中、載入失敗的狀態頁，直接開時資料表格（.data-table、data-wf-table）
       與 data-wf-row 不得看得到資料列
       （預設列表疊在狀態上面＝data-show-when 寫錯）；任何狀態頁的空狀態、失敗說明叫人點「某按鈕」時，
       該按鈕在這個狀態要看得到
   R21 提示句加色塊：頁內提示句、錯誤句（.notice、role=alert 這類）不加底色；抽屜、對話框、表單裡的提示
       不用帶底色的通知橫幅（.banner），改用頁內提示句（規則見 shared/線框視覺基本盤.md「頁內提示句」）
   R22 狀態只靠圓點：表格列裡 12px 以下的圓點（含 ::before／::after 畫的），旁邊沒有文字說明是什麼狀態
   R23 原生檔案控制項：畫面上看得到瀏覽器原生的「選擇檔案」控制項（input type=file 要藏起來，用上傳元件的按鈕觸發）
   R24 骨架沒有灰條：載入骨架（.skeleton）量起來寬不到 8px 或高不到 4px（寫成行內元素時灰條畫不出來；放不下灰條的窄欄不算）
   R25 新增抽屜標題：頁首「新增／建立」按鈕打開的抽屜或對話框，標題寫「編輯」「修改」
       （同一個抽屜兼用時，標題寫 data-wf-title-new／data-wf-title-edit，proto.js 依開啟方式切換）

   提醒（不擋、列進交件說明）
   R26 表單送出鈕沒接線：頁面有表單送出鈕（type=submit）時，實際點下去 600ms 內要看得到載入中（.is-loading）
       或欄位錯誤（aria-invalid／欄位錯誤句）；兩者都沒有＝送出鈕沒有掛 WfProto.initForm（R14 不點送出鈕，由這條補）
   R27 同一流程主按鈕位置不一致：同一流程（AREAS 的 flow）各主頁碼的置底主按鈕（.scr__foot .btn--primary）
       getBoundingClientRect().top 去重（容差 0.6px）後多於 1 個值——各頁置底區高度不同、使用者的手要換位置

   這支只抓得到「機器量得出來」的問題；數字前後一致、按鈕依狀態變、空狀態文案這些仍要照
   skill 的交件前自檢逐條看。
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import os from "node:os";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

/* ---------- 參數 ---------- */
const argv = process.argv.slice(2);
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx >= 0 ? String(argv[onlyIdx + 1] || "").split(/[,，\s]+/).filter(Boolean) : [];
const posArgs = argv.filter((a, i) => !a.startsWith("--") && (onlyIdx < 0 || i !== onlyIdx + 1));
const root = posArgs[0] ? path.resolve(posArgs[0]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 在假的 window 裡執行專案的 JS 資料檔 */
function loadGlobal(file, globalName) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return null;
  const sandbox = { window: {}, console: { error() {}, log() {} } };
  try { vm.runInNewContext(fs.readFileSync(full, "utf8"), sandbox, { filename: file }); } catch { return null; }
  return sandbox.window[globalName] || null;
}
const config = loadGlobal("wireframe.config.js", "WfConfig") || {};
const map = loadGlobal("assets/page-map.js", "WfPageMap");
if (!map) {
  console.error(`✗ 讀不到 ${path.join(root, "assets/page-map.js")}（先跑 node scripts/check.mjs 修好登錄表）`);
  process.exit(2);
}
const PAGES = map.PAGES || {};
const CLIENT = config.visualMode === "client"; // 元件稿模式：R5 改查客戶危險色、R6 只提醒
const ROLES = Array.isArray(map.ROLES) ? map.ROLES : [];
const baseOf = (c) => String(c).replace(/-\d+$/, "");
const bulletText = (b) => (b && typeof b === "object" ? String(b.text || "") : String(b || ""));

/** 本頁顯示規則（或前端互動）卡的「角色：」說明（主頁碼或狀態頁碼的卡都算；工程標註四區：前端驗證／前端互動／顯示規則／API） */
function roleNote(code) {
  for (const c of [code, baseOf(code)]) {
    const cards = (map.FEATURE_NOTES || {})[c] || [];
    const hit = cards.filter((k) => ["顯示規則", "前端互動"].includes(String(k.title || "").trim()))
      .flatMap((k) => (k.bullets || []).map(bulletText)).find((t) => /^角色[：:]/.test(t.trim()));
    if (hit) return hit;
  }
  return "";
}

/* ---------- 要檢查的頁碼與寬度 ---------- */
const targets = Object.entries(PAGES)
  .filter(([c, p]) => p.kind !== "doc" && !p.unplanned && p.file && fs.existsSync(path.join(root, "pages", p.file)))
  .filter(([c]) => !only.length || only.includes(c) || only.includes(baseOf(c)));
const isApp = (p) => (p.device || config.mode) === "app";
const widthsFor = (p) => (isApp(p) ? [{ w: 390, h: 844, label: "手機" }] : [{ w: 1440, h: 900, label: "桌機" }, { w: 900, h: 900, label: "平板" }, { w: 420, h: 860, label: "手機" }]);

/* ---------- 找 Playwright 與瀏覽器（與 walk.mjs 相同順序） ---------- */
function findPlaywright() {
  const bases = [process.env.WF_PLAYWRIGHT, process.cwd(), root].filter(Boolean);
  try { bases.push(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()); } catch {}
  for (const base of bases) {
    const req = createRequire(path.join(path.resolve(base), "_render_.js"));
    for (const name of ["playwright", "playwright-core"]) {
      try { return req(fs.existsSync(path.join(base, "package.json")) && path.basename(base).startsWith("playwright") ? base : name); } catch {}
    }
  }
  return null;
}
function browserCandidates() {
  const list = [];
  if (process.env.WF_CHROME) list.push(process.env.WF_CHROME);
  for (const cache of [path.join(os.homedir(), "Library/Caches/ms-playwright"), path.join(os.homedir(), ".cache/ms-playwright")]) {
    if (!fs.existsSync(cache)) continue;
    fs.readdirSync(cache).filter((d) => /^chromium/.test(d)).sort().reverse().forEach((d) => {
      [
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chrome-linux/chrome",
        "chrome-linux64/chrome",
        "chrome-headless-shell-mac-arm64/chrome-headless-shell",
        "chrome-headless-shell-linux64/chrome-headless-shell",
      ].forEach((p) => list.push(path.join(cache, d, p)));
    });
  }
  list.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser");
  return list.filter((p) => fs.existsSync(p));
}

/* ============================================================
   在頁面裡執行的量測（回傳 [{ rule, msg }]）
   ============================================================ */
function audit(opts) {
  const out = [];
  const W = window.innerWidth;
  const add = (rule, msg) => out.push({ rule, msg });
  const desc = (el) => {
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const txt = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 18);
    return `<${el.tagName.toLowerCase()}${cls}>${txt ? "「" + txt + "」" : ""}`;
  };
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return false; // 1px 的「螢幕閱讀器專用」元素不算看得到
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(cs.clip) || cs.clipPath === "inset(50%)") return false; // 被裁成看不到
      if (cs.position === "absolute" || cs.position === "fixed") break;
    }
    return true;
  };
  const ownText = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, "");
  const all = Array.from(document.body.querySelectorAll("*")).filter((el) => !["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "BR"].includes(el.tagName) && visible(el));

  /* ---- 顏色工具 ---- */
  const parseColors = (s) => (String(s).match(/rgba?\([^)]*\)/g) || []).map((c) => {
    const n = c.replace(/rgba?\(|\)/g, "").split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1, raw: c };
  });
  const near = (a, b) => !!a && !!b && Math.abs(a.r - b.r) <= 6 && Math.abs(a.g - b.g) <= 6 && Math.abs(a.b - b.b) <= 6;
  const chroma = (c) => c.a > 0.1 && Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 24;
  const isRed = (c) => {
    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    if (max - min < 24 || max !== c.r) return false;
    let h = c.g >= c.b ? (60 * (c.g - c.b)) / (max - min) : 360 + (60 * (c.g - c.b)) / (max - min);
    return h <= 25 || h >= 335;
  };
  const DANGER = /刪除|移除|停用|作廢|撤銷|註銷|清空|永久|放棄|解除|封鎖|終止|退訂|取消訂單|取消訂閱|取消預約|取消訂位|登出|重設/;
  const ERRWORD = /請|錯誤|失敗|不正確|不符|無效|過期|不得|不能|無法|須|必須|至少|最多|超過|不足|已被|重複|格式|額滿|已滿|不可|沒有權限|無權限|找不到|未填|未選|修正/;
  const CONTROL = "input,select,textarea,[contenteditable=''],[contenteditable='true'],[role=textbox],[role=combobox]";
  const redText = (el) => { const c = parseColors(getComputedStyle(el).color)[0]; return c && isRed(c); };
  const describedByInvalid = (el) => !!el.id && !!document.querySelector(`[aria-invalid="true"][aria-describedby~="${CSS.escape(el.id)}"],[aria-invalid="true"][aria-errormessage="${CSS.escape(el.id)}"]`);
  /** 往上找 4 層，看同一欄位裡有沒有看得到的錯誤句 */
  const fieldHasError = (el) => {
    let p = el;
    for (let i = 0; i < 4 && p; i += 1, p = p.parentElement) {
      if (p.querySelector('[aria-invalid="true"]')) return true;
      const hit = Array.from(p.querySelectorAll("*")).some((t) => t !== el && visible(t) && ownText(t) && redText(t) && ERRWORD.test(t.innerText));
      if (hit) return true;
    }
    return false;
  };
  function redAllowed(el, part) {
    const act = el.closest("button,[role=button],[role=menuitem],a");
    if (act && DANGER.test(act.innerText || act.getAttribute("aria-label") || "")) return true; // 危險動作
    if (part === "text") {
      if (el.closest('[role=alert],[aria-live="assertive"]') || describedByInvalid(el)) return true;
      if (ERRWORD.test(el.innerText || "")) return true; // 錯誤句
      return false;
    }
    // 框線、底色、陰影：錯誤框——本身或同一欄位裡的輸入元件 aria-invalid，或同一欄位裡看得到錯誤句
    const ctl = el.matches(CONTROL) ? el : el.querySelector(CONTROL);
    if (ctl && ctl.getAttribute("aria-invalid") === "true") return true;
    if (el.closest('[role=alert]')) return true;
    return fieldHasError(el);
  }

  /* ---- R2 水平溢出 ---- */
  const scrollW = document.documentElement.scrollWidth;
  const scrollerOf = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll") return { el: p, scroll: true };
      if (ox === "hidden" || ox === "clip") return { el: p, scroll: false };
    }
    return null;
  };
  if (scrollW > W + 1) {
    const offenders = all.filter((el) => el.getBoundingClientRect().right > W + 1 && !scrollerOf(el) && getComputedStyle(el).position !== "fixed")
      .filter((el, i, arr) => !arr.some((o) => o !== el && o.contains(el))).slice(0, 3).map(desc);
    add("R2", `整頁橫向溢出 ${scrollW - W}px（頁寬 ${scrollW}／畫面 ${W}）${offenders.length ? "：" + offenders.join("、") : ""}`);
  }

  /* ---- R3 一字一行 ---- */
  const squeezed = [];
  for (const el of all) {
    const t = ownText(el);
    if (t.length < 2 || !/[一-鿿A-Za-z]/.test(t)) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 16;
    const lh = parseFloat(cs.lineHeight) || fs * 1.4;
    const r = el.getBoundingClientRect();
    const inner = r.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (r.height >= lh * 1.9 && inner < fs * 1.9 && cs.writingMode.startsWith("horizontal")) squeezed.push(desc(el));
  }
  if (squeezed.length) add("R3", `文字被擠成一字一行 ${squeezed.length} 處：${[...new Set(squeezed)].slice(0, 4).join("、")}`);

  /* ---- R4 列尾操作看不到 ---- */
  const hiddenActs = [];
  document.querySelectorAll("tbody tr").forEach((tr) => {
    if (!visible(tr)) return;
    tr.querySelectorAll("button,a,[role=button]").forEach((b) => {
      if (!visible(b)) return;
      const r = b.getBoundingClientRect();
      const sc = scrollerOf(b);
      const clipRight = sc ? Math.min(W, sc.el.getBoundingClientRect().right) : W;
      if (r.right <= clipRight + 1) return;
      if (W >= 1100 || !sc || !sc.scroll) hiddenActs.push(desc(b)); // 桌機寬要不捲動就看得到；較窄時放在可橫捲的表格裡可以
    });
  });
  if (hiddenActs.length) add("R4", `表格列上的操作超出可視範圍 ${hiddenActs.length} 個${W >= 1100 ? "（桌機寬要不橫捲就看得到；欄位太多先刪次要欄或收進詳情）" : ""}：${[...new Set(hiddenActs)].slice(0, 3).join("、")}`);

  /* ---- R5 紅色與非灰階（元件稿：客戶危險色的用途） ---- */
  const redBad = new Set();
  const colorBad = new Set();
  // 元件稿：客戶危險色＝:root 的 --wf-color-error 算出來的顏色
  let danger = null;
  if (opts.client) {
    const probe = document.createElement("span");
    probe.style.color = "var(--wf-color-error)";
    document.body.appendChild(probe);
    danger = parseColors(getComputedStyle(probe).color)[0] || null;
    probe.remove();
  }
  for (const el of all) {
    const cs = getComputedStyle(el);
    const parts = [];
    if (ownText(el)) parts.push(["text", cs.color]);
    parts.push(["fill", cs.backgroundColor]);
    ["Top", "Right", "Bottom", "Left"].forEach((s) => { if (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none") parts.push(["frame", cs[`border${s}Color`]]); });
    if (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== "none") parts.push(["frame", cs.outlineColor]);
    if (cs.boxShadow && cs.boxShadow !== "none") parts.push(["frame", cs.boxShadow]);
    if (el instanceof SVGElement) { if (cs.fill && cs.fill !== "none") parts.push(["text", cs.fill]); if (cs.stroke && cs.stroke !== "none") parts.push(["text", cs.stroke]); }
    for (const [part, val] of parts) {
      for (const c of parseColors(val)) {
        if (opts.client) {
          // 元件稿：只看客戶危險色用在哪裡，品牌色與其他顏色不擋
          if (c.a > 0.1 && near(c, danger) && !redAllowed(el, part)) redBad.add(`${desc(el)}（${part === "text" ? "文字" : part === "fill" ? "底色" : "框線／陰影"}）`);
          continue;
        }
        if (!chroma(c)) continue;
        if (!isRed(c)) { colorBad.add(`${desc(el)} ${c.raw}`); continue; }
        if (!redAllowed(el, part)) redBad.add(`${desc(el)}（${part === "text" ? "文字" : part === "fill" ? "底色" : "框線／陰影"}）`);
      }
    }
  }
  if (redBad.size) add("R5", `${opts.client ? "客戶危險色" : "紅色"}用在錯誤與危險動作以外 ${redBad.size} 處：${[...redBad].slice(0, 4).join("、")}`);
  if (colorBad.size) add("R5", `出現灰階以外的顏色 ${colorBad.size} 處：${[...colorBad].slice(0, 3).join("、")}`);

  /* ---- R6 字級 ---- */
  const TEXTLIKE = /^(|text|search|email|tel|url|password|number|date|time|datetime-local|month)$/i;
  const tiny = new Set();
  const small = new Set();
  const MUST14 = "button,[role=button],[role=menuitem],a,input,select,textarea,label,legend,th,td,[role=alert]";
  for (const el of all) {
    if (el.tagName === "INPUT" && !TEXTLIKE.test(el.getAttribute("type") || "")) continue; // 勾選框、選項圈沒有字
    const isCtl = el.matches("input,select,textarea");
    if (!ownText(el) && !isCtl) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 12) tiny.add(`${desc(el)} ${px}px`);
    else if (px < 14 && (el.matches(MUST14) || (el.parentElement && el.parentElement.matches(MUST14) && el.tagName === "SPAN" && !el.className))) small.add(`${desc(el)} ${px}px`);
  }
  if (tiny.size) add("R6", `文字小於 12px ${tiny.size} 處：${[...tiny].slice(0, 4).join("、")}`);
  if (small.size) add("R6", `按鈕、連結、輸入框、欄位標籤、表格內容、錯誤句小於 14px ${small.size} 處：${[...small].slice(0, 4).join("、")}`);

  /* ---- R7 原生樣式、R8 尺寸異常 ---- */
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const pristineCache = {};
  const pristine = (el) => {
    const key = el.tagName + ":" + (el.getAttribute("type") || "");
    if (!pristineCache[key]) {
      const p = document.createElement(el.tagName);
      if (el.getAttribute("type")) p.setAttribute("type", el.getAttribute("type"));
      if (el.tagName === "SELECT") p.innerHTML = "<option>x</option>";
      shadow.appendChild(p);
      const cs = getComputedStyle(p);
      pristineCache[key] = { app: cs.appearance, border: cs.borderTopStyle + cs.borderTopWidth + cs.borderTopColor, bg: cs.backgroundColor };
    }
    return pristineCache[key];
  };
  const native = new Set();
  const huge = new Set();
  for (const el of all.filter((e) => e.matches("button,select,input,textarea"))) {
    if (el.tagName === "INPUT" && !TEXTLIKE.test(el.getAttribute("type") || "")) continue;
    const cs = getComputedStyle(el);
    const p = pristine(el);
    if (cs.appearance !== "none" && cs.appearance === p.app && cs.borderTopStyle + cs.borderTopWidth + cs.borderTopColor === p.border && cs.backgroundColor === p.bg) native.add(desc(el));
    if (el.matches("input,select") && el.getBoundingClientRect().height > 72) huge.add(`${desc(el)} 高 ${Math.round(el.getBoundingClientRect().height)}px`);
  }
  host.remove();
  if (native.size) add("R7", `沒有套到元件樣式（瀏覽器原生外觀）${native.size} 個：${[...native].slice(0, 4).join("、")}`);
  if (huge.size) add("R8", `元件高度異常：${[...huge].slice(0, 3).join("、")}`);

  /* ---- R9 底部按鈕超過 3 顆 ---- */
  document.querySelectorAll('[class*="__foot"],[class*="__acts"],[class*="__actions"],[class*="__footer"]').forEach((foot) => {
    if (!visible(foot) || !foot.closest('[role=dialog],[role=alertdialog],[class*="drawer"],[class*="sheet"],[class*="dialog"],[class*="modal"],[class*="alert"]')) return;
    if (foot.parentElement && foot.parentElement.closest('[class*="__foot"],[class*="__acts"],[class*="__actions"],[class*="__footer"]')) return; // 只算最外層的底部
    const n = Array.from(foot.querySelectorAll("button,[role=button],a.btn")).filter(visible).length;
    if (n > 3) add("R9", `${desc(foot)} 底部同時有 ${n} 顆按鈕（上限 3 顆；依該筆狀態只顯示能做的動作，其餘收進「⋯」）`);
  });

  /* ---- R10 一打開就有輕提示（主頁碼與狀態頁碼都查；專門展示輕提示的狀態頁除外） ---- */
  if (opts.isMain || !/輕提示|成功|toast/i.test(opts.label || "")) {
    const toasts = Array.from(document.querySelectorAll('.toast,[class*="toast"]')).filter(visible).filter((t) => (t.innerText || "").trim());
    if (toasts.length) add("R10", opts.isMain
      ? `預設狀態一打開就有輕提示：${toasts.slice(0, 2).map(desc).join("、")}（輕提示只在操作後出現，要展示就另開狀態頁）`
      : `直接開狀態頁就跳輕提示：${toasts.slice(0, 2).map(desc).join("、")}（使用者沒操作就不該出現；狀態頁的 apply 用 proto.js 套用頁碼時會自動靜音，自己用 setTimeout 延後呼叫的改成直接設定畫面）`);
  }

  /* ---- R11 空狀態：同一個動作不重複放實心按鈕 ---- */
  const solid = (b) => { const c = parseColors(getComputedStyle(b).backgroundColor)[0]; return c && c.a > 0.5 && (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) < 110; };
  const btnText = (b) => (b.innerText || "").trim().replace(/\s+/g, "");
  const empties = Array.from(document.querySelectorAll('.empty,[class*="empty-state"],[class*="__empty"]')).filter(visible);
  if (empties.length) {
    const solids = Array.from(document.querySelectorAll("button,a,[role=button]")).filter((b) => visible(b) && solid(b) && !b.closest("header,[role=banner]"));
    const dup = solids.map(btnText).filter((t, i, arr) => t && arr.indexOf(t) !== i);
    if (dup.length) add("R11", `空狀態畫面有兩顆「${dup[0]}」實心按鈕（頁首已有的動作，空狀態不再放一顆；需要時說明句帶到頁首按鈕即可）`);
    empties.forEach((box) => {
      const n = Array.from(box.querySelectorAll("button,a,[role=button]")).filter((b) => visible(b) && solid(b)).length;
      if (n > 1) add("R11", `${desc(box)} 裡有 ${n} 顆實心按鈕（空狀態最多一顆主按鈕）`);
    });
  }

  /* ---- R12 筆數矛盾 ---- */
  const counts = {};
  (document.body.innerText || "").replace(/共\s*([\d,，]+)\s*(筆|項|則|件|位|篇|張)/g, (_, n, unit) => { (counts[unit] = counts[unit] || new Set()).add(n.replace(/[,，]/g, "")); return ""; });
  Object.entries(counts).forEach(([unit, set]) => { if (set.size > 1) add("R12", `同一畫面「共 N ${unit}」數字不一致：${[...set].join("、")}`); });

  /* ---- R15 首屏資料列數、R16 主要動作位置（Web 後台頁，1440×900 量） ---- */
  if (opts.layout && document.querySelector(".site--admin")) {
    if (opts.isMain) {
      const H = window.innerHeight;
      document.querySelectorAll("table").forEach((t) => {
        const rowsAll = Array.from(t.querySelectorAll("tbody tr")).filter(visible).filter((r) => !r.querySelector(".empty"));
        if (rowsAll.length < 5) return;
        const seen = rowsAll.filter((r) => r.getBoundingClientRect().bottom <= H + 1).length;
        if (seen < 5) add("R15", `1440×900 首屏只看得到 ${seen} 列資料（至少 5 列）：表格上方的區塊太高，先精簡摘要、說明或篩選列（排版模式庫 Web-後台列表頁）`);
      });
    }
    const h1 = Array.from(document.querySelectorAll("h1")).find(visible);
    if (h1) {
      let row = h1.parentElement;
      for (let i = 0; i < 3 && row && !row.querySelector(".btn--primary"); i += 1) row = row.parentElement;
      const btns = row ? Array.from(row.querySelectorAll("button,a.btn,[role=button]")).filter(visible) : [];
      const primary = btns.find((b) => b.matches(".btn--primary"));
      if (primary) {
        const rr = row.getBoundingClientRect(), pr = primary.getBoundingClientRect();
        const others = btns.filter((b) => b !== primary && !b.closest("nav") && Math.abs(b.getBoundingClientRect().top - pr.top) < pr.height);
        if (pr.left + pr.width / 2 < rr.left + rr.width / 2) add("R16", `主要動作 ${desc(primary)} 不在標題列右半邊（放標題列右上）`);
        else if (others.some((b) => b.getBoundingClientRect().right > pr.right + 1)) add("R16", `主要動作 ${desc(primary)} 不是標題列最右邊的按鈕（實心主鈕放最右，次要動作排在它左邊）`);
      }
    }
  }

  /* ---- R21 提示句加色塊（每個頁碼量一次） ---- */
  if (opts.first) {
    const bgOf = (el) => parseColors(getComputedStyle(el).backgroundColor)[0];
    const backdrop = (el) => { // 往上找第一個有底色的祖先（找不到＝白底）
      for (let p = el.parentElement; p; p = p.parentElement) { const c = bgOf(p); if (c && c.a > 0.1) return c; }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const NOTICE = '.notice,[class*="notice"],[role=alert],[class*="banner"],[class*="callout"]';
    const OVERLAY = '[role=dialog],[role=alertdialog],[class*="drawer"],[class*="dialog"],[class*="modal"],[class*="sheet"],form';
    const blocks = new Set();
    document.querySelectorAll(NOTICE).forEach((el) => {
      if (!visible(el) || el.matches('.toast,[class*="toast"],[role=dialog],[role=alertdialog]') || /(^|\s)\S*(layer|__icon|__body|__title|__desc|__acts|__close)(\s|$)/.test(typeof el.className === "string" ? el.className : "")) return;
      if (el.parentElement && el.parentElement.closest(NOTICE)) return; // 只看最外層
      const c = bgOf(el);
      if (!c || c.a <= 0.1 || near(c, backdrop(el))) return; // 沒有自己的底色
      const isBanner = /(^|\s)banner/.test(String(el.className));
      if (isBanner && !el.closest(OVERLAY)) return; // 頁面上方的通知橫幅照元件篇可以有淡底
      blocks.add(isBanner ? `${desc(el)}（抽屜、對話框或表單裡的通知橫幅）` : desc(el));
    });
    if (blocks.size) add("R21", `提示句做成帶底色的色塊 ${blocks.size} 處：${[...blocks].slice(0, 3).join("、")}（頁內提示句與錯誤句只是一句字＋句尾文字按鈕，不加外框、底色、圖示；浮層與表單裡的衝突、失敗提示用 .notice／.notice--error）`);
  }

  /* ---- R22 狀態只靠圓點（每個頁碼量一次） ---- */
  if (opts.first) {
    const dots = new Set();
    const px = (v) => parseFloat(v) || 0;
    const isDot = (cs, w, h) => {
      if (w < 4 || h < 4 || w > 12 || h > 12) return false;
      const rad = String(cs.borderTopLeftRadius);
      const round = rad.endsWith("%") ? px(rad) >= 40 : px(rad) >= Math.min(w, h) * 0.4;
      const fill = parseColors(cs.backgroundColor)[0];
      const ring = px(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none";
      return round && ((fill && fill.a > 0.1) || ring);
    };
    const textNear = (host) => {
      if (ownText(host) || host.getAttribute("aria-label") || host.getAttribute("title")) return true;
      const par = host.parentElement;
      if (par && ownText(par)) return true; // 例：<span class="status"><i class="dot"></i>超時</span>
      return [host.previousElementSibling, host.nextElementSibling].some((s) => s && visible(s) && !s.matches("a,button,[role=button]") && (s.innerText || "").trim().length > 0 && (s.innerText || "").trim().length <= 12);
    };
    document.querySelectorAll("tbody tr, [data-wf-row]").forEach((row) => {
      if (!visible(row)) return;
      row.querySelectorAll("*").forEach((el) => {
        if (el.matches("input,label,svg,svg *,.skeleton,[class*=check],[class*=radio],[class*=avatar]") || el.closest("label")) return;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return;
        const r = el.getBoundingClientRect();
        let hit = isDot(cs, r.width, r.height) && !el.children.length;
        ["::before", "::after"].forEach((pe) => {
          const ps = getComputedStyle(el, pe);
          if (!hit && ps.content && ps.content !== "none" && ps.display !== "none" && isDot(ps, px(ps.width), px(ps.height))) hit = true;
        });
        if (hit && !textNear(el)) dots.add(desc(el.parentElement || el));
      });
    });
    if (dots.size) add("R22", `狀態只用圓點表示、旁邊沒有文字 ${dots.size} 處：${[...dots].slice(0, 3).join("、")}（看不出顏色的人與灰階線框都分不出來；圓點旁加狀態文字，例「超時」，或改用帶字的標籤）`);
  }

  /* ---- R23 原生檔案控制項 ---- */
  const files = Array.from(document.querySelectorAll('input[type="file"]')).filter(visible);
  if (files.length) add("R23", `看得到瀏覽器原生的檔案控制項 ${files.length} 個：${files.slice(0, 2).map(desc).join("、")}（input type=file 加 hidden，用上傳元件的「選擇檔案」按鈕觸發，寫法見元件篇〈拖放上傳〉）`);

  /* ---- R24 骨架沒有灰條（每個頁碼量一次） ---- */
  if (opts.first) {
    const flat = [];
    document.querySelectorAll('[class*="skeleton"]').forEach((el) => {
      const cls = typeof el.className === "string" ? el.className : "";
      if (!/(^|\s)skeleton(\s|$|--)/.test(cls) || !el.parentElement || !visible(el.parentElement)) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || el.closest("[hidden],template")) return;
      const r = el.getBoundingClientRect();
      const ps = getComputedStyle(el.parentElement);
      const room = el.parentElement.getBoundingClientRect().width - (parseFloat(ps.paddingLeft) || 0) - (parseFloat(ps.paddingRight) || 0);
      if (room < 16) return; // 放不下灰條的窄欄（勾選欄、操作欄）不算
      if (r.width < 8 || r.height < 4) flat.push(desc(el.parentElement));
    });
    if (flat.length) add("R24", `載入骨架量不到灰條 ${flat.length} 個（寬不到 8px 或高不到 4px）：${[...new Set(flat)].slice(0, 3).join("、")}（骨架寫成 .skeleton 區塊元素並給寬高；用 data-wf-table 的 setState("loading") 會自動產生骨架列）`);
  }

  /* ---- R19 篩選下拉要有欄位標籤 ---- */
  const checkedCtl = new Set(); // 同一顆下拉只報一次（外層篩選列可能被多個選擇器同時選到）
  if (opts.layout) document.querySelectorAll('.filter-bar,[data-wf-filter]').forEach((bar) => {
    if (!visible(bar)) return;
    bar.querySelectorAll('select,[role=combobox],[aria-haspopup="listbox"]').forEach((ctl) => {
      if (!visible(ctl) || checkedCtl.has(ctl)) return;
      checkedCtl.add(ctl);
      // aria-label 看不到，不算；aria-labelledby 指到看得到的字才算
      const lb = (ctl.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => id && document.getElementById(id)).filter(Boolean);
      if (lb.some((l) => l !== ctl && !l.classList.contains("filter-select__value") && visible(l) && (l.innerText || "").trim())) return;
      if (ctl.id && document.querySelector(`label[for="${CSS.escape(ctl.id)}"]`)) return;
      if (ctl.closest("label")) return;
      // 外層欄位有看得到的標籤字（.field__label、label、legend）
      // 下拉本身或外層欄位有看得到的標籤字（.filter-select__label、.field__label、label、legend）
      if (Array.from(ctl.querySelectorAll('[class*="label"]')).some((l) => visible(l) && (l.innerText || "").trim())) return;
      const field = ctl.parentElement && ctl.parentElement.closest('.field,fieldset');
      if (field && !field.contains(bar) && Array.from(field.querySelectorAll('label,legend,[class*="label"]')).some((l) => visible(l) && (l.innerText || "").trim())) return;
      const shown = ctl.tagName === "SELECT" ? (ctl.selectedOptions[0] ? ctl.selectedOptions[0].textContent : "") : ctl.innerText || "";
      const t = shown.trim().replace(/\s+/g, "");
      if (/[：:]/.test(t)) return; // 「狀態：全部」自帶欄位名
      if (/^(全部|所有|不限)?$/.test(t)) add("R19", `篩選列的下拉 ${desc(ctl)} 只顯示「${t || "（空白）"}」，看不出篩的是哪一欄；照元件示範加欄位名稱 <span class="filter-select__label">狀態</span>（原生下拉用 label）`);
    });
  });

  return out;
}

/** 狀態頁應有的元素：依頁名判斷狀態種類，回傳 { kind, ok }；頁名看不出種類回傳 null */
function stateCheck(label) {
  const vis = (el) => el.getClientRects().length && (!el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  const any = (sel, textRe) => Array.from(document.querySelectorAll(sel)).some((el) => vis(el) && (!textRe || textRe.test(el.innerText || "")));
  const L = String(label || "");
  const EMPTY = '.empty,[class*="empty"],[data-wf-state="empty"],[data-wf-state="filtered"]';
  if (/載入中|讀取中|載入更多中/.test(L)) return { kind: "載入中（骨架或 aria-busy）", ok: any('[aria-busy="true"],.skeleton,[class*="skeleton"],[class*="spinner"],[data-wf-state="loading"]') };
  if (/載入失敗|讀取失敗|連線失敗|無法載入|伺服器錯誤|系統錯誤|網路錯誤/.test(L)) return { kind: "載入失敗（失敗說明）", ok: any(`[data-wf-state="error"],[role=alert],${EMPTY},[class*="error"]`, /失敗|錯誤|無法|再試/) };
  if (/篩選無結果|搜尋無結果|查無|無結果|沒有符合/.test(L)) return { kind: "篩選無結果（空狀態）", ok: any(EMPTY) };
  if (/空資料|無資料|沒有資料|尚無|還沒有|空狀態|空清單|空白/.test(L)) return { kind: "空資料（空狀態）", ok: any(EMPTY) };
  if (/欄位錯誤|驗證錯誤|格式錯誤|必填未填|錯誤提示/.test(L)) return { kind: "欄位錯誤（aria-invalid 或欄位錯誤句）", ok: any('[aria-invalid="true"],.is-error,[class*="field__error"],[class*="error-summary"]') };
  if (/對話框|確認$|確認視窗/.test(L)) return { kind: "對話框", ok: any('[role=dialog],[role=alertdialog],[class*="dialog"],[class*="alert"],[class*="sheet"],[class*="modal"]') };
  if (/抽屜/.test(L)) return { kind: "抽屜", ok: any('[class*="drawer"],[role=dialog]') };
  return null;
}

/** R20 狀態頁顯示條件：回傳 [訊息…]——該是空的狀態看得到資料列、空狀態文案提到的按鈕看不到 */
function stateShowCheck(label) {
  const out = [];
  const vis = (el) => {
    if (!el.getClientRects().length) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const L = String(label || "");
  const NO_ROWS = /篩選無結果|搜尋無結果|查無|無結果|沒有符合|空資料|無資料|沒有資料|尚無|還沒有|空狀態|空清單|載入中|讀取中|載入失敗|讀取失敗|連線失敗|無法載入|伺服器錯誤|系統錯誤|網路錯誤/;
  if (NO_ROWS.test(L)) {
    const SKIP = '.empty,[class*="empty"],[class*="skeleton"],[aria-busy="true"],[role=alert],[class*="error"],[data-wf-state]';
    // 只看資料表格（.data-table、data-wf-table）與資料列（data-wf-row）；方案比較表這類固定內容不算
    const rows = Array.from(document.querySelectorAll(".data-table tbody tr, [data-wf-table] tbody tr, [data-wf-row]")).filter((r) => {
      if (!vis(r) || r.closest('.table__state,.table__skeleton,[aria-busy="true"],template') || r.querySelector(SKIP) || r.matches(SKIP)) return false;
      return (r.innerText || "").trim().length > 0;
    });
    if (rows.length) out.push(`「${L}」畫面上還看得到 ${rows.length} 列資料（例：「${(rows[0].innerText || "").trim().replace(/\s+/g, " ").slice(0, 24)}」）——預設列表疊在狀態上面，檢查 data-show-when 是否多寫了這個頁碼`);
  }
  const boxes = Array.from(document.querySelectorAll('.empty,[class*="empty-state"],[class*="__empty"],[data-wf-state="empty"],[data-wf-state="filtered"],[data-wf-state="error"]')).filter(vis);
  const clickables = Array.from(document.querySelectorAll("button,a,[role=button],[role=menuitem]")).filter(vis)
    .map((b) => ((b.innerText || "") + " " + (b.getAttribute("aria-label") || "")).replace(/\s+/g, ""));
  const asked = new Set();
  boxes.forEach((box) => {
    (box.innerText || "").replace(/(?:點選|點擊|點|按下|按|從|用|使用|透過)[^「『\n]{0,8}[「『]([^」』]{1,10})[」』]/g, (_, name) => { asked.add(name.replace(/\s+/g, "")); return ""; });
  });
  asked.forEach((name) => {
    if (!clickables.some((t) => t.includes(name))) out.push(`「${L}」的說明叫人點「${name}」，但這個狀態看不到「${name}」按鈕（按鈕依狀態藏起來時，說明句也跟著改，或讓按鈕在這個狀態看得到）`);
  });
  return out;
}

/** R25：開新增抽屜後讀標題（回傳標題文字；沒開出浮層回傳 null） */
async function newDrawerTitle(key) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = document.querySelector(`[data-wf-r25="${key}"]`);
  if (!el) return null;
  const vis = (x) => x.getClientRects().length && (!x.checkVisibility || x.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  const LAYER = '[role=dialog],[role=alertdialog],[class*="drawer"],[class*="dialog"],[class*="sheet"],[class*="modal"]';
  const shown = () => Array.from(document.querySelectorAll(LAYER)).filter((d) => vis(d) && !d.closest(".toast") && d.getBoundingClientRect().width > 200);
  const before = new Set(shown());
  el.click();
  await wait(450);
  // 點了以後才出現的浮層，依文件順序（外層在前）找第一個有標題的
  for (const layer of shown().filter((d) => !before.has(d))) {
    const head = Array.from(layer.querySelectorAll('h1,h2,h3,[class*="__title"]')).find((h) => vis(h) && (h.innerText || "").trim());
    if (head) return (head.innerText || "").trim().replace(/\s+/g, " ");
  }
  return null;
}

/** 畫面指紋：看得到的文字＋看得到的按鈕數（比較角色切換前後） */
function fingerprint() {
  const vis = (el) => el.getClientRects().length && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true }));
  const btns = Array.from(document.querySelectorAll("button,a,input,select,[role=button]")).filter(vis).length;
  return `${btns}|${(document.body.innerText || "").replace(/\s+/g, " ")}`;
}

/** 列出看得到的按鈕與選單項目（seen＝已點過的樣子，不重複），回傳 { key, label, sig }；用 data-wf-rc 標記 */
function listClickables(seenList) {
  const seen = new Set(seenList || []);
  const vis = (el) => el.getClientRects().length && (!el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  const out = [];
  let i = 0;
  document.querySelectorAll("button,[role=button],[role=menuitem],a[href]").forEach((el) => {
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return;
    if (el.closest("[data-wf-role-hidden],template,header,[role=banner]")) return; // 全站頂列不屬於本頁操作
    if (el.matches('[aria-current="page"],[aria-current="true"],[aria-selected="true"],[aria-pressed="true"]')) return; // 已在目前這一項
    if (el.matches("[data-wf-close]") || el.type === "submit") return; // 關閉鈕、表單送出另由走查驗
    if (el.tagName === "A" && el.closest("[role=menu],[class*=\"popmenu\"]") && !el.matches("[role=menuitem]")) return; // 選單裡的連結以選單項目點
    if (!vis(el) && !el.closest('[role=menu],[class*="popmenu"]')) return; // 看不到的不點（選單項目除外：選單要先打開才看得到）
    const label = (el.innerText || el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
    if (!label) return;
    const sig = `${el.className}|${label}|${Array.from(el.attributes).filter((a) => a.name.startsWith("data-")).map((a) => a.name).sort().join(",")}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    i += 1;
    el.setAttribute("data-wf-rc", String(i));
    out.push({ key: String(i), label: label.slice(0, 20), sig });
  });
  return out;
}

/** 點一下指定按鈕，回傳畫面有沒有反應：點之前與點之後的畫面（DOM）不同、送出換頁訊息給殼層、開檔案選擇器都算 */
async function clickAndWatch(key) {
  const el = document.querySelector(`[data-wf-rc="${key}"]`);
  if (!el) return true;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // 畫面快照：不算選單本身的開關與觸發鈕的 aria-expanded（選單打開又收起不是反應）
  const snapshot = () => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("[aria-expanded]").forEach((n) => n.removeAttribute("aria-expanded"));
    if (menu && menu.id) { const m = clone.querySelector(`#${CSS.escape(menu.id)}`); if (m) m.remove(); }
    return clone.outerHTML;
  };
  // 按鈕所在的選單容器：先用畫面上的觸發鈕把選單打開（選單裡的動作常要知道是從哪一列打開的）
  let menu = null;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (p.getAttribute("role") === "menu" || Array.from(p.classList).some((c) => /^(popmenu|menu|dropdown)$/.test(c) || /(^|-)menu$/.test(c))) { menu = p; break; }
  }
  await wait(50);
  const before = snapshot(); // 選單還沒打開時的畫面：點了選單項目以後只是選單收起來＝沒反應
  if (menu && menu.id) {
    const vis = (t) => t.getClientRects().length && (!t.checkVisibility || t.checkVisibility({ visibilityProperty: true }));
    const trigger = Array.from(document.querySelectorAll(`[data-wf-popmenu="${CSS.escape(menu.id)}"],[aria-controls="${CSS.escape(menu.id)}"]`)).find(vis);
    if (trigger) { trigger.click(); await wait(200); }
  }
  let reacted = false;
  const navMsgs = () => (window.__wfMsgs || []).filter((m) => m && !["ready", "roles"].includes(m.wf)).length;
  const msgBefore = navMsgs();
  const origClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () { if (this.type === "file") reacted = true; else origClick.call(this); };
  const origOpen = window.open;
  window.open = function () { reacted = true; return null; }; // 開新分頁（流程外）也算反應
  const hashBefore = window.location.hash;
  try { el.click(); } catch { reacted = true; }
  await wait(400);
  HTMLInputElement.prototype.click = origClick;
  window.open = origOpen;
  // 只改了網址 #（例：href="#" 的連結）不算反應
  if (window.location.hash !== hashBefore) history.replaceState(null, "", window.location.pathname + window.location.search + hashBefore);
  return reacted || navMsgs() > msgBefore || snapshot() !== before;
}

/* ============================================================
   主程式
   ============================================================ */
const pwLib = findPlaywright();
if (!pwLib) {
  console.log("! 找不到 Playwright（playwright 或 playwright-core）：在專案資料夾執行 npm i -D playwright-core（並確認本機有 Google Chrome）後重跑；交件說明標「畫面未經機器檢查」");
  process.exit(2);
}
const { chromium } = pwLib;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const args = ["--allow-file-access-from-files"];
  let browser = null;
  try { browser = await chromium.launch({ headless: true, args }); } catch {
    for (const exe of browserCandidates()) {
      try { browser = await chromium.launch({ headless: true, args, executablePath: exe }); break; } catch {}
    }
  }
  if (!browser) {
    console.log("! 有 Playwright，但找不到可用的 Chromium／Chrome（安裝 Google Chrome，或設環境變數 WF_CHROME）；交件說明標「畫面未經機器檢查」");
    process.exit(2);
  }

  const findings = []; // { rule, where, msg }
  const urlOf = (file, code, extra = {}) => {
    const q = new URLSearchParams({ p: code, motion: "0", ...extra });
    return pathToFileURL(path.join(root, "pages", file)).href + "?" + q.toString();
  };
  async function open(file, code, vp, extra) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    // 假裝頁面放在殼層裡：換頁、返回、關閉會送訊息給殼層，這裡把訊息記下來（點了有沒有反應要看）
    await page.addInitScript(() => {
      const msgs = [];
      window.__wfMsgs = msgs;
      try { Object.defineProperty(window, "parent", { configurable: true, get: () => ({ postMessage: (m) => msgs.push(m) }) }); } catch {}
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).split("\n")[0]));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().split("\n")[0]); });
    await page.goto(urlOf(file, code, extra));
    await sleep(450);
    return { page, errors };
  }

  const RULE_NAMES = {
    R1: "主控台錯誤", R2: "水平溢出", R3: "一字一行", R4: "列尾操作看不到", R5: "紅色與非灰階的用途",
    R6: "字級", R7: "原生樣式（沒套到元件）", R8: "元件尺寸異常", R9: "底部按鈕超過 3 顆", R10: "一打開就有輕提示（主頁碼與狀態頁碼）",
    R11: "空狀態按鈕重複", R12: "筆數矛盾", R13: "角色切換沒作用", R14: "點了沒反應",
    R15: "首屏資料列數", R16: "主要動作位置", R17: "狀態頁打不開（直接開與預設畫面相同或缺該狀態元素）",
    R18: "統計卡數字與篩選結果", R19: "篩選下拉沒有欄位標籤", R20: "狀態頁顯示條件（該空的看得到資料列、說明提到的按鈕看不到）",
    R21: "提示句加色塊", R22: "狀態只靠圓點", R23: "原生檔案控制項", R24: "骨架沒有灰條", R25: "新增抽屜標題寫編輯",
    R26: "表單送出鈕沒接線（點了沒有載入中也沒有欄位錯誤）", R27: "同一流程主按鈕位置不一致",
  };
  const WARN_RULES = new Set(["R26", "R27"]); // 只提醒不擋
  if (CLIENT) RULE_NAMES.R5 = "客戶危險色的用途";

  for (const [code, item] of targets) {
    const isMain = !/-\d+$/.test(code);
    for (const [vi, vp] of widthsFor(item).entries()) {
      const { page, errors } = await open(item.file, code, vp);
      const res = await page.evaluate(audit, { isMain, client: CLIENT, layout: vp.w === 1440, first: vi === 0, label: String(item.label || "") });
      res.forEach((r) => findings.push({ rule: r.rule, where: `${code} ${vp.label} ${vp.w}`, msg: r.msg }));
      [...new Set(errors)].forEach((e) => findings.push({ rule: "R1", where: `${code} ${vp.label} ${vp.w}`, msg: e }));
      await page.close();
    }
  }

  // R17 狀態頁打不開：直接開每個狀態頁碼，畫面不可和主頁碼的預設畫面相同，且要看得到該狀態應有的元素
  {
    const mainPrint = {};
    for (const [code, item] of targets.filter(([c]) => /-\d+$/.test(c))) {
      const base = baseOf(code);
      const vp = widthsFor(item)[0];
      if (PAGES[base] && PAGES[base].file === item.file && mainPrint[base] === undefined) {
        const { page } = await open(item.file, base, vp);
        mainPrint[base] = await page.evaluate(fingerprint);
        await page.close();
      }
      const { page } = await open(item.file, code, vp);
      const print = await page.evaluate(fingerprint);
      const exp = await page.evaluate(stateCheck, String(item.label || ""));
      const show = await page.evaluate(stateShowCheck, String(item.label || ""));
      show.forEach((m) => findings.push({ rule: "R20", where: code, msg: m }));
      await page.close();
      if (mainPrint[base] !== undefined && print === mainPrint[base])
        findings.push({ rule: "R17", where: code, msg: `直接開 ${code}「${item.label}」看到的畫面和 ${base} 預設畫面完全相同——狀態沒有套用（頁面的 apply 要能在首次載入時切到這個狀態；只靠同頁換頁碼才正常不算）` });
      else if (exp && !exp.ok)
        findings.push({ rule: "R17", where: code, msg: `直接開 ${code}「${item.label}」看不到${exp.kind}` });
    }
  }

  // R18 統計卡與篩選結果：點統計卡後表格筆數要等於卡上的數字
  for (const [code, item] of targets.filter(([c]) => !/-\d+$/.test(c))) {
    const vp = widthsFor(item)[0];
    let { page } = await open(item.file, code, vp);
    const cards = await page.evaluate(() => {
      const vis = (el) => el.getClientRects().length && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true }));
      const out = [];
      document.querySelectorAll('.stat-card,[class*="stat-card"],[class*="stat__"],[data-wf-stat],[data-wf-filter-value]').forEach((el, i) => {
        const card = el.closest("button,a,[role=button],[data-wf-filter-value],[data-wf-stat]") || el;
        if (!vis(card) || card.hasAttribute("data-wf-r18")) return;
        if (!(card.matches("button,a,[role=button],[data-wf-filter-value],[data-wf-stat]"))) return; // 不能點的摘要數字不量
        const m = (card.innerText || "").replace(/[,，]/g, "").match(/(\d+)\s*(筆|件|張|則|單)?/);
        if (!m) return;
        card.setAttribute("data-wf-r18", String(i));
        out.push({ key: String(i), n: Number(m[1]), label: (card.innerText || "").trim().replace(/\s+/g, " ").slice(0, 20) });
      });
      return out;
    });
    for (const c of cards) {
      const got = await page.evaluate(async (key) => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const el = document.querySelector(`[data-wf-r18="${key}"]`);
        if (!el) return null;
        el.click();
        await wait(400);
        const vis = (x) => x.getClientRects().length && (!x.checkVisibility || x.checkVisibility({ visibilityProperty: true }));
        const tables = Array.from(document.querySelectorAll("table")).filter(vis);
        if (tables.length !== 1) return null; // 沒有表格或多張表：量不到
        const t = tables[0];
        const box = t.closest("[data-wf-table]");
        if (box && box._wfTable && typeof box._wfTable.matched === "function" && box._wfTable.state === "ready") return box._wfTable.matched().length;
        const total = (document.body.innerText || "").match(/共\s*([\d,，]+)\s*(筆|項|則|件|張)/);
        if (total) return Number(total[1].replace(/[,，]/g, ""));
        return Array.from(t.querySelectorAll("tbody tr")).filter((r) => vis(r) && !r.querySelector(".empty,[class*='empty']")).length;
      }, c.key).catch(() => null);
      if (got !== null && got !== c.n)
        findings.push({ rule: "R18", where: code, msg: `統計卡「${c.label}」寫 ${c.n}，點下去表格只有 ${got} 筆（示範資料要對得上：卡上的數字＝點下去的筆數；或把卡上數字改成示範資料實際的筆數）` });
      await page.close();
      ({ page } = await open(item.file, code, vp));
      await page.evaluate(() => {
        let i = 0;
        document.querySelectorAll('.stat-card,[class*="stat-card"],[class*="stat__"],[data-wf-stat],[data-wf-filter-value]').forEach((el, j) => {
          const card = el.closest("button,a,[role=button],[data-wf-filter-value],[data-wf-stat]") || el;
          if (!card.hasAttribute("data-wf-r18")) card.setAttribute("data-wf-r18", String(j));
          i += 1;
        });
      });
    }
    await page.close();
  }

  // R25 新增抽屜標題：頁首「新增／建立」鈕打開的抽屜或對話框，標題不可寫「編輯」「修改」
  for (const [code, item] of targets.filter(([c]) => !/-\d+$/.test(c))) {
    const vp = widthsFor(item)[0];
    let { page } = await open(item.file, code, vp);
    const keys = await page.evaluate(() => {
      const vis = (el) => el.getClientRects().length && (!el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
      const out = [];
      document.querySelectorAll("button,a,[role=button]").forEach((b, i) => {
        if (!vis(b) || b.closest("tbody,[role=menu],[class*=popmenu],[data-wf-row],header,[role=banner],template")) return;
        const t = (b.innerText || "").trim().replace(/\s+/g, "");
        if (!/^[＋+]?(新增|建立|新建)/.test(t)) return;
        b.setAttribute("data-wf-r25", String(i));
        out.push({ key: String(i), label: t.slice(0, 12) });
      });
      return out;
    });
    for (const k of keys) {
      const title = await page.evaluate(newDrawerTitle, k.key).catch(() => null);
      if (title && /編輯|修改/.test(title) && !/新增|建立|新建/.test(title))
        findings.push({ rule: "R25", where: code, msg: `按「${k.label}」打開的浮層標題是「${title}」（新增時標題寫「新增…」；同一個抽屜兼用就在標題加 data-wf-title-new="新增…" data-wf-title-edit="編輯…"，proto.js 依開啟方式切換）` });
      await page.close();
      ({ page } = await open(item.file, code, vp));
      await page.evaluate((list) => {
        const all = document.querySelectorAll("button,a,[role=button]");
        list.forEach((x) => { const b = all[Number(x.key)]; if (b) b.setAttribute("data-wf-r25", x.key); });
      }, keys);
    }
    await page.close();
  }

  // R13 角色切換：本頁寫了「角色：」（＝各角色內容或操作不同），各角色看到的畫面要不一樣；沒寫「角色：」的頁不要求有差別
  const mains = targets.filter(([c]) => !/-\d+$/.test(c));
  if (ROLES.length >= 2) {
    for (const [code, item] of mains) {
      const note = roleNote(code);
      if (!note) continue;
      const vp = widthsFor(item)[0];
      const prints = new Set();
      for (const role of ROLES) {
        const { page } = await open(item.file, code, vp, { role });
        prints.add(await page.evaluate(fingerprint));
        await page.close();
      }
      if (prints.size === 1) findings.push({ rule: "R13", where: code, msg: `顯示規則卡寫了角色差異，但切換 ${ROLES.join("／")} 看到的畫面完全相同（用 data-wf-roles 標出各角色看得到的按鈕與欄位）` });
    }
  }

  // R14 點了沒反應：每個狀態逐一點看得到的按鈕與選單項目（同一份 HTML 同樣子的只點一次），點了有反應就重開頁面再點下一個
  const seenByFile = {};
  for (const [code, item] of targets) {
    const vp = widthsFor(item)[0];
    const seen = (seenByFile[item.file] = seenByFile[item.file] || []);
    const seenAtStart = [...seen]; // 重開頁面後用同一份清單編號
    let { page } = await open(item.file, code, vp);
    const list = await page.evaluate(listClickables, seenAtStart);
    const dead = [];
    for (const c of list) {
      seen.push(c.sig);
      const reacted = await page.evaluate(clickAndWatch, c.key).catch(() => true);
      if (!reacted) dead.push(`「${c.label}」`);
      else {
        await page.close();
        ({ page } = await open(item.file, code, vp));
        await page.evaluate(listClickables, seenAtStart);
      }
    }
    await page.close();
    if (dead.length) findings.push({ rule: "R14", where: code, msg: `點了畫面沒有任何變化：${dead.join("、")}（每個操作都要有去向：開對話框、換頁碼、輕提示；工程標註寫「流程外」的也要給回饋，用使用者真的會看到的結果句，例：data-wf-toast="已加入購物車"，不寫「示意」「本原型未涵蓋」）` });
  }

  // R26 表單送出鈕沒接線（提醒）：點 type=submit 的按鈕，600ms 內要看得到載入中或欄位錯誤
  for (const [code, item] of targets) {
    const vp = widthsFor(item)[0];
    const { page } = await open(item.file, code, vp);
    const res = await page.evaluate(async () => {
      const vis = (el) => el.getClientRects().length && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true }));
      const btns = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"]')).filter((b) => vis(b) && !b.disabled);
      const out = [];
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const b of btns) {
        const label = (b.innerText || b.value || "").trim().replace(/\s+/g, " ").slice(0, 20);
        const form = b.form || (b.getAttribute("form") && document.getElementById(b.getAttribute("form")));
        if (!form) { out.push({ label, note: "沒有對應的 <form>" }); continue; }
        // 頁面沒掛 initForm 時，原生送出會換網址：先擋住，才看得出「沒反應」
        let nativeSubmit = false;
        const stop = (e) => { if (!e.defaultPrevented) { nativeSubmit = true; e.preventDefault(); } };
        form.addEventListener("submit", stop);
        try { b.click(); } catch {}
        let seen = "";
        for (let t = 0; t < 600 && !seen; t += 100) {
          await wait(100);
          if (b.classList.contains("is-loading") || form.querySelector(".is-loading")) seen = "載入中";
          else if (form.querySelector('[aria-invalid="true"], .field__error:not([hidden]), [data-wf-form-error]:not([hidden])') || document.querySelector('.field__error:not([hidden])')) seen = "欄位錯誤";
        }
        form.removeEventListener("submit", stop);
        if (!seen) out.push({ label, note: nativeSubmit ? "沒有掛 WfProto.initForm（原生送出）" : "點了 600ms 內沒有載入中也沒有欄位錯誤" });
      }
      return out;
    }).catch(() => []);
    await page.close();
    res.forEach((r) => findings.push({ rule: "R26", where: code, msg: `送出鈕「${r.label}」${r.note}（表單一律用 WfProto.initForm 掛：驗證沒過顯示欄位錯誤、通過進載入中；寫法見 README「互動原型」）` }));
  }

  // R27 同一流程主按鈕位置不一致（提醒）：各主頁碼置底主按鈕的 top 去重後要只有 1 個值
  {
    const flowOf = {};
    (map.AREAS || []).forEach((a) => (a.flows || []).forEach((f) => (f.pages || []).forEach((c) => { flowOf[c] = f.id; })));
    const byFlow = {};
    for (const [code, item] of targets.filter(([c]) => !/-\d+$/.test(c))) {
      const flow = flowOf[code];
      if (!flow) continue;
      const vp = widthsFor(item)[0];
      const { page } = await open(item.file, code, vp);
      const top = await page.evaluate(() => {
        const vis = (el) => el.getClientRects().length && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true }));
        const b = Array.from(document.querySelectorAll(".scr__foot .btn--primary")).find(vis);
        return b ? b.getBoundingClientRect().top : null;
      }).catch(() => null);
      await page.close();
      if (top === null) continue;
      (byFlow[flow] = byFlow[flow] || []).push({ code, top });
    }
    Object.entries(byFlow).forEach(([flow, list]) => {
      if (list.length < 2) return;
      const groups = [];
      list.forEach((x) => { const g = groups.find((g) => Math.abs(g.top - x.top) <= 0.6); if (g) g.codes.push(x.code); else groups.push({ top: x.top, codes: [x.code] }); });
      if (groups.length > 1) findings.push({ rule: "R27", where: flow, msg: `同一流程各頁置底主按鈕的 top 有 ${groups.length} 個值：${groups.map((g) => `${g.top.toFixed(1)}（${g.codes.join("、")}）`).join("；")}（置底區結構、按鈕高度與內距各頁要一樣）` });
    });
  }
  await browser.close();

  /* ---------- 結果 ---------- */
  console.log(`畫面檢查：${root}`);
  console.log(`  已開 ${targets.length} 個頁碼（Web 三種寬度 1440／900／420、App 390）`);
  console.log(`  線框呈現：${CLIENT ? "元件稿（client）" : "灰階（gray）"}`);
  const byRule = {};
  findings.forEach((f) => (byRule[f.rule] = byRule[f.rule] || []).push(f));
  // 元件稿：字級照客戶元件庫，R6 只提醒不擋
  const notes = CLIENT && byRule.R6 ? byRule.R6 : null;
  if (notes) delete byRule.R6;
  Object.keys(RULE_NAMES).forEach((r) => {
    const list = byRule[r];
    if (r === "R6" && notes) { console.log(`  ! R6 字級（元件稿只提醒，照客戶元件庫；列進交件說明）`); new Set(notes.map((f) => `${f.where}：${f.msg}`)).forEach((l) => console.log(`      - ${l}`)); return; }
    if (!list) { console.log(`  ✓ ${r} ${RULE_NAMES[r]}`); return; }
    // 同一訊息在多個寬度出現時合併
    const merged = new Map();
    list.forEach((f) => { const k = f.msg; merged.set(k, (merged.get(k) || []).concat(f.where)); });
    const warn = WARN_RULES.has(r);
    console.log(`  ${warn ? "!" : "✗"} ${r} ${RULE_NAMES[r]}（${merged.size} 項${warn ? "，只提醒不擋，列進交件說明" : ""}）`);
    merged.forEach((wheres, msg) => console.log(`      - ${wheres.join("／")}：${msg}`));
  });
  const failed = Object.keys(byRule).filter((r) => !WARN_RULES.has(r)).length;
  console.log(failed ? `\n未通過：${failed} 類問題` : `\n全部通過（${Object.keys(RULE_NAMES).length} 項）`);
  process.exit(failed ? 1 : 0);
})();

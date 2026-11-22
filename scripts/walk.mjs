#!/usr/bin/env node
/* ============================================================
   互動走查（Node 18+；有 Playwright 就自動點，沒有就產出手動走查清單）
   用法：node scripts/walk.mjs <走查步驟檔.json> [輸出.md]
         沒給輸出路徑＝寫在步驟檔旁邊，檔名「<步驟檔名>-走查結果.md」
   範例步驟檔：scripts/walk.example.json（元件示範頁 G2）
   結果：每步全符合 exit 0；有任何一步不符 exit 1；
         找不到 Playwright 或瀏覽器 → 產出手動走查清單、exit 2（交件說明標「互動未經自動化驗證」）

   找 Playwright 的順序（任一處裝了 playwright 或 playwright-core 即可）：
     環境變數 WF_PLAYWRIGHT（套件資料夾路徑）→ 目前所在資料夾 → 專案資料夾 → 步驟檔所在資料夾 → 全域安裝（npm root -g）
     都沒有時：在專案資料夾執行 npm i -D playwright-core（並裝 Google Chrome）後重跑；或改用手動走查清單。
   找瀏覽器的順序：Playwright 自帶的 Chromium（npx playwright install chromium 裝的）→ 環境變數 WF_CHROME
     → ~/Library/Caches/ms-playwright、~/.cache/ms-playwright 裡的 Chromium → 本機 Google Chrome／Chromium

   步驟檔格式（JSON）：
   {
     "title": "走查名稱",
     "url": "index.html?p=A1.1&menu=0&notes=0",   // 相對專案資料夾；沒帶 motion=0 會自動補上（關轉場與動畫）
     "viewport": { "width": 1200, "height": 900 }, // 選填
     "steps": [
       {
         "op": "點「送出」",                          // 操作（中文描述，寫進結果表）
         "do": [{ "click": "#submit" }],              // 動作，依序執行；見下方「動作」
         "expect": "欄位下方出現錯誤提示",              // 預期（中文描述，寫進結果表）
         "check": { "visible": ".field__error" },     // 檢查條件，全部符合才算通過；見下方「檢查」
         "shot": "送出-空值"                           // 選填：截圖檔名（存在輸出 .md 旁的資料夾）
       }
     ]
   }
   動作（作用在殼層中間的線框頁裡；選擇器用 CSS，或 Playwright 的 text=文字）：
     { "click": 選擇器 }               點一下
     { "fill": 選擇器, "value": 文字 }  清空後填入
     { "type": 選擇器, "value": 文字 }  逐字輸入（會觸發輸入事件）
     { "press": 按鍵 }                 按鍵，例 "Escape"、"Enter"
     { "scroll": 選擇器 }              捲到該元素
     { "blur": 選擇器 }                讓該欄位失去焦點（真正觸發 blur 驗證，不靠點別處）
     { "hover": 選擇器 }               滑鼠移到該元素上（驗 hover 態；配合 "style" 檢查）
     { "goto": 頁碼 }                  殼層換到某頁碼（例 "A1.1-3"）
     { "role": 角色 }                  切換檢視角色
     { "wait": 毫秒 }                  等待
   檢查：
     "visible": 選擇器（或陣列）       看得到
     "hidden": 選擇器（或陣列）        看不到（不存在或隱藏）
     "text": { "sel": 選擇器, "has": 文字 }    元素文字包含
     "value": { "sel": 選擇器, "is": 文字 }    輸入框的值等於
     "count": { "sel": 選擇器, "is": 數字 }    符合的元素個數
     "page": 頁碼                       殼層目前的頁碼
     "attr": { "sel": 選擇器, "name": "disabled"｜"class"｜"aria-disabled"｜任何屬性, "is": 值 或 "has": 值 }
                                        屬性檢查：disabled 讀的是真停用；class 用 has 查有沒有某個 class；
                                        is 比整個值（布林寫 true／false；屬性不存在＝false／null）
     "focused": 選擇器                  目前鍵盤焦點在該元素上
     "scrollBottom": 選擇器             該可捲動區已捲到底（誤差 1px）
     "style": { "sel": 選擇器, "prop": "opacity"｜"transform"｜"background-color"｜任何 CSS 屬性, "is": 值 或 "has": 值 或 "not": 值 }
                                        getComputedStyle 的值（驗動畫結束後的 opacity、hover 的底色、transform）；
                                        步驟檔網址自帶 motion=1 時動畫不會被關掉，才量得到有動畫的狀態
     "rect": { "sel": 選擇器, "prop": "top"｜"left"｜"right"｜"bottom"｜"width"｜"height"（或陣列）,
               "is": 數字 或 "sameAs": 另一個選擇器 }
                                        量 getBoundingClientRect 比對，容差 0.6px（主按鈕與輸入框左右對齊、各頁主按鈕 top 一致）
   步驟檔頂層可加 "reduced": true：整組用系統「減少動態」跑一次（檢查三點靜止、逐字一次出現、內容不變）
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [stepArg, outArg] = process.argv.slice(2);
if (!stepArg) {
  console.error("用法：node scripts/walk.mjs <走查步驟檔.json> [輸出.md]");
  process.exit(2);
}
const stepFile = path.resolve(stepArg);
let spec;
try {
  spec = JSON.parse(fs.readFileSync(stepFile, "utf8"));
} catch (err) {
  console.error(`✗ 步驟檔讀不到或不是合法 JSON：${err.message}`);
  process.exit(2);
}
const steps = Array.isArray(spec.steps) ? spec.steps : [];
const outFile = path.resolve(outArg || path.join(path.dirname(stepFile), path.basename(stepFile, ".json") + "-走查結果.md"));
const shotDir = path.join(path.dirname(outFile), path.basename(outFile, ".md") + "-截圖");

/* ---------- 共用：把「動作」與「檢查」轉成人看得懂的字（寫進手動清單） ---------- */
const doText = (d) =>
  d.click ? `點 ${d.click}` : d.fill ? `${d.fill} 填入「${d.value}」` : d.type ? `${d.type} 輸入「${d.value}」` : d.press ? `按 ${d.press}` :
  d.scroll ? `捲到 ${d.scroll}` : d.blur ? `離開 ${d.blur}` : d.hover ? `滑到 ${d.hover}` : d.goto ? `換到 ${d.goto}` : d.role ? `檢視角色切到「${d.role}」` : d.wait ? `等 ${d.wait} 毫秒` : JSON.stringify(d);
const cell = (s) => String(s ?? "").replace(/\|/g, "／").replace(/\n/g, " ");

function writeReport(rows, { auto, errors = [], browserNote = "" }) {
  const lines = [];
  lines.push(`# ${spec.title || "互動走查"}`, "");
  const relStep = path.relative(root, stepFile);
  lines.push(`- 步驟檔：${relStep && !relStep.startsWith("..") ? relStep : stepFile}`);
  lines.push(`- 網址：${spec.url || "index.html"}`);
  if (auto) {
    const pass = rows.filter((r) => r.ok).length;
    lines.push(`- 方式：自動走查（Playwright）${browserNote ? "；" + browserNote : ""}`);
    lines.push(`- 結果：${pass}／${rows.length} 步符合`, "");
  } else {
    lines.push("- 方式：手動走查清單——互動未經自動化驗證，請照表逐步點，填「實際」與「結果」", "");
  }
  lines.push("| # | 操作 | 預期 | 實際 | 結果 |", "|---|---|---|---|---|");
  rows.forEach((r, i) => lines.push(`| ${i + 1} | ${cell(r.op)} | ${cell(r.expect)} | ${cell(r.actual)} | ${r.ok === null ? "" : r.ok ? "符合" : "不符"} |`));
  if (errors.length) lines.push("", "## 頁面錯誤訊息", "", ...errors.map((e) => `- ${cell(e)}`));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, lines.join("\n") + "\n");
}

function manualFallback(reason) {
  const rows = steps.map((s) => ({ op: s.op || (s.do || []).map(doText).join("→"), expect: s.expect || "", actual: "", ok: null }));
  writeReport(rows, { auto: false });
  console.log(`! ${reason}`);
  console.log(`  已改產出手動走查清單：${outFile}`);
  console.log("  要自動走查：在專案資料夾執行 npm i -D playwright-core（本機要有 Google Chrome）後重跑。");
  process.exit(2);
}

/* ---------- 找 Playwright ---------- */
function findPlaywright() {
  const bases = [process.env.WF_PLAYWRIGHT, process.cwd(), root, path.dirname(stepFile)].filter(Boolean);
  try { bases.push(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()); } catch {}
  for (const base of bases) {
    const req = createRequire(path.join(path.resolve(base), "_walk_.js"));
    for (const name of ["playwright", "playwright-core"]) {
      try {
        // WF_PLAYWRIGHT 直接指套件資料夾時也接受
        return { lib: req(fs.existsSync(path.join(base, "package.json")) && path.basename(base).startsWith("playwright") ? base : name), from: base };
      } catch {}
    }
  }
  return null;
}

/* ---------- 找瀏覽器（Playwright 自帶的找不到時用） ---------- */
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
  list.push(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  );
  return list.filter((p) => fs.existsSync(p));
}

const pw = findPlaywright();
if (!pw) manualFallback("找不到 Playwright（playwright 或 playwright-core）");
const { chromium } = pw.lib;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const asList = (v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

(async () => {
  const args = ["--allow-file-access-from-files"];
  let browser = null;
  let browserNote = "Playwright 自帶 Chromium";
  try {
    browser = await chromium.launch({ headless: true, args });
  } catch {
    for (const exe of browserCandidates()) {
      try {
        browser = await chromium.launch({ headless: true, args, executablePath: exe });
        browserNote = `瀏覽器 ${path.basename(exe)}`;
        break;
      } catch {}
    }
  }
  if (!browser) manualFallback("有 Playwright，但找不到可用的 Chromium／Chrome（可設環境變數 WF_CHROME 指定執行檔）");

  // reduced:true＝整組用系統「減少動態」跑（Playwright 模擬 prefers-reduced-motion）
  const page = await browser.newPage({ viewport: spec.viewport || { width: 1200, height: 900 }, reducedMotion: spec.reduced ? "reduce" : "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // 網址：相對專案資料夾；一律帶 motion=0（關轉場與動畫，避免抓到動畫中途）
  let rel = spec.url || "index.html";
  if (!/[?&]motion=/.test(rel)) rel += (rel.includes("?") ? "&" : "?") + "motion=0";
  const [file, query = ""] = rel.split("?");
  await page.goto(pathToFileURL(path.join(root, file)).href + (query ? "?" + query : ""));
  await sleep(800);

  /** 殼層中間目前最上層的線框頁（換頁、開任務層後會變，每次重新取） */
  async function frame() {
    const h = await page.evaluateHandle(() => (window.WfShell ? window.WfShell.frame() : null));
    const el = h.asElement();
    return el ? await el.contentFrame() : page.mainFrame();
  }

  async function runAction(d) {
    const f = await frame();
    if (d.click) await f.click(d.click, { timeout: 3000 });
    else if (d.fill) await f.fill(d.fill, String(d.value ?? ""), { timeout: 3000 });
    else if (d.type) await f.type(d.type, String(d.value ?? ""), { timeout: 3000 });
    else if (d.press) await page.keyboard.press(d.press);
    else if (d.scroll) await f.$eval(d.scroll, (el) => el.scrollIntoView({ block: "center" }));
    else if (d.blur) await f.locator(d.blur).first().evaluate((el) => { el.focus(); el.blur(); }, null, { timeout: 3000 }); // 先聚焦再離開，確保 blur 事件真的發生
    else if (d.hover) await f.locator(d.hover).first().hover({ timeout: 3000 });
    else if (d.goto) await page.evaluate((c) => window.WfShell.goCode(c), d.goto);
    else if (d.role) await page.evaluate((r) => window.WfShell.setRole(r), d.role);
    else if (d.wait) await sleep(Number(d.wait));
    else throw new Error(`不認得的動作：${JSON.stringify(d)}`);
    await sleep(d.wait ? 0 : 200); // 每個動作後留一點時間給頁面反應
  }

  /** 逐項檢查，回傳 { ok, actual } */
  async function runCheck(check = {}) {
    const f = await frame();
    const notes = [];
    let ok = true;
    const visible = async (sel) => { try { return await f.locator(sel).first().isVisible(); } catch { return false; } };
    for (const sel of asList(check.visible)) { const v = await visible(sel); ok = ok && v; notes.push(`${sel} ${v ? "看得到" : "看不到"}`); }
    for (const sel of asList(check.hidden)) { const v = await visible(sel); ok = ok && !v; notes.push(`${sel} ${v ? "仍看得到" : "已隱藏"}`); }
    for (const t of asList(check.text)) {
      const got = await f.locator(t.sel).first().textContent({ timeout: 1500 }).catch(() => null);
      const pass = got !== null && got.includes(t.has);
      ok = ok && pass;
      notes.push(`${t.sel} 文字「${got === null ? "（找不到元素）" : got.trim().slice(0, 40)}」`);
    }
    for (const t of asList(check.value)) {
      const got = await f.locator(t.sel).first().inputValue({ timeout: 1500 }).catch(() => null);
      ok = ok && got === String(t.is);
      notes.push(`${t.sel} 值「${got === null ? "（找不到元素）" : got}」`);
    }
    for (const t of asList(check.count)) {
      const got = await f.locator(t.sel).count();
      ok = ok && got === Number(t.is);
      notes.push(`${t.sel} 共 ${got} 個`);
    }
    if (check.page) {
      const cur = await page.evaluate(() => (window.WfShell ? window.WfShell.current().code : ""));
      ok = ok && cur === check.page;
      notes.push(`目前頁碼 ${cur}`);
    }
    // attr：屬性／class／disabled
    for (const t of asList(check.attr)) {
      const got = await f.locator(t.sel).first().evaluate((el, name) => {
        if (name === "disabled") return !!el.disabled;
        if (name === "class") return el.className;
        return el.getAttribute(name);
      }, t.name, { timeout: 1500 }).catch(() => undefined);
      let pass;
      if (got === undefined) pass = false;
      else if (t.name === "class" && t.has !== undefined) pass = String(got).split(/\s+/).includes(String(t.has));
      else if (t.has !== undefined) pass = got !== null && String(got).includes(String(t.has));
      else if (t.name === "disabled") pass = got === (t.is === true || t.is === "true");
      else pass = (t.is === false || t.is === null) ? (got === null || got === "false") : String(got) === String(t.is);
      ok = ok && pass;
      notes.push(`${t.sel} ${t.name}＝${got === undefined ? "（找不到元素）" : JSON.stringify(got)}`);
    }
    // focused：目前焦點
    if (check.focused) {
      const got = await f.evaluate((sel) => { const a = document.activeElement; return !!(a && a.matches && a.matches(sel)); }, check.focused).catch(() => false);
      const tag = await f.evaluate(() => { const a = document.activeElement; return a ? `<${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""}>` : "（無）"; }).catch(() => "");
      ok = ok && got;
      notes.push(`焦點在 ${tag}${got ? "（符合）" : "（不是 " + check.focused + "）"}`);
    }
    // scrollBottom：可捲動區在底部
    for (const sel of asList(check.scrollBottom)) {
      const got = await f.locator(sel).first().evaluate((el) => ({ at: el.scrollTop + el.clientHeight >= el.scrollHeight - 1, top: Math.round(el.scrollTop), max: Math.round(el.scrollHeight - el.clientHeight) }), null, { timeout: 1500 }).catch(() => null);
      const pass = !!(got && got.at);
      ok = ok && pass;
      notes.push(`${sel} 捲動 ${got ? `${got.top}／${got.max}${pass ? "（在底部）" : "（不在底部）"}` : "（找不到元素）"}`);
    }
    // style：getComputedStyle 的值（is 完全相等、has 包含、not 不等於）
    for (const t of asList(check.style)) {
      const got = await f.locator(t.sel).first().evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop).trim(), t.prop, { timeout: 1500 }).catch(() => undefined);
      let pass;
      if (got === undefined) pass = false;
      else if (t.has !== undefined) pass = String(got).includes(String(t.has));
      else if (t.not !== undefined) pass = String(got) !== String(t.not);
      else pass = String(got) === String(t.is);
      ok = ok && pass;
      notes.push(`${t.sel} ${t.prop}＝${got === undefined ? "（找不到元素）" : got}${pass ? "" : "（不符）"}`);
    }
    // rect：量 getBoundingClientRect，與期望值或另一元素比對，容差 0.6px
    for (const t of asList(check.rect)) {
      const props = asList(t.prop || t.props || "top");
      const read = async (sel) => f.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }, null, { timeout: 1500 }).catch(() => null);
      const a = await read(t.sel);
      const b = t.sameAs ? await read(t.sameAs) : null;
      if (!a || (t.sameAs && !b)) { ok = false; notes.push(`${!a ? t.sel : t.sameAs}（找不到元素）`); continue; }
      for (const p of props) {
        const want = t.sameAs ? b[p] : Number(t.is);
        const pass = Math.abs(a[p] - want) <= 0.6;
        ok = ok && pass;
        notes.push(`${t.sel} ${p}＝${a[p].toFixed(1)}${t.sameAs ? `，${t.sameAs} ${p}＝${want.toFixed(1)}` : `，期望 ${want}`}${pass ? "" : "（差 " + Math.abs(a[p] - want).toFixed(1) + "）"}`);
      }
    }
    return { ok, actual: notes.join("；") || "（無檢查條件）" };
  }

  const rows = [];
  for (const [i, s] of steps.entries()) {
    let ok = false;
    let actual = "";
    try {
      for (const d of asList(s.do)) await runAction(d);
      ({ ok, actual } = await runCheck(s.check));
      if (s.shot) {
        fs.mkdirSync(shotDir, { recursive: true });
        const name = `${String(i + 1).padStart(2, "0")}-${s.shot}.png`;
        await page.screenshot({ path: path.join(shotDir, name) });
        actual += `；截圖 ${path.basename(shotDir)}/${name}`;
      }
    } catch (err) {
      ok = false;
      actual = `執行失敗：${String(err.message).split("\n")[0]}`;
    }
    rows.push({ op: s.op || asList(s.do).map(doText).join("→"), expect: s.expect || "", actual, ok });
    console.log(`${ok ? "✓" : "✗"} ${i + 1}. ${s.op || ""} → ${actual}`);
  }
  await browser.close();
  writeReport(rows, { auto: true, errors, browserNote });
  const fail = rows.filter((r) => !r.ok).length;
  console.log(`\n${fail ? `有 ${fail} 步不符` : `全部 ${rows.length} 步符合`}；結果：${outFile}`);
  process.exit(fail ? 1 : 0);
})();

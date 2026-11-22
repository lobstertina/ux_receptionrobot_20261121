#!/usr/bin/env node
/* ============================================================
   截圖（Node 18+；需要 Playwright＋Chromium／Chrome，找法同 render-check.mjs）
   用法：node scripts/shot.mjs <頁碼…> [--frame [--redo]] [--main-only]
         頁碼寫主頁碼（A1.1）＝本頁與它所有狀態頁（A1.1-2、A1.1-3…）；寫狀態頁碼（A1.1-3）＝只截那一個；
         不寫頁碼＝PAGES 裡所有已繪製的一般畫面頁碼。--main-only＝主頁碼不展開狀態頁。
   結果：全部截好 exit 0；頁碼不存在、--frame 被拒絕 exit 1；找不到 Playwright 或瀏覽器 exit 2

   一般截圖（流程畫面交件用）：命名規則以本檔「網址與檔名」一段為準，存進專案的 _screens/
     Web：每個頁碼四張——<頁碼>-桌機.png、<頁碼>-平板.png、<頁碼>-手機.png、<頁碼>-手機-標註.png（視窗 1240×800）
     App：每個頁碼兩張——<頁碼>-手機.png、<頁碼>-手機-標註.png
     多角色（page-map.js 的 ROLES 有 2 個以上）：主頁碼另外用每個非預設角色截一張（Web 桌機、App 手機），
       畫面和預設角色相同的不留；檔名加角色，例 B1.1-桌機-客服.png
     網址一律帶 motion=0（關掉轉場與動畫）

   框架截圖（--frame，主頁大版面畫完時用）：
     只截主頁碼一張 _screens/<頁碼>-框架.png（Web 1440 寬、App 手機寬），
     並在進度檔 ux-progress.md：本頁「狀態」改為「框架待確認」、「## 狀態歷程」記一筆（段落不存在就補上）、更新「最後更新」。
     本頁在 PAGES 已有狀態頁（流程畫面已開始），或進度檔本頁已是「線框完成」「已入版本」→ 拒絕：框架圖只在主頁大版面畫完、畫狀態頁之前截
     主頁改版（設計師要改大版面、要依新版型重產例外狀態）時加 --redo：不擋已有狀態頁與已完成的狀態，
       重截框架圖並把本頁狀態退回「框架待確認」、記一筆狀態歷程；之後依新版型重產狀態頁、重截交件圖

   文件頁（G4 資訊架構、G5～G7 等）：頁碼明確寫出來才截，一張 _screens/<頁碼>-文件.png（1440×900、開選單、關標註）；
     不寫頁碼時不截文件頁。

   不另寫截圖程式、不另裝截圖工具：截圖一律用這支。
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
const FRAME = argv.includes("--frame");
const REDO = argv.includes("--redo"); // 主頁改版：允許已有狀態頁、已完成時重截框架圖
const MAIN_ONLY = argv.includes("--main-only");
const codesArg = argv.filter((a) => !a.startsWith("--")).flatMap((a) => a.split(/[,，\s]+/)).filter(Boolean);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); // 殼層根目錄＝專案資料夾
const screensDir = path.join(root, "_screens");

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
  process.exit(1);
}
const PAGES = map.PAGES || {};
const ROLES = Array.isArray(map.ROLES) ? map.ROLES : [];
const isState = (c) => /-\d+$/.test(c);
const baseOf = (c) => String(c).replace(/-\d+$/, "");
const drawn = (it) => it && it.kind !== "doc" && !it.unplanned && it.file && fs.existsSync(path.join(root, "pages", it.file));
const isDocDrawn = (it) => it && it.kind === "doc" && it.file && fs.existsSync(path.join(root, "pages", it.file));
const isApp = (it) => ((it && it.device) || config.mode) === "app";
const statesOf = (base) => Object.keys(PAGES).filter((c) => isState(c) && baseOf(c) === base && drawn(PAGES[c]));

/* ---------- 要截哪些頁碼 ---------- */
const bad = codesArg.filter((c) => !PAGES[c]);
if (bad.length) {
  console.error(`✗ PAGES 沒有這些頁碼：${bad.join("、")}`);
  process.exit(1);
}
let codes = [];
if (FRAME) {
  if (!codesArg.length) {
    console.error("✗ --frame 要寫主頁碼，例：node scripts/shot.mjs A1.1 --frame");
    process.exit(1);
  }
  for (const c of codesArg) {
    if (isState(c)) { console.error(`✗ ${c} 是狀態頁碼；框架圖只截主頁碼（${baseOf(c)}）`); process.exit(1); }
    if (!drawn(PAGES[c])) { console.error(`✗ ${c} 還沒有已繪製的線框檔`); process.exit(1); }
    const st = statesOf(c);
    if (st.length && !REDO) {
      console.error(`✗ ${c} 已有狀態頁 ${st.join("、")}（流程畫面已開始）：框架圖只在主頁大版面畫完、畫狀態頁之前截；現在要截的是交件用的 node scripts/shot.mjs ${c}；主頁改版要重截框架就加 --redo`);
      process.exit(1);
    }
  }
  codes = codesArg;
} else {
  const picked = codesArg.length ? codesArg : Object.keys(PAGES).filter((c) => !isState(c));
  picked.forEach((c) => {
    if (!codes.includes(c)) codes.push(c);
    if (!isState(c) && !MAIN_ONLY) statesOf(c).forEach((s) => { if (!codes.includes(s)) codes.push(s); });
  });
  // 文件頁只在頁碼明確寫出來時截
  codes = codes.filter((c) => drawn(PAGES[c]) || (codesArg.includes(c) && isDocDrawn(PAGES[c])));
}
if (!codes.length) {
  console.error("✗ 沒有可以截圖的頁碼（尚未繪製的頁不截；文件頁要明確寫頁碼，例：node scripts/shot.mjs G4）");
  process.exit(1);
}

/* ---------- 進度檔：框架待確認 ---------- */
const progressPath = path.join(root, "ux-progress.md");
const pad = (n) => String(n).padStart(2, "0");
const nowText = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const cellsOf = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** 檢查進度檔本頁的狀態可不可以截框架（回傳 null＝可以；字串＝拒絕原因） */
function frameBlocked(code) {
  if (!fs.existsSync(progressPath)) return null;
  const row = findRow(fs.readFileSync(progressPath, "utf8").split(/\r?\n/), code);
  if (row && /^(線框完成|已入版本)/.test(row.cells[row.col["狀態"]] || "")) return `進度檔「${row.cells[row.col["頁名"]]}」已是「${row.cells[row.col["狀態"]]}」，框架圖只在主頁大版面畫完時截`;
  return null;
}
/** 在「## 頁面狀態」表找本頁那一列：頁碼欄等於頁碼，或頁名欄等於 PAGES 的 label */
function findRow(lines, code) {
  let inSec = false;
  let head = null;
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (/^##\s/.test(l) && !/^###/.test(l)) { inSec = l.replace(/^##\s+/, "").trim() === "頁面狀態"; head = null; continue; }
    if (!inSec || !/^\s*\|/.test(l)) continue;
    const cells = cellsOf(l);
    if (!head) { head = cells; continue; }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const col = {};
    head.forEach((h, k) => (col[h] = k));
    if (col["狀態"] === undefined) return null;
    const label = String((PAGES[code] || {}).label || "").trim();
    if ((cells[col["頁碼"]] || "") === code || (label && cells[col["頁名"]] === label)) return { index: i, cells, col };
  }
  return null;
}
/** 本頁狀態改為「框架待確認」、記狀態歷程、更新最後更新 */
function markFramePending(code) {
  if (!fs.existsSync(progressPath)) return "沒有進度檔 ux-progress.md（不是由 ux-flow-manager 帶的流程）：交件說明的待確認清單列「主頁框架待設計師確認」";
  const lines = fs.readFileSync(progressPath, "utf8").split(/\r?\n/);
  const row = findRow(lines, code);
  const label = String((PAGES[code] || {}).label || "").trim();
  const time = nowText();
  if (!row) return `進度檔「## 頁面狀態」找不到 ${code}「${label}」這一列：沒有改狀態，下次 ux-flow-manager 接續時補上`;
  row.cells[row.col["狀態"]] = "框架待確認";
  if (row.col["頁碼"] !== undefined && /^(—|-|)$/.test(row.cells[row.col["頁碼"]] || "")) row.cells[row.col["頁碼"]] = code;
  lines[row.index] = `| ${row.cells.join(" | ")} |`;
  const pageName = row.cells[row.col["頁名"]] || label;
  // 「## 狀態歷程」：沒有就補在「## 版本紀錄摘要」前面（再沒有就放檔尾）
  let hi = lines.findIndex((l) => /^##\s+狀態歷程\s*$/.test(l));
  if (hi < 0) {
    const vi = lines.findIndex((l) => /^##\s+版本紀錄摘要\s*$/.test(l));
    const block = ["## 狀態歷程", "| 時間 | 頁名 | 頁碼 | 狀態 |", "|---|---|---|---|", ""];
    if (vi >= 0) lines.splice(vi, 0, ...block);
    else lines.push("", ...block);
    hi = lines.findIndex((l) => /^##\s+狀態歷程\s*$/.test(l));
  }
  // 歷程表最後一列之後加一筆（表格還沒有表頭就補上）
  const sectionEnd = () => { let e = hi + 1; while (e < lines.length && !/^##\s/.test(lines[e])) e += 1; return e; };
  for (let k = sectionEnd() - 1; k > hi; k -= 1) if (/^無\s*$/.test(lines[k].trim())) lines.splice(k, 1); // 沒有內容時寫的「無」拿掉
  const tableRows = [];
  for (let k = hi + 1; k < sectionEnd(); k += 1) if (/^\s*\|/.test(lines[k])) tableRows.push(k);
  const entry = `| ${time} | ${pageName} | ${code} | 框架待確認 |`;
  if (!tableRows.length) lines.splice(hi + 1, 0, "| 時間 | 頁名 | 頁碼 | 狀態 |", "|---|---|---|---|", entry);
  else lines.splice(tableRows[tableRows.length - 1] + 1, 0, entry);
  const out = lines.join("\n").replace(/^(\s*-\s*最後更新：).*$/m, `$1${time}`);
  fs.writeFileSync(progressPath, out);
  return `進度檔：${pageName}（${code}）狀態改為「框架待確認」，狀態歷程記一筆 ${time}`;
}

if (FRAME) {
  for (const c of codes) {
    const why = REDO ? null : frameBlocked(c);
    if (why) { console.error(`✗ ${c}：${why}`); process.exit(1); }
  }
}

/* ---------- 找 Playwright 與瀏覽器（與 render-check.mjs 相同順序） ---------- */
function findPlaywright() {
  const bases = [process.env.WF_PLAYWRIGHT, process.cwd(), root].filter(Boolean);
  try { bases.push(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()); } catch {}
  for (const base of bases) {
    const req = createRequire(path.join(path.resolve(base), "_shot_.js"));
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

/* ---------- 網址與檔名（截圖命名規則以本段為準） ---------- */
const shellUrl = (params) => pathToFileURL(path.join(root, "index.html")).href + "?" + new URLSearchParams({ ...params, motion: "0" }).toString();
function shotsFor(code) {
  if (PAGES[code] && PAGES[code].kind === "doc") return [{ name: `${code}-文件.png`, vp: { width: 1440, height: 900 }, q: { p: code, menu: "1", notes: "0" } }];
  const app = isApp(PAGES[code]);
  if (FRAME) return [app
    ? { name: `${code}-框架.png`, vp: { width: 1240, height: 800 }, q: { p: code, menu: "1", notes: "0" } }
    : { name: `${code}-框架.png`, vp: { width: 1440, height: 900 }, q: { p: code, menu: "0", notes: "0" } }];
  if (app) return [
    { name: `${code}-手機.png`, vp: { width: 1240, height: 800 }, q: { p: code, menu: "1", notes: "0" }, role: true },
    { name: `${code}-手機-標註.png`, vp: { width: 1240, height: 800 }, q: { p: code, menu: "1", notes: "1" } },
  ];
  return [
    { name: `${code}-桌機.png`, vp: { width: 1240, height: 800 }, q: { p: code, menu: "0", notes: "0" }, role: true },
    { name: `${code}-平板.png`, vp: { width: 1240, height: 800 }, q: { p: code, menu: "1", notes: "0" } },
    { name: `${code}-手機.png`, vp: { width: 1240, height: 800 }, q: { p: code, menu: "0", notes: "0", w: "620" } },
    { name: `${code}-手機-標註.png`, vp: { width: 1240, height: 800 }, q: { p: code, menu: "1", notes: "1" } },
  ];
}

/* ============================================================
   主程式
   ============================================================ */
const pwLib = findPlaywright();
if (!pwLib) {
  console.log("! 找不到 Playwright（playwright 或 playwright-core）：在專案資料夾執行 npm i -D playwright-core（並確認本機有 Google Chrome）後重跑");
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
    console.log("! 有 Playwright，但找不到可用的 Chromium／Chrome（安裝 Google Chrome，或設環境變數 WF_CHROME）");
    process.exit(2);
  }
  fs.mkdirSync(screensDir, { recursive: true });

  /** 開殼層網址、等內頁載入，回傳 { buf：整張截圖, inner：只有中間畫面（比較角色差異用，上方列的角色名不算） } */
  async function capture(vp, q) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto(shellUrl(q));
    const innerFrame = await (async () => {
      for (let i = 0; i < 40; i += 1) {
        const f = page.frames().find((fr) => fr.url().includes("/pages/"));
        if (f) return f;
        await sleep(100);
      }
      return null;
    })();
    if (innerFrame) await innerFrame.waitForSelector("body").catch(() => {});
    await sleep(700); // 等頁面套用頁碼狀態（狀態頁的 apply 可能延後開浮層）
    const buf = await page.screenshot();
    let inner = buf;
    if (innerFrame) inner = await (await innerFrame.frameElement()).screenshot().catch(() => buf);
    await page.close();
    return { buf, inner };
  }

  const written = [];
  for (const code of codes) {
    for (const s of shotsFor(code)) {
      const shot = await capture(s.vp, s.q);
      fs.writeFileSync(path.join(screensDir, s.name), shot.buf);
      written.push(s.name);
      // 多角色：主頁碼另外截每個非預設角色，畫面和預設角色相同的不留
      if (!FRAME && s.role && !isState(code) && ROLES.length >= 2) {
        for (const role of ROLES.slice(1)) {
          const rs = await capture(s.vp, { ...s.q, role });
          if (Buffer.compare(rs.inner, shot.inner) === 0) continue; // 中間畫面和預設角色一樣：不留
          const name = s.name.replace(/\.png$/, `-${role}.png`);
          fs.writeFileSync(path.join(screensDir, name), rs.buf);
          written.push(name);
        }
      }
    }
  }
  await browser.close();

  console.log(`截圖：${root}`);
  console.log(`  已存 ${written.length} 張到 _screens/：`);
  written.forEach((n) => console.log(`    - ${n}`));
  if (FRAME) codes.forEach((c) => console.log(`  ${markFramePending(c)}`));
  process.exit(0);
})();

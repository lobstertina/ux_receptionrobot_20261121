#!/usr/bin/env node
/* ============================================================
   資訊備註區塊資料的覆蓋檢查（零相依，Node 18+）
   用法：node scripts/check-region-notes.cjs [專案資料夾] [group id 前綴...] [--require 主頁碼...]
         （沒給專案資料夾＝本腳本上一層；第一個參數是存在的資料夾才當專案資料夾）
         --require 後面列的主頁碼（例：交件的頁）一定要已拆區塊，沒拆就算問題（exit 1）；
         沒寫 --require 時，還沒拆的頁只列出、不算錯。
   資訊備註模式＝把 page-map.js 的整頁標註（FEATURE_NOTES／TEST_HINTS）重新分配到「畫面區塊」上，
   區塊資料在 assets/region-notes/<模組字母>.js（格式見 assets/region-notes.js）。本腳本檢查分配有沒有漏：
    1. group.codes 的每個頁碼都存在 page-map；同一個頁碼不能屬於兩個 group；main 要在 codes 裡
    2. 每個區塊至少一個狀態；狀態的 code 都在 group.codes 裡；區塊 id 不重複；
       group.codes 的每個頁碼至少被一個區塊狀態引用（資訊備註模式點選單的狀態頁碼＝選中引用它的那個區塊狀態，沒被引用就選不到）
    3. 狀態與整頁通則的 features 標題只能是四區（前端驗證 → 前端互動 → 顯示規則 → API），照順序、不重複
    4. page-map 裡這些頁碼的每一條工程標註與測試值，都有分配到 group（整頁通則或某個區塊狀態）
       ——文字逐字比對（空白壓成一格）；測試值以「標題＋結果」比對（同標題不同結果算兩條）
    5. 欄位規則（field-rules.js 的 usedOn 指到這些頁碼的欄位）都掛在某個區塊的 fields；fields 的 id 要在 FIELDS 登記
    6. 區塊 id 有出現在頁面 HTML（pages/、starters/）或 assets 的 JS 裡（data-note-region="…"）
   最後列出還沒拆區塊的畫面頁碼（不含文件頁、尚未繪製的頁）——只列出、不算錯。
   有問題 exit 1；全部通過 exit 0。
   拆區塊時對照現行標註：node scripts/dump-notes.cjs <頁碼>
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
let ROOT = path.join(__dirname, "..");
if (args[0] && fs.existsSync(args[0]) && fs.statSync(args[0]).isDirectory()) ROOT = path.resolve(args.shift());
const reqAt = args.indexOf("--require");
const required = reqAt >= 0 ? args.slice(reqAt + 1) : [];
const only = reqAt >= 0 ? args.slice(0, reqAt) : args;

// 資料檔都是給瀏覽器用的 window.X = …，在 Node 裡把 window 指到 global 就能直接載入
global.window = global;
global.document = { addEventListener() {}, querySelector() { return null; }, currentScript: null };
const load = (rel) => require(path.join(ROOT, rel));
load("assets/page-map.js");
if (fs.existsSync(path.join(ROOT, "assets/field-rules.js"))) load("assets/field-rules.js");
load("assets/region-notes.js");

const map = window.WfPageMap;
const fieldRules = window.WfFieldRules || null;
const notes = window.WfRegionNotes;

// 依 AREAS 載入各模組的區塊資料（和殼層一樣：文件區不載、檔案不存在就略過）
const loadedFiles = [];
(map.AREAS || []).forEach((area) => {
  if (area.pin || !/^[A-Z]$/.test(area.id)) return;
  const rel = "assets/region-notes/" + area.id + ".js";
  if (!fs.existsSync(path.join(ROOT, rel))) return;
  load(rel);
  loadedFiles.push(rel);
});
const groups = notes.groups;

const SECTION_TITLES = ["前端驗證", "前端互動", "顯示規則", "API"];
const norm = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
function lineText(line) {
  if (line && typeof line === "object") return norm(line.text || line.page || line.href);
  return norm(line);
}
function featureLines(features) {
  const out = [];
  (features || []).forEach((card) => {
    if (!card) return;
    (card.bullets || []).forEach((b) => out.push(lineText(b)));
    if (card.body) out.push(norm(card.body));
    (card.links || []).forEach((l) => out.push(norm(l.label)));
  });
  return out.filter(Boolean);
}

// 頁面 HTML＋JS 全部合在一起，拿來找 data-note-region
function filesIn(dir, ext) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((f) => f.endsWith(ext)).map((f) => path.join(full, f));
}
const sources = []
  .concat(filesIn("pages", ".html"), filesIn("starters", ".html"), filesIn("assets", ".js"))
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");

let problems = 0;
function fail(group, msg) {
  problems++;
  console.log("  ✗ [" + group.id + "] " + msg);
}

function checkTitles(group, where, features) {
  let last = -1;
  const seenTitles = {};
  (features || []).forEach((card) => {
    const t = norm(card && card.title);
    const idx = SECTION_TITLES.indexOf(t);
    if (idx < 0) {
      fail(group, where + "：區塊標題「" + t + "」不合規，只能用 " + SECTION_TITLES.join("、"));
      return;
    }
    if (seenTitles[t]) fail(group, where + "：「" + t + "」重複出現，同一處每區最多一個");
    if (idx < last) fail(group, where + "：「" + t + "」順序不對，要照 " + SECTION_TITLES.join(" → "));
    seenTitles[t] = true;
    last = Math.max(last, idx);
  });
}

const seen = {};
groups.forEach((group) => {
  if (only.length && !only.some((p) => String(group.id).indexOf(p) === 0)) return;
  console.log("● " + group.id + "（" + group.codes.length + " 個頁碼，" + group.regions.length + " 個區塊）");
  if (group.codes.indexOf(group.main) < 0) fail(group, "main（" + group.main + "）不在 codes 裡");
  const haveLines = new Set();
  const haveHints = new Set();
  const haveFields = new Set();
  function collect(block) {
    featureLines(block.features).forEach((t) => haveLines.add(t));
    (block.hints || []).forEach((h) => haveHints.add(norm(h.title) + "｜" + norm(h.result)));
  }
  collect(group.page || {});
  checkTitles(group, "整頁通則", (group.page || {}).features);
  const regionIds = new Set();
  (group.regions || []).forEach((region) => {
    if (regionIds.has(region.id)) fail(group, "區塊 id 重複：" + region.id);
    regionIds.add(region.id);
    (region.fields || []).forEach((f) => {
      haveFields.add(f.id);
      if (fieldRules && fieldRules.fieldById && !fieldRules.fieldById(f.id)) fail(group, "區塊 " + region.id + " 的欄位 " + f.id + " 沒有登記在 FIELDS");
    });
    if (!region.states || !region.states.length) fail(group, "區塊沒有任何狀態：" + region.id);
    (region.states || []).forEach((state) => {
      if (group.codes.indexOf(state.code) < 0) fail(group, "狀態頁碼不在 codes：" + region.id + " / " + state.label + " → " + state.code);
      checkTitles(group, region.id + " / " + state.label, state.features);
      collect(state);
    });
    const re = new RegExp("data-note-region[\"'=,\\s:]+[\"']?" + String(region.id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\"']");
    if (!re.test(sources)) fail(group, "頁面裡找不到 data-note-region=\"" + region.id + "\"");
  });

  const usedCodes = new Set();
  (group.regions || []).forEach((region) => (region.states || []).forEach((state) => usedCodes.add(state.code)));
  group.codes.forEach((code) => {
    if (!usedCodes.has(code)) fail(group, "頁碼 " + code + " 沒有被任何區塊狀態引用：資訊備註模式下點不到這個狀態，掛到它所屬的區塊（整頁狀態掛在包住主要內容的那一塊）");
  });

  group.codes.forEach((code) => {
    if (seen[code]) fail(group, "頁碼同時屬於兩個 group：" + code + "（另一個 " + seen[code] + "）");
    seen[code] = group.id;
    const spec = map.spec(code);
    if (!spec || spec.p !== code) {
      fail(group, "page-map 沒有這個頁碼：" + code);
      return;
    }
    featureLines(map.featuresFor(code)).forEach((t) => {
      if (!haveLines.has(t)) fail(group, code + " 標註沒分配到：" + t.slice(0, 80));
    });
    (map.hintsFor(code) || []).forEach((h) => {
      if (!haveHints.has(norm(h.title) + "｜" + norm(h.result))) fail(group, code + " 測試值沒分配到：" + h.title + "｜" + norm(h.result).slice(0, 40));
    });
    (fieldRules ? fieldRules.notesFor(code) : []).forEach((f) => {
      if (!haveFields.has(f.id)) fail(group, code + " 欄位規則沒掛到區塊：" + f.id + " " + f.label);
    });
  });
});

// 尚未拆區塊的畫面頁碼（只列出）
const pending = [];
(map.AREAS || []).forEach((area) => {
  const codes = (area.pages || []).concat(...(area.flows || []).map((f) => f.pages || []));
  codes.forEach((code) => {
    const spec = map.spec(code);
    if (!spec || spec.unplanned || spec.kind === "doc") return;
    if (!notes.groupFor(code)) pending.push(code);
  });
});
// --require：指定的主頁碼一定要已拆區塊
required.forEach((code) => {
  const spec = map.spec(code);
  if (!spec) {
    problems++;
    console.log("  ✗ --require " + code + "：page-map 沒有這個頁碼");
  } else if (!notes.groupFor(code)) {
    problems++;
    console.log("  ✗ --require " + code + "：還沒拆畫面區塊（照 wireframe-generator 的 references/資訊備註區塊.md 第 2 節補）");
  }
});

console.log("\n載入區塊資料檔：" + (loadedFiles.length ? loadedFiles.join("、") : "（無）"));
console.log("已拆區塊 group：" + groups.length + " 個；尚未拆的頁碼 " + pending.length + " 個（資訊備註模式下這些頁照舊顯示整頁標註）");
if (pending.length) console.log("  " + pending.join(" "));
console.log(problems ? "\n✗ 有 " + problems + " 個問題" : "\n✓ 覆蓋檢查通過");
process.exit(problems ? 1 : 0);

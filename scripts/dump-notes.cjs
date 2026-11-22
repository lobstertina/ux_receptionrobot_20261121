#!/usr/bin/env node
/* ============================================================
   印出指定頁碼現行的工程標註（page-map.js 的 FEATURE_NOTES／TEST_HINTS＋欄位規則），拆區塊時對照用。
   用法：node scripts/dump-notes.cjs [專案資料夾] <頁碼或主頁碼...>
     node scripts/dump-notes.cjs B1.1        → 列出 B1.1 一家（B1.1、B1.1-2…）每個頁碼
     node scripts/dump-notes.cjs B1.1-3 C2.1 → 指定頁碼／一家
   （第一個參數是存在的資料夾才當專案資料夾；沒給＝本腳本上一層）
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
let ROOT = path.join(__dirname, "..");
if (args[0] && fs.existsSync(args[0]) && fs.statSync(args[0]).isDirectory()) ROOT = path.resolve(args.shift());
if (!args.length) {
  console.log("用法：node scripts/dump-notes.cjs <頁碼或主頁碼...>");
  process.exit(1);
}

global.window = global;
global.document = { addEventListener() {}, querySelector() { return null; }, currentScript: null };
require(path.join(ROOT, "assets/page-map.js"));
if (fs.existsSync(path.join(ROOT, "assets/field-rules.js"))) require(path.join(ROOT, "assets/field-rules.js"));
const map = window.WfPageMap;
const fieldRules = window.WfFieldRules || null;

const all = map.listedCodes();
const base = (c) => (String(c).match(/^[A-Z]\d+(?:\.\d+)?/) || [c])[0];
const wanted = [];
args.forEach((arg) => {
  const family = all.filter((c) => c === arg || (base(c) === arg && c !== arg));
  (family.length ? family : [arg]).forEach((c) => wanted.indexOf(c) < 0 && wanted.push(c));
});
wanted.forEach((code) => {
  console.log("\n==================== " + code + " ====================");
  console.log("spec: " + JSON.stringify(map.spec(code)));
  console.log("features: " + JSON.stringify(map.featuresFor(code), null, 2));
  console.log("hints: " + JSON.stringify(map.hintsFor(code), null, 2));
  console.log("fieldRules: " + JSON.stringify(fieldRules ? fieldRules.notesFor(code) : []));
});

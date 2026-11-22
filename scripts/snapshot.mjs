#!/usr/bin/env node
/* ============================================================
   存版本快照（零相依，Node 18+）
   用法：node scripts/snapshot.mjs <版本代號> "<版本標題>" "<異動 1>" "<異動 2>" …
   例（第一次存版本）：node scripts/snapshot.mjs 2026-10-15 "客戶審閱版" "A1.1 輸入手機：初版" "A1.2 驗證碼：初版"
   例（之後的版本）：  node scripts/snapshot.mjs 2026-10-22 "審閱決議修正版" "A1.2 驗證碼：重送倒數改 30 秒（10/20 客戶審閱會議）"
   規則（什麼時候存、哪些異動要寫）：skills/wireframe-generator/references/版本紀錄規則.md
     · 版本代號用日期，同一天第二版加 -2（2026-10-15-2）
     · 版本標題寫這一版的目的（客戶審閱版、審閱決議修正版、交付工程版）
     · 第一次存版本：每頁一條「頁碼 頁名：初版」，不分組；自檢修正一律不列
     · 之後的版本：每條異動「頁碼 頁名：改了什麼（因為哪個決定）」；設計師自己的迭代不寫

   做的事：
   1. 把目前的 pages/、assets/（含 page-map.js、field-rules.js、client-theme.css）、starters/ 與 wireframe.config.js
      （內頁靠它決定灰階或元件稿）複製到 history/<版本代號>/
   2. 在 history/<版本代號>/ 寫入 snapshot.js（殼層靠它確認「這個版本真的有快照」）
   3. 在 history/changelog.js 最前面加一筆版本紀錄；日期欄（date）取版本代號裡的日期，
      代號不是日期格式時才用系統日期
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [id, title, ...changes] = process.argv.slice(2);

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

if (!id || !title) fail('用法：node scripts/snapshot.mjs <版本代號> "<版本標題>" "<頁碼 頁名：改了什麼（因為哪個決定）>" …');
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) fail("版本代號用日期（例：2026-10-15），同一天第二版加 -2（例：2026-10-15-2）；只能用英數字、點、底線、連字號");

const historyDir = path.join(root, "history");
const target = path.join(historyDir, id);
if (fs.existsSync(target)) fail(`history/${id}/ 已存在；版本代號不可重複，請換一個`);

const changelogPath = path.join(historyDir, "changelog.js");
const PREFIX = "window.WfChangelog = ";

function readChangelog() {
  if (!fs.existsSync(changelogPath)) return { header: "", data: { versions: [] } };
  const src = fs.readFileSync(changelogPath, "utf8");
  const at = src.indexOf(PREFIX);
  if (at < 0) fail("history/changelog.js 格式不對：找不到 window.WfChangelog = ");
  const body = src.slice(at + PREFIX.length).trim().replace(/;\s*$/, "");
  try {
    return { header: src.slice(0, at), data: JSON.parse(body) };
  } catch (err) {
    fail("history/changelog.js 等號右邊不是合法 JSON：" + err.message);
  }
}

const { header, data } = readChangelog();
data.versions = data.versions || [];
if (data.versions.some((v) => v.id === id)) fail(`changelog.js 已有版本 ${id}`);

// 1. 複製 pages/ 與 assets/
for (const dir of ["pages", "assets", "starters"]) {
  const from = path.join(root, dir);
  if (!fs.existsSync(from)) {
    if (dir === "starters") continue; // starters/（元件示範頁）可有可無
    fail(`找不到 ${dir}/`);
  }
  fs.cpSync(from, path.join(target, dir), { recursive: true });
}
// 專案設定：舊版本打開時照當時的線框呈現（灰階／元件稿）
if (fs.existsSync(path.join(root, "wireframe.config.js"))) fs.copyFileSync(path.join(root, "wireframe.config.js"), path.join(target, "wireframe.config.js"));

// 2. 快照標記
fs.writeFileSync(
  path.join(target, "snapshot.js"),
  `/* 版本快照標記：由 scripts/snapshot.mjs 產生，請勿刪除 */\n(window.WfSnapshots = window.WfSnapshots || {})[${JSON.stringify(id)}] = true;\n`
);

// 3. 版本紀錄（新的放最前面）
// date（日期欄）：版本代號是日期（2026-10-15 或 2026-10-15-2）時用代號裡的日期；代號不是日期時才用系統日期
const idDate = id.match(/^(\d{4})-(\d{2})-(\d{2})(?:-\d+)?$/);
const today = new Date();
const date = idDate
  ? `${idDate[1]}-${idDate[2]}-${idDate[3]}`
  : [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
data.versions.unshift({ id, date, title, changes });
fs.writeFileSync(changelogPath, header + PREFIX + JSON.stringify(data, null, 2) + ";\n");

console.log(`✓ 已存版本 ${id}「${title}」→ history/${id}/（pages/、assets/、snapshot.js），並更新 history/changelog.js`);

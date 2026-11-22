/* ============================================================
   內頁共用互動（WfProto）：每一張 pages/*.html 在 </body> 前載入
   - 讓流程動起來需要的事：切狀態、換頁（含轉場）、返回、表單假驗證，
     以及「會動的元件」：對話框、輕提示、底部面板、側邊抽屜、浮動選單、
     刪除流程、驗證碼、進度條、權限詢問、全站錯誤、分段頁籤、搜尋欄、載入更多。
   - 與殼層只用 postMessage 溝通（file:// 也能用）；單獨開檔時自己處理。
   - 寫線框頁時優先用 HTML 屬性宣告（data-wf-*），不必寫 JS；一覽見
     shared/knowledge/interaction-patterns 各篇「怎麼呼叫」，
     可點的示範在 starters/components.html。
   - 模擬鍵盤是選配，另載 assets/proto-keyboard.js。
   - 網址帶 motion=0：關閉所有轉場與動畫（截圖驗收用；殼層會把這個參數帶給內頁）。
   - 從左側選單切到同一份檔的另一個狀態時，先把表單欄位、狀態下拉、選取、浮層重設回預設值，
     再交給頁面的 apply；不想被重設的區塊加 data-wf-no-reset。
   - registerPage 的 apply 一律在元件（表格、分頁、篩選列…）初始化完成後才第一次執行，
     所以直接開狀態頁碼（?p=A1.1-2）與從選單切過去，看到的畫面相同。
   ============================================================ */
window.WfProto = (function () {
  "use strict";

  var inShell = window.parent !== window;
  var handler = null;
  var currentCode = "";
  var booted = false; // boot（元件初始化）跑完了沒
  var started = false; // 頁碼套用過了沒（只做一次）
  var toastMuted = 0; // 大於 0＝正在套用頁碼狀態，輕提示不顯示（使用者沒操作就不該跳）

  /* 關閉轉場與動畫：網址帶 motion=0（截圖驗收用），<html> 加 .wf-no-motion，浮層開合不等動態 */
  var noMotion = new URLSearchParams(window.location.search).get("motion") === "0";
  if (noMotion) document.documentElement.classList.add("wf-no-motion");
  var SMOOTH = noMotion ? "auto" : "smooth"; // 捲動時的動態
  /** 系統「減少動態」開著、或網址 motion=0：逐字一次出現、等待文案不淡出、輕提示不淡出（內容與流程不變） */
  function reducedMotion() {
    if (noMotion) return true;
    try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (err) { return false; }
  }

  /* 線框呈現（wireframe.config.js 的 visualMode）："gray"＝灰階（預設）、"client"＝元件稿。
     元件稿：<html> 加 data-wf-visual="client"，並載入 assets/client-theme.css（客戶外觀層）；
     頁面 HTML 與 class 不變。網址帶 visual=gray|client 可暫時覆寫（兩版比對用）。 */
  (function setupVisual() {
    var me = document.currentScript;
    var assetsBase = me && me.src ? me.src.replace(/[^/]*$/, "") : "../assets/";
    function apply(mode) {
      var client = mode === "client";
      document.documentElement.setAttribute("data-wf-visual", client ? "client" : "gray");
      if (!client || document.querySelector("link[data-wf-client-theme]")) return;
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = assetsBase + "client-theme.css";
      link.setAttribute("data-wf-client-theme", "");
      document.head.appendChild(link);
    }
    var forced = new URLSearchParams(window.location.search).get("visual");
    if (forced === "gray" || forced === "client") return apply(forced);
    if (window.WfConfig) return apply(window.WfConfig.visualMode);
    // 內頁沒有載入專案設定：從專案資料夾最上層讀 wireframe.config.js
    var s = document.createElement("script");
    s.src = assetsBase + "../wireframe.config.js";
    s.onload = function () { apply((window.WfConfig || {}).visualMode); };
    s.onerror = function () { apply("gray"); };
    document.head.appendChild(s);
  })();

  /* 資訊備註模式（殼層右上「資訊備註」）：在殼層裡才載入 assets/notes-frame.js——
     框選畫面區塊、擋掉互動與換頁、點狀態卡頭切狀態後的填值／點擊都由它負責，頁面不用另外引用。 */
  (function loadNotesFrame() {
    if (!inShell) return;
    var me = document.currentScript;
    var assetsBase = me && me.src ? me.src.replace(/[^/]*$/, "") : "../assets/";
    var s = document.createElement("script");
    s.src = assetsBase + "notes-frame.js";
    (document.head || document.documentElement).appendChild(s);
  })();

  /** 分頁暫存區（關掉分頁就清掉）；某些環境不允許存取時回傳 null */
  var tabStore = (function () {
    try {
      return window.sessionStorage;
    } catch (err) {
      return null;
    }
  })();

  function fileName() {
    return String(window.location.pathname || "").split("/").pop();
  }

  function ownParams() {
    var out = {};
    new URLSearchParams(window.location.search).forEach(function (v, k) {
      if (k !== "p" && k !== "motion") out[k] = v;
    });
    return out;
  }

  function ownCode() {
    return new URLSearchParams(window.location.search).get("p") || "";
  }

  function post(msg) {
    try {
      window.parent.postMessage(msg, "*");
    } catch (err) {}
  }

  /** 浮層掛在哪裡：App 頁＝.scr（畫面框內）；Web 頁＝body（固定在視窗上） */
  function root() {
    var scr = document.querySelector(".scr");
    return scr && !scr.hidden ? scr : document.body;
  }

  function byId(idOrEl) {
    if (!idOrEl) return null;
    if (typeof idOrEl !== "string") return idOrEl;
    return document.getElementById(idOrEl.replace(/^#/, ""));
  }

  function after(ms, fn) {
    return window.setTimeout(fn, ms);
  }

  var OVERLAY_MS = noMotion ? 0 : 240; // 與 shared.css 的 --dur-overlay 一致；motion=0 時不等動態

  /* ---------- 同頁多狀態 ---------- */

  /** data-show-when="A1.1-2 A1.1-3"：只有目前頁碼在清單內才顯示 */
  function syncShowWhen(code) {
    document.querySelectorAll("[data-show-when]").forEach(function (node) {
      var allowed = (node.getAttribute("data-show-when") || "").split(/\s+/).filter(Boolean);
      node.hidden = allowed.indexOf(code) === -1;
    });
  }

  /**
   * 切到某個狀態。ctx.source：
   *   "menu"＝從左側選單點進來（請顯示該狀態的示範資料）
   *   "boot"＝頁面剛載入
   *   "flow"＝操作流程中跳過來（例如送出失敗）
   */
  function applyCode(code, ctx) {
    ctx = ctx || {};
    ctx.params = ctx.params || {};
    ctx.source = ctx.source || "boot";
    // 從左側選單切狀態：先回到預設值（表單欄位、狀態下拉、選取、浮層），再由頁面依狀態設定
    if (ctx.source === "menu" && snap) resetState();
    currentCode = code;
    // 剛載入或從選單切狀態（使用者還沒操作）：頁面 apply 裡呼叫的互動函式（例：狀態下拉 set）不跳輕提示；
    // 操作流程中跳過來（source＝"flow"）的照常跳
    var quiet = ctx.source !== "flow";
    if (quiet) toastMuted += 1;
    try {
      if (handler && typeof handler.apply === "function") handler.apply(code, ctx);
    } finally {
      if (quiet) toastMuted -= 1;
    }
    syncShowWhen(code);
    // 同一份檔切到別的頁碼時，本頁用到的角色可能不同：回報殼層更新「檢視角色」
    if (inShell && ctx.source !== "boot") post({ wf: "roles", roles: pageRoles() });
  }

  /**
   * 每頁登記一次：
   * WfProto.registerPage({ defaultCode: "A1.1", apply: function (code, ctx) { … } })
   */
  function registerPage(h) {
    handler = h || null;
    // 元件（表格、分頁、篩選列…）在 boot 才初始化；頁面通常在 DOMContentLoaded 之前就呼叫 registerPage，
    // 這時先只記下 handler，等 boot 把元件都建好再套用頁碼——否則直接開狀態頁（?p=A1.1-2）時，
    // 頁面 apply 拿不到元件（例：表格的 _wfTable 還不存在），畫面停在預設狀態
    if (booted) startPage();
  }

  /** 元件都初始化完成後才做：記下預設值 → 套用網址指定的頁碼 → 通知殼層 */
  function startPage() {
    if (started) return;
    started = true;
    takeSnapshot(); // 記下 HTML 寫好的預設值，選單切狀態時回到這裡
    var code = ownCode() || (handler && handler.defaultCode) || "";
    applyCode(code, { source: "boot", params: ownParams() });
    if (inShell) post({ wf: "ready", file: fileName(), code: code, roles: pageRoles() });
  }

  /* ---------- 換頁（含轉場） ----------
     轉場 transition：
       "push"  ＝同層推進：新頁由右推入，返回時往右退出（導覽列左上放返回）
       "cover" ＝獨立任務：新頁由下覆蓋，關閉時往下退出（導覽列右上放 ×）
       "none"  ＝不做動態
     沒指定時：換到另一頁＝push；同一頁的狀態切換（A1.1 → A1.1-2）不做轉場。 */

  /** 換到另一份 HTML（同資料夾檔名），殼層會換成該檔的預設頁碼 */
  function go(file, params, options) {
    options = options || {};
    if (inShell) {
      post({ wf: "go", file: file, params: params || {}, transition: options.transition || "" });
      return;
    }
    var q = new URLSearchParams(params || {}).toString();
    window.location.href = file + (q ? "?" + q : "");
  }

  /** 跳到某個頁碼（可跨檔）；單獨開檔時只在本頁切狀態 */
  function goCode(code, params, options) {
    options = options || {};
    if (inShell) {
      post({
        wf: "goCode",
        code: code,
        params: params || {},
        source: options.source || "flow",
        replace: !!options.replace,
        transition: options.transition || "",
      });
      return;
    }
    applyCode(code, { source: options.source || "flow", params: params || {} });
  }

  /** 返回「上一動」（殼層記錄的堆疊，不寫死某一頁）；沒有上一步時用 fallbackCode */
  function goBack(fallbackCode, options) {
    options = options || {};
    if (!options.force && guard.isDirty()) {
      confirmLeave(function () { goBack(fallbackCode, { force: true }); });
      return;
    }
    guard.set(false);
    if (inShell) {
      post({ wf: "goBack", fallback: fallbackCode || "" });
      return;
    }
    if (fallbackCode) goCode(fallbackCode);
    else window.history.back();
  }

  /** 關閉（×）：結束這串獨立任務，回到「進入任務之前」的那一頁 */
  function closePage(fallbackCode, options) {
    options = options || {};
    if (!options.force && guard.isDirty()) {
      confirmLeave(function () { closePage(fallbackCode, { force: true }); });
      return;
    }
    guard.set(false);
    if (inShell) {
      post({ wf: "close", fallback: fallbackCode || "" });
      return;
    }
    if (fallbackCode) goCode(fallbackCode);
    else window.history.back();
  }

  /* ---------- 流程暫存（例如上一頁輸入的手機號碼） ---------- */
  var FLOW_KEY = "wf-flow";
  var flow = {
    get: function (key) {
      try {
        return (JSON.parse(tabStore.getItem(FLOW_KEY) || "{}") || {})[key];
      } catch (err) {
        return undefined;
      }
    },
    set: function (key, value) {
      try {
        var all = JSON.parse(tabStore.getItem(FLOW_KEY) || "{}") || {};
        all[key] = value;
        tabStore.setItem(FLOW_KEY, JSON.stringify(all));
      } catch (err) {}
    },
  };

  /* ---------- 表單 ---------- */

  function errorSlot(input, create) {
    var field = input.closest(".field") || input.parentElement;
    var slot = field.querySelector('[data-wf-error-for="' + input.id + '"]');
    if (!slot && create) {
      slot = document.createElement("p");
      slot.className = "field__error";
      slot.setAttribute("data-wf-error-for", input.id);
      slot.setAttribute("role", "alert");
      // 錯誤字緊貼欄位下方：有說明字（.field__help）時插在說明字之前，說明字在錯誤字之下
      var help = Array.prototype.filter.call(field.children, function (c) { return c.classList && c.classList.contains("field__help"); })[0];
      if (help) field.insertBefore(slot, help);
      else field.appendChild(slot);
    }
    return slot;
  }

  /** 顯示欄位錯誤：欄位加 is-error，訊息貼在欄位正下方 */
  function showFieldError(input, message) {
    var field = input.closest(".field");
    if (field) field.classList.add("is-error");
    input.setAttribute("aria-invalid", "true");
    var slot = errorSlot(input, true);
    slot.textContent = message;
    slot.hidden = false;
  }

  function clearFieldError(input) {
    var field = input.closest(".field");
    if (field) field.classList.remove("is-error");
    input.removeAttribute("aria-invalid");
    var slot = errorSlot(input, false);
    if (slot) {
      slot.textContent = "";
      slot.hidden = true;
    }
  }

  /**
   * 按鈕進入載入中：文字換成「○○中」＋三顆跳動圓點（5px、間距 4、1 秒循環、各錯開 0.15 秒；減少動態時圓點靜止），
   * 按鈕 disabled 擋重複點擊；回傳還原函式。
   *   WfProto.setButtonLoading(btn, "送出中")                       只鎖按鈕
   *   WfProto.setButtonLoading(btn, "送出中", { lockForm: true })   同時鎖住按鈕所在表單（或 lockForm 直接給表單元素）：
   *     表單內所有欄位與其他按鈕 disabled、表單加 .is-busy（淡化、不可點）；還原函式一併解鎖
   */
  function setButtonLoading(btn, label, options) {
    if (!btn) return function () {};
    options = options || {};
    var html = btn.innerHTML;
    btn.classList.add("is-loading");
    btn.disabled = true;
    btn.innerHTML = '<span class="btn__label">' + escHtml(label || "處理中") + '</span><span class="bdots" aria-hidden="true"><span></span><span></span><span></span></span>';
    // 整表單鎖定：lockForm 給 true＝按鈕所在的 <form>（或 form= 屬性指到的表單）；給元素＝那個容器
    var form = options.lockForm === true ? btn.form || btn.closest("form") : options.lockForm ? byId(options.lockForm) : null;
    var locked = [];
    if (form) {
      form.classList.add("is-busy");
      form.querySelectorAll("input, select, textarea, button").forEach(function (el) {
        if (el === btn) return;
        locked.push({ el: el, was: el.disabled });
        el.disabled = true;
      });
      // 按鈕放在表單外（置底區用 form= 指過來）時只淡化表單本身，不淡化置底區：按鈕要保持清楚看得到「○○中」
    }
    return function () {
      btn.classList.remove("is-loading");
      btn.disabled = false;
      btn.innerHTML = html;
      if (form) {
        form.classList.remove("is-busy");
        locked.forEach(function (x) { x.el.disabled = x.was; });
      }
    };
  }

  /** 欄位名稱：取 .field__label 的字，沒有就用 aria-label（給「請輸入〔欄位名稱〕」用） */
  function fieldName(input) {
    var field = input.closest(".field");
    var label = field && field.querySelector(".field__label");
    return ((label && label.textContent) || input.getAttribute("aria-label") || "").trim();
  }

  var VALIDATORS = {
    // 必填沒填：「請輸入〔欄位名稱〕」；下拉選單是「請選擇〔欄位名稱〕」
    required: {
      test: function (v) { return String(v || "").trim().length > 0; },
      message: function (input) { return (input.tagName === "SELECT" ? "請選擇" : "請輸入") + fieldName(input); },
    },
  };

  /**
   * 一次掛好表單行為：
   *   - 主按鈕一律可按；按下才完整檢查，有錯就擋住送出、各欄位下方顯示錯誤、捲到第一個錯誤欄位
   *   - 離開欄位時檢查（checkOn: "submit" 的欄位只在按下時檢查）
   *   - 錯誤在內容改為正確後才消失（還沒改對就維持）
   *   - 通過後按鈕進入載入中（停用）再換頁
   * config = {
   *   form: "表單 id", submitBtn: "按鈕 id",
   *   fields: [{ id: "輸入框 id", rules: ["required", { test: fn, message: "請輸入 09 開頭的 10 碼手機號碼" }], checkOn?: "submit" }],
   *   onInvalid: function (firstBadInput, values) {},   // 前端擋住時（可在此 goCode 到錯誤狀態）
   *   onSubmit: function (values) { return "下一頁.html" 或 "A1.2" 或 null },  // 回傳檔名就換頁、回傳頁碼就 goCode；falsy 留在本頁並結束載入中
   *   loadingLabel: "送出中", delay: 700,
   *   —— 以下選填，不給＝維持上面的預設行為 ——
   *   lockForm: true,        // 載入中同時鎖住整個表單（欄位 disabled＋.is-busy）；預設 true，給 false 只鎖按鈕
   *   clearOnInput: true,    // 錯誤出現後一重新輸入就立刻清掉（預設：改對才清）
   *   blurSkipEmpty: true,   // 空欄位離開不報錯，按送出才報「請輸入○○」（預設：空欄位離開就報）
   *   gateRules: true        // 主按鈕「條件未全過時灰但仍可點」：true＝用 fields 的規則判斷；
   *                          //   或 [{ id, rules }] 另一組較寬的條件；或 function (values) { return 布林 }
   *                          //   灰＝只套 .btn.is-disabled 樣式（不是真 disabled、也不加 aria-disabled），點了照樣跑完整驗證、顯示錯誤
   * }
   */
  function initForm(config) {
    var form = document.getElementById(config.form);
    if (!form) return;
    var btn = config.submitBtn ? document.getElementById(config.submitBtn) : form.querySelector('[type="submit"]') || document.querySelector('[type="submit"][form="' + form.id + '"]');
    var fields = (config.fields || []).map(function (f) {
      return { cfg: f, el: document.getElementById(f.id) };
    }).filter(function (f) { return !!f.el; });
    // 表單層級錯誤句（data-wf-form-error）：送出被擋時寫「有 n 個欄位需要修改」，錯誤都改好後自動收起
    var summary = (config.summary && document.getElementById(config.summary)) || form.querySelector("[data-wf-form-error]");
    function syncSummary(count) {
      if (!summary) return;
      if (count === undefined) count = fields.filter(function (f) { return hasError(f); }).length;
      if (count && !summary.hidden) summary.textContent = "有 " + count + " 個欄位需要修改";
      if (!count) summary.hidden = true;
    }

    function rule(r) {
      if (typeof r === "string") return VALIDATORS[r];
      // 只給函式時沒有文案：用「請輸入〔欄位名稱〕」；要寫出正確條件請改用 { test, message }
      if (typeof r === "function") return { test: r, message: VALIDATORS.required.message };
      return r;
    }

    /** 回傳第一條不符合的規則文案；全部符合回傳 null */
    function check(f) {
      var v = f.el.value;
      var list = f.cfg.rules || [];
      for (var i = 0; i < list.length; i += 1) {
        var r = rule(list[i]);
        if (r && !r.test(v)) return typeof r.message === "function" ? r.message(f.el) : r.message;
      }
      return null;
    }

    function hasError(f) {
      var field = f.el.closest(".field");
      return !!(field && field.classList.contains("is-error"));
    }

    /** gateRules：條件全過＝true。true＝用 fields 的規則；陣列＝另一組 { id, rules }；函式＝自己判斷 */
    function gateOpen() {
      var g = config.gateRules;
      if (!g) return true;
      if (typeof g === "function") {
        var values = {};
        fields.forEach(function (f) { values[f.cfg.id] = f.el.value; });
        return !!g(values);
      }
      var list = g === true ? fields : (Array.isArray(g) ? g : []).map(function (x) { return { cfg: x, el: document.getElementById(x.id) }; }).filter(function (x) { return !!x.el; });
      return list.every(function (f) { return check(f) === null; });
    }

    // 主按鈕一律可按（真 disabled 只在載入中）；沒有 gateRules 時清掉任何「條件滿足前停用」的樣子，
    // 有 gateRules 時條件未全過就套灰色（只加 .is-disabled 樣式），仍可點、點了跑完整驗證。
    // [待設計師確認] 刻意不加 aria-disabled：按鈕其實可點（點了會顯示錯誤），標成停用會讓讀屏與 Playwright（walk.mjs 的 click）都當它不能按
    function syncBtn() {
      if (!btn || btn.classList.contains("is-loading")) return;
      btn.classList.toggle("is-disabled", !gateOpen());
      btn.removeAttribute("aria-disabled");
    }

    fields.forEach(function (f) {
      // 離開欄位時檢查；checkOn: "submit" 的欄位只在按下主按鈕時檢查；
      // blurSkipEmpty 時空欄位離開不報錯（送出才報）
      f.el.addEventListener("blur", function () {
        if (f.cfg.checkOn === "submit" && !hasError(f)) return;
        if (config.blurSkipEmpty && !hasError(f) && !String(f.el.value || "").trim()) return;
        var err = check(f);
        if (err) showFieldError(f.el, err);
        else clearFieldError(f.el);
      });
      // 已經有錯時，每次輸入後重新判斷：改為正確才清掉錯誤；還沒改對就維持錯誤（文案換成目前沒過的那一條）
      // clearOnInput 時一重新輸入就清掉，離開欄位或送出時再判斷
      f.el.addEventListener("input", function () {
        syncBtn();
        if (!hasError(f)) return;
        if (config.clearOnInput) clearFieldError(f.el);
        else {
          var err = check(f);
          if (err) showFieldError(f.el, err);
          else clearFieldError(f.el);
        }
        syncSummary();
      });
      f.el.addEventListener("change", syncBtn);
    });
    syncBtn();
    form._wfSync = syncBtn;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (btn && btn.disabled) return;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // 送出先收鍵盤
      var values = {};
      var firstBad = null;
      fields.forEach(function (f) {
        values[f.cfg.id] = f.el.value;
        var err = check(f, "submit");
        if (err) {
          showFieldError(f.el, err);
          if (!firstBad) firstBad = f.el;
        } else {
          clearFieldError(f.el);
        }
      });
      if (summary) {
        var bad = fields.filter(function (f) { return hasError(f); }).length;
        summary.hidden = !bad;
        if (bad) summary.textContent = "有 " + bad + " 個欄位需要修改";
      }
      if (firstBad) {
        // 捲到第一個錯誤欄位；Web 桌機寬度再把焦點移過去，手機不移焦點（避免叫出鍵盤蓋住錯誤字）
        var target = firstBad.closest(".field") || firstBad;
        if (target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: SMOOTH });
        if (document.querySelector(".site") && window.innerWidth > 640) firstBad.focus({ preventScroll: true });
        if (typeof config.onInvalid === "function") config.onInvalid(firstBad, values);
        return;
      }
      // 載入中：按鈕換字＋三點；預設連整個表單一起鎖（lockForm:false 只鎖按鈕）
      var restore = setButtonLoading(btn, config.loadingLabel, { lockForm: config.lockForm !== false ? form : null });
      window.setTimeout(function () {
        var target = config.onSubmit ? config.onSubmit(values) : null;
        if (target) {
          // 回傳檔名（含 .html）就換頁；回傳頁碼（A1.2）就 goCode
          if (/\.html?(\?|#|$)/i.test(String(target))) go(target);
          else goCode(String(target));
          return;
        }
        restore();
        syncBtn();
      }, typeof config.delay === "number" ? config.delay : 700);
    });
  }

  /** 程式改了輸入框的值之後呼叫（主按鈕維持可按、不留停用樣子） */
  function syncForm(formId) {
    var form = document.getElementById(formId);
    if (form && form._wfSync) form._wfSync();
  }

  /* ============================================================
     浮層：底部面板、側邊抽屜、對話框、浮動選單
     規則：
     - 點遮罩可關：底部面板、側邊抽屜、浮動選單（選單沒有遮罩，點選單外任何地方即關）
     - 點遮罩不可關：對話框（要使用者做決定）
     - ESC：關最上層。對話框按 ESC＝按左邊的取消鈕；只有一顆鈕時＝按那顆
     - 圖層：系統層 ＞ 對話框 ＞ 遮罩 ＞ 底部面板／側邊抽屜 ＞ 浮動選單 ＞ 內容（數值在 shared.css 第 0 段）
     ============================================================ */
  var stack = []; // 目前開著的浮層，最後一個在最上層

  function kindOf(el) {
    if (!el || !el.classList) return "";
    if (el.classList.contains("sheet-layer")) return "sheet";
    if (el.classList.contains("drawer-layer")) return "drawer";
    if (el.classList.contains("alert-layer")) return "alert";
    if (el.classList.contains("popmenu")) return "popmenu";
    if (el.classList.contains("sidenav")) return "sidenav";
    if (el.classList.contains("edit-drawer-layer")) return "editdrawer";
    if (el.classList.contains("calendar-pop")) return "picker";
    if (el.hasAttribute("data-wf-popover")) return "popover";
    if (el.getAttribute("role") === "listbox") return "listbox";
    return "";
  }

  /** 會困住 Tab 的浮層（要先處理才能回到頁面）：對話框、底部面板、抽屜 */
  function isModal(el) {
    return ["alert", "sheet", "drawer", "sidenav", "editdrawer", "picker"].indexOf(kindOf(el)) >= 0;
  }

  /** 元素可見且可聚焦 */
  function focusables(box) {
    return Array.prototype.filter.call(
      box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (n) { return n.offsetParent !== null || n.getClientRects().length; }
    );
  }

  /** 從某個元素往後（或往前）找下一個可聚焦的元素，跳過 skip 容器裡的 */
  function focusFrom(el, backwards, skip) {
    var all = focusables(document.body).filter(function (n) { return !(skip && skip.contains(n)); });
    if (!all.length) return null;
    var idx = -1;
    for (var i = 0; i < all.length; i += 1) {
      var pos = el.compareDocumentPosition(all[i]);
      if (backwards) { if (pos & Node.DOCUMENT_POSITION_PRECEDING) idx = i; }
      else if (pos & Node.DOCUMENT_POSITION_FOLLOWING && !(pos & Node.DOCUMENT_POSITION_CONTAINED_BY)) { idx = i; break; }
    }
    var target = idx >= 0 ? all[idx] : null;
    if (target) target.focus();
    return target;
  }

  /** 焦點要放回去的地方：打開它的元素還在就回到它；不在了就回到更外層浮層的開啟者 */
  function restoreFocus(el) {
    var list = [el._wfOpener, el._wfOpenerOuter];
    for (var i = 0; i < list.length; i += 1) {
      var t = list[i];
      if (t && t.isConnected && t.focus && (t.offsetParent !== null || t.getClientRects().length)) {
        t.focus({ preventScroll: true });
        return true;
      }
    }
    return false;
  }

  /** 開啟時焦點落點：指定的 data-wf-autofocus → 對話框的取消鈕 → 目前選中項 → 第一個可聚焦元素 */
  function initialFocus(el) {
    var kind = kindOf(el);
    if (kind === "alert" && el.querySelector(".alert__field .input")) return null; // 輸入型另外處理（全選原值）
    var t = el.querySelector("[data-wf-autofocus]");
    if (!t && kind === "alert") t = el.querySelector("[data-wf-esc]") || el.querySelector(".alert__btn");
    if (!t) t = el.querySelector('[aria-checked="true"], [aria-selected="true"][role="option"], [aria-current]:not([aria-current="false"])');
    if (!t) t = focusables(el)[0];
    return t || null;
  }

  function emit(el, name) {
    try {
      el.dispatchEvent(new CustomEvent(name, { bubbles: true }));
    } catch (err) {}
  }

  /** 打開一個浮層（元素或 id）。對話框開啟時會把焦點放到裡面的輸入框（有的話） */
  function openOverlay(idOrEl, opener) {
    var el = byId(idOrEl);
    var kind = kindOf(el);
    if (!el || !kind) return null;
    // 記住打開它的元素：關閉時焦點回到這裡
    var active = opener || document.activeElement;
    if (active && active !== document.body && !el.contains(active)) {
      el._wfOpener = active;
      var outer = stack.filter(function (o) { return o !== el && o.contains(active); })[0];
      el._wfOpenerOuter = outer ? outer._wfOpener : null;
    }
    if (kind === "sidenav") {
      openSidenavDrawer(el);
    } else {
      if (el.parentElement !== root() && kind !== "popmenu" && kind !== "listbox" && kind !== "picker" && !el.closest(".scr")) root().appendChild(el);
      window.clearTimeout(el._wfHideTimer);
      el.hidden = false;
      void el.offsetHeight; // 先讓瀏覽器畫出起始位置，加 is-open 才有動態
      el.classList.add("is-open");
    }
    if (stack.indexOf(el) === -1) stack.push(el);
    emit(el, "wf:open");
    var input = el.querySelector(".alert__field .input");
    if (input) after(OVERLAY_MS, function () { input.focus(); if (input.select) input.select(); });
    else {
      var first = initialFocus(el);
      if (first) after(kind === "listbox" || kind === "popmenu" || kind === "picker" || kind === "popover" ? 0 : 40, function () { if (stack.indexOf(el) >= 0) first.focus({ preventScroll: kind !== "editdrawer" && kind !== "alert" ? false : true }); });
    }
    return el;
  }

  /** 關閉浮層：不給參數＝關最上層 */
  function closeOverlay(idOrEl) {
    var el = idOrEl ? byId(idOrEl) : stack[stack.length - 1];
    if (!el) return;
    var i = stack.indexOf(el);
    if (i >= 0) stack.splice(i, 1);
    var kind = kindOf(el);
    var hadFocus = document.activeElement && (el.contains(document.activeElement) || document.activeElement === document.body);
    if (document.activeElement && el.contains(document.activeElement) && document.activeElement.blur) document.activeElement.blur();
    el.classList.remove("is-open");
    if (kind === "popmenu") {
      removeCatcher();
      if (el._wfAnchor) el._wfAnchor.setAttribute("aria-expanded", "false");
    }
    if (kind === "sidenav") closeSidenavDrawer(el);
    else {
      if (kind === "listbox" || kind === "picker" || kind === "popover") el.hidden = true; // 小浮層沒有收合動態，立即隱藏
      else {
        el._wfHideTimer = after(OVERLAY_MS, function () {
          el.hidden = true;
          if (el.hasAttribute("data-wf-temp")) el.remove();
        });
      }
    }
    // 焦點回到打開它的元素（焦點在浮層裡、或已經掉到 body 時才搬，不搶使用者剛點的地方）
    if (hadFocus || !document.activeElement || document.activeElement === document.body) restoreFocus(el);
    emit(el, "wf:close");
  }

  function topOverlay() {
    return stack[stack.length - 1] || null;
  }

  var sheet = {
    open: function (id) { return openOverlay(id); },
    close: function (id) { closeOverlay(id); },
  };
  var drawer = {
    open: function (id) { return openOverlay(id); },
    close: function (id) { closeOverlay(id); },
    toggle: function (id) {
      var el = byId(id);
      if (el && el.classList.contains("is-open")) closeOverlay(el);
      else openOverlay(el);
    },
  };

  /* ---------- 浮動選單（更多） ----------
     共用一個選單給每一列的「⋯」：<button data-wf-popmenu="row-menu"> 放在每一列，選單只寫一份。
     打開時記住觸發的那一列（最近的 data-wf-row、表格列 tr 或清單項目 li），選單裡的動作自動作用在該列：
       · data-wf-delete（不填值）＝刪除流程成功後移除該列
       · data-wf-open-edit="抽屜 id"＝打開編輯抽屜，並把列上 data-wf-cell="欄位 id" 的文字帶進抽屜同 id 的欄位；
         儲存成功（WfProto.editDrawer.close(id, true)）時把欄位值寫回列上
       · data-wf-row-copy＝在該列下方插入一份副本（data-wf-row-title 的文字加「（副本）」），輕提示「已建立副本」
       · 其他項目：在該列觸發 wf:rowaction（detail.action＝項目的 data-wf-row-action 或文字），也可用 WfProto.popmenu.row(選單 id) 取得該列 */
  var catcher = null;
  function cssId(id) { return window.CSS && CSS.escape ? CSS.escape(id) : id; }
  function rowOf(el) { return (el && el.closest && el.closest("[data-wf-row], tr, li")) || null; }
  /** 把列上 data-wf-cell="欄位 id" 的值帶進 scope 裡同 id 的欄位 */
  function fillFromRow(scope, row) {
    if (!scope || !row) return;
    row.querySelectorAll("[data-wf-cell]").forEach(function (c) {
      var f = scope.querySelector("#" + cssId(c.getAttribute("data-wf-cell")));
      if (!f) return;
      var v = c.hasAttribute("data-value") ? c.getAttribute("data-value") : c.textContent.trim();
      if (f.tagName === "SELECT") {
        Array.prototype.forEach.call(f.options, function (o, i) { if (o.value === v || o.text === v) f.selectedIndex = i; });
      } else if (f.type === "checkbox" || f.type === "radio") f.checked = v === "true" || v === "是";
      else f.value = v;
      clearFieldError(f);
    });
    rteSync(scope);
  }
  /** 反方向：把 scope 裡的欄位值寫回列上 data-wf-cell 的文字 */
  function writeToRow(scope, row) {
    if (!scope || !row) return;
    row.querySelectorAll("[data-wf-cell]").forEach(function (c) {
      var f = scope.querySelector("#" + cssId(c.getAttribute("data-wf-cell")));
      if (!f) return;
      var v = f.tagName === "SELECT" ? (f.options[f.selectedIndex] ? f.options[f.selectedIndex].text : "") : f.type === "checkbox" ? (f.checked ? "是" : "否") : f.value.trim();
      if (c.hasAttribute("data-value")) c.setAttribute("data-value", f.value);
      c.textContent = v;
    });
  }
  /** 在列下方插入一份副本 */
  function copyRow(row, toastText) {
    if (!row || !row.parentNode) return null;
    var dup = row.cloneNode(true);
    dup.removeAttribute("id");
    dup.querySelectorAll("[id]").forEach(function (n) { n.removeAttribute("id"); });
    dup.querySelectorAll("[aria-expanded]").forEach(function (n) { n.setAttribute("aria-expanded", "false"); });
    var title = dup.querySelector("[data-wf-row-title]");
    if (title) title.textContent = title.textContent.trim() + "（副本）";
    row.parentNode.insertBefore(dup, row.nextSibling);
    toast(toastText || "已建立副本");
    return dup;
  }
  function removeCatcher() {
    if (catcher) catcher.remove();
    catcher = null;
  }

  /** 以觸發鈕定位打開選單：預設貼在觸發鈕下方、右緣對齊；下方放不下就翻上去 */
  function openPopmenu(idOrEl, anchor) {
    var menu = byId(idOrEl);
    if (!menu) return null;
    // 同時只開一個浮動選單
    stack.filter(function (o) { return kindOf(o) === "popmenu" && o !== menu; }).forEach(function (o) { closeOverlay(o); });
    var host = root();
    removeCatcher();
    // 透明接點層在選單「下面」：點選單外任何地方就收起
    catcher = document.createElement("div");
    catcher.className = "popmenu-catcher";
    host.appendChild(catcher);
    host.appendChild(menu);
    menu.hidden = false;
    menu.classList.remove("is-up");
    var hostRect = host === document.body ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight } : host.getBoundingClientRect();
    var a = anchor ? anchor.getBoundingClientRect() : { top: hostRect.top + 100, bottom: hostRect.top + 100, right: hostRect.left + hostRect.width - 20 };
    var w = menu.offsetWidth;
    var h = menu.offsetHeight;
    var left = Math.min(Math.max(8, a.right - hostRect.left - w), hostRect.width - w - 8);
    var top = a.bottom - hostRect.top + 4;
    if (top + h > hostRect.height - 42) {
      top = a.top - hostRect.top - h - 4;
      menu.classList.add("is-up");
    }
    menu.style.left = left + "px";
    menu.style.top = Math.max(8, top) + "px";
    menu._wfAnchor = anchor || null;
    menu._wfRow = rowOf(anchor); // 記住觸發的那一列：選單裡的刪除、編輯、複製都作用在這一列
    if (anchor) anchor.setAttribute("aria-expanded", "true"); // 列上的「⋯」在選單開著時保持顯示
    return openOverlay(menu, anchor);
  }

  var popmenu = {
    open: openPopmenu,
    close: function (id) { closeOverlay(id); },
    /** 這個選單最近一次是從哪一列打開的（表格列、清單項目或 data-wf-row 元素） */
    row: function (id) { var el = byId(id); return (el && el._wfRow) || null; },
    toggle: function (id, anchor) {
      var el = byId(id);
      if (el && el.classList.contains("is-open")) closeOverlay(el);
      else openPopmenu(el, anchor);
    },
  };

  /* ---------- 對話框 ----------
     WfProto.alert("dlg-id")             打開頁面裡寫好的 .alert-layer
     WfProto.alert({                     臨時產生一個（關掉就移除）
       title: "要刪除這筆紀錄嗎？",
       desc: "刪除後無法復原。",          // 可省略；失敗類只留標題
       actions: [                         // 一顆或兩顆；省略＝「我知道了」
         { label: "取消", role: "cancel" },
         { label: "刪除", role: "danger", onClick: function (value) { … return false 可阻止關閉 } }
       ],
       input: { value: "目前的名稱", placeholder: "…", maxLength: 20,
                emptyMessage: "請輸入 1～20 個字的名稱",          // 空白時按確認顯示的錯誤
                validate: function (v) { return "錯誤字" 或 "" } },
       system: false                      // true＝模擬系統權限框
     })
     輸入型（短輸入，例：重新命名）：開啟時預帶原值並全選；確認鈕一律可按，按下才檢查，
     不符合時在輸入框下方顯示一句寫出正確條件的錯誤，內容改為正確後錯誤消失。 */
  function alertBox(opts) {
    if (typeof opts === "string" || (opts && opts.nodeType === 1)) return openOverlay(opts);
    opts = opts || {};
    var actions = opts.actions && opts.actions.length ? opts.actions.slice(0, 2) : [{ label: "我知道了", role: "primary" }];
    var layer = document.createElement("div");
    layer.className = "alert-layer";
    layer.setAttribute("data-wf-temp", "");
    layer.hidden = true;
    var box = document.createElement("div");
    box.className = "alert" + (opts.system ? " alert--system" : "");
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    var title = document.createElement("p");
    title.className = "alert__title";
    title.textContent = opts.title || "";
    box.appendChild(title);
    if (opts.desc) {
      var desc = document.createElement("p");
      desc.className = "alert__desc";
      desc.textContent = opts.desc;
      box.appendChild(desc);
    }
    var input = null;
    var err = null;
    /** 輸入型的檢查：空白（且必填）回傳 emptyMessage，其餘交給 validate；沒問題回傳 "" */
    function inputError(value) {
      if (value === "" && opts.input.required !== false) return opts.input.emptyMessage || "請輸入" + (opts.input.name || "名稱");
      return opts.input.validate ? opts.input.validate(value) || "" : "";
    }
    if (opts.input) {
      var wrap = document.createElement("div");
      wrap.className = "alert__field field";
      input = document.createElement("input");
      input.className = "input";
      input.type = "text";
      input.value = opts.input.value || "";
      if (opts.input.placeholder) input.placeholder = opts.input.placeholder;
      if (opts.input.maxLength) input.maxLength = opts.input.maxLength;
      input.setAttribute("aria-label", opts.title || "輸入");
      wrap.appendChild(input);
      err = document.createElement("p");
      err.className = "field__error";
      err.hidden = true;
      wrap.appendChild(err);
      box.appendChild(wrap);
    }
    var acts = document.createElement("div");
    acts.className = "alert__acts";
    var confirmBtns = [];
    actions.forEach(function (act) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "alert__btn" + (act.role === "primary" ? " alert__btn--primary" : act.role === "danger" ? " alert__btn--danger" : "");
      b.textContent = act.label;
      if (act.role === "cancel") b.setAttribute("data-wf-esc", "");
      if (act.role !== "cancel") confirmBtns.push(b);
      b.addEventListener("click", function () {
        var value = input ? input.value.trim() : undefined;
        if (input && act.role !== "cancel") {
          var msg = inputError(value);
          if (msg) {
            wrap.classList.add("is-error");
            input.setAttribute("aria-invalid", "true");
            err.textContent = msg;
            err.hidden = false;
            return;
          }
        }
        var keep = typeof act.onClick === "function" ? act.onClick(value) : undefined;
        if (keep !== false) closeOverlay(layer);
      });
      acts.appendChild(b);
    });
    box.appendChild(acts);
    layer.appendChild(box);
    root().appendChild(layer);
    if (input) {
      // 已經有錯時，每次輸入後重新判斷：改為正確才清掉錯誤
      input.addEventListener("input", function () {
        if (wrap.classList.contains("is-error") && !inputError(input.value.trim())) {
          wrap.classList.remove("is-error");
          input.removeAttribute("aria-invalid");
          err.textContent = "";
          err.hidden = true;
        }
      });
      // 實體鍵盤 Enter＝按確認
      input.addEventListener("keydown", function (e) {
        var last = confirmBtns[confirmBtns.length - 1];
        if (e.key === "Enter" && last && !last.disabled) last.click();
      });
    }
    openOverlay(layer);
    return {
      el: layer,
      input: input,
      close: function () { closeOverlay(layer); },
    };
  }
  alertBox.open = function (id) { return openOverlay(id); };
  alertBox.close = function (id) { closeOverlay(id); };

  /* ---------- 輕提示 ----------
     WfProto.toast("已刪除")：統一停留 3 秒；出現在置底區上方 12px（沒有置底區時貼近畫面底部）。
     WfProto.toast("已封存", { action: { label: "復原", onClick: fn } })：可復原的操作附「復原」文字鈕，停留 5 秒。
     同時只會有一個，新的會取代舊的。 */
  var TOAST_MS = 3000;
  var toastEl = null;
  var toastTimer = null;
  function visible(el) {
    return !!(el && !el.hidden && el.offsetParent !== null && el.getClientRects().length);
  }
  function toast(text, options) {
    // 套用頁碼狀態期間（applyCode 靜音中）不顯示：回傳一個沒放進畫面的元素，呼叫端照常可用
    if (toastMuted > 0) {
      var silent = document.createElement("div");
      silent.className = "toast";
      return silent;
    }
    options = options || {};
    var action = options.action || null; // { label: "復原", onClick: fn }：只用於可復原的操作，停留 5 秒
    var ms = typeof options.ms === "number" ? options.ms : action ? 5000 : TOAST_MS;
    if (toastEl) toastEl.remove();
    window.clearTimeout(toastTimer);
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    var label = document.createElement("span");
    label.className = "toast__text";
    label.textContent = text;
    el.appendChild(label);
    if (action) {
      el.classList.add("toast--action");
      var undo = document.createElement("button");
      undo.type = "button";
      undo.className = "toast__action";
      undo.textContent = action.label || "復原";
      undo.addEventListener("click", function () {
        el.remove();
        if (toastEl === el) toastEl = null;
        if (typeof action.onClick === "function") action.onClick();
      });
      el.appendChild(undo);
    }
    var scr = root() === document.body ? null : root();
    var foot = scr ? scr.querySelector(".scr__foot") : null;
    if (scr && visible(foot)) foot.appendChild(el);
    else if (scr) {
      el.classList.add("toast--low");
      scr.appendChild(el);
    } else document.body.appendChild(el);
    // 淡入／淡出 200ms 由 shared.css 的 .toast／.toast.is-on 控制（減少動態、motion=0 時直接出現與消失）；
    // 重複觸發：先拿掉 .is-on、強制 reflow 再加回，動畫才會重播
    el.classList.remove("is-on");
    void el.offsetWidth;
    el.classList.add("is-on");
    toastEl = el;
    var fadeMs = reducedMotion() ? 0 : 200;
    toastTimer = after(ms, function () {
      el.classList.remove("is-on");
      after(fadeMs, function () {
        el.remove();
        if (toastEl === el) toastEl = null;
      });
    });
    return el;
  }

  /* ============================================================
     對話元件（WfProto.chat）：AI 對話頁的「送出 → 等待文案 → 打字中 → 逐字回覆 → 解鎖」整套。
     頁面只宣告對話流容器與輸入列，行為都在這裡；長相在 shared.css「3i 對話元件」。

     var chat = WfProto.chat.feed("chat-feed", {
       composer: "chat-composer",   // <form>：裡面有多行輸入框與送出鈕（輸入框空白時送出鈕 disabled）
       input: "chat-input", send: "chat-send",   // 省略＝composer 裡的 textarea／[type=submit]
       onSend: function (text, api, info) { … } // 使用者送出（Enter 或按鈕）；使用者泡泡已自動加上；多選組已勾的項目會併成「A、B：文字」一起送，info.picked／info.text 分開拿
     });
     chat.addBubble("ai"｜"user"｜"system", "文字或 HTML")        → 泡泡元素（AI 靠左、使用者靠右）
     chat.addTyping()                                           → 打字中泡泡（三點 6px、1 秒循環、位移 −4px）；回覆出現時 remove()
     chat.waitThen([{ text: "正在理解問題", ms: 800 }, …], cb)  → 等待文案泡泡逐段換字（換字淡出 200ms；減少動態不淡出）；
                                                                 走完移除泡泡、呼叫 cb。頁面隱藏時暫停、回來續走；回傳 { stop }
     chat.typeInto(bubble, "回覆全文", { first: 60, per: 24 }, done) → 逐字出現＋尾端游標；\n 換行；減少動態時整段一次出現
     chat.lockComposer(true｜false)                              → 回覆中鎖定：輸入框／送出／其他按鈕 disabled＋.is-reply-locked（data-wf-chat-keep 的按鈕不鎖）
     chat.scrollToBottom({ threshold: 48, force: false })        → 距底不到 48px 才自動捲（使用者往上看舊訊息時不搶捲）
     chat.addChoices({ type: "single"｜"multi", options: ["…"], onPick: fn, confirmLabel: "確認", skip: "先跳過", onSkip: fn })
                                                                 → 單選：點一顆就送出、整組收起；多選：外框＋至少一項才可按確認（框內靠右）
     chat.addInlineRetry("暫時無法回覆，", "再試一次", onRetry, { countdown: 10 }) → 對話流內純文字＋底線按鈕（countdown：先倒數才可點）
     chat.respond("回覆全文", { wait: [...], done: fn })          → 鎖定 → 等待文案 → 打字中 → 逐字 → 解鎖，一行搞定
     ============================================================ */
  var chat = (function () {
    /** 往上找第一個可捲動的容器（對話流自己、.scr__body…） */
    function scrollerOf(el) {
      for (var p = el; p && p !== document.body; p = p.parentElement) {
        var oy = getComputedStyle(p).overflowY;
        if (oy === "auto" || oy === "scroll") return p;
      }
      return document.scrollingElement || document.documentElement;
    }
    function textToHtml(text) {
      return escHtml(text).replace(/\n/g, "<br>");
    }

    function feed(idOrEl, opts) {
      opts = opts || {};
      var feedEl = byId(idOrEl);
      if (!feedEl) return null;
      feedEl.classList.add("chat-feed");
      var composer = byId(opts.composer) || feedEl.closest(".chat") && feedEl.closest(".chat").querySelector(".chat-composer") || null;
      var input = byId(opts.input) || (composer && composer.querySelector("textarea, input:not([type=hidden])")) || null;
      var send = byId(opts.send) || (composer && (composer.querySelector('[type="submit"]') || composer.querySelector(".chat-composer__send"))) || null;
      var locked = false;
      var currentWait = null;
      var api = {};

      /* ---- 捲動 ---- */
      function distToBottom() {
        var s = scrollerOf(feedEl);
        return s.scrollHeight - s.scrollTop - s.clientHeight;
      }
      function scrollToBottom(o) {
        o = o || {};
        var threshold = typeof o.threshold === "number" ? o.threshold : 48;
        if (!o.force && distToBottom() > threshold) return false;
        var s = scrollerOf(feedEl);
        s.scrollTop = s.scrollHeight;
        return true;
      }
      /** 新增元素前先量「本來就貼著底部嗎」，加完才決定要不要捲（避免新內容把距離撐大後判斷失準） */
      function append(node) {
        var near = distToBottom() <= 48;
        feedEl.appendChild(node);
        if (near) scrollToBottom({ force: true });
        return node;
      }

      /* ---- 泡泡 ---- */
      function addBubble(role, html) {
        role = role === "user" ? "user" : role === "system" ? "system" : "ai";
        var p = document.createElement("div");
        p.className = "bubble bubble--" + role;
        p.innerHTML = html == null ? "" : String(html);
        return append(p);
      }
      function addTyping() {
        var p = document.createElement("div");
        p.className = "bubble bubble--ai bubble--typing";
        p.setAttribute("aria-label", "回覆中");
        p.innerHTML = '<span class="tdots" aria-hidden="true"><span></span><span></span><span></span></span>';
        return append(p);
      }

      /* ---- 等待文案（分段換字）---- */
      function waitThen(steps, cb) {
        if (currentWait) currentWait.stop(); // 啟動前先停上一組，避免計時器累積
        steps = (steps || []).map(function (s) { return typeof s === "string" ? { text: s, ms: 900 } : s; });
        var p = document.createElement("div");
        p.className = "bubble bubble--ai bubble--wait";
        p.setAttribute("role", "status");
        var label = document.createElement("span");
        label.className = "bubble__wait";
        label.textContent = steps.length ? steps[0].text : "";
        p.appendChild(label);
        append(p);
        var idx = 0;
        var timer = null;
        var fadeTimer = null;
        var remaining = steps.length ? steps[0].ms : 0;
        var startedAt = 0;
        var stopped = false;
        var fade = reducedMotion() ? 0 : 200;
        function finish() {
          handle.stop();
          p.remove();
          if (typeof cb === "function") cb();
        }
        function advance() {
          idx += 1;
          if (idx >= steps.length) { finish(); return; }
          function swap() {
            label.textContent = steps[idx].text;
            label.classList.remove("is-fading");
            scrollToBottom();
            remaining = steps[idx].ms;
            run();
          }
          if (fade) { label.classList.add("is-fading"); fadeTimer = after(fade, swap); }
          else swap();
        }
        function run() {
          if (stopped || document.hidden) return;
          startedAt = Date.now();
          timer = after(remaining, advance);
        }
        function pause() {
          if (timer === null) return;
          window.clearTimeout(timer);
          timer = null;
          remaining = Math.max(0, remaining - (Date.now() - startedAt));
        }
        function onVis() { if (document.hidden) pause(); else if (!stopped && timer === null && !fadeTimer) run(); }
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("pagehide", pause);
        window.addEventListener("pageshow", onVis);
        var handle = {
          el: p,
          stop: function () {
            stopped = true;
            window.clearTimeout(timer);
            window.clearTimeout(fadeTimer);
            timer = null;
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("pagehide", pause);
            window.removeEventListener("pageshow", onVis);
            if (currentWait === handle) currentWait = null;
          },
        };
        currentWait = handle;
        if (!steps.length) { after(0, finish); return handle; }
        run();
        return handle;
      }

      /* ---- 逐字出現 ---- */
      function typeInto(el, text, o, done) {
        if (typeof o === "function") { done = o; o = null; }
        o = o || {};
        el = byId(el) || el;
        text = String(text == null ? "" : text);
        var first = typeof o.first === "number" ? o.first : 60;
        var per = typeof o.per === "number" ? o.per : 24;
        var stopped = false;
        var timer = null;
        if (reducedMotion()) {
          el.innerHTML = textToHtml(text);
          scrollToBottom();
          if (typeof done === "function") after(0, done);
          return { stop: function () {} };
        }
        var caret = document.createElement("span");
        caret.className = "type-caret";
        caret.setAttribute("aria-hidden", "true");
        el.innerHTML = "";
        el.appendChild(caret);
        var i = 0;
        function tick() {
          if (stopped) return;
          i += 1;
          el.innerHTML = textToHtml(text.slice(0, i));
          if (i < text.length) {
            el.appendChild(caret);
            scrollToBottom();
            timer = after(per, tick);
            return;
          }
          scrollToBottom();
          if (typeof done === "function") done();
        }
        timer = after(first, tick);
        return { stop: function () { stopped = true; window.clearTimeout(timer); } };
      }

      /* ---- 回覆中鎖定輸入列 ---- */
      function syncSend() {
        if (!send) return;
        send.disabled = locked || !(input && String(input.value || "").trim());
      }
      function lockComposer(on) {
        locked = !!on;
        if (composer) composer.classList.toggle("is-reply-locked", locked);
        if (input) {
          input.disabled = locked;
          if (locked && input.blur) input.blur(); // 收鍵盤
        }
        if (composer) {
          composer.querySelectorAll("button, input[type=button]").forEach(function (b) {
            if (b === send || b.hasAttribute("data-wf-chat-keep")) return; // 掃描入口這類仍可點的加 data-wf-chat-keep
            b.disabled = locked;
          });
        }
        syncSend();
        if (!locked && input && opts.focusAfterUnlock) input.focus(); // 選填：解鎖後把焦點放回輸入框
      }

      /* ---- 輸入列：自動長高、Enter 送出、空白不可送 ---- */
      function autoGrow() {
        if (!input || input.tagName !== "TEXTAREA") return;
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px"; // 上限由 CSS max-height（約 4 行）管，超過在框內捲
      }
      /** 使用者改打字送出時：多選組裡已勾的項目要跟文字一起送（「及／或」），沒點的組收起；回傳已勾的文字 */
      function collapsePendingChoices() {
        var picked = [];
        feedEl.querySelectorAll(".chat-choices").forEach(function (g) {
          if (g.classList.contains("chat-choices--multi")) {
            g.querySelectorAll('.chip[aria-pressed="true"]').forEach(function (c) { picked.push(c.textContent.trim()); });
          }
          g.remove();
        });
        return picked;
      }
      function submitText() {
        if (locked || !input) return;
        var text = String(input.value || "").trim();
        if (!text) return;
        input.value = "";
        autoGrow();
        syncSend();
        var picked = collapsePendingChoices(); // 已勾的多選項目併進這次送出；還沒點的選項組收起
        var sent = picked.length ? picked.join("、") + "：" + text : text;
        addBubble("user", textToHtml(sent));
        if (typeof opts.onSend === "function") opts.onSend(sent, api, { picked: picked, text: text });
      }
      if (input) {
        input.addEventListener("input", function () { autoGrow(); syncSend(); });
        input.addEventListener("keydown", function (e) {
          if (e.key !== "Enter" || e.shiftKey) return;
          if (e.isComposing || e.keyCode === 229) return; // 中文選字中按 Enter 是選字，不送出
          e.preventDefault();
          submitText();
        });
        autoGrow();
      }
      if (composer && composer.tagName === "FORM") {
        composer.addEventListener("submit", function (e) { e.preventDefault(); submitText(); });
      } else if (send) {
        send.addEventListener("click", submitText);
      }
      syncSend();

      /* ---- 追問選項（單選／多選膠囊）---- */
      function addChoices(o) {
        o = o || {};
        var multi = o.type === "multi";
        var wrap = document.createElement("div");
        wrap.className = "chat-choices" + (multi ? " chat-choices--multi" : "");
        var box = multi ? document.createElement("div") : wrap;
        if (multi) { box.className = "chip-group chat-choices__box"; wrap.appendChild(box); }
        if (o.title) {
          var t = document.createElement("p");
          t.className = "chip-group__title";
          t.textContent = o.title;
          box.appendChild(t);
        }
        var chips = document.createElement("div");
        chips.className = "chips" + (multi ? " chips--multi" : "");
        if (multi) chips.setAttribute("data-wf-select", "multi");
        (o.options || []).forEach(function (opt) {
          var label = typeof opt === "string" ? opt : opt.label;
          var value = typeof opt === "string" ? opt : (opt.value != null ? opt.value : opt.label);
          var b = document.createElement("button");
          b.type = "button";
          b.className = "chip";
          b.setAttribute("aria-pressed", "false");
          b.textContent = label;
          b.setAttribute("data-wf-value", value);
          if (!multi) {
            b.addEventListener("click", function () {
              wrap.remove(); // 單選：點一顆就送出、整組收起
              if (o.echo !== false) addBubble("user", escHtml(label));
              if (typeof o.onPick === "function") o.onPick(value, label);
            });
          }
          chips.appendChild(b);
        });
        box.appendChild(chips);
        if (multi) {
          var acts = document.createElement("div");
          acts.className = "chat-choices__acts";
          var ok = document.createElement("button");
          ok.type = "button";
          ok.className = "btn btn--primary btn--sm";
          ok.textContent = o.confirmLabel || "確認";
          ok.disabled = true; // 至少選一項才可按
          acts.appendChild(ok);
          box.appendChild(acts);
          chips.addEventListener("wf:select", function () {
            ok.disabled = !chips.querySelector('.chip[aria-pressed="true"]');
          });
          ok.addEventListener("click", function () {
            var picked = Array.prototype.map.call(chips.querySelectorAll('.chip[aria-pressed="true"]'), function (c) { return { value: c.getAttribute("data-wf-value"), label: c.textContent }; });
            if (!picked.length) return;
            wrap.remove();
            if (o.echo !== false) addBubble("user", escHtml(picked.map(function (x) { return x.label; }).join("、")));
            if (typeof o.onPick === "function") o.onPick(picked.map(function (x) { return x.value; }), picked.map(function (x) { return x.label; }));
          });
        }
        if (o.skip) {
          // 「先跳過」放外框外靠右
          var skipRow = document.createElement("div");
          skipRow.className = "chat-choices__skip";
          var skip = document.createElement("button");
          skip.type = "button";
          skip.className = "text-btn";
          skip.textContent = o.skip;
          skip.addEventListener("click", function () {
            wrap.remove();
            if (typeof o.onSkip === "function") o.onSkip();
          });
          skipRow.appendChild(skip);
          wrap.appendChild(skipRow);
        }
        return append(wrap);
      }

      /* ---- 已送出後失敗：對話流內一行純文字＋底線按鈕 ---- */
      function addInlineRetry(text, label, onRetry, o) {
        o = o || {};
        var p = document.createElement("p");
        p.className = "chat-retry";
        p.setAttribute("role", "status");
        var span = document.createElement("span");
        span.textContent = text || "";
        var b = document.createElement("button");
        b.type = "button";
        b.className = "text-btn";
        b.textContent = label || "再試一次";
        p.appendChild(span);
        p.appendChild(b);
        b.addEventListener("click", function () {
          if (b.disabled) return;
          p.remove();
          if (typeof onRetry === "function") onRetry();
        });
        if (o.countdown) {
          // 例：429 太頻繁——先倒數「10 秒後可再試」，數完才可點
          var left = Number(o.countdown);
          b.disabled = true;
          b.textContent = left + " 秒後可再試";
          var t = window.setInterval(function () {
            left -= 1;
            if (!p.isConnected) { window.clearInterval(t); return; }
            if (left > 0) { b.textContent = left + " 秒後可再試"; return; }
            window.clearInterval(t);
            b.disabled = false;
            b.textContent = label || "再試一次";
          }, 1000);
        }
        return append(p);
      }

      /* ---- 一行搞定：鎖定 → 等待文案 → 打字中 → 逐字 → 解鎖 ---- */
      function respond(text, o) {
        o = o || {};
        lockComposer(true);
        function typing() {
          var t = addTyping();
          after(typeof o.typingMs === "number" ? o.typingMs : 600, function () {
            t.remove();
            var b = addBubble("ai", "");
            typeInto(b, text, o.type || null, function () {
              lockComposer(false);
              if (typeof o.done === "function") o.done(b);
            });
          });
        }
        if (o.wait && o.wait.length) waitThen(o.wait, typing);
        else typing();
      }

      api.el = feedEl;
      api.composer = composer;
      api.input = input;
      api.send = send;
      api.addBubble = addBubble;
      api.addTyping = addTyping;
      api.waitThen = waitThen;
      api.typeInto = typeInto;
      api.lockComposer = lockComposer;
      api.isLocked = function () { return locked; };
      api.scrollToBottom = scrollToBottom;
      api.addChoices = addChoices;
      api.addInlineRetry = addInlineRetry;
      api.respond = respond;
      api.submit = submitText;
      api.clear = function () { feedEl.innerHTML = ""; };
      feedEl._wfChat = api;
      return api;
    }

    return { feed: feed, textToHtml: textToHtml };
  })();

  /* ---------- 刪除流程 ----------
     更多選單 → 確認對話框（紅字「刪除」）→ 對話框立刻關閉 → 輕提示「刪除中」→「已刪除」；失敗才再跳對話框。
     WfProto.deleteFlow({
       target: "#row-3",                     // 刪除成功後移除的元素（可省略）
       title: "要刪除這筆紀錄嗎？", desc: "刪除後無法復原。", confirmLabel: "刪除",
       second: { title: "確定要永久刪除？", desc: "…", confirmLabel: "永久刪除" },  // 兩段確認（可省略）
       fail: false,                          // true＝示範失敗：跳「刪除失敗」＋我知道了
       onDone: function () {}
     }) */
  function deleteFlow(opts) {
    opts = opts || {};
    var verb = opts.verb || "刪除";
    function run() {
      toast(opts.busyText || verb + "中");
      after(opts.delay || 900, function () {
        if (opts.fail) {
          if (toastEl) toastEl.remove();
          alertBox({ title: opts.failTitle || verb + "失敗" });
          return;
        }
        var target = typeof opts.target === "string" ? document.querySelector(opts.target) : opts.target;
        if (target) {
          // 焦點在被刪的那一列裡：先移到下一個元素（沒有就前一個），列消失後焦點不會掉到頁面最上方
          if (target.contains(document.activeElement)) focusFrom(target, false, target) || focusFrom(target, true, target);
          target.remove();
        }
        toast(opts.doneText || "已" + verb);
        if (typeof opts.onDone === "function") opts.onDone();
      });
    }
    alertBox({
      title: opts.title || "要" + verb + "嗎？",
      desc: opts.desc === undefined ? verb + "後無法復原。" : opts.desc,
      actions: [
        { label: "取消", role: "cancel" },
        {
          label: opts.confirmLabel || verb,
          role: "danger",
          onClick: function () {
            if (opts.second) {
              after(OVERLAY_MS, function () {
                alertBox({
                  title: opts.second.title,
                  desc: opts.second.desc,
                  actions: [
                    { label: "取消", role: "cancel" },
                    { label: opts.second.confirmLabel || verb, role: "danger", onClick: run },
                  ],
                });
              });
            } else run();
          },
        },
      ],
    });
  }

  /* ---------- 離開前確認（放棄修改？） ----------
     容器加 data-wf-guard：裡面有任何輸入或點選後，按返回／關閉會先問「要放棄修改嗎？」。
     存檔成功後呼叫 WfProto.guard.set(false)。 */
  var dirty = false;
  var guard = {
    set: function (v) { dirty = !!v; },
    isDirty: function () { return dirty; },
  };
  function confirmLeave(onLeave) {
    alertBox({
      title: "要放棄修改嗎？",
      desc: "修改的內容不會儲存。",
      actions: [
        { label: "繼續編輯", role: "cancel" },
        { label: "放棄", role: "danger", onClick: function () { dirty = false; after(OVERLAY_MS, onLeave); } },
      ],
    });
  }

  /* ---------- 驗證碼 ----------
     WfProto.otp(容器, {
       length: 6,                                   // 格數
       onComplete: function (code, api) {},         // 填滿自動呼叫（自動送出）；api.error("訊息") 清空並顯示紅字
       errorCode: "000000", next: "A1.3"            // 宣告式用法的簡寫：輸入 errorCode 顯示錯誤，其他六碼跳到 next
     })
     行為：打一碼自動跳下一格、退格回上一格、貼上整串自動分格、填滿自動送出；
     錯誤時清空全部格子、焦點回第一格、格子下方置中一句紅字。 */
  function otp(container, opts) {
    var box = byId(container);
    if (!box || box._wfOtp) return box && box._wfOtp;
    opts = opts || {};
    var len = opts.length || Number(box.getAttribute("data-wf-otp-length")) || 6;
    if (!box.querySelector("input")) {
      for (var n = 0; n < len; n += 1) {
        var c = document.createElement("input");
        c.className = "input";
        c.inputMode = "numeric";
        c.autocomplete = n === 0 ? "one-time-code" : "off";
        c.maxLength = 1;
        c.setAttribute("aria-label", "第 " + (n + 1) + " 碼");
        box.appendChild(c);
      }
    }
    var cells = Array.prototype.slice.call(box.querySelectorAll("input"));
    var field = box.closest(".field") || box.parentElement;
    var errEl = field.querySelector(".otp__error") || null;
    var busy = false;

    function value() {
      return cells.map(function (c) { return c.value; }).join("");
    }
    function clearError() {
      field.classList.remove("is-error");
      if (errEl) errEl.hidden = true;
    }
    function fill(str) {
      String(str).replace(/\D/g, "").slice(0, len).split("").forEach(function (d, i) { cells[i].value = d; });
      cells.forEach(function (c) { c.classList.toggle("is-filled", !!c.value); });
      var next = cells.filter(function (c) { return !c.value; })[0];
      (next || cells[len - 1]).focus();
      maybeDone();
    }
    var api = {
      value: value,
      fill: fill,
      error: function (msg) {
        busy = false;
        cells.forEach(function (c) { c.value = ""; c.classList.remove("is-filled"); });
        field.classList.add("is-error");
        if (!errEl) {
          errEl = document.createElement("p");
          errEl.className = "field__error otp__error";
          errEl.setAttribute("role", "alert");
          box.insertAdjacentElement("afterend", errEl);
        }
        errEl.textContent = msg || "驗證碼不正確，請輸入簡訊中的 6 位數驗證碼";
        errEl.hidden = false;
        cells[0].focus();
        after(OVERLAY_MS + 40, function () { if (errEl.scrollIntoView) errEl.scrollIntoView({ block: "nearest" }); });
      },
      reset: function () {
        busy = false;
        cells.forEach(function (c) { c.value = ""; c.classList.remove("is-filled"); });
        clearError();
      },
    };
    function maybeDone() {
      if (busy || value().length !== len) return;
      busy = true;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // 送出先收鍵盤
      var code = value();
      if (typeof opts.onComplete === "function") {
        opts.onComplete(code, api);
        return;
      }
      var errorCode = opts.errorCode || box.getAttribute("data-wf-otp-error") || "000000";
      var next = opts.next || box.getAttribute("data-wf-otp-next") || "";
      after(600, function () {
        if (code === errorCode) api.error(box.getAttribute("data-wf-otp-message") || "");
        else if (next) {
          busy = false;
          if (/\.html$/.test(next)) go(next);
          else goCode(next);
        } else {
          busy = false;
          toast("驗證成功");
        }
      });
    }
    cells.forEach(function (c, i) {
      c.addEventListener("input", function () {
        var digits = c.value.replace(/\D/g, "");
        if (digits.length > 1) {
          // 貼上或候選碼一次帶入整串
          fill(value().slice(0, i) + digits);
          return;
        }
        c.value = digits;
        c.classList.toggle("is-filled", !!digits);
        if (field.classList.contains("is-error")) clearError();
        if (digits && cells[i + 1]) cells[i + 1].focus();
        maybeDone();
      });
      c.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !c.value && cells[i - 1]) {
          cells[i - 1].value = "";
          cells[i - 1].classList.remove("is-filled");
          cells[i - 1].focus();
          e.preventDefault();
        }
      });
      c.addEventListener("paste", function (e) {
        var text = (e.clipboardData || window.clipboardData).getData("text");
        e.preventDefault();
        fill(text);
      });
      c.addEventListener("focus", function () {
        // 一律從第一個空格開始填
        var firstEmpty = cells.filter(function (x) { return !x.value; })[0];
        if (firstEmpty && cells.indexOf(firstEmpty) < i) firstEmpty.focus();
      });
    });
    box._wfOtp = api;
    return api;
  }

  /* ---------- 倒數（重新發送驗證碼） ----------
     <button type="button" class="text-btn" data-wf-countdown="60">重新發送</button>
     倒數中顯示「重新發送（52 秒）」並停用；歸零後變可點，點了重新倒數並提示「已重新發送驗證碼」。 */
  function countdown(btn, seconds, options) {
    btn = byId(btn);
    if (!btn) return function () {};
    options = options || {};
    var label = btn.getAttribute("data-wf-label") || btn.textContent.trim();
    btn.setAttribute("data-wf-label", label);
    window.clearInterval(btn._wfTimer);
    var left = seconds;
    function render() {
      if (left > 0) {
        btn.disabled = true;
        btn.textContent = label + "（" + left + " 秒）";
      } else {
        btn.disabled = false;
        btn.textContent = label;
        window.clearInterval(btn._wfTimer);
        if (typeof options.onEnd === "function") options.onEnd();
      }
    }
    render();
    btn._wfTimer = window.setInterval(function () {
      left -= 1;
      render();
    }, 1000);
    return function stop() { window.clearInterval(btn._wfTimer); };
  }

  /* ---------- 進度 ----------
     WfProto.progress(el, 40, "上傳中 40%")       設定確定進度（0–100）
     WfProto.simulateProgress(el, { ms: 3000, label: "上傳中", onDone })  假裝跑完一段上傳
     WfProto.rotateText(el, ["整理資料", "比對中", "產生結果"], 2000)   不定式等待時每 2 秒換一句，回傳停止函式 */
  function progress(el, pct, label) {
    el = byId(el);
    if (!el) return;
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    var fill = el.querySelector(".progress__fill");
    if (fill) fill.style.width = pct + "%";
    el.setAttribute("aria-valuenow", String(pct));
    var lab = el.querySelector(".progress__label");
    if (lab) lab.textContent = label != null ? label : pct + "%";
  }
  function simulateProgress(el, opts) {
    opts = opts || {};
    var ms = opts.ms || 3000;
    var start = Date.now();
    var word = opts.label || "上傳中";
    var timer = window.setInterval(function () {
      var pct = Math.min(100, ((Date.now() - start) / ms) * 100);
      progress(el, pct, word + " " + Math.round(pct) + "%");
      if (pct >= 100) {
        window.clearInterval(timer);
        if (typeof opts.onDone === "function") after(200, opts.onDone);
      }
    }, 100);
    return function stop() { window.clearInterval(timer); };
  }
  function rotateText(el, texts, ms) {
    el = byId(el);
    if (!el || !texts || !texts.length) return function () {};
    var i = 0;
    el.textContent = texts[0];
    var timer = window.setInterval(function () {
      i = (i + 1) % texts.length;
      el.textContent = texts[i];
    }, ms || 2000);
    return function stop() { window.clearInterval(timer); };
  }

  /* ---------- 步驟進度 ----------
     WfProto.steps(el, 2, 3) 或 <div class="steps-bar" data-wf-steps="3" data-wf-step="2"></div> */
  function steps(el, current, total, unit) {
    el = byId(el);
    if (!el) return;
    total = total || Number(el.getAttribute("data-wf-steps")) || 1;
    current = current || Number(el.getAttribute("data-wf-step")) || 1;
    unit = unit || el.getAttribute("data-wf-step-unit") || "題";
    el.setAttribute("data-wf-steps", String(total));
    el.setAttribute("data-wf-step", String(current));
    var bars = "";
    for (var i = 1; i <= total; i += 1) bars += "<i class=\"" + (i < current ? "is-done" : i === current ? "is-on" : "") + "\"></i>";
    el.innerHTML = '<div class="steps-bar__track" aria-hidden="true">' + bars + '</div><p class="steps-bar__label">第 ' + current + "／共 " + total + " " + unit + "</p>";
  }

  /* ---------- 權限詢問 ----------
     WfProto.permission({ name: "相機", onAllow, onDeny })
     第一次：模擬系統權限框（按鈕用系統原文「不允許／好」）；按不允許後回原畫面，不追加說明。
     之後再呼叫（已被拒）：App 自己的對話框「需要相機權限」＋「稍後再說｜前往系統設定」。
     主功能（掃描、拍照）要先放一頁權限說明頁（.perm），按「繼續」才呼叫本函式；輔助輸入（語音）直接呼叫。 */
  var permState = {};
  function permission(opts) {
    opts = opts || {};
    var name = opts.name || "相機";
    if (permState[name] === "denied") {
      alertBox({
        title: "需要" + name + "權限",
        desc: opts.deniedDesc || "請到系統設定開啟" + name + "權限，才能使用這個功能。",
        actions: [
          { label: "稍後再說", role: "cancel" },
          { label: "前往系統設定", role: "primary", onClick: function () { toast("已開啟系統設定"); } },
        ],
      });
      return;
    }
    if (permState[name] === "granted") {
      if (typeof opts.onAllow === "function") opts.onAllow();
      return;
    }
    alertBox({
      system: true,
      title: "「" + (opts.app || "這個 App") + "」想要取用你的" + name,
      desc: opts.reason || "用來完成你要做的操作。",
      actions: [
        { label: "不允許", role: "cancel", onClick: function () { permState[name] = "denied"; if (typeof opts.onDeny === "function") opts.onDeny(); } },
        { label: "好", role: "primary", onClick: function () { permState[name] = "granted"; if (typeof opts.onAllow === "function") after(OVERLAY_MS, opts.onAllow); } },
      ],
    });
  }
  permission.reset = function () { permState = {}; };

  /* ---------- 全站錯誤（全站共用對話框，各頁引用同一組，不每頁各畫一份） ----------
     WfProto.globalError("login")  登入失效：「請重新登入」＋「重新登入」（opts.loginCode 指定登入頁碼）
     WfProto.globalError("server")   使用者改不了的系統錯誤：「系統暫停服務」＋「我知道了」
     WfProto.globalError("failed", { action: "儲存" })  動作失敗：「儲存失敗」＋「我知道了」
     WfProto.globalError("account")  帳號不能用：「這個帳號無法使用」＋「登出」 */
  function globalError(kind, opts) {
    opts = opts || {};
    var preset = {
      login: { title: "請重新登入", desc: "登入已逾期，重新登入後會回到這一頁。", label: "重新登入" },
      server: { title: "系統暫停服務", desc: "", label: "我知道了" },
      failed: { title: (opts.action || "操作") + "失敗", desc: "", label: "我知道了" },
      account: { title: "這個帳號無法使用", desc: "如有疑問請聯絡客服。", label: "登出" },
    }[kind] || { title: opts.title || "發生錯誤", desc: "", label: "我知道了" };
    return alertBox({
      title: opts.title || preset.title,
      desc: opts.desc != null ? opts.desc : preset.desc,
      actions: [{
        label: opts.label || preset.label,
        role: "primary",
        onClick: function () {
          if (typeof opts.onConfirm === "function") opts.onConfirm();
          else if (opts.loginCode) goCode(opts.loginCode, {}, { transition: "cover" });
        },
      }],
    });
  }

  /* ---------- 載入更多 ----------
     WfProto.loadMore(清單, {
       render: function (i) { return "<li …>第 i 筆</li>"; },  // 產生第 i 筆（從 0 起）
       total: 30, batch: 10,         // 總筆數、每次載入幾筆
       auto: true,                   // true＝捲到底自動載入（顯示一列小轉圈）；false＝尾端放「載入更多」鈕
       endText: "沒有更多紀錄了"
     }) */
  function loadMore(list, opts) {
    list = byId(list);
    if (!list) return;
    opts = opts || {};
    var total = opts.total || 30;
    var batch = opts.batch || 10;
    var shown = list.children.length;
    var foot = document.createElement("div");
    list.insertAdjacentElement("afterend", foot);
    function renderFoot() {
      if (shown >= total) {
        foot.className = "list-end";
        foot.textContent = opts.endText || "沒有更多了";
        return;
      }
      foot.className = "load-more";
      if (opts.auto) {
        foot.innerHTML = '<span class="spinner spinner--sm" aria-hidden="true"></span>載入中';
      } else {
        foot.innerHTML = '<button type="button" class="btn btn--secondary btn--sm">載入更多</button>';
        foot.querySelector("button").addEventListener("click", more);
      }
    }
    var loading = false;
    function more() {
      if (loading || shown >= total) return;
      loading = true;
      if (!opts.auto) foot.innerHTML = '<span class="spinner spinner--sm" aria-hidden="true"></span>載入中';
      after(opts.delay || 700, function () {
        var html = "";
        for (var i = shown; i < Math.min(total, shown + batch); i += 1) html += opts.render(i);
        list.insertAdjacentHTML("beforeend", html);
        shown = Math.min(total, shown + batch);
        loading = false;
        renderFoot();
      });
    }
    renderFoot();
    if (opts.auto && window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) more();
      }, { root: list.closest(".scr__body") || null }).observe(foot);
    }
    return { more: more };
  }

  /* ============================================================
     Web 後台元件：資料表格、分頁、篩選列、側邊導覽、麵包屑、通知橫幅、提示泡泡
     規則（焦點歸還、Esc、點外面、Tab）見 knowledge/interaction-patterns/Web互動通用規則.md
     ============================================================ */
  function mq(query) {
    return window.matchMedia ? window.matchMedia(query) : { matches: false, addEventListener: function () {} };
  }
  var narrowMq = mq("(max-width: 1099px)"); // 側邊導覽改抽屜的寬度
  var hoverMq = mq("(hover: hover) and (pointer: fine)"); // 有滑鼠的裝置才顯示提示泡泡

  /* ---------- 資料表格 ----------
     <div class="data-table" data-wf-table> 自動掛上：欄排序、勾選列＋全選、批次操作列、狀態（載入中／空／篩到零／失敗）。
     WfProto.table("orders") 取得控制器：
       .sort(th, "ascending"|"descending")  .setState("loading"|"error"|"ready")  .selected()  .clearSelection()  .render() */
  function cellValue(row, idx) {
    var cell = row.cells[idx];
    if (!cell) return "";
    return cell.hasAttribute("data-sort-value") ? cell.getAttribute("data-sort-value") : cell.textContent.trim();
  }
  function compareBy(type) {
    return function (a, b) {
      if (type === "number") return (parseFloat(String(a).replace(/[^\d.-]/g, "")) || 0) - (parseFloat(String(b).replace(/[^\d.-]/g, "")) || 0);
      if (type === "date") return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; // 2026/10/12 這種格式直接比字串
      return String(a).localeCompare(String(b), "zh-Hant");
    };
  }
  var STATE_DEFAULTS = {
    empty: '<div class="empty"><p class="empty__title">還沒有資料</p></div>',
    filtered: '<div class="empty"><p class="empty__title">沒有符合條件的資料</p><p class="empty__desc">換個關鍵字，或清除篩選條件再試一次。</p><button type="button" class="btn btn--secondary btn--sm" data-wf-filter-clear>清除篩選</button></div>',
    error: '<div class="empty"><p class="empty__title">資料載入失敗</p><button type="button" class="btn btn--primary btn--sm" data-wf-table-retry>再試一次</button></div>',
  };

  function table(idOrEl) {
    var box = byId(idOrEl);
    if (!box) return null;
    if (box._wfTable) return box._wfTable;
    var tbl = box.querySelector("table");
    var body = tbl.tBodies[0];
    var selectAll = box.querySelector("[data-wf-select-all]");
    var bulk = box.querySelector(".bulk-bar");
    if (!bulk) box.classList.add("data-table--no-select"); // 沒有批次動作就不顯示勾選欄
    var forced = ""; // 程式指定的狀態（loading／error）；空字串＝依資料自動判斷
    if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1");

    function rows() { return Array.prototype.slice.call(body.rows); }
    function matched() { return rows().filter(function (r) { return !r.hasAttribute("data-wf-filtered-out"); }); }
    function rowBox(r) { return r.querySelector("[data-wf-select-row]"); }
    function setRowChecked(r, on) {
      var c = rowBox(r);
      if (c) c.checked = on;
      r.classList.toggle("is-selected", !!(c && c.checked));
    }
    function colCount() {
      var head = tbl.tHead && tbl.tHead.rows[0];
      return head ? head.cells.length : body.rows[0] ? body.rows[0].cells.length : 1;
    }
    function selected() { return rows().filter(function (r) { return !r.hidden && rowBox(r) && rowBox(r).checked; }); }

    function syncSelection() {
      var vis = rows().filter(function (r) { return !r.hidden && rowBox(r); });
      var n = selected().length;
      rows().forEach(function (r) { var c = rowBox(r); r.classList.toggle("is-selected", !!(c && c.checked)); });
      if (selectAll) {
        selectAll.checked = n > 0 && n === vis.length;
        selectAll.indeterminate = n > 0 && n < vis.length; // 部分勾選＝三態
      }
      if (bulk) {
        bulk.hidden = n === 0 || api.state !== "ready";
        bulk.querySelectorAll("[data-wf-count]").forEach(function (c) { c.textContent = String(n); });
        placeBulk();
      }
      emit(box, "wf:selection");
    }

    /* 批次操作列浮在視窗底部：水平置中於本表格（內容區），不隨捲動走；
       表格下方預留「列高＋與視窗底的距離＋16」，最後一列與分頁不被蓋住；輕提示同時往上讓位 */
    function placeBulk() {
      var html = document.documentElement;
      if (!bulk || bulk.hidden) {
        box.classList.remove("has-bulk-open");
        box.style.removeProperty("--bulk-space");
        if (!document.querySelector(".has-bulk-open")) html.style.removeProperty("--wf-bulk-offset");
        return;
      }
      var r = box.getBoundingClientRect();
      bulk.style.setProperty("--bulk-cx", Math.round(r.left + r.width / 2) + "px");
      bulk.style.setProperty("--bulk-max", Math.round(r.width) + "px");
      box.classList.add("has-bulk-open");
      var gap = window.innerHeight - bulk.getBoundingClientRect().bottom; // 與視窗底的距離（24，手機 16）
      box.style.setProperty("--bulk-space", Math.round(bulk.offsetHeight + gap + 16) + "px");
      html.style.setProperty("--wf-bulk-offset", Math.round(bulk.offsetHeight + gap + 12) + "px");
    }
    if (bulk) {
      window.addEventListener("resize", placeBulk);
      // 側欄收合、抽屜開合會改變表格位置與寬度：跟著重新置中
      if (window.ResizeObserver) new ResizeObserver(function () { placeBulk(); }).observe(box);
    }

    function applyState(name) {
      api.state = name;
      box.querySelectorAll(".table__state, .table__skeleton").forEach(function (n) { n.remove(); });
      body.hidden = name !== "ready";
      box.setAttribute("data-wf-state", name);
      if (name === "loading") box.setAttribute("aria-busy", "true");
      else box.removeAttribute("aria-busy");
      var cols = colCount();
      if (name === "loading") {
        var sk = document.createElement("tbody");
        sk.className = "table__skeleton";
        var n = Math.min(api.pager ? api.pageSize : 5, 5);
        var html = "";
        for (var i = 0; i < n; i += 1) {
          html += "<tr>";
          for (var j = 0; j < cols; j += 1) html += '<td><span class="skeleton skeleton--line"></span></td>';
          html += "</tr>";
        }
        sk.innerHTML = html;
        tbl.appendChild(sk);
      } else if (name !== "ready") {
        var tb = document.createElement("tbody");
        tb.className = "table__state";
        var tpl = box.querySelector('template[data-wf-table-state="' + name + '"]');
        tb.innerHTML = '<tr><td colspan="' + cols + '"></td></tr>';
        var cell = tb.querySelector("td");
        if (tpl) cell.appendChild(tpl.content.cloneNode(true));
        else cell.innerHTML = STATE_DEFAULTS[name] || "";
        tbl.appendChild(tb);
      }
      if (selectAll) selectAll.disabled = name !== "ready";
      if (api.pager) api.pager.el.hidden = name !== "ready" && name !== "loading";
      syncSelection();
    }

    var api = {
      el: box,
      state: "ready",
      page: 1,
      pageSize: Infinity,
      pager: null,
      rows: rows,
      matched: matched,
      selected: selected,
      /** 依篩選、排序、分頁重畫：只顯示目前這一頁；看不到的列自動取消勾選 */
      render: function () {
        var list = matched();
        if (api.pager) {
          var pages = Math.max(1, Math.ceil(list.length / api.pageSize));
          if (api.page > pages) api.page = pages;
        }
        var start = api.pager ? (api.page - 1) * api.pageSize : 0;
        var end = api.pager ? start + api.pageSize : list.length;
        var show = list.slice(start, end);
        rows().forEach(function (r) {
          r.hidden = show.indexOf(r) === -1;
          if (r.hidden) setRowChecked(r, false);
        });
        var auto = rows().length === 0 ? "empty" : list.length === 0 ? "filtered" : "ready";
        applyState(forced || auto);
        if (api.pager) api.pager.update(list.length);
      },
      /** 依某欄排序：再點同一欄切換升降冪；只有目前排序欄帶 aria-sort */
      sort: function (th, dir) {
        th = typeof th === "number" ? tbl.tHead.rows[0].cells[th] : th;
        var idx = th.cellIndex;
        var cur = th.getAttribute("aria-sort");
        dir = dir || (cur === "ascending" ? "descending" : "ascending");
        tbl.tHead.querySelectorAll("th").forEach(function (h) { h.removeAttribute("aria-sort"); });
        th.setAttribute("aria-sort", dir);
        var cmp = compareBy(th.getAttribute("data-wf-sort") || "text");
        rows().sort(function (a, b) { return cmp(cellValue(a, idx), cellValue(b, idx)) * (dir === "ascending" ? 1 : -1); })
          .forEach(function (r) { body.appendChild(r); });
        api.render();
        emit(box, "wf:sort");
      },
      /** 指定狀態："loading"（骨架列）、"error"（讀取失敗＋再試一次）；"ready"＝回到依資料自動判斷（空、篩到零、正常） */
      setState: function (name) {
        forced = name === "loading" || name === "error" ? name : "";
        api.render();
      },
      clearSelection: function () {
        rows().forEach(function (r) { setRowChecked(r, false); });
        syncSelection();
      },
      /** 勾選指定的列（陣列索引，從 0 起，只算目前看得到的列） */
      select: function (indexes) {
        var vis = rows().filter(function (r) { return !r.hidden; });
        (indexes || []).forEach(function (i) { if (vis[i]) setRowChecked(vis[i], true); });
        syncSelection();
      },
      syncSelection: syncSelection,
    };

    // 勾選：單列、全選本頁（只勾目前看得到的列）
    box.addEventListener("change", function (e) {
      if (e.target.matches("[data-wf-select-all]")) {
        rows().forEach(function (r) { if (!r.hidden) setRowChecked(r, e.target.checked); });
        syncSelection();
      } else if (e.target.matches("[data-wf-select-row]")) syncSelection();
    });
    box.addEventListener("click", function (e) {
      var t = e.target;
      var sortBtn = t.closest(".table__sort");
      if (sortBtn) { api.sort(sortBtn.closest("th")); return; }
      if (t.closest("[data-wf-clear-selection]")) {
        api.clearSelection();
        if (selectAll) selectAll.focus(); // 取消選取鈕跟著批次列消失，焦點移到全選框
        return;
      }
      if (t.closest("[data-wf-table-retry]")) {
        api.setState("loading");
        box.focus();
        after(900, function () { api.setState("ready"); });
        return;
      }
      var bt = t.closest("[data-wf-bulk-toast]");
      if (bt) {
        toast(bt.getAttribute("data-wf-bulk-toast").replace("{n}", selected().length));
        api.clearSelection();
        if (selectAll) selectAll.focus();
        return;
      }
      var bd = t.closest("[data-wf-bulk-delete]");
      if (bd) {
        var picked = selected();
        var n = picked.length;
        deleteFlow({
          verb: bd.getAttribute("data-wf-bulk-verb") || "刪除",
          title: (bd.getAttribute("data-wf-bulk-delete") || "要刪除這 {n} 筆嗎？").replace("{n}", n),
          desc: bd.hasAttribute("data-wf-bulk-desc") ? bd.getAttribute("data-wf-bulk-desc") : undefined,
          confirmLabel: bd.getAttribute("data-wf-bulk-confirm") || undefined,
          onDone: function () {
            picked.forEach(function (r) { r.remove(); });
            api.render();
            (selectAll && !selectAll.disabled ? selectAll : box).focus();
          },
        });
      }
    });

    // 列被刪除或加入時（刪除流程、載入更多）自動重算筆數與分頁
    if (window.MutationObserver) new MutationObserver(function () { api.render(); }).observe(body, { childList: true });
    box._wfTable = api;
    api.render();
    return api;
  }

  /* ---------- 分頁 ----------
     <nav class="pagination" aria-label="分頁" data-wf-pagination data-wf-for="表格容器 id" data-wf-page-size="10" data-wf-page-sizes="10,20,50"></nav>
     沒有連到表格時寫 data-wf-total="128"。換頁後焦點移到表格開頭；觸發 wf:page 事件 */
  var ICON_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>';
  function pagination(idOrEl, opts) {
    var nav = byId(idOrEl);
    if (!nav) return null;
    if (nav._wfPager) return nav._wfPager;
    opts = opts || {};
    if (!nav.getAttribute("aria-label")) nav.setAttribute("aria-label", "分頁");
    var linked = byId(opts.for || nav.getAttribute("data-wf-for") || "");
    var t = linked ? table(linked) : null;
    var api = {
      el: nav,
      page: opts.page || Number(nav.getAttribute("data-wf-page")) || 1,
      pageSize: opts.pageSize || Number(nav.getAttribute("data-wf-page-size")) || 10,
      total: opts.total || Number(nav.getAttribute("data-wf-total")) || 0,
      sizes: (opts.sizes || (nav.getAttribute("data-wf-page-sizes") || "10,20,50").split(",")).map(Number),
    };
    function pages() { return Math.max(1, Math.ceil(api.total / api.pageSize)); }
    /** 頁碼清單：第一頁、最後一頁、目前頁前後各一頁，其餘收成「…」 */
    function numbers() {
      var n = pages();
      var out = [];
      for (var i = 1; i <= n; i += 1) {
        if (i === 1 || i === n || Math.abs(i - api.page) <= 1 || n <= 7) out.push(i);
        else if (out[out.length - 1] !== "…") out.push("…");
      }
      return out;
    }
    function render() {
      var n = pages();
      var from = api.total ? (api.page - 1) * api.pageSize + 1 : 0;
      var to = Math.min(api.total, api.page * api.pageSize);
      nav.innerHTML =
        '<div class="pagination__info"><span>共 ' + api.total + " 筆</span>" +
        (api.total ? "<span>第 " + from + "–" + to + " 筆</span>" : "") +
        '<label class="pagination__size">每頁<select class="select" aria-label="每頁筆數">' +
        api.sizes.map(function (s) { return '<option value="' + s + '"' + (s === api.pageSize ? " selected" : "") + ">" + s + "</option>"; }).join("") +
        "</select>筆</label></div>" +
        '<ul class="pagination__pages">' +
        '<li><button type="button" class="pagination__btn pagination__prev" data-page="' + (api.page - 1) + '"' + (api.page <= 1 ? " disabled" : "") + ">" + ICON_PREV + "上一頁</button></li>" +
        numbers().map(function (p) {
          if (p === "…") return '<li class="pagination__gap" aria-hidden="true">…</li>';
          return '<li class="pagination__num"><button type="button" class="pagination__btn" data-page="' + p + '" aria-label="第 ' + p + ' 頁"' + (p === api.page ? ' aria-current="page"' : "") + ">" + p + "</button></li>";
        }).join("") +
        '<li class="pagination__status">第 ' + api.page + "／共 " + n + " 頁</li>" +
        '<li><button type="button" class="pagination__btn pagination__next" data-page="' + (api.page + 1) + '"' + (api.page >= n ? " disabled" : "") + ">下一頁" + ICON_NEXT + "</button></li></ul>";
    }
    api.update = function (total) {
      api.total = total;
      if (api.page > pages()) api.page = pages();
      render();
    };
    /** 換到第 p 頁：連到表格時重畫表格並把焦點移到表格開頭；沒連表格時焦點留在同一顆鈕 */
    api.go = function (p, from) {
      p = Math.max(1, Math.min(pages(), p));
      if (p === api.page) return;
      api.page = p;
      if (t) {
        t.page = p;
        t.render();
        t.el.focus({ preventScroll: true });
        if (t.el.scrollIntoView) t.el.scrollIntoView({ block: "start", behavior: SMOOTH });
      } else {
        render();
        var again = from && nav.querySelector(from.classList.contains("pagination__prev") ? ".pagination__prev" : from.classList.contains("pagination__next") ? ".pagination__next" : '[aria-current="page"]');
        if (again && !again.disabled) again.focus();
        else if (nav.querySelector('[aria-current="page"]')) nav.querySelector('[aria-current="page"]').focus();
      }
      emit(nav, "wf:page");
    };
    api.setPageSize = function (size) {
      api.pageSize = size;
      api.page = 1;
      if (t) { t.pageSize = size; t.page = 1; t.render(); }
      else render();
      emit(nav, "wf:page");
    };
    nav.addEventListener("click", function (e) {
      var b = e.target.closest(".pagination__btn");
      if (b && !b.disabled) api.go(Number(b.getAttribute("data-page")), b);
    });
    nav.addEventListener("change", function (e) {
      if (e.target.matches("select")) {
        api.setPageSize(Number(e.target.value));
        var sel = nav.querySelector("select");
        if (sel) sel.focus();
      }
    });
    nav._wfPager = api;
    if (t) {
      t.pager = api;
      t.pageSize = api.pageSize;
      t.page = api.page;
      t.render();
    } else render();
    return api;
  }

  /* ---------- 下拉清單（listbox）：篩選下拉用 ----------
     按鈕 Enter／Space／↓ 打開並聚焦目前選中項；↑ 打開並聚焦最後一項；清單內 ↑↓ 移動、Home／End、打字跳到該字開頭的項目；
     Enter／Space 選定並關閉；Esc 關閉；Tab 關閉並讓焦點往下走；點外面關閉。關閉後焦點回到按鈕 */
  function listbox(rootEl, onPick, opts) {
    var btn = rootEl.querySelector("[aria-haspopup]");
    var menu = rootEl.querySelector('[role="listbox"]');
    if (!btn || !menu || menu._wfListbox) return;
    var multi = !!(opts && opts.multi); // 多值：選了切換勾選、清單不關
    if (multi) menu.setAttribute("aria-multiselectable", "true");
    menu._wfListbox = true;
    menu._wfRoot = rootEl;
    function options() { return Array.prototype.slice.call(menu.querySelectorAll('[role="option"]:not([aria-disabled="true"])')); }
    options().forEach(function (o) { o.tabIndex = -1; });
    function isOpen() { return stack.indexOf(menu) >= 0; }
    function open(focusLast) {
      if (isOpen()) return;
      menu.classList.remove("is-right");
      menu.hidden = false;
      var r = menu.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) menu.classList.add("is-right");
      btn.setAttribute("aria-expanded", "true");
      openOverlay(menu, btn);
      var list = options();
      if (focusLast) after(0, function () { if (list.length) list[list.length - 1].focus(); });
      // 沒有選中項（多值清單一個都沒勾）時，焦點落在第一個選項
      else if (!menu.querySelector('[role="option"][aria-selected="true"]')) after(0, function () { if (list.length) list[0].focus(); });
    }
    function close() { if (isOpen()) closeOverlay(menu); }
    function pick(o) {
      if (multi) {
        var on = o.getAttribute("aria-selected") !== "true";
        o.setAttribute("aria-selected", on ? "true" : "false");
        if (typeof onPick === "function") onPick(o.getAttribute("data-value") || "", o.textContent.trim(), o, on);
        return;
      }
      options().forEach(function (x) { x.setAttribute("aria-selected", x === o ? "true" : "false"); });
      close();
      if (typeof onPick === "function") onPick(o.getAttribute("data-value") || "", o.textContent.trim(), o);
    }
    menu.addEventListener("wf:close", function () { btn.setAttribute("aria-expanded", "false"); });
    btn.addEventListener("click", function () { if (isOpen()) close(); else open(false); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        open(e.key === "ArrowUp");
      }
    });
    menu.addEventListener("click", function (e) {
      var o = e.target.closest('[role="option"]');
      if (o && o.getAttribute("aria-disabled") !== "true") pick(o);
    });
    menu.addEventListener("keydown", function (e) {
      var list = options();
      var i = list.indexOf(document.activeElement);
      if (!list.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); (list[i + 1] || list[i] || list[0]).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (list[i - 1] || list[0]).focus(); }
      else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (list[i]) pick(list[i]); }
      else if (e.key === "Tab") close(); // 焦點先回按鈕，瀏覽器再照 Tab 往下（或 Shift+Tab 往上）移
      else if (e.key.length === 1 && /\S/.test(e.key)) {
        // 打字跳到該字開頭的項目（從目前項目往後找，跳過停用項）
        var from = list.slice(i + 1).concat(list.slice(0, i + 1));
        var hit = from.filter(function (o) { return o.textContent.trim().indexOf(e.key) === 0; })[0];
        if (hit) hit.focus();
      }
    });
    return { open: open, close: close, pick: pick };
  }

  /* ---------- 篩選列 ----------
     <div class="filter-bar" id="…" data-wf-filter data-wf-for="表格容器 id">，全部用屬性宣告：
       · 搜尋：.search__input，打字 250ms 後套用（Enter 立即套用）
       · 篩選下拉：.filter-select[data-wf-filter-key="status"]，比對每列的 data-status
           單選；選項 data-value 可寫多個值「待付款|待出貨|處理中」＝符合任一（例：「未結案」）
           加 data-wf-filter-multi＝多值：可複選、清單不關，符合任一個勾選值
       · 範圍：.filter-range[data-wf-filter-key="amount"][data-wf-filter-range="number"]＝數值區間（最低／最高小面板，自動產生）；
           data-wf-filter-range="date" 裡放日期區間選擇（data-wf-datepicker="range"，可加 data-wf-time）＝日期區間，
           比對每列的 data-amount（數字）／data-date（YYYY/MM/DD，可帶 HH:mm）
       · 已套用條件：每個條件一個可移除的標籤＋「清除全部」；套用後表格回到第 1 頁，全部篩掉時表格顯示「沒有符合條件」
     統計數字卡連動：<div class="stat-cards" data-wf-stat-filter="篩選列 id"> 裡的卡寫 data-wf-filter-set="status=待付款|待出貨"，
       點了套用、再點一次取消；值留空（status=）＝「全部」卡，點了清掉該條件。篩選列怎麼改，卡片選中態都跟著同步 */
  function splitVals(v) { return String(v == null ? "" : v).split("|").map(function (x) { return x.trim(); }).filter(Boolean); }
  function sameSet(a, b) {
    a = a || [];
    b = b || [];
    return a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; });
  }
  function optLabel(o) {
    if (o.hasAttribute("data-label")) return o.getAttribute("data-label");
    var sub = o.querySelector(".filter-select__option-sub");
    return (sub ? o.textContent.replace(sub.textContent, "") : o.textContent).trim();
  }
  var numFmt = function (n) { return Number(n).toLocaleString("en-US"); };

  function filterBar(idOrEl) {
    var bar = byId(idOrEl);
    if (!bar) return null;
    if (bar._wfFilter) return bar._wfFilter;
    var linked = byId(bar.getAttribute("data-wf-for") || "");
    var t = linked ? table(linked) : null;
    var search = bar.querySelector(".search__input");
    var applied = bar.querySelector(".filter-bar__applied");
    var tags = applied && applied.querySelector(".filter-tags");
    var selects = Array.prototype.slice.call(bar.querySelectorAll(".filter-select"));
    var ranges = Array.prototype.slice.call(bar.querySelectorAll(".filter-range"));
    var statGroups = bar.id ? Array.prototype.slice.call(document.querySelectorAll('[data-wf-stat-filter="' + bar.id + '"]')) : [];
    var values = {}; // 下拉：值陣列（空陣列＝全部）；範圍：{ min, max }（null＝不限）
    var labels = {}; // 已套用標籤顯示的值
    var names = {};  // 條件名稱（下拉／範圍按鈕上的欄位名）
    var types = {};  // 範圍類型：number／date
    var q = "";
    var timer = null;

    function keyOf(el) { return el.getAttribute("data-wf-filter-key"); }
    function nameOf(el) {
      var l = el.querySelector(".filter-select__label");
      return l ? l.textContent.trim() : el.getAttribute("data-wf-filter-name") || keyOf(el);
    }
    function selectFor(key) { return selects.filter(function (fs) { return keyOf(fs) === key; })[0] || null; }
    function rangeFor(key) { return ranges.filter(function (fr) { return keyOf(fr) === key; })[0] || null; }

    /** 下拉：依值陣列更新選中、按鈕上的字與已套用文字。
        同一組值只列一個名稱：
          · 群組選項（例：「未結案」＝待處理|處理中）被選時，它包含的單項不再另列
          · 值相同的兩個選項（例：「指派給我」與同一人的名字）只列一個，用使用者實際點的那一個 */
    function setSelectUi(fs, vals) {
      var key = keyOf(fs);
      var multi = fs.hasAttribute("data-wf-filter-multi");
      var opts = Array.prototype.slice.call(fs.querySelectorAll('[role="option"]'));
      if (!vals.length) { fs._wfPicks = []; }
      var picks = (fs._wfPicks || []).filter(function (o) { return opts.indexOf(o) >= 0; }); // 使用者點過的選項（新的在後）
      function ovOf(o) { return splitVals(o.getAttribute("data-value")); }
      function isPicked(o) { return picks.indexOf(o) >= 0; }
      // 符合目前條件的選項
      var hits = opts.filter(function (o) {
        var ov = ovOf(o);
        if (!vals.length) return !ov.length; // 沒有條件＝「全部」
        return ov.length > 0 && (multi ? ov.every(function (x) { return vals.indexOf(x) >= 0; }) : sameSet(ov, vals));
      });
      // 值相同的選項只留一個：使用者最近點的優先，否則留第一個
      var kept = [];
      hits.forEach(function (o) {
        var same = kept.filter(function (k) { return sameSet(ovOf(k), ovOf(o)); })[0];
        if (!same) kept.push(o);
        else if (isPicked(o) && (!isPicked(same) || picks.indexOf(o) > picks.indexOf(same))) kept[kept.indexOf(same)] = o;
      });
      // 被群組選項包含的單項：勾選照常顯示，但不另列名稱
      var shown = kept.filter(function (o) {
        var ov = ovOf(o);
        return !kept.some(function (g) {
          var gv = ovOf(g);
          return g !== o && gv.length > ov.length && ov.every(function (x) { return gv.indexOf(x) >= 0; });
        });
      });
      var picked = [];
      opts.forEach(function (o) {
        var on = kept.indexOf(o) >= 0;
        o.setAttribute("aria-selected", on ? "true" : "false");
        if (on && shown.indexOf(o) >= 0 && ovOf(o).length) picked.push(optLabel(o));
      });
      var label = picked.length ? picked.join("、") : vals.join("、");
      values[key] = vals.slice();
      labels[key] = vals.length ? label : "";
      names[key] = nameOf(fs);
      fs.classList.toggle("is-active", vals.length > 0);
      var v = fs.querySelector(".filter-select__value");
      if (v) v.textContent = !vals.length ? fs.getAttribute("data-wf-all-label") || "全部" : picked.length > 2 ? picked.length + " 項" : label;
    }
    /** 範圍：顯示文字「1,000～5,000」「1,000 以上」「5,000 以下」 */
    function rangeText(r, type) {
      var f = type === "number" ? numFmt : function (x) { return x; };
      if (r.min !== "" && r.max !== "") return f(r.min) + "～" + f(r.max);
      if (r.min !== "") return f(r.min) + (type === "number" ? " 以上" : " 起");
      return f(r.max) + (type === "number" ? " 以下" : " 止");
    }
    function setRangeUi(fr, r) {
      var key = keyOf(fr);
      var type = types[key];
      r = r && (r.min !== "" || r.max !== "") ? r : null;
      values[key] = r;
      labels[key] = r ? rangeText(r, type) : "";
      names[key] = nameOf(fr);
      fr.classList.toggle("is-active", !!r);
      if (type === "number") {
        var v = fr.querySelector(".filter-select__value");
        if (v) v.textContent = r ? labels[key] : fr.getAttribute("data-wf-all-label") || "全部";
        var ins = fr._wfPanel ? fr._wfPanel.querySelectorAll(".input") : [];
        if (ins.length === 2) { ins[0].value = r ? r.min : ""; ins[1].value = r ? r.max : ""; }
      } else if (!r && fr._wfDate) {
        fr._wfSilent = true; // 清掉日期區間時不要再觸發一次套用
        fr._wfDate.set("", "");
        fr._wfSilent = false;
      }
    }
    function inRange(cell, r, type) {
      if (cell == null) return false;
      if (type === "number") {
        var n = parseFloat(String(cell).replace(/[^\d.-]/g, ""));
        if (isNaN(n)) return false;
        return (r.min === "" || n >= Number(r.min)) && (r.max === "" || n <= Number(r.max));
      }
      // 日期：YYYY/MM/DD 直接比字串；條件帶時刻時，列上沒時刻的補 00:00
      var c = String(cell).trim();
      var withTime = String(r.min).length > 10 || String(r.max).length > 10;
      c = withTime ? (c.length > 10 ? c : c + " 00:00") : c.slice(0, 10);
      return (r.min === "" || c >= r.min) && (r.max === "" || c <= r.max);
    }
    function renderTags() {
      if (!applied || !tags) return;
      var items = [];
      if (q) items.push({ key: "__q", text: "關鍵字：" + q });
      Object.keys(values).forEach(function (k) {
        var v = values[k];
        if (v && (Array.isArray(v) ? v.length : true)) items.push({ key: k, text: (names[k] || k) + "：" + labels[k] });
      });
      tags.innerHTML = items.map(function (it) {
        return '<li><span class="filter-tag">' + escHtml(it.text) + '<button type="button" class="filter-tag__remove" data-key="' + escHtml(it.key) + '" aria-label="移除條件 ' + escHtml(it.text) + '"></button></span></li>';
      }).join("");
      applied.hidden = !items.length;
    }
    /** 統計數字卡選中態＝目前條件是否剛好等於卡片的值 */
    function syncStats() {
      statGroups.forEach(function (g) {
        g.querySelectorAll("[data-wf-filter-set]").forEach(function (c) {
          var p = parseSet(c);
          if (!p.vals.length) return; // 「全部」卡不顯示選中
          c.setAttribute("aria-pressed", sameSet(values[p.key], p.vals) ? "true" : "false");
        });
      });
    }
    function parseSet(c) {
      var raw = c.getAttribute("data-wf-filter-set") || "";
      var i = raw.indexOf("=");
      return { key: raw.slice(0, i).trim(), vals: splitVals(raw.slice(i + 1)) };
    }
    function apply() {
      if (t) {
        t.rows().forEach(function (r) {
          var ok = !q || r.textContent.indexOf(q) >= 0;
          Object.keys(values).forEach(function (k) {
            var v = values[k];
            if (!v) return;
            var cell = r.getAttribute("data-" + k);
            if (Array.isArray(v)) { if (v.length && v.indexOf(cell) < 0) ok = false; }
            else if (!inRange(cell, v, types[k])) ok = false;
          });
          if (ok) r.removeAttribute("data-wf-filtered-out");
          else r.setAttribute("data-wf-filtered-out", "");
        });
        t.page = 1;
        if (t.pager) t.pager.page = 1;
        t.render();
      }
      renderTags();
      syncStats();
      emit(bar, "wf:filter");
    }
    /** 設定某個條件：字串（"" 或 "a|b"）、陣列（多值）、{ min, max }（範圍）、null／""＝清除 */
    function setKey(key, value) {
      var fs = selectFor(key);
      var fr = rangeFor(key);
      if (fr) {
        var r = value && typeof value === "object" && !Array.isArray(value) ? { min: String(value.min == null ? "" : value.min), max: String(value.max == null ? "" : value.max) } : null;
        setRangeUi(fr, r);
        if (r && fr._wfDate) { fr._wfSilent = true; fr._wfDate.set(r.min, r.max); fr._wfSilent = false; }
        return;
      }
      var vals = Array.isArray(value) ? value.slice() : splitVals(value);
      if (fs) setSelectUi(fs, vals);
      else {
        // 只靠統計數字卡設定、沒有對應下拉的條件
        values[key] = vals;
        labels[key] = vals.join("、");
      }
    }
    var api = {
      el: bar,
      values: values,
      /** 設定某個條件並套用：set("status", "待出貨")、set("status", ["待付款", "待出貨"])、set("amount", { min: 1000, max: 5000 })；空值＝清除 */
      set: function (key, value) {
        setKey(key, value);
        apply();
      },
      /** 設定搜尋字並套用 */
      search: function (text) {
        q = String(text || "").trim();
        if (search) {
          search.value = q;
          search.dispatchEvent(new Event("input", { bubbles: true }));
        }
        window.clearTimeout(timer);
        apply();
      },
      /** 清除全部條件；焦點回到搜尋框 */
      clear: function (focus) {
        q = "";
        if (search) {
          search.value = "";
          var c = search.closest(".search") && search.closest(".search").querySelector(".search__clear");
          if (c) c.hidden = true;
        }
        Object.keys(values).forEach(function (k) { setKey(k, ""); });
        apply();
        if (focus !== false && search) search.focus();
      },
      apply: apply,
      /** 回到預設條件（HTML 寫好的選中項），清掉搜尋字 */
      reset: function () {
        q = "";
        if (search) {
          search.value = "";
          var c = search.closest(".search") && search.closest(".search").querySelector(".search__clear");
          if (c) c.hidden = true;
        }
        selects.forEach(function (fs) { fs._wfPicks = []; });
        Object.keys(values).forEach(function (k) {
          var fs = selectFor(k);
          setKey(k, fs && fs._wfInit ? fs._wfInit : "");
        });
        apply();
      },
    };

    // 下拉（單選／多值）
    selects.forEach(function (fs) {
      var cur = Array.prototype.filter.call(fs.querySelectorAll('[role="option"]'), function (o) { return o.getAttribute("aria-selected") === "true"; });
      var vals = [];
      cur.forEach(function (o) { splitVals(o.getAttribute("data-value")).forEach(function (x) { if (vals.indexOf(x) < 0) vals.push(x); }); });
      setSelectUi(fs, vals);
      var multi = fs.hasAttribute("data-wf-filter-multi");
      fs._wfInit = vals.slice(); // 預設條件（選單切狀態時回到這裡）
      listbox(fs, function (value, text, o, on) {
        // 記住使用者實際點的選項：已套用條件用它的名稱顯示
        fs._wfPicks = (fs._wfPicks || []).filter(function (x) { return x !== o; });
        if (!multi || on) fs._wfPicks.push(o);
        if (!multi) fs._wfPicks = [o];
        var next = splitVals(value);
        if (multi) {
          var now = (values[keyOf(fs)] || []).slice();
          next.forEach(function (x) {
            var i = now.indexOf(x);
            if (on && i < 0) now.push(x);
            if (!on && i >= 0) now.splice(i, 1);
          });
          next = now;
        }
        setSelectUi(fs, next);
        apply();
      }, { multi: multi });
    });

    // 範圍
    ranges.forEach(function (fr, idx) {
      var key = keyOf(fr);
      var type = fr.getAttribute("data-wf-filter-range") || "number";
      types[key] = type;
      names[key] = nameOf(fr);
      if (type === "date") {
        var dp = fr.matches("[data-wf-datepicker]") ? fr : fr.querySelector("[data-wf-datepicker]");
        fr._wfDate = dp ? datePicker(dp) : null;
        if (fr._wfDate) {
          fr.addEventListener("wf:change", function () {
            if (fr._wfSilent) return;
            var v = fr._wfDate.text();
            setRangeUi(fr, v[0] && v[1] ? { min: v[0], max: v[1] } : null);
            apply();
          });
        }
        setRangeUi(fr, null);
        return;
      }
      // 數值區間：按鈕＋自動產生的小面板（最低／最高、清除、套用）
      var btn = fr.querySelector(".filter-select__btn");
      var unit = fr.getAttribute("data-wf-unit") || "";
      var pid = (bar.id || "filter") + "-range-" + idx;
      var panel = document.createElement("div");
      panel.className = "popover filter-range__panel";
      panel.id = pid;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", names[key] + "範圍");
      panel.setAttribute("data-wf-popover", "");
      panel.hidden = true;
      panel.innerHTML =
        '<p class="popover__title">' + escHtml(names[key]) + "範圍" + (unit ? "（" + escHtml(unit) + "）" : "") + "</p>" +
        '<div class="filter-range__inputs">' +
        '<div class="field"><label class="field__label" for="' + pid + '-min">最低</label><input class="input" id="' + pid + '-min" inputmode="numeric" placeholder="例：' + (fr.getAttribute("data-wf-min-example") || "1000") + '" /></div>' +
        '<span class="filter-range__sep" aria-hidden="true">～</span>' +
        '<div class="field"><label class="field__label" for="' + pid + '-max">最高</label><input class="input" id="' + pid + '-max" inputmode="numeric" placeholder="例：' + (fr.getAttribute("data-wf-max-example") || "5000") + '" /></div></div>' +
        '<p class="field__error" role="alert" hidden></p>' +
        '<div class="popover__foot filter-range__foot"><button type="button" class="text-btn" data-range-clear>清除</button><button type="button" class="btn btn--primary btn--sm" data-range-apply>套用</button></div>';
      fr.appendChild(panel);
      fr._wfPanel = panel;
      btn.setAttribute("aria-haspopup", "dialog");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", pid);
      var ins = panel.querySelectorAll(".input");
      var err = panel.querySelector(".field__error");
      function showErr(msg) {
        err.textContent = msg;
        err.hidden = !msg;
        panel.querySelectorAll(".field").forEach(function (f) { f.classList.toggle("is-error", !!msg); });
        ins.forEach(function (i) { if (msg) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid"); });
      }
      function commit() {
        var a = ins[0].value.replace(/,/g, "").trim();
        var b = ins[1].value.replace(/,/g, "").trim();
        if ((a && isNaN(Number(a))) || (b && isNaN(Number(b)))) { showErr("請輸入數字，例如 1000"); (a && isNaN(Number(a)) ? ins[0] : ins[1]).focus(); return; }
        if (a && b && Number(a) > Number(b)) { showErr("最低不可大於最高"); ins[0].focus(); return; }
        showErr("");
        setRangeUi(fr, a || b ? { min: a, max: b } : null);
        closeOverlay(panel);
        apply();
      }
      btn.addEventListener("click", function () {
        showErr("");
        var r = values[key];
        ins[0].value = r ? r.min : "";
        ins[1].value = r ? r.max : "";
        popover.toggle(panel, btn);
      });
      panel.addEventListener("click", function (e) {
        if (e.target.closest("[data-range-apply]")) commit();
        else if (e.target.closest("[data-range-clear]")) { ins[0].value = ""; ins[1].value = ""; commit(); }
      });
      panel.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.matches(".input")) { e.preventDefault(); commit(); } });
      panel.addEventListener("input", function () { if (!err.hidden) showErr(""); });
      setRangeUi(fr, null);
    });

    // 統計數字卡：點了套用該卡的條件，再點一次取消
    statGroups.forEach(function (g) {
      g.addEventListener("click", function (e) {
        var c = e.target.closest("[data-wf-filter-set]");
        if (!c || c.disabled) return;
        var p = parseSet(c);
        if (!p.vals.length || sameSet(values[p.key], p.vals)) setKey(p.key, "");
        else setKey(p.key, p.vals);
        if (!selectFor(p.key) && p.vals.length) {
          names[p.key] = g.getAttribute("data-wf-filter-name") || p.key;
          labels[p.key] = (c.querySelector(".stat-card__label") || c).textContent.trim();
        }
        apply();
      });
    });

    if (search) {
      search.addEventListener("input", function () {
        window.clearTimeout(timer);
        timer = after(250, function () {
          q = search.value.trim();
          apply();
        });
      });
      search.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          window.clearTimeout(timer);
          q = search.value.trim();
          apply();
        }
      });
    }
    bar.addEventListener("click", function (e) {
      var rm = e.target.closest(".filter-tag__remove");
      if (rm) {
        var all = Array.prototype.slice.call(bar.querySelectorAll(".filter-tag__remove"));
        var idx = all.indexOf(rm);
        var key = rm.getAttribute("data-key");
        if (key === "__q") {
          q = "";
          if (search) { search.value = ""; search.dispatchEvent(new Event("input", { bubbles: true })); window.clearTimeout(timer); }
        } else setKey(key, "");
        apply();
        // 移除的那顆不見了：焦點移到同位置的下一個條件，沒有就前一個，再沒有就回搜尋框
        var left = bar.querySelectorAll(".filter-tag__remove");
        var next = left[idx] || left[idx - 1] || search;
        if (next) next.focus();
        return;
      }
      if (e.target.closest("[data-wf-filter-clear]")) api.clear();
    });
    bar._wfFilter = api;
    renderTags();
    syncStats();
    return api;
  }

  /* ---------- 側邊導覽 ----------
     <nav class="sidenav" id="sidenav" data-wf-sidenav>
     收合／展開按鈕放在上方，不放側欄最下方：
     · 預設：頂列 Logo 左邊的選單圖示鈕 data-wf-sidenav-collapse="sidenav"（值＝側欄 id）。
       ≥1100 按了收合成圖示列、再按展開；≤1099 同一顆按鈕負責打開／關閉抽屜。
     · 替代：側欄最上方與產品名稱同一列（.sidenav__top 裡的按鈕，值留空＝所在的側欄），
       這時頂列另放 data-wf-open-sidenav="sidenav" 的選單鈕（只在 ≤1099 出現，專開抽屜）。
     抽屜：點遮罩、Esc、× 關閉，焦點回到打開它的按鈕 */
  function sidenavButtons(el) {
    var list = [];
    document.querySelectorAll("[data-wf-sidenav-collapse], [data-wf-open-sidenav]").forEach(function (b) {
      var v = b.getAttribute("data-wf-sidenav-collapse");
      if (v === null) v = b.getAttribute("data-wf-open-sidenav");
      if (v ? v === el.id : b.closest(".sidenav") === el) list.push(b);
    });
    return list;
  }
  /** 依目前寬度與狀態更新按鈕的 aria-expanded（展開中＝true）與無障礙名稱 */
  function syncSidenavButtons(el) {
    var narrow = narrowMq.matches;
    var open = el.classList.contains("is-open");
    var collapsed = el.classList.contains("is-collapsed");
    sidenavButtons(el).forEach(function (b) {
      if (b.hasAttribute("data-wf-open-sidenav")) {
        b.setAttribute("aria-expanded", open ? "true" : "false");
        return;
      }
      b.setAttribute("aria-controls", el.id || "");
      if (narrow) {
        b.setAttribute("aria-expanded", open ? "true" : "false");
        b.setAttribute("aria-label", "開啟選單");
      } else {
        b.setAttribute("aria-expanded", collapsed ? "false" : "true");
        b.setAttribute("aria-label", collapsed ? "展開側邊導覽" : "收合側邊導覽");
      }
    });
  }
  function openSidenavDrawer(el) {
    if (!el._wfScrim) {
      var s = document.createElement("div");
      s.className = "sidenav-scrim";
      s.addEventListener("click", function () { closeOverlay(el); });
      el.parentNode.insertBefore(s, el);
      el._wfScrim = s;
    }
    el.classList.add("is-open");
    syncSidenavButtons(el);
  }
  function closeSidenavDrawer(el) {
    el.classList.remove("is-open");
    if (el._wfScrim) el._wfScrim.remove();
    el._wfScrim = null;
    syncSidenavButtons(el);
  }
  function sidenavEl(id) {
    return (id && id.nodeType ? id : byId(id)) || document.querySelector(".sidenav");
  }
  var sidenav = {
    /** 窄寬度（<1100）打開抽屜；寬螢幕不做事 */
    open: function (id) {
      var el = sidenavEl(id);
      if (el && narrowMq.matches) openOverlay(el);
      return el;
    },
    close: function (id) {
      var el = sidenavEl(id);
      if (el && stack.indexOf(el) >= 0) closeOverlay(el);
    },
    toggle: function (id) {
      var el = sidenavEl(id);
      if (el && stack.indexOf(el) >= 0) closeOverlay(el);
      else sidenav.open(el);
    },
    /** 頂列選單鈕的行為：≥1100 收合／展開，≤1099 打開／關閉抽屜 */
    press: function (id) {
      var el = sidenavEl(id);
      if (!el) return;
      if (narrowMq.matches) sidenav.toggle(el);
      else sidenav.collapse(el);
    },
    /** 寬螢幕收合成圖示列（on 省略＝切換）；收合時每個項目滑過或聚焦會顯示名稱提示 */
    collapse: function (id, on) {
      var el = sidenavEl(id);
      if (!el) return;
      on = on === undefined ? !el.classList.contains("is-collapsed") : !!on;
      if (el.classList.contains("sidenav--dual")) {
        var panel = activePanel(el);
        if (on && panel && panel.querySelector(".sidenav__back")) return; // 帶「返回」的內頁不提供收合
        var hadFocus = panel && panel.contains(document.activeElement);
        el.classList.toggle("is-collapsed", on);
        syncRail(el);
        syncSidenavButtons(el);
        // 收合鈕跟著第二層消失：焦點移到該組的第一層圖示
        if (on && hadFocus && panel) { var rb = el.querySelector('[data-wf-sidenav-panel="' + panel.id + '"]'); if (rb) rb.focus(); }
        emit(el, "wf:sidenav");
        return;
      }
      el.classList.toggle("is-collapsed", on);
      syncSidenavButtons(el);
      el.querySelectorAll(".sidenav__item").forEach(function (item) {
        var l = item.querySelector(".sidenav__label");
        if (on && l) item.setAttribute("data-wf-tooltip", l.textContent.trim());
        else item.removeAttribute("data-wf-tooltip");
      });
      emit(el, "wf:sidenav");
    },
  };
  /** 雙層側欄：切到某一組第二層並展開 */
  sidenav.showPanel = function (id, panelId) { var el = sidenavEl(id); if (el) showDualPanel(el, panelId); };
  // 拉寬到 ≥1100 時，開著的抽屜自動收起（側欄回到頁面左側）；跨過斷點時按鈕的狀態與名稱跟著換
  if (narrowMq.addEventListener) narrowMq.addEventListener("change", function (e) {
    if (!e.matches) stack.filter(function (o) { return kindOf(o) === "sidenav"; }).forEach(function (o) { closeOverlay(o); });
    document.querySelectorAll("[data-wf-sidenav]").forEach(function (el) {
      syncSidenavButtons(el);
      if (el.classList.contains("sidenav--dual")) syncRail(el);
    });
  });

  /* ---------- 麵包屑：超過 data-wf-breadcrumb（預設 4）層時中段收成「…」，點了展開 ---------- */
  function breadcrumb(idOrEl) {
    var nav = byId(idOrEl);
    if (!nav || nav._wfCrumb) return;
    nav._wfCrumb = true;
    var max = Number(nav.getAttribute("data-wf-breadcrumb")) || 4;
    var items = Array.prototype.slice.call(nav.querySelectorAll(".breadcrumb__item"));
    if (items.length <= max) return;
    var middle = items.slice(1, items.length - 2);
    middle.forEach(function (li) { li.hidden = true; });
    var more = document.createElement("li");
    more.className = "breadcrumb__item";
    more.innerHTML = '<button type="button" class="breadcrumb__more" aria-label="顯示完整路徑（另外 ' + middle.length + ' 層）">…</button>';
    items[0].insertAdjacentElement("afterend", more);
    more.querySelector("button").addEventListener("click", function () {
      middle.forEach(function (li) { li.hidden = false; });
      more.remove();
      var first = middle[0].querySelector("a, button");
      if (first) first.focus();
    });
  }

  /* ---------- 通知橫幅：關閉（data-wf-dismiss）後焦點移到橫幅後面的下一個可聚焦元素 ---------- */
  function dismiss(idOrEl) {
    var el = byId(idOrEl);
    if (!el || el.hidden) return;
    var hadFocus = el.contains(document.activeElement);
    if (hadFocus) focusFrom(el, false, el) || focusFrom(el, true, el);
    el.hidden = true;
    emit(el, "wf:dismiss");
  }

  /* ---------- 提示泡泡：data-wf-tooltip="一句話"；滑鼠停 500ms 或鍵盤聚焦才出現；觸控裝置不出現；Esc、移開、失焦即消失 ---------- */
  var tipEl = null;
  var tipFor = null;
  var tipTimer = null;
  function hideTip() {
    window.clearTimeout(tipTimer);
    if (tipEl) tipEl.remove();
    if (tipFor && tipFor.getAttribute("aria-describedby") === "wf-tooltip") tipFor.removeAttribute("aria-describedby");
    tipEl = null;
    tipFor = null;
  }
  function showTip(el) {
    hideTip();
    var text = el.getAttribute("data-wf-tooltip");
    if (!text) return;
    tipFor = el;
    tipEl = document.createElement("div");
    tipEl.className = "tooltip";
    tipEl.id = "wf-tooltip";
    tipEl.setAttribute("role", "tooltip");
    tipEl.textContent = text;
    var host = root();
    host.appendChild(tipEl);
    if (text !== (el.getAttribute("aria-label") || el.textContent.trim())) el.setAttribute("aria-describedby", "wf-tooltip");
    var hostRect = host === document.body ? { top: 0, left: 0, width: window.innerWidth } : host.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var w = tipEl.offsetWidth;
    var h = tipEl.offsetHeight;
    var side = el.closest(".sidenav.is-collapsed"); // 收合側欄：提示放在圖示右邊
    var left = side ? r.right + 8 : r.left + r.width / 2 - w / 2;
    var top = side ? r.top + r.height / 2 - h / 2 : r.top - h - 8;
    if (!side && top < 8) top = r.bottom + 8;
    left = Math.max(8, Math.min(left, hostRect.left + hostRect.width - w - 8));
    tipEl.style.left = left - hostRect.left + "px";
    tipEl.style.top = top - hostRect.top + "px";
  }
  /** 窄寬度時側欄是抽屜、名稱都看得到，收合用的名稱提示不顯示 */
  function tipOff(el) {
    return narrowMq.matches && !!el.closest(".sidenav");
  }
  function bindTooltips() {
    document.addEventListener("mouseover", function (e) {
      var el = e.target.closest && e.target.closest("[data-wf-tooltip]");
      if (!el || el === tipFor || !hoverMq.matches || tipOff(el)) return;
      window.clearTimeout(tipTimer);
      tipTimer = after(500, function () { showTip(el); });
    });
    document.addEventListener("mouseout", function (e) {
      var el = e.target.closest && e.target.closest("[data-wf-tooltip]");
      if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) {
        window.clearTimeout(tipTimer);
        if (tipFor === el) hideTip();
      }
    });
    document.addEventListener("focusin", function (e) {
      var el = e.target.closest && e.target.closest("[data-wf-tooltip]");
      var keyboard = false;
      try { keyboard = e.target.matches(":focus-visible"); } catch (err) {}
      if (el && keyboard && !tipOff(el)) showTip(el);
    });
    document.addEventListener("focusout", function () { hideTip(); });
    document.addEventListener("pointerdown", function () { hideTip(); }, true);
    window.addEventListener("scroll", function () { hideTip(); }, true);
  }

  /** 點外面關閉：下拉清單、浮層（不搶這次點擊） */
  function bindOutside() {
    document.addEventListener("pointerdown", function (e) {
      stack.filter(function (o) { return ["listbox", "picker", "popover"].indexOf(kindOf(o)) >= 0; }).forEach(function (o) {
        var box = o._wfRoot || o;
        if (box.contains(e.target) || (o._wfOpener && o._wfOpener.contains(e.target))) return;
        closeOverlay(o);
      });
    }, true);
  }

  /** 鍵盤：彈出層困住 Tab、選單內方向鍵、選單裡按 Tab 關閉並讓焦點往下走 */
  function bindKeys() {
    // 頁籤：←→ 切換並循環、Home／End 第一個／最後一個（整組只佔一個 Tab 停駐點）
    document.addEventListener("keydown", function (e) {
      var tab = e.target.closest && e.target.closest("[data-wf-tabs] .tabs__tab, [data-wf-tabs] .seg__item");
      if (!tab || ["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(e.key) < 0) return;
      var list = Array.prototype.slice.call(tab.closest("[data-wf-tabs]").querySelectorAll(".tabs__tab, .seg__item"));
      var i = list.indexOf(tab);
      var next = e.key === "Home" ? list[0] : e.key === "End" ? list[list.length - 1] : list[(i + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
      e.preventDefault();
      next.focus();
      next.click();
    });
    document.addEventListener("keydown", function (e) {
      var top = topOverlay();
      if (!top) return;
      var kind = kindOf(top);
      if (kind === "popmenu") {
        var items = Array.prototype.slice.call(top.querySelectorAll(".popmenu__item:not([disabled])"));
        var i = items.indexOf(document.activeElement);
        if (e.key === "ArrowDown") { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
        else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
        else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
        else if (e.key === "Tab") {
          // 選單開著按 Tab：關閉選單，焦點從觸發鈕往下（Shift＋Tab 往上）移
          e.preventDefault();
          var anchor = top._wfAnchor || top._wfOpener;
          closeOverlay(top);
          if (anchor) focusFrom(anchor, e.shiftKey, top);
        }
        return;
      }
      if (kind === "popover" && e.key === "Tab") {
        // 浮層不困焦點：從最後一個往下、第一個往上按 Tab＝關閉浮層，焦點回到按鈕前後
        var inside = focusables(top);
        var edge = e.shiftKey ? inside[0] : inside[inside.length - 1];
        if (!inside.length || document.activeElement === edge || !top.contains(document.activeElement)) {
          e.preventDefault();
          var anchor2 = top._wfAnchor || top._wfOpener;
          closeOverlay(top);
          if (anchor2) { if (e.shiftKey) focusFrom(anchor2, true, top); else focusFrom(anchor2, false, top); }
        }
        return;
      }
      if (e.key === "Tab" && isModal(top)) {
        var box = kind === "alert" ? top.querySelector(".alert") || top : kind === "sheet" ? top.querySelector(".sheet") || top : kind === "drawer" ? top.querySelector(".drawer") || top : kind === "editdrawer" ? top.querySelector(".edit-drawer") || top : top;
        var list = focusables(box);
        if (!list.length) return;
        var first = list[0];
        var last = list[list.length - 1];
        if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ============================================================
     Web 表單與浮層：日期與區間、組合框與多選、拖放上傳、浮層、右側編輯抽屜、長表單段落導覽
     ============================================================ */

  /* ---------- 日期選擇 ----------
     <div class="date-field" data-wf-datepicker="single|range|datetime" data-wf-today="2026/10/15" data-wf-min="…" data-wf-max="…">
     datetime＝日期＋時刻同一個元件（輸入框可直接打「YYYY/MM/DD HH:mm」）；區間加 data-wf-time＝開始與結束各帶時刻。
       時刻用日曆下方的「時」「分」兩個下拉（分鐘間隔 data-wf-minute-step，預設 15）；點日期不關，按「確定」才寫回；
       預設時刻 data-wf-default-time（單一，預設 09:00）、data-wf-start-time／data-wf-end-time（區間，預設 00:00／23:59）。
     日曆鍵盤：←→ 前後一天、↑↓ 前後一週、PageUp／PageDown 前後一個月（加 Shift＝前後一年）、
     Home／End 本週第一天（星期日）／最後一天（星期六）、Enter／Space 選定、Esc 關閉；Tab 只在日曆裡循環（含時刻下拉與確定鈕）。
     關閉後焦點回到打開它的按鈕或欄位；Esc、點外面＝不變更；觸發 wf:change */
  var WEEK = ["日", "一", "二", "三", "四", "五", "六"];
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(d) { return d ? d.getFullYear() + "/" + pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) : ""; }
  function parseDate(s) {
    var m = String(s || "").trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }
  /** 「2026/10/15 14:30」→ { d, time:"14:30" }；格式不對回傳 null */
  function parseDateTime(s) {
    var m = String(s || "").trim().match(/^(\S+)\s+(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var d = parseDate(m[1]);
    if (!d || +m[2] > 23 || +m[3] > 59) return null;
    return { d: d, time: pad2(+m[2]) + ":" + m[3] };
  }
  function sameDay(a, b) { return !!(a && b) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(d.getDate(), last));
    return x;
  }

  function datePicker(idOrEl) {
    var box = byId(idOrEl);
    if (!box) return null;
    if (box._wfDate) return box._wfDate;
    var mode = box.getAttribute("data-wf-datepicker");
    var range = mode === "range";
    var withTime = mode === "datetime" || box.hasAttribute("data-wf-time");
    var step = Number(box.getAttribute("data-wf-minute-step")) || 15;
    var input = box.querySelector(".date-field__input");
    var opener = box.querySelector(".date-field__trigger, .date-field__btn");
    var text = box.querySelector(".date-field__text");
    var t0 = parseDate(box.getAttribute("data-wf-today")) || new Date();
    var today = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate());
    var min = parseDate(box.getAttribute("data-wf-min"));
    var max = parseDate(box.getAttribute("data-wf-max"));
    var first = input ? (withTime ? parseDateTime(input.value) : { d: parseDate(input.value) }) : null;
    var st = {
      value: first ? first.d : null,
      time: (first && first.time) || box.getAttribute("data-wf-default-time") || "09:00",
      start: parseDate(box.getAttribute("data-wf-start")),
      end: parseDate(box.getAttribute("data-wf-end")),
      t1: box.getAttribute("data-wf-start-time") || "00:00",
      t2: box.getAttribute("data-wf-end-time") || "23:59",
      focus: today,
      view: today,
      hover: null,
    };
    var snap = null; // 打開時的值：沒按確定（Esc、點外面）就還原
    var committed = false;
    var PRESETS = [
      { label: "今天", get: function () { return [today, today]; } },
      { label: "近 7 天", get: function () { return [addDays(today, -6), today]; } },
      { label: "近 30 天", get: function () { return [addDays(today, -29), today]; } },
      { label: "本月", get: function () { return [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 0)]; } },
    ];
    var pop = document.createElement("div");
    pop.className = "calendar-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-modal", "true");
    pop.setAttribute("aria-label", box.getAttribute("data-wf-label") || (range ? "選擇日期區間" : withTime ? "選擇日期與時間" : "選擇日期"));
    pop.hidden = true;
    pop._wfRoot = box;
    box.appendChild(pop);
    if (opener) {
      opener.setAttribute("aria-haspopup", "dialog");
      opener.setAttribute("aria-expanded", "false");
    }

    function off(d) { return (min && d < min) || (max && d > max); }
    function monthsShown() { return range && window.innerWidth > 640 ? 2 : 1; }
    function between(d) {
      var a = st.start;
      var b = st.end || st.hover;
      if (!a || !b) return false;
      var lo = a < b ? a : b;
      var hi = a < b ? b : a;
      return d > lo && d < hi;
    }
    function dt(d, time) { return d ? fmtDate(d) + (withTime ? " " + time : "") : ""; }
    function monthHtml(base, idx, count) {
      var y = base.getFullYear();
      var m = base.getMonth();
      var firstDay = new Date(y, m, 1).getDay();
      var days = new Date(y, m + 1, 0).getDate();
      var ghostPrev = idx > 0;
      var ghostNext = idx < count - 1;
      var h = '<div class="calendar"><div class="calendar__head">' +
        '<button type="button" class="calendar__nav' + (ghostPrev ? " is-ghost" : "") + '" data-nav="-1" aria-label="上個月"' + (ghostPrev ? ' tabindex="-1" aria-hidden="true"' : "") + ">" + ICON_PREV + "</button>" +
        '<p class="calendar__title">' + y + " 年 " + (m + 1) + " 月</p>" +
        '<button type="button" class="calendar__nav' + (ghostNext ? " is-ghost" : "") + '" data-nav="1" aria-label="下個月"' + (ghostNext ? ' tabindex="-1" aria-hidden="true"' : "") + ">" + ICON_NEXT + "</button></div>" +
        '<table class="calendar__grid" role="grid" aria-label="' + y + " 年 " + (m + 1) + ' 月"><thead><tr>' +
        WEEK.map(function (w) { return '<th scope="col" abbr="星期' + w + '">' + w + "</th>"; }).join("") + "</tr></thead><tbody><tr>";
      for (var i = 0; i < firstDay; i += 1) h += "<td></td>";
      for (var dd = 1; dd <= days; dd += 1) {
        var d = new Date(y, m, dd);
        if (d.getDay() === 0 && dd > 1) h += "</tr><tr>";
        var sel = range ? sameDay(d, st.start) || sameDay(d, st.end) : sameDay(d, st.value);
        var cls = "calendar__day" + (sameDay(d, today) ? " is-today" : "") + (range && between(d) ? (st.end ? " is-range" : " is-preview") : "");
        var f = sameDay(d, st.focus);
        h += '<td><button type="button" class="' + cls + '" data-date="' + fmtDate(d) + '" tabindex="' + (f ? 0 : -1) + '"' + (f ? " data-wf-autofocus" : "") +
          ' aria-pressed="' + sel + '"' + (off(d) ? ' aria-disabled="true"' : "") +
          ' aria-label="' + y + " 年 " + (m + 1) + " 月 " + dd + " 日 星期" + WEEK[d.getDay()] + (sameDay(d, today) ? "（今天）" : "") + '">' + dd + "</button></td>";
      }
      return h + "</tr></tbody></table></div>";
    }
    /** 時刻下拉：時 00–23、分依間隔；目前值不在間隔上（例 23:59）時也列進去 */
    function timePick(name, label, val) {
      var hh = val.slice(0, 2);
      var mm = val.slice(3, 5);
      var hours = "";
      for (var hI = 0; hI < 24; hI += 1) hours += '<option value="' + pad2(hI) + '"' + (pad2(hI) === hh ? " selected" : "") + ">" + pad2(hI) + "</option>";
      var mins = [];
      for (var mI = 0; mI < 60; mI += step) mins.push(pad2(mI));
      if (mins.indexOf(mm) < 0) { mins.push(mm); mins.sort(); }
      return '<div class="time-pick" role="group" aria-label="' + label + '"><span class="time-pick__label" aria-hidden="true">' + label + "</span>" +
        '<select class="select" data-time="' + name + '" data-part="h" aria-label="' + label + '（時）">' + hours + "</select>" +
        '<span class="time-pick__sep" aria-hidden="true">:</span>' +
        '<select class="select" data-time="' + name + '" data-part="m" aria-label="' + label + '（分）">' + mins.map(function (x) { return '<option value="' + x + '"' + (x === mm ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></div>";
    }
    function status() {
      if (!range) return st.value ? "已選 " + dt(st.value, st.time) : "今天 " + fmtDate(today);
      if (!st.start) return "請選開始日期";
      if (!st.end) return "開始 " + dt(st.start, st.t1) + "，請選結束日期";
      return dt(st.start, st.t1) + " – " + dt(st.end, st.t2);
    }
    function setStatus(msg, isError) {
      var el = pop.querySelector(".calendar-pop__status");
      if (!el) return;
      el.textContent = msg || status();
      el.classList.toggle("is-error", !!isError);
    }
    function render() {
      var count = monthsShown();
      var h = '<div class="calendar-pop__body">';
      if (range) h += '<ul class="calendar-pop__presets" aria-label="快捷區間">' + PRESETS.map(function (p, i) { return '<li><button type="button" class="calendar-pop__preset" data-preset="' + i + '">' + p.label + "</button></li>"; }).join("") + "</ul>";
      h += '<div class="calendar-pop__months">';
      for (var i = 0; i < count; i += 1) h += monthHtml(new Date(st.view.getFullYear(), st.view.getMonth() + i, 1), i, count);
      h += "</div></div>";
      if (withTime) h += '<div class="calendar-pop__time">' + (range ? timePick("t1", "開始時間", st.t1) + timePick("t2", "結束時間", st.t2) : timePick("time", "時間", st.time)) + "</div>";
      h += '<div class="calendar-pop__foot"><span class="calendar-pop__status" aria-live="polite">' + status() + '</span><span class="calendar-pop__foot-acts"><button type="button" class="text-btn" data-clear>清除</button>' +
        (withTime ? '<button type="button" class="btn btn--primary btn--sm" data-ok>確定</button>' : "") + "</span></div>";
      pop.innerHTML = h;
    }
    function focusDay(d) {
      st.focus = d;
      var count = monthsShown();
      var viewEnd = new Date(st.view.getFullYear(), st.view.getMonth() + count, 1);
      if (d < st.view) st.view = new Date(d.getFullYear(), d.getMonth(), 1);
      else if (d >= viewEnd) st.view = new Date(d.getFullYear(), d.getMonth() - count + 1, 1);
      render();
      var b = pop.querySelector('[data-date="' + fmtDate(d) + '"]');
      if (b) b.focus();
    }
    function textValue() {
      if (range) return st.start && st.end ? [dt(st.start, st.t1), dt(st.end, st.t2)] : ["", ""];
      return dt(st.value, st.time);
    }
    function update() {
      if (input) input.value = dt(st.value, st.time);
      if (text) {
        var tx = range ? (st.start && st.end ? dt(st.start, st.t1) + " – " + dt(st.end, st.t2) : "") : dt(st.value, st.time);
        text.textContent = tx || text.getAttribute("data-placeholder") || "";
        text.classList.toggle("is-placeholder", !tx);
      }
      emit(box, "wf:change");
    }
    function clearRangeError() {
      var field = box.closest(".field");
      if (field && field.classList.contains("is-error")) { field.classList.remove("is-error"); var er = field.querySelector(".field__error"); if (er) er.hidden = true; }
    }
    function isOpen() { return stack.indexOf(pop) >= 0; }
    function open() {
      if (isOpen()) return;
      snap = { value: st.value, time: st.time, start: st.start, end: st.end, t1: st.t1, t2: st.t2 };
      committed = false;
      var base = (range ? st.start : st.value) || today;
      st.focus = base;
      st.view = new Date(base.getFullYear(), base.getMonth(), 1);
      st.hover = null;
      render();
      pop.classList.remove("is-right");
      pop.hidden = false;
      if (pop.getBoundingClientRect().right > window.innerWidth - 8) pop.classList.add("is-right");
      if (opener) opener.setAttribute("aria-expanded", "true");
      openOverlay(pop, opener || input);
    }
    function close() { if (isOpen()) closeOverlay(pop); }
    /** 寫回欄位並關閉 */
    function commit() {
      committed = true;
      update();
      if (input) clearFieldError(input);
      if (range) clearRangeError();
      close();
    }
    function pick(d) {
      if (off(d)) return;
      if (!range) {
        st.value = d;
        if (withTime) { focusDay(d); setStatus(); return; } // 有時刻：選好日期再挑時間，按「確定」才寫回
        commit();
        return;
      }
      if (!st.start || st.end) {
        st.start = d;
        st.end = null;
        focusDay(d);
        return;
      }
      if (d < st.start) { st.end = st.start; st.start = d; }
      else st.end = d;
      if (withTime) { focusDay(d); setStatus(); return; }
      commit();
    }
    pop.addEventListener("wf:close", function () {
      if (opener) opener.setAttribute("aria-expanded", "false");
      if (!committed && snap) { st.value = snap.value; st.time = snap.time; st.start = snap.start; st.end = snap.end; st.t1 = snap.t1; st.t2 = snap.t2; }
    });
    pop.addEventListener("click", function (e) {
      var nav = e.target.closest("[data-nav]");
      if (nav) {
        var n = Number(nav.getAttribute("data-nav"));
        st.view = new Date(st.view.getFullYear(), st.view.getMonth() + n, 1);
        st.focus = addMonths(st.focus, n);
        render();
        var again = pop.querySelector('[data-nav="' + n + '"]:not(.is-ghost)');
        if (again) again.focus();
        return;
      }
      var day = e.target.closest("[data-date]");
      if (day) { pick(parseDate(day.getAttribute("data-date"))); return; }
      var pre = e.target.closest("[data-preset]");
      if (pre) {
        var r = PRESETS[Number(pre.getAttribute("data-preset"))].get();
        st.start = r[0];
        st.end = r[1];
        if (withTime) { st.t1 = "00:00"; st.t2 = "23:59"; }
        commit();
        return;
      }
      if (e.target.closest("[data-ok]")) {
        var missing = range ? !(st.start && st.end) : !st.value;
        if (missing) {
          setStatus(range ? "請選開始與結束日期" : "請先選日期", true);
          var fd = pop.querySelector('[data-date][tabindex="0"]');
          if (fd) fd.focus();
          return;
        }
        commit();
        return;
      }
      if (e.target.closest("[data-clear]")) {
        st.value = null;
        st.start = st.end = null;
        commit();
      }
    });
    pop.addEventListener("change", function (e) {
      var sel = e.target.closest("[data-time]");
      if (!sel) return;
      var name = sel.getAttribute("data-time");
      var h = pop.querySelector('[data-time="' + name + '"][data-part="h"]').value;
      var m = pop.querySelector('[data-time="' + name + '"][data-part="m"]').value;
      st[name] = h + ":" + m;
      setStatus();
    });
    pop.addEventListener("mouseover", function (e) {
      var day = e.target.closest("[data-date]");
      if (!range || !day || !st.start || st.end) return;
      st.hover = parseDate(day.getAttribute("data-date"));
      pop.querySelectorAll("[data-date]").forEach(function (b) { b.classList.toggle("is-preview", between(parseDate(b.getAttribute("data-date")))); });
    });
    pop.addEventListener("keydown", function (e) {
      var day = e.target.closest("[data-date]");
      if (!day) return;
      var f = parseDate(day.getAttribute("data-date"));
      var next = null;
      if (e.key === "ArrowLeft") next = addDays(f, -1);
      else if (e.key === "ArrowRight") next = addDays(f, 1);
      else if (e.key === "ArrowUp") next = addDays(f, -7);
      else if (e.key === "ArrowDown") next = addDays(f, 7);
      else if (e.key === "PageUp") next = addMonths(f, e.shiftKey ? -12 : -1);
      else if (e.key === "PageDown") next = addMonths(f, e.shiftKey ? 12 : 1);
      else if (e.key === "Home") next = addDays(f, -f.getDay());
      else if (e.key === "End") next = addDays(f, 6 - f.getDay());
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(f); return; }
      if (next) { e.preventDefault(); focusDay(next); }
    });
    if (opener) opener.addEventListener("click", function () { if (isOpen()) close(); else open(); });
    if (input) {
      // 直接打字：離開欄位時檢查格式與範圍
      input.addEventListener("change", function () {
        var v = input.value.trim();
        if (!v) { st.value = null; clearFieldError(input); emit(box, "wf:change"); return; }
        var p = withTime ? parseDateTime(v) : { d: parseDate(v) };
        if (!p || !p.d) { showFieldError(input, withTime ? "請輸入 YYYY/MM/DD HH:mm 格式，例如 " + fmtDate(today) + " 14:30" : "請輸入 YYYY/MM/DD 格式的日期，例如 " + fmtDate(today)); return; }
        if (off(p.d)) { showFieldError(input, "請選擇 " + (min ? fmtDate(min) : "") + " 到 " + (max ? fmtDate(max) : "") + " 之間的日期"); return; }
        st.value = p.d;
        if (p.time) st.time = p.time;
        clearFieldError(input);
        update();
      });
      input.addEventListener("keydown", function (e) {
        if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); open(); }
      });
    }
    function withClock(d, time) {
      if (!d) return null;
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (withTime) x.setHours(+time.slice(0, 2), +time.slice(3, 5));
      return x;
    }
    var api = {
      el: box,
      open: open,
      close: close,
      /** 單一日期回傳 Date（有時刻時含時、分）；區間回傳 [開始, 結束] */
      value: function () { return range ? [withClock(st.start, st.t1), withClock(st.end, st.t2)] : withClock(st.value, st.time); },
      /** 顯示用文字：單一＝"2026/10/15"（有時刻＝"2026/10/15 14:30"）；區間＝[開始字串, 結束字串] */
      text: textValue,
      /** 設定值：單一日期給 "2026/10/15"（有時刻給 "2026/10/15 14:30"）；區間給兩個字串 */
      set: function (a, b) {
        function one(s) { var p = withTime ? parseDateTime(s) : null; return p || { d: parseDate(s), time: "" }; }
        if (range) {
          var pa = one(a);
          var pb = one(b);
          st.start = pa.d;
          st.end = pb.d;
          if (pa.time) st.t1 = pa.time;
          if (pb.time) st.t2 = pb.time;
        } else {
          var p1 = one(a);
          st.value = p1.d;
          if (p1.time) st.time = p1.time;
        }
        update();
      },
    };
    box._wfDate = api;
    update();
    var initText = textValue(); // 預設值（選單切狀態時回到這裡）
    api.reset = function () { if (range) api.set(initText[0] || "", initText[1] || ""); else api.set(initText || ""); };
    return api;
  }

  /* ---------- 組合框（自動完成）與多選 ----------
     <div class="combobox" data-wf-combobox="single|multi">：打字篩選；↓↑ 移動、Enter 選定、Esc 關閉（再按一次清空輸入）；
     多選：選了變標籤、清單不關；空白時按 Backspace 移除最後一個標籤；右側「清除全部」。查無結果時顯示「查無符合「…」的項目」 */
  function combobox(idOrEl) {
    var box = byId(idOrEl);
    if (!box) return null;
    if (box._wfCombo) return box._wfCombo;
    var multi = box.getAttribute("data-wf-combobox") === "multi";
    var input = box.querySelector(".combobox__input");
    var popup = box.querySelector(".combobox__popup");
    var list = box.querySelector(".combobox__list");
    var empty = box.querySelector(".combobox__empty");
    var tags = box.querySelector(".combobox__tags");
    var clearBtn = box.querySelector(".combobox__clear");
    var field = box.querySelector(".combobox__field");
    var opts = Array.prototype.slice.call(list.querySelectorAll('[role="option"]'));
    if (!list.id) list.id = "wf-cb-" + Math.random().toString(36).slice(2, 8);
    opts.forEach(function (o, i) { if (!o.id) o.id = list.id + "-" + i; });
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("autocomplete", "off");
    var selected = opts.filter(function (o) { return o.getAttribute("aria-selected") === "true"; }).map(function (o) { return o.getAttribute("data-value"); });
    var active = -1;

    function optOf(v) { return opts.filter(function (o) { return o.getAttribute("data-value") === v; })[0]; }
    function labelOf(v) {
      var o = optOf(v);
      if (!o) return v;
      return o.getAttribute("data-label") || o.childNodes[0].textContent.trim();
    }
    function shown() { return opts.filter(function (o) { return !o.hidden; }); }
    function isOpen() { return !popup.hidden; }
    function setActive(i) {
      var v = shown();
      opts.forEach(function (o) { o.classList.remove("is-active"); });
      active = v[i] ? i : -1;
      if (v[i]) {
        v[i].classList.add("is-active");
        input.setAttribute("aria-activedescendant", v[i].id);
        if (v[i].scrollIntoView) v[i].scrollIntoView({ block: "nearest" });
      } else input.removeAttribute("aria-activedescendant");
    }
    function filter() {
      var q = input.value.trim();
      if (!multi && selected[0] && q === labelOf(selected[0])) q = ""; // 單選剛選好時顯示全部選項
      var n = 0;
      opts.forEach(function (o) {
        var ok = !q || o.textContent.indexOf(q) >= 0;
        o.hidden = !ok;
        o.setAttribute("aria-selected", selected.indexOf(o.getAttribute("data-value")) >= 0 ? "true" : "false");
        if (ok) n += 1;
      });
      if (empty) {
        empty.hidden = n > 0;
        if (!n) empty.textContent = "查無符合「" + q + "」的項目";
      }
      setActive(-1);
    }
    function open() {
      if (isOpen()) return;
      popup.hidden = false;
      input.setAttribute("aria-expanded", "true");
      filter();
    }
    function close() {
      if (!isOpen()) return;
      popup.hidden = true;
      input.setAttribute("aria-expanded", "false");
      setActive(-1);
      if (!multi) {
        // 單選：沒選到選項就離開＝退回上次確定的值；清空＝取消選取
        if (!input.value.trim()) { if (selected.length) { selected = []; sync(); } }
        else input.value = selected[0] ? labelOf(selected[0]) : "";
      }
    }
    function sync() {
      if (multi && tags) {
        tags.innerHTML = selected.map(function (v) {
          return '<li><span class="filter-tag">' + labelOf(v) + '<button type="button" class="filter-tag__remove" data-value="' + v + '" aria-label="移除 ' + labelOf(v) + '"></button></span></li>';
        }).join("");
      }
      if (clearBtn) clearBtn.hidden = !selected.length && !input.value;
      opts.forEach(function (o) { o.setAttribute("aria-selected", selected.indexOf(o.getAttribute("data-value")) >= 0 ? "true" : "false"); });
      var f = box.closest(".field");
      if (f && f.classList.contains("is-error") && selected.length) {
        f.classList.remove("is-error");
        var er = f.querySelector(".field__error");
        if (er) er.hidden = true;
      }
      emit(box, "wf:change");
    }
    function choose(o) {
      var v = o.getAttribute("data-value");
      if (multi) {
        var i = selected.indexOf(v);
        if (i >= 0) selected.splice(i, 1);
        else selected.push(v);
        input.value = "";
        sync();
        filter();
        setActive(shown().indexOf(o));
      } else {
        selected = [v];
        input.value = labelOf(v);
        sync();
        close();
      }
    }
    function removeValue(v, from) {
      var all = Array.prototype.slice.call(box.querySelectorAll(".filter-tag__remove"));
      var idx = from ? all.indexOf(from) : -1;
      selected = selected.filter(function (x) { return x !== v; });
      sync();
      if (isOpen()) filter();
      var left = box.querySelectorAll(".filter-tag__remove");
      (left[idx] || left[idx - 1] || input).focus();
    }
    input.addEventListener("input", function () {
      open();
      filter();
      if (clearBtn) clearBtn.hidden = !selected.length && !input.value;
    });
    input.addEventListener("click", function () { open(); });
    input.addEventListener("keydown", function (e) {
      var v = shown();
      if (e.key === "ArrowDown") { e.preventDefault(); if (!isOpen()) open(); setActive(Math.min(active + 1, v.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (isOpen()) setActive(Math.max(active - 1, 0)); }
      else if (e.key === "Enter") { if (isOpen()) { e.preventDefault(); if (active >= 0 && v[active]) choose(v[active]); } }
      else if (e.key === "Escape") {
        if (isOpen()) { e.preventDefault(); e.stopPropagation(); close(); }
        else if (input.value) { e.preventDefault(); e.stopPropagation(); input.value = ""; if (!multi) selected = []; sync(); }
      } else if (e.key === "Backspace" && multi && !input.value && selected.length) removeValue(selected[selected.length - 1]);
      else if (e.key === "Tab") close();
    });
    list.addEventListener("mousedown", function (e) { e.preventDefault(); }); // 點選項時焦點留在輸入框
    list.addEventListener("click", function (e) {
      var o = e.target.closest('[role="option"]');
      if (o) choose(o);
    });
    field.addEventListener("click", function (e) {
      if (e.target === field) input.focus();
    });
    box.addEventListener("click", function (e) {
      var rm = e.target.closest(".filter-tag__remove");
      if (rm) { removeValue(rm.getAttribute("data-value"), rm); return; }
      if (e.target.closest(".combobox__clear")) {
        selected = [];
        input.value = "";
        sync();
        if (isOpen()) filter();
        input.focus();
      }
    });
    box.addEventListener("focusout", function (e) {
      if (!box.contains(e.relatedTarget)) close();
    });
    var api = {
      el: box,
      value: function () { return selected.slice(); },
      labels: function () { return selected.map(labelOf); },
      set: function (values) {
        selected = (values || []).slice();
        input.value = !multi && selected[0] ? labelOf(selected[0]) : "";
        sync();
      },
      open: open,
      close: close,
    };
    if (!multi && selected[0]) input.value = labelOf(selected[0]);
    sync();
    var initSel = selected.slice(); // 預設選取（選單切狀態時回到這裡）
    api.reset = function () { api.set(initSel); };
    box._wfCombo = api;
    return api;
  }

  /* ---------- 拖放上傳 ----------
     <div class="upload" data-wf-upload data-wf-accept=".jpg,.png,.pdf" data-wf-max-size="10" data-wf-max-files="5">
     拖入時拖放區加深；不合格式、超過大小或數量 → 拖放區下方一句紅字寫出原因；上傳中顯示百分比與進度條；
     檔名含「失敗」的檔案第一次會上傳失敗（示範重試）；WfProto.upload(el).add([{ name, size }]) 可直接加入示範檔案 */
  function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function escHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function upload(idOrEl, opts) {
    var box = byId(idOrEl);
    if (!box) return null;
    if (box._wfUpload) return box._wfUpload;
    opts = opts || {};
    var accept = (opts.accept || box.getAttribute("data-wf-accept") || "").split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    var maxMB = opts.maxSize || Number(box.getAttribute("data-wf-max-size")) || 10;
    var maxFiles = opts.maxFiles || Number(box.getAttribute("data-wf-max-files")) || 5;
    var failMark = box.getAttribute("data-wf-upload-fail") || "失敗";
    var zone = box.querySelector(".upload__zone");
    var input = box.querySelector(".upload__input");
    var pick = box.querySelector(".upload__pick");
    var list = box.querySelector(".upload__list");
    var err = zone.querySelector(".field__error");
    if (!err) {
      err = document.createElement("p");
      err.className = "field__error";
      err.setAttribute("role", "alert");
      err.hidden = true;
      zone.appendChild(err);
    }
    var live = document.createElement("p");
    live.className = "visually-hidden";
    live.setAttribute("aria-live", "polite");
    box.appendChild(live);
    function say(msg) { live.textContent = msg; }
    function showErrors(lines) {
      err.hidden = !lines.length;
      err.textContent = lines.join("；");
    }
    function add(files) {
      var msgs = [];
      Array.prototype.forEach.call(files, function (f) {
        var ext = "." + String(f.name.split(".").pop() || "").toLowerCase();
        if (accept.length && accept.indexOf(ext) < 0) { msgs.push("「" + f.name + "」格式不支援，請上傳 " + accept.map(function (a) { return a.slice(1).toUpperCase(); }).join("、")); return; }
        if (f.size > maxMB * 1048576) { msgs.push("「" + f.name + "」超過 " + maxMB + " MB"); return; }
        if (list.children.length >= maxFiles) { msgs.push("最多 " + maxFiles + " 個檔案，「" + f.name + "」沒有加入"); return; }
        addItem(f);
      });
      showErrors(msgs);
    }
    function addItem(f) {
      var li = document.createElement("li");
      li.className = "upload__item";
      li._wfFile = f;
      li._wfTries = 0;
      li.innerHTML = '<span class="upload__thumb" aria-hidden="true"></span><span class="upload__name"></span>' +
        '<span class="upload__acts"><button type="button" class="upload__remove" aria-label="移除 ' + escHtml(f.name) + '"></button></span>' +
        '<span class="upload__meta"></span><span class="upload__bar" aria-hidden="true"><i></i></span>';
      li.querySelector(".upload__name").textContent = f.name;
      list.appendChild(li);
      start(li);
    }
    function start(li) {
      li._wfTries += 1;
      li.classList.remove("is-error", "is-done");
      var bar = li.querySelector(".upload__bar");
      var fill = bar.firstChild;
      var meta = li.querySelector(".upload__meta");
      var retry = li.querySelector("[data-wf-retry]");
      if (retry) retry.remove();
      var name = li._wfFile.name;
      var size = fmtSize(li._wfFile.size);
      var willFail = name.indexOf(failMark) >= 0 && li._wfTries === 1;
      var pct = 0;
      bar.hidden = false;
      fill.style.width = "0%";
      meta.textContent = size + " · 上傳中 0%";
      window.clearInterval(li._wfTimer);
      li._wfTimer = window.setInterval(function () {
        pct += 10;
        if (willFail && pct >= 60) {
          window.clearInterval(li._wfTimer);
          li.classList.add("is-error");
          bar.hidden = true;
          meta.textContent = size + " · 上傳失敗，請檢查網路後重試";
          li.querySelector(".upload__acts").insertAdjacentHTML("afterbegin", '<button type="button" class="text-btn" data-wf-retry>重試</button>');
          say("「" + name + "」上傳失敗");
          return;
        }
        fill.style.width = pct + "%";
        meta.textContent = size + " · 上傳中 " + pct + "%";
        if (pct >= 100) {
          window.clearInterval(li._wfTimer);
          li.classList.add("is-done");
          bar.hidden = true;
          meta.textContent = size + " · 已上傳";
          say("「" + name + "」已上傳");
          emit(box, "wf:change");
        }
      }, 160);
    }
    list.addEventListener("click", function (e) {
      var li = e.target.closest(".upload__item");
      if (!li) return;
      if (e.target.closest("[data-wf-retry]")) {
        start(li);
        li.querySelector(".upload__remove").focus(); // 重試鈕消失，焦點留在同一列
        return;
      }
      if (e.target.closest(".upload__remove")) {
        window.clearInterval(li._wfTimer);
        var next = li.nextElementSibling || li.previousElementSibling;
        li.remove();
        showErrors([]);
        (next ? next.querySelector(".upload__remove") : pick).focus();
        say("已移除「" + li._wfFile.name + "」");
        emit(box, "wf:change");
      }
    });
    ["dragenter", "dragover"].forEach(function (type) {
      zone.addEventListener(type, function (e) { e.preventDefault(); zone.classList.add("is-dragover"); });
    });
    zone.addEventListener("dragleave", function (e) {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove("is-dragover");
    });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("is-dragover");
      if (e.dataTransfer && e.dataTransfer.files) add(e.dataTransfer.files);
    });
    if (pick && input) pick.addEventListener("click", function () { input.click(); });
    if (input) input.addEventListener("change", function () { add(input.files); input.value = ""; });
    var api = {
      el: box,
      add: add,
      /** 目前清單裡的檔案：[{ name, size, status: "uploading"|"done"|"error" }] */
      files: function () {
        return Array.prototype.map.call(list.children, function (li) {
          return { name: li._wfFile.name, size: li._wfFile.size, status: li.classList.contains("is-done") ? "done" : li.classList.contains("is-error") ? "error" : "uploading" };
        });
      },
      clear: function () {
        Array.prototype.slice.call(list.children).forEach(function (li) { window.clearInterval(li._wfTimer); li.remove(); });
        showErrors([]);
      },
    };
    box._wfUpload = api;
    return api;
  }

  /* ---------- 浮層（popover） ----------
     <button data-wf-popover-open="id" aria-haspopup="dialog" aria-expanded="false">：貼在按鈕下方（放不下翻到上方）；
     開啟時焦點移到第一個可操作元素；不困住 Tab——從最後一個往下（或第一個往上）按 Tab 會關閉並回到按鈕前後；點外面、Esc 關閉 */
  function placeNear(el, anchor) {
    var host = root();
    var hostRect = host === document.body ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight } : host.getBoundingClientRect();
    var a = anchor.getBoundingClientRect();
    el.hidden = false;
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    var left = Math.min(Math.max(8, a.left - hostRect.left), hostRect.width - w - 8);
    var top = a.bottom - hostRect.top + 4;
    if (top + h > hostRect.height - 8 && a.top - hostRect.top - h - 4 > 8) top = a.top - hostRect.top - h - 4;
    el.style.left = left + "px";
    el.style.top = top + "px";
  }
  var popover = {
    open: function (id, anchor) {
      var el = byId(id);
      if (!el) return null;
      root().appendChild(el);
      el._wfAnchor = anchor || null;
      if (anchor) placeNear(el, anchor);
      else el.hidden = false;
      if (anchor) anchor.setAttribute("aria-expanded", "true");
      if (!el._wfBound) {
        el._wfBound = true;
        el.addEventListener("wf:close", function () { if (el._wfAnchor) el._wfAnchor.setAttribute("aria-expanded", "false"); });
      }
      return openOverlay(el, anchor);
    },
    close: function (id) { closeOverlay(byId(id)); },
    toggle: function (id, anchor) {
      var el = byId(id);
      if (el && stack.indexOf(el) >= 0) closeOverlay(el);
      else popover.open(el, anchor);
    },
  };

  /* ---------- 右側編輯抽屜 ----------
     <div class="edit-drawer-layer" id="…" hidden> 用 data-wf-open-edit="id" 或 WfProto.editDrawer.open(id) 打開。
     開啟時焦點到 data-wf-autofocus 的欄位（沒有就第一個可操作元素）；Tab 困在抽屜裡；
     改過內容後按 ×、取消、Esc、點遮罩，先問「要放棄修改嗎？」（繼續編輯｜放棄）；關閉後焦點回到打開它的按鈕 */
  function requestEditClose(el) {
    if (el._wfDirty) {
      alertBox({
        title: "要放棄修改嗎？",
        desc: "修改的內容不會儲存。",
        actions: [
          { label: "繼續編輯", role: "cancel" },
          { label: "放棄", role: "danger", onClick: function () { el._wfDirty = false; after(0, function () { closeOverlay(el); }); } },
        ],
      });
      return;
    }
    closeOverlay(el);
  }
  var editDrawer = {
    /** row：從哪一列打開（選單動作或列上的編輯鈕）；列上 data-wf-cell 的值會帶進抽屜。
        mode：可省略；"new"／"edit" 指定模式（頁面 apply 直接開編輯狀態、沒有列可帶時寫 "edit"） */
    open: function (id, opener, row, mode) {
      var el = byId(id);
      if (!el) return null;
      if (!el._wfBound) {
        el._wfBound = true;
        ["input", "change", "wf:change"].forEach(function (type) {
          el.addEventListener(type, function () { if (el._wfReady) el._wfDirty = true; });
        });
      }
      el._wfDirty = false;
      el._wfReady = false;
      el._wfRow = row || null;
      // 新增或編輯：從列上（或列的選單）打開＝編輯，其他（頁首「新增」鈕）＝新增。
      // 標題寫 data-wf-title-new／data-wf-title-edit 時換成對應文字；只給某一種模式看的元素寫 data-wf-mode-show="new|edit"
      mode = mode === "new" || mode === "edit" ? mode : row ? "edit" : "new";
      el.setAttribute("data-wf-mode", mode);
      el.querySelectorAll("[data-wf-title-new], [data-wf-title-edit]").forEach(function (t) {
        var txt = t.getAttribute("data-wf-title-" + mode);
        if (txt) t.textContent = txt;
      });
      el.querySelectorAll("[data-wf-mode-show]").forEach(function (n) {
        n.hidden = n.getAttribute("data-wf-mode-show") !== mode;
      });
      if (row) fillFromRow(el, row);
      after(0, function () { el._wfReady = true; }); // 開啟前程式帶入的值不算修改
      return openOverlay(el, opener);
    },
    /** 這個抽屜是從哪一列打開的 */
    row: function (id) { var el = byId(id); return (el && el._wfRow) || null; },
    /** 關閉；force＝不問、直接關（儲存成功後用） */
    close: function (id, force) {
      var el = byId(id);
      if (!el) return;
      if (force) {
        el._wfDirty = false;
        if (el._wfRow && el._wfRow.isConnected) writeToRow(el, el._wfRow); // 儲存成功：欄位值寫回那一列
      }
      requestEditClose(el);
    },
    isDirty: function (id) { var el = byId(id); return !!(el && el._wfDirty); },
  };

  /* ---------- 長表單段落導覽：<nav class="form-index" data-wf-form-index> 內的連結指向各段落 id；捲到哪段就標成目前段落 ---------- */
  function formIndex(idOrEl) {
    var nav = byId(idOrEl);
    if (!nav || nav._wfIndex) return;
    nav._wfIndex = true;
    var links = Array.prototype.slice.call(nav.querySelectorAll("a[href^='#']"));
    function mark(id) { links.forEach(function (a) { a.setAttribute("aria-current", a.getAttribute("href") === "#" + id ? "true" : "false"); }); }
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var sec = document.querySelector(a.getAttribute("href"));
        if (!sec) return;
        e.preventDefault();
        mark(sec.id);
        if (!sec.hasAttribute("tabindex")) sec.setAttribute("tabindex", "-1");
        sec.focus({ preventScroll: true });
        sec.scrollIntoView({ behavior: SMOOTH, block: "start" });
      });
    });
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) mark(en.target.id); });
      }, { rootMargin: "-88px 0px -60% 0px" });
      links.forEach(function (a) { var s = document.querySelector(a.getAttribute("href")); if (s) io.observe(s); });
    }
    if (links[0]) mark(links[0].getAttribute("href").slice(1));
  }

  /* ============================================================
     Web 後台第三批：角色檢視、雙層側欄、狀態下拉、編輯紀錄、收藏欄
     ============================================================ */

  /* ---------- 角色檢視 ----------
     元素寫 data-wf-roles="主管,編輯"＝只有這些角色看得到；沒寫的元素所有角色都看得到。
     目前角色來源：殼層上方列「檢視角色」切換（網址 ?role=主管 可直接指定，截圖用）；
     單獨開檔時讀網址的 role 參數，或呼叫 WfProto.role.set("編輯")。切換即時重畫，在 document 觸發 wf:role */
  var currentRole = "";
  function splitRoles(s) { return String(s || "").split(/[,，、\s]+/).filter(Boolean); }
  /** 本頁用到的角色（依出現順序） */
  function pageRoles() {
    var out = [];
    document.querySelectorAll("[data-wf-roles]").forEach(function (el) {
      if (el.closest("[hidden]")) return; // 目前狀態看不到的區塊不算（同一份檔的其他頁碼）
      splitRoles(el.getAttribute("data-wf-roles")).forEach(function (r) { if (out.indexOf(r) < 0) out.push(r); });
    });
    return out;
  }
  function applyRole(name) {
    if (name !== undefined) currentRole = name || "";
    if (!currentRole) currentRole = pageRoles()[0] || "";
    document.querySelectorAll("[data-wf-roles]").forEach(function (el) {
      var ok = !currentRole || splitRoles(el.getAttribute("data-wf-roles")).indexOf(currentRole) >= 0;
      if (ok) el.removeAttribute("data-wf-role-hidden");
      else el.setAttribute("data-wf-role-hidden", "");
    });
    if (currentRole) document.documentElement.setAttribute("data-wf-role", currentRole);
    emit(document, "wf:role");
    return currentRole;
  }
  var role = {
    get: function () { return currentRole; },
    set: function (name) { return applyRole(name || ""); },
    list: pageRoles,
    /** 動態加了帶 data-wf-roles 的元素後呼叫，照目前角色重畫 */
    apply: function () { return applyRole(); },
  };

  /* ---------- 雙層側欄（.sidenav--dual）----------
     第一層 .sidenav__rail-item[data-wf-sidenav-panel="第二層 id"]：點了展開並切到那一組（收合時點圖示即展開）；
     第二層 .sidenav__panel 頂端的收合鈕 data-wf-sidenav-collapse（值留空）；收合後只剩圖示欄、不顯示展開鈕。
     換頁（載入）時自動展開目前頁（aria-current）所在那一組；第二層有 .sidenav__back（返回）的內頁不提供收合 */
  function dualPanels(el) { return Array.prototype.slice.call(el.querySelectorAll(".sidenav__panel")); }
  function activePanel(el) { return dualPanels(el).filter(function (p) { return !p.hidden; })[0] || null; }
  function syncRail(el) {
    var open = activePanel(el);
    var collapsed = el.classList.contains("is-collapsed") && !narrowMq.matches;
    el.querySelectorAll("[data-wf-sidenav-panel]").forEach(function (b) {
      var id = b.getAttribute("data-wf-sidenav-panel");
      b.setAttribute("aria-controls", id);
      b.setAttribute("aria-expanded", open && open.id === id && !collapsed ? "true" : "false");
    });
  }
  function showDualPanel(el, id) {
    el._wfPanelSet = true;
    dualPanels(el).forEach(function (p) { p.hidden = p.id !== id; });
    el.classList.remove("is-collapsed");
    syncRail(el);
    syncSidenavButtons(el);
    emit(el, "wf:sidenav");
  }
  function initDual(el) {
    // 頁面已經指定要展開哪一組（例：內頁在載入時切到帶返回的第二層）就照它；否則展開目前頁所在那一組
    var cur = el.querySelector('.sidenav__panel .sidenav__item[aria-current]:not([aria-current="false"])');
    var panel = el._wfPanelSet ? activePanel(el) : cur ? cur.closest(".sidenav__panel") : dualPanels(el)[0];
    el.querySelectorAll("[data-wf-sidenav-panel]").forEach(function (b) {
      if (panel && b.getAttribute("data-wf-sidenav-panel") === panel.id) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
    if (panel) showDualPanel(el, panel.id); // 換頁時自動展開第二層
  }

  /* ---------- 狀態下拉（依狀態轉換表只列出可前往的狀態） ----------
     <div class="status-select" data-wf-status="待出貨"
          data-wf-status-flow="待付款>待出貨,已取消; 待出貨>已出貨,已取消; 已出貨>已完成"
          data-wf-status-dialog="已取消:cancel-dlg; 已出貨:ship-dlg"
          data-wf-status-log="編輯紀錄清單 id">
       <button type="button" class="status-select__btn" aria-haspopup="listbox" aria-expanded="false"></button>
       <ul class="filter-select__menu status-select__menu" role="listbox" aria-label="改為" hidden></ul>
     </div>
     · 轉換表：「目前狀態>可前往 1,可前往 2」，多組用分號隔開（→、全形逗號、頓號也可以）；不在表裡的狀態＝最終狀態，按鈕停用
     · 需要補資料的轉換，依資料量選容器：
         單一短欄位（原因、追蹤碼）＝ data-wf-status-dialog="目標狀態:對話框 id"（頁面寫好的 .alert-layer）
         長文字或多欄位 ＝ data-wf-status-drawer="目標狀態:抽屜 id"（頁面寫好的 .edit-drawer-layer；
           桌機、平板從右側滑出，手機 ≤640 自動改成底部面板）
       容器裡確認鈕寫 data-wf-status-confirm；對話框的取消鈕寫 data-wf-esc data-wf-close，抽屜的取消鈕與 × 寫 data-wf-close
       （抽屜裡打過字再關會先問「要放棄修改嗎？」）；確認時檢查容器裡的 required 欄位（空白＝「請輸入／請選擇〔欄位名〕」）
     · 改完：按鈕換新狀態、輕提示「已改為「〔狀態〕」」、所在表格列的 data-status 一起更新、觸發 wf:status；
       有 data-wf-status-log 時在編輯紀錄最上方加一筆（狀態前後值，以及對話框裡填的欄位） */
  function parsePairs(s, sep) {
    var out = {};
    String(s || "").split(/[;；\n]/).forEach(function (part) {
      var m = part.split(sep);
      if (m.length < 2) return;
      out[m[0].trim()] = m.slice(1).join("").trim();
    });
    return out;
  }
  function statusSelect(idOrEl) {
    var box = byId(idOrEl);
    if (!box) return null;
    if (box._wfStatus) return box._wfStatus;
    var btn = box.querySelector(".status-select__btn");
    var menu = box.querySelector('[role="listbox"]');
    var flowRaw = parsePairs(box.getAttribute("data-wf-status-flow"), /→|>/);
    var flow = {};
    Object.keys(flowRaw).forEach(function (k) { flow[k] = flowRaw[k].split(/[,，、]/).map(function (x) { return x.trim(); }).filter(Boolean); });
    var dialogs = parsePairs(box.getAttribute("data-wf-status-dialog"), /[:：]/);
    var drawers = parsePairs(box.getAttribute("data-wf-status-drawer"), /[:：]/);
    Object.keys(drawers).forEach(function (k) { dialogs[k] = drawers[k]; }); // 補資料容器：對話框或抽屜（依元素種類開啟）
    var initial = box.getAttribute("data-wf-status") || ""; // 預設狀態（選單切狀態時回到這裡）
    var key = box.getAttribute("data-wf-status-key") || "status";
    if (!menu.id) menu.id = (box.id || "status-" + Math.random().toString(36).slice(2, 7)) + "-menu";
    btn.setAttribute("aria-controls", menu.id);
    function render() {
      var cur = box.getAttribute("data-wf-status") || "";
      var next = flow[cur] || [];
      btn.innerHTML = '<span class="visually-hidden">狀態：</span><span class="badge">' + escHtml(cur) + "</span>" + (next.length ? '<span class="visually-hidden">，可變更</span>' : '<span class="status-select__hint">已是最終狀態</span>');
      btn.disabled = !next.length;
      menu.innerHTML = next.map(function (n) {
        return '<li class="filter-select__option" role="option" tabindex="-1" aria-selected="false" data-value="' + escHtml(n) + '">改為「' + escHtml(n) + "」" + (dialogs[n] ? '<span class="filter-select__option-sub">需補資料</span>' : "") + "</li>";
      }).join("");
    }
    function change(to, dialog) {
      var from = box.getAttribute("data-wf-status") || "";
      box.setAttribute("data-wf-status", to);
      render();
      var row = box.closest("tr");
      if (row) row.setAttribute("data-" + key, to);
      var logId = box.getAttribute("data-wf-status-log");
      if (logId && byId(logId)) {
        var log = audit(logId);
        if (dialog) {
          dialog.querySelectorAll(".field").forEach(function (f) {
            var c = f.querySelector("input, select, textarea");
            if (c && c.value.trim()) log.add({ field: fieldName(c), from: "", to: c.tagName === "SELECT" ? c.options[c.selectedIndex].text : c.value.trim() });
          });
        }
        log.add({ field: box.getAttribute("data-wf-status-name") || "狀態", from: from, to: to });
      }
      box._wfStatusLast = { from: from, to: to };
      toast("已改為「" + to + "」");
      emit(box, "wf:status");
    }
    render();
    listbox(box, function (value) {
      var dlgId = dialogs[value];
      var dlg = dlgId && byId(dlgId);
      if (!dlg) { change(value, null); return; }
      // 需要補資料：先清空容器裡的欄位、記住目標狀態，再打開
      dlg.querySelectorAll(".field").forEach(function (f) {
        var c = f.querySelector("input, select, textarea");
        if (!c) return;
        if (c.tagName === "SELECT") c.selectedIndex = 0;
        else c.value = "";
        clearFieldError(c);
      });
      rteSync(dlg);
      dlg._wfStatusPending = { box: box, to: value };
      if (kindOf(dlg) === "editdrawer") {
        dlg.classList.add("edit-drawer-layer--sheet"); // 手機改成底部面板
        after(0, function () { editDrawer.open(dlg, btn); });
      } else after(0, function () { openOverlay(dlg, btn); });
    });
    var api = {
      el: box,
      value: function () { return box.getAttribute("data-wf-status") || ""; },
      /** 可前往的狀態 */
      next: function () { return (flow[box.getAttribute("data-wf-status") || ""] || []).slice(); },
      /** 直接改狀態（不跳對話框） */
      set: function (to) { change(to, null); },
      /** 回到預設狀態（不寫編輯紀錄、不跳提示） */
      reset: function () {
        box.setAttribute("data-wf-status", initial);
        var row = box.closest("tr");
        if (row) row.setAttribute("data-" + key, initial);
        render();
      },
      _change: change,
    };
    box._wfStatus = api;
    return api;
  }
  /** 補資料容器（對話框或抽屜）的確認鈕 */
  function confirmStatusDialog(btnEl) {
    var dlg = btnEl.closest(".alert-layer, .edit-drawer-layer");
    var pending = dlg && dlg._wfStatusPending;
    if (!pending) return;
    var bad = [];
    dlg.querySelectorAll("[required]").forEach(function (c) {
      if (!String(c.value || "").trim()) {
        showFieldError(c, (c.tagName === "SELECT" ? "請選擇" : "請輸入") + fieldName(c));
        bad.push(c);
      } else clearFieldError(c);
    });
    if (bad.length) { bad[0].focus(); return; }
    dlg._wfStatusPending = null;
    if (kindOf(dlg) === "editdrawer") editDrawer.close(dlg, true);
    else closeOverlay(dlg);
    pending.box._wfStatus._change(pending.to, dlg);
  }

  /* ---------- 編輯紀錄 ----------
     <ol class="audit-log" id="…" data-wf-audit data-wf-audit-who="王小明">：每筆＝時間、人、欄位、原值 → 新值，新的在最上面。
     WfProto.audit("id").add({ field: "狀態", from: "待出貨", to: "已出貨", who, time })；
     who 省略＝data-wf-audit-who（預設「你」）加上目前檢視角色，time 省略＝現在 */
  function nowText() {
    var d = new Date();
    return fmtDate(d) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function audit(idOrEl) {
    var list = byId(idOrEl);
    if (!list) return null;
    return {
      el: list,
      add: function (e) {
        e = e || {};
        var who = e.who || (list.getAttribute("data-wf-audit-who") || "你") + (currentRole ? "（" + currentRole + "）" : "");
        var li = document.createElement("li");
        li.className = "audit-log__item is-new";
        li.innerHTML = '<time class="audit-log__time">' + escHtml(e.time || nowText()) + '</time><span class="audit-log__who">' + escHtml(who) + "</span>" +
          '<p class="audit-log__change"><span class="audit-log__field">' + escHtml(e.field || "") + '</span><span class="audit-log__from">' + escHtml(e.from || "") +
          '</span><span class="audit-log__arrow" aria-hidden="true"></span><span class="visually-hidden">改為</span><span class="audit-log__to">' + escHtml(e.to || "") + "</span></p>";
        list.insertBefore(li, list.firstChild);
        emit(list, "wf:audit");
        return li;
      },
      count: function () { return list.querySelectorAll(".audit-log__item").length; },
    };
  }

  /* ---------- 活動時間軸 ----------
     <section class="activity" id="…" data-wf-activity data-wf-activity-who="王小明">：單筆詳情的動態＋備註，新的在最上面。
     頂端留言框（form.activity__composer 裡的 textarea.activity__input）按「新增備註」：
       空白＝框下紅字（data-wf-empty 可改文案，預設「請輸入備註內容」）、不新增；
       有字＝在最上方加一筆備註、清空留言框、輕提示「已新增備註」。
     WfProto.activity("id").add({ type: "note"|"event", text, who, time })；type 省略＝"event"（系統事件）；
     who 省略＝data-wf-activity-who（預設「你」）加上目前檢視角色，time 省略＝現在；.count() 筆數；事件 wf:activity */
  function activity(idOrEl) {
    var box = byId(idOrEl);
    if (!box) return null;
    if (box._wfActivity) return box._wfActivity;
    var list = box.querySelector(".activity__list");
    var form = box.querySelector(".activity__composer");
    var input = form ? form.querySelector(".activity__input") : null;
    var empty = box.querySelector(".activity__empty");
    // 一筆都沒有時顯示空狀態句
    function sync() {
      if (empty && list) empty.hidden = !!list.querySelector(".activity__item");
    }
    function add(e) {
      e = e || {};
      if (!list) return null;
      var who = e.who || (box.getAttribute("data-wf-activity-who") || "你") + (currentRole ? "（" + currentRole + "）" : "");
      var li = document.createElement("li");
      li.className = "activity__item is-new" + (e.type === "note" ? " activity__item--note" : "");
      li.innerHTML = '<span class="activity__dot" aria-hidden="true"></span><p class="activity__meta"><span class="activity__who">' + escHtml(who) +
        '</span><time class="activity__time">' + escHtml(e.time || nowText()) + '</time></p><p class="activity__text">' + escHtml(e.text || "") + "</p>";
      list.insertBefore(li, list.firstChild);
      sync();
      emit(box, "wf:activity");
      return li;
    }
    if (form && input) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var v = input.value.trim();
        if (!v) {
          showFieldError(input, input.getAttribute("data-wf-empty") || "請輸入備註內容");
          return;
        }
        clearFieldError(input);
        add({ type: "note", text: v });
        input.value = "";
        toast("已新增備註");
      });
      // 已經報錯時，打了字就收掉錯誤
      input.addEventListener("input", function () {
        if (input.value.trim()) clearFieldError(input);
      });
    }
    var api = {
      el: box,
      add: add,
      count: function () { return list ? list.querySelectorAll(".activity__item").length : 0; },
    };
    box._wfActivity = api;
    sync();
    return api;
  }

  /* ---------- 收藏欄：button.fav-btn[data-wf-fav][aria-pressed]，點了切換，輕提示「已加入收藏」／「已取消收藏」，
     所在表格列寫 data-fav="是|否"（可再拿來篩選），觸發 wf:fav ---------- */
  function toggleFav(b) {
    var on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", on ? "true" : "false");
    var row = b.closest("tr");
    if (row) row.setAttribute("data-fav", on ? "是" : "否");
    toast(on ? "已加入收藏" : "已取消收藏");
    emit(b, "wf:fav");
  }

  /* ---------- 文字編輯器（線框層級） ----------
     <div class="rte" data-wf-rte> 工具列（標題、粗體、清單、連結、圖片）＋內容區（textarea.rte__area）＋字數（[data-wf-rte-count]）。
     只畫外觀與四種狀態：預設、聚焦（內容區聚焦時整個框加深）、錯誤（外層 .field.is-error）、停用（內容區 disabled，工具列跟著停用）。
     工具列按鈕不做真實排版，點了焦點留在內容區；字數隨輸入更新（有 maxlength 時顯示「目前／上限」）。
     WfProto.rte(el) 回傳 .sync()（重算字數與停用）、.disable(true|false) */
  function rte(idOrEl) {
    var box = byId(idOrEl);
    if (!box) return null;
    if (box._wfRte) return box._wfRte;
    var area = box.querySelector(".rte__area");
    var count = box.querySelector("[data-wf-rte-count]");
    var tools = Array.prototype.slice.call(box.querySelectorAll(".rte__tool"));
    function sync() {
      if (!area) return;
      var max = area.maxLength > 0 ? area.maxLength : 0;
      if (count) count.textContent = area.value.length + (max ? "／" + max : " 字");
      tools.forEach(function (t) { t.disabled = area.disabled; });
      box.classList.toggle("is-disabled", area.disabled);
    }
    if (area) area.addEventListener("input", sync);
    // 工具列只示意：按下不搶走內容區的焦點，維持「聚焦」的樣子
    tools.forEach(function (t) {
      t.addEventListener("mousedown", function (e) { e.preventDefault(); });
      t.addEventListener("click", function () { if (area && !area.disabled) area.focus(); });
    });
    var api = {
      el: box,
      sync: sync,
      disable: function (on) { if (area) area.disabled = !!on; sync(); },
    };
    box._wfRte = api;
    sync();
    return api;
  }
  /** 重算 scope 裡所有文字編輯器的字數（程式改了內容之後呼叫） */
  function rteSync(scope) {
    (scope || document).querySelectorAll("[data-wf-rte]").forEach(function (el) { var a = rte(el); if (a) a.sync(); });
  }

  /* ---------- 切狀態重設 ----------
     從左側選單切到同一份檔的另一個狀態時（ctx.source＝"menu"），在頁面的 apply 之前把畫面回到預設值：
       · 浮層（對話框、抽屜、選單、浮層、日曆、底部面板）立即關閉；輕提示、提示泡泡移除
       · 表單欄位回到 HTML 寫的值（含勾選、單選、下拉）並清掉欄位錯誤與錯誤摘要
       · 選取（膠囊、面板選項、統計卡、表格勾選）、頁籤回到 HTML 寫的選中項
       · 狀態下拉、篩選列、日期、組合框、驗證碼、上傳清單、文字編輯器回到預設
       · 「放棄修改」的修改記號歸零
     預設值＝registerPage 時的畫面（頁面 HTML 寫好的值）。不想被重設的區塊加 data-wf-no-reset。
     也可以自己呼叫 WfProto.reset()；重設完在 document 觸發 wf:reset */
  var snap = null;
  var SELECT_ATTRS = [
    [".chip[aria-pressed], .stat-card--selectable[aria-pressed]", "aria-pressed"],
    [".sheet__option[aria-checked]", "aria-checked"],
    [".tabs__tab[aria-selected], .seg__item[aria-selected]", "aria-selected"],
  ];
  function keptOut(el) { return !!(el.closest && el.closest("[data-wf-no-reset]")); }
  function takeSnapshot() {
    if (snap) return;
    snap = { controls: [], attrs: [] };
    document.querySelectorAll("input, select, textarea").forEach(function (c) {
      if (c.type === "file" || keptOut(c)) return;
      snap.controls.push({ el: c, value: c.value, checked: c.checked, index: c.selectedIndex, disabled: c.disabled });
    });
    SELECT_ATTRS.forEach(function (pair) {
      document.querySelectorAll(pair[0]).forEach(function (n) {
        if (!keptOut(n)) snap.attrs.push({ el: n, attr: pair[1], value: n.getAttribute(pair[1]), on: n.classList.contains("is-on") });
      });
    });
  }
  /** 立即關閉一個浮層（不等動態、不搬焦點） */
  function closeNow(el) {
    var kind = kindOf(el);
    window.clearTimeout(el._wfHideTimer);
    el.classList.remove("is-open");
    if (kind === "sidenav") closeSidenavDrawer(el);
    else el.hidden = true;
    if (kind === "popmenu" && el._wfAnchor) el._wfAnchor.setAttribute("aria-expanded", "false");
    if (kind === "editdrawer") el._wfDirty = false;
    if (el.hasAttribute("data-wf-temp")) el.remove();
    emit(el, "wf:close");
  }
  function resetState() {
    if (!snap) return;
    // 1 浮層與提示
    stack.slice().reverse().forEach(function (el) { if (!keptOut(el)) closeNow(el); });
    stack = stack.filter(function (el) { return keptOut(el); });
    removeCatcher();
    window.clearTimeout(toastTimer);
    if (toastEl) { toastEl.remove(); toastEl = null; }
    hideTip();
    // 2 表單欄位與錯誤
    snap.controls.forEach(function (s) {
      var c = s.el;
      if (!c.isConnected) return;
      if (c.type === "checkbox" || c.type === "radio") c.checked = s.checked;
      else if (c.tagName === "SELECT") c.selectedIndex = s.index;
      else c.value = s.value;
      c.disabled = s.disabled;
      if (c.type === "checkbox") c.indeterminate = false;
    });
    document.querySelectorAll(".field.is-error").forEach(function (f) { if (!keptOut(f)) f.classList.remove("is-error"); });
    document.querySelectorAll("[aria-invalid]").forEach(function (n) { if (!keptOut(n)) n.removeAttribute("aria-invalid"); });
    document.querySelectorAll(".field__error[data-wf-error-for], [data-wf-form-error]").forEach(function (n) {
      if (keptOut(n)) return;
      n.hidden = true;
      if (n.hasAttribute("data-wf-error-for")) n.textContent = "";
    });
    // 3 選取與頁籤
    snap.attrs.forEach(function (s) {
      if (!s.el.isConnected) return;
      if (s.value == null) s.el.removeAttribute(s.attr);
      else s.el.setAttribute(s.attr, s.value);
      s.el.classList.toggle("is-on", s.on);
    });
    document.querySelectorAll("[data-wf-tabs]").forEach(function (g) {
      if (keptOut(g)) return;
      g.querySelectorAll(".tabs__tab, .seg__item").forEach(function (t) {
        var on = t.getAttribute("aria-selected") === "true";
        t.tabIndex = on ? 0 : -1;
        var p = t.getAttribute("aria-controls");
        if (p && document.getElementById(p)) document.getElementById(p).hidden = !on;
      });
    });
    // 4 會動的元件回到預設
    function each(sel, fn) { document.querySelectorAll(sel).forEach(function (el) { if (!keptOut(el)) fn(el); }); }
    each("[data-wf-status-flow]", function (el) { if (el._wfStatus) el._wfStatus.reset(); });
    each("[data-wf-filter]", function (el) { if (el._wfFilter) el._wfFilter.reset(); });
    each("[data-wf-datepicker]", function (el) { if (el._wfDate && el._wfDate.reset) el._wfDate.reset(); });
    each("[data-wf-combobox]", function (el) { if (el._wfCombo && el._wfCombo.reset) el._wfCombo.reset(); });
    each("[data-wf-upload]", function (el) { if (el._wfUpload) el._wfUpload.clear(); });
    each("[data-wf-otp]", function (el) { if (el._wfOtp) el._wfOtp.reset(); });
    each("[data-wf-table]", function (el) { if (el._wfTable) { el._wfTable.setState("ready"); el._wfTable.syncSelection(); } });
    each(".search", function (s) {
      var i = s.querySelector(".search__input");
      var c = s.querySelector(".search__clear");
      if (i && c) c.hidden = !i.value;
    });
    rteSync(document);
    dirty = false;
    emit(document, "wf:reset");
  }

  /* ---------- 自動掛上的宣告式行為 ---------- */

  /** 宣告式導覽：
   *   data-wf-go="檔名.html"、data-wf-code="A1.2"（可加 data-wf-transition="push|cover|none"）
   *   data-wf-params="view=next&id=3"（帶給下一頁的網址參數，下一頁用 ctx.params 讀）
   *   data-wf-back（返回上一動，可帶備援頁碼）、data-wf-close-page（關閉獨立任務，可帶備援頁碼） */
  function handleNav(e) {
    var t = e.target.closest("[data-wf-go], [data-wf-code], [data-wf-back], [data-wf-close-page]");
    if (!t) return;
    e.preventDefault();
    var transition = t.getAttribute("data-wf-transition") || "";
    var params = {};
    new URLSearchParams(t.getAttribute("data-wf-params") || "").forEach(function (v, k) { params[k] = v; });
    if (t.hasAttribute("data-wf-back")) goBack(t.getAttribute("data-wf-back") || "");
    else if (t.hasAttribute("data-wf-close-page")) closePage(t.getAttribute("data-wf-close-page") || "");
    else if (t.hasAttribute("data-wf-code")) goCode(t.getAttribute("data-wf-code"), params, { transition: transition });
    else go(t.getAttribute("data-wf-go"), params, { transition: transition });
  }

  /** 單選／多選：容器 data-wf-select="single|multi"，選項是 .chip、.sheet__option 或 .choice-card 以外的按鈕 */
  function handleSelect(e) {
    var item = e.target.closest(".chip, .sheet__option, .stat-card--selectable");
    if (!item) return;
    var group = item.closest("[data-wf-select]");
    if (!group || item.disabled) return;
    var multi = group.getAttribute("data-wf-select") === "multi";
    var pressable = item.classList.contains("chip") || item.classList.contains("stat-card--selectable");
    var attr = pressable ? "aria-pressed" : "aria-checked";
    var on = item.getAttribute(attr) === "true";
    if (!multi) {
      group.querySelectorAll(".chip, .sheet__option, .stat-card--selectable").forEach(function (o) {
        if (o !== item) { o.setAttribute(o.classList.contains("sheet__option") ? "aria-checked" : "aria-pressed", "false"); o.classList.remove("is-on"); }
      });
    }
    // 單選膠囊可再點一次取消；面板選項單選時點已選的不取消
    var next = multi || pressable ? !on : true;
    item.setAttribute(attr, next ? "true" : "false");
    item.classList.toggle("is-on", next);
    emit(group, "wf:select");
  }

  /** 分段頁籤：容器 data-wf-tabs，項目 .tabs__tab 或 .seg__item；aria-controls 指向的面板跟著切換 */
  function handleTabs(e) {
    var tab = e.target.closest(".tabs__tab, .seg__item");
    if (!tab) return;
    var group = tab.closest("[data-wf-tabs]");
    if (!group) return;
    group.querySelectorAll(".tabs__tab, .seg__item").forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1; // 整組只有選中的那個在 Tab 順序裡
      var panel = t.getAttribute("aria-controls");
      if (panel && document.getElementById(panel)) document.getElementById(panel).hidden = !on;
    });
    emit(group, "wf:tab");
  }

  function bindClicks() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      // 遮罩：底部面板、側邊抽屜點遮罩可關；對話框不可
      if (t.classList.contains("sheet-layer") || t.classList.contains("drawer-layer")) {
        closeOverlay(t);
        return;
      }
      if (t.classList.contains("edit-drawer-layer")) {
        requestEditClose(t);
        return;
      }
      if (t.classList.contains("popmenu-catcher")) {
        stack.filter(function (o) { return kindOf(o) === "popmenu"; }).forEach(function (o) { closeOverlay(o); });
        return;
      }
      // 點了選單裡的項目：先收選單，再執行項目上的動作
      var menuItem = t.closest(".popmenu__item");
      var menuEl = menuItem ? menuItem.closest(".popmenu") : null;
      var menuRow = menuEl ? menuEl._wfRow || null : null; // 觸發選單的那一列
      if (menuItem) closeOverlay(menuEl);
      if (menuItem && menuRow && menuRow.isConnected) {
        var rowCopy = menuItem.closest("[data-wf-row-copy]");
        if (rowCopy) copyRow(menuRow, rowCopy.getAttribute("data-wf-row-copy") || "");
        try {
          menuRow.dispatchEvent(new CustomEvent("wf:rowaction", { bubbles: true, detail: { action: menuItem.getAttribute("data-wf-row-action") || menuItem.textContent.trim(), item: menuItem, menu: menuEl } }));
        } catch (err) {}
      }

      var pm = t.closest("[data-wf-popmenu]");
      if (pm) {
        popmenu.toggle(pm.getAttribute("data-wf-popmenu"), pm);
        return;
      }

      var closer = t.closest("[data-wf-close]");
      if (closer) {
        var closing = byId(closer.getAttribute("data-wf-close")) || closer.closest(".sheet-layer, .drawer-layer, .alert-layer, .popmenu, .sidenav, .edit-drawer-layer, [data-wf-popover]");
        if (kindOf(closing) === "editdrawer") requestEditClose(closing);
        else closeOverlay(closing);
      }
      var editOpen = t.closest("[data-wf-open-edit]");
      if (editOpen) {
        // 選單裡的「編輯」：焦點之後回到該列的「⋯」，並帶入該列資料；列上的編輯鈕：帶入所在列
        if (menuEl) editDrawer.open(editOpen.getAttribute("data-wf-open-edit"), menuEl._wfAnchor || editOpen, menuRow);
        else editDrawer.open(editOpen.getAttribute("data-wf-open-edit"), editOpen, editOpen.closest("[data-wf-row], tr") || null);
      }
      var pop = t.closest("[data-wf-popover-open]");
      if (pop) popover.toggle(pop.getAttribute("data-wf-popover-open"), pop);

      var opener = t.closest("[data-wf-open], [data-wf-open-sheet], [data-wf-open-drawer], [data-wf-open-alert]");
      if (opener) {
        var id = opener.getAttribute("data-wf-open") || opener.getAttribute("data-wf-open-sheet") ||
          opener.getAttribute("data-wf-open-drawer") || opener.getAttribute("data-wf-open-alert");
        openOverlay(id);
      }

      var sn = t.closest("[data-wf-open-sidenav]");
      if (sn) sidenav.toggle(sn.getAttribute("data-wf-open-sidenav"));
      var snc = t.closest("[data-wf-sidenav-collapse]");
      if (snc) sidenav.press(snc.getAttribute("data-wf-sidenav-collapse") || snc.closest(".sidenav"));
      var rail = t.closest("[data-wf-sidenav-panel]");
      if (rail) showDualPanel(rail.closest(".sidenav"), rail.getAttribute("data-wf-sidenav-panel"));
      var favBtn = t.closest("[data-wf-fav]");
      if (favBtn) toggleFav(favBtn);
      var stOk = t.closest("[data-wf-status-confirm]");
      if (stOk) confirmStatusDialog(stOk);
      // 抽屜模式下點了導覽項目＝換頁，抽屜收起
      var navItem = t.closest(".sidenav.is-open .sidenav__item");
      if (navItem) closeOverlay(navItem.closest(".sidenav"));
      var dis = t.closest("[data-wf-dismiss]");
      if (dis) dismiss(dis.getAttribute("data-wf-dismiss") || dis.closest(".banner"));
      // 表格「沒有符合條件」狀態裡的「清除篩選」：找連到這張表的篩選列
      var fc = t.closest(".data-table [data-wf-filter-clear]");
      if (fc) {
        var tb = fc.closest(".data-table");
        var fb = tb.id && document.querySelector('.filter-bar[data-wf-for="' + tb.id + '"]');
        if (fb && fb._wfFilter) fb._wfFilter.clear();
      }

      var del = t.closest("[data-wf-delete]");
      if (del) {
        deleteFlow({
          target: del.getAttribute("data-wf-delete") || (menuItem && menuRow) || null, // 選單裡不填值＝刪觸發的那一列
          title: del.getAttribute("data-wf-delete-title") || undefined,
          desc: del.hasAttribute("data-wf-delete-desc") ? del.getAttribute("data-wf-delete-desc") : undefined,
          confirmLabel: del.getAttribute("data-wf-delete-confirm") || undefined,
          second: del.hasAttribute("data-wf-delete-second") ? { title: del.getAttribute("data-wf-delete-second"), desc: del.getAttribute("data-wf-delete-second-desc") || "", confirmLabel: del.getAttribute("data-wf-delete-second-confirm") || undefined } : null,
          fail: del.hasAttribute("data-wf-delete-fail"),
        });
      }

      var cd = t.closest("[data-wf-countdown]");
      if (cd && !cd.disabled) {
        countdown(cd, Number(cd.getAttribute("data-wf-countdown")) || 60);
        toast(cd.getAttribute("data-wf-toast") || "已重新發送驗證碼");
      } else {
        var tt = t.closest("[data-wf-toast]");
        if (tt) toast(tt.getAttribute("data-wf-toast"));
      }

      var clear = t.closest(".search__clear");
      if (clear) {
        var input = clear.closest(".search").querySelector(".search__input");
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      }

      handleSelect(e);
      handleTabs(e);
      handleNav(e);
    });
  }

  /** ESC：關最上層浮層。對話框＝按取消（只有一顆鈕時按那顆） */
  function escape() {
    var top = topOverlay();
    if (!top) return false;
    if (kindOf(top) === "editdrawer") {
      requestEditClose(top);
      return true;
    }
    if (kindOf(top) === "alert") {
      var btns = top.querySelectorAll(".alert__btn");
      var cancel = top.querySelector("[data-wf-esc]") || (btns.length === 1 ? btns[0] : null);
      if (cancel) cancel.click();
      return true;
    }
    closeOverlay(top);
    return true;
  }

  function bindInputs() {
    // 搜尋欄清除鈕：有字才出現
    document.addEventListener("input", function (e) {
      var s = e.target.closest && e.target.closest(".search");
      if (s) {
        var c = s.querySelector(".search__clear");
        if (c) c.hidden = !e.target.value;
      }
      if (e.target.closest && e.target.closest("[data-wf-guard]")) dirty = true;
    });
    document.addEventListener("change", function (e) {
      if (e.target.closest && e.target.closest("[data-wf-guard]")) dirty = true;
    });
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-wf-guard] .chip, [data-wf-guard] .sheet__option, [data-wf-guard] .choice-card")) dirty = true;
    }, true);
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (tipEl) { hideTip(); e.preventDefault(); return; } // 先收提示泡泡
      if (escape()) e.preventDefault();
    });
  }

  /** App 狀態列：頁面只要放 <div class="statusbar"></div>，這裡補上時間與圖示 */
  function fillStatusbar() {
    document.querySelectorAll(".statusbar").forEach(function (bar) {
      if (bar.children.length) return;
      bar.innerHTML =
        '<span class="statusbar__time">9:41</span>' +
        '<span class="statusbar__island" aria-hidden="true"></span>' +
        '<span class="statusbar__icons" aria-hidden="true"><i></i><i></i><i></i></span>';
    });
  }

  /** 頁面載入時自動初始化的宣告式元件 */
  function autoInit() {
    document.querySelectorAll("[data-wf-table]").forEach(function (el) { table(el); });
    document.querySelectorAll("[data-wf-pagination]").forEach(function (el) { pagination(el); });
    document.querySelectorAll("[data-wf-filter]").forEach(function (el) { filterBar(el); });
    document.querySelectorAll("[data-wf-breadcrumb]").forEach(function (el) { breadcrumb(el); });
    document.querySelectorAll("[data-wf-datepicker]").forEach(function (el) { datePicker(el); });
    document.querySelectorAll("[data-wf-combobox]").forEach(function (el) { combobox(el); });
    document.querySelectorAll("[data-wf-upload]").forEach(function (el) { upload(el); });
    document.querySelectorAll("[data-wf-form-index]").forEach(function (el) { formIndex(el); });
    document.querySelectorAll("[data-wf-sidenav]").forEach(function (el) {
      if (el.classList.contains("sidenav--dual")) initDual(el);
      else if (el.hasAttribute("data-wf-collapsed")) sidenav.collapse(el, true);
      else syncSidenavButtons(el);
    });
    document.querySelectorAll("[data-wf-status-flow]").forEach(function (el) { statusSelect(el); });
    document.querySelectorAll("[data-wf-otp]").forEach(function (el) { otp(el); });
    document.querySelectorAll("[data-wf-rte]").forEach(function (el) { rte(el); });
    document.querySelectorAll("[data-wf-activity]").forEach(function (el) { activity(el); });
    document.querySelectorAll("[data-wf-countdown][data-wf-autostart]").forEach(function (el) {
      countdown(el, Number(el.getAttribute("data-wf-countdown")) || 60);
    });
    document.querySelectorAll("[data-wf-steps]").forEach(function (el) { steps(el); });
    document.querySelectorAll("[data-wf-tabs] .tabs__tab, [data-wf-tabs] .seg__item").forEach(function (t) {
      t.tabIndex = t.getAttribute("aria-selected") === "true" ? 0 : -1;
    });
    document.querySelectorAll(".search").forEach(function (s) {
      var i = s.querySelector(".search__input");
      var c = s.querySelector(".search__clear");
      if (i && c) c.hidden = !i.value;
    });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg) return;
    if (msg.wf === "key" && msg.key === "Escape") {
      escape();
      return;
    }
    if (msg.wf === "role") {
      applyRole(msg.role || "");
      return;
    }
    if (msg.wf !== "apply") return;
    applyCode(msg.code, { source: msg.source || "flow", params: msg.params || {} });
  });

  function boot() {
    fillStatusbar();
    bindClicks();
    bindInputs();
    bindKeys();
    bindOutside();
    bindTooltips();
    autoInit();
    applyRole(new URLSearchParams(window.location.search).get("role") || "");
    booted = true;
    // 已登記的頁面：元件都建好了，現在才套用頁碼（含直接開狀態頁）
    if (handler) { startPage(); return; }
    takeSnapshot(); // 沒有呼叫 registerPage 的頁面：載入完的畫面就是預設值
    // 沒有呼叫 registerPage 的頁面（純靜態）也要讓殼層知道載入了哪個檔
    window.setTimeout(function () {
      if (!handler && inShell) {
        var code = ownCode();
        syncShowWhen(code);
        post({ wf: "ready", file: fileName(), code: code, roles: pageRoles() });
      }
    }, 0);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  return {
    registerPage: registerPage,
    applyCode: applyCode,
    go: go,
    goCode: goCode,
    goBack: goBack,
    close: closePage,
    currentCode: function () { return currentCode; },
    flow: flow,
    initForm: initForm,
    syncForm: syncForm,
    showFieldError: showFieldError,
    clearFieldError: clearFieldError,
    setButtonLoading: setButtonLoading,
    chat: chat,
    reducedMotion: reducedMotion,
    // 會動的元件
    open: openOverlay,
    closeOverlay: closeOverlay,
    sheet: sheet,
    drawer: drawer,
    popmenu: popmenu,
    alert: alertBox,
    toast: toast,
    deleteFlow: deleteFlow,
    guard: guard,
    confirmLeave: confirmLeave,
    otp: otp,
    countdown: countdown,
    progress: progress,
    simulateProgress: simulateProgress,
    rotateText: rotateText,
    steps: steps,
    permission: permission,
    globalError: globalError,
    loadMore: loadMore,
    escape: escape,
    TOAST_MS: TOAST_MS,
    // Web 後台元件
    table: table,
    pagination: pagination,
    filterBar: filterBar,
    listbox: listbox,
    sidenav: sidenav,
    breadcrumb: breadcrumb,
    dismiss: dismiss,
    tooltip: { show: showTip, hide: hideTip },
    // Web 表單與浮層
    datePicker: datePicker,
    combobox: combobox,
    upload: upload,
    popover: popover,
    editDrawer: editDrawer,
    formIndex: formIndex,
    // Web 後台第三批
    role: role,
    statusSelect: statusSelect,
    audit: audit,
    activity: activity,
    // 第四批：文字編輯器、切狀態重設
    rte: rte,
    reset: resetState,
    noMotion: noMotion,
  };
})();

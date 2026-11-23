/* ============================================================
   資訊備註模式：內頁這一側（由 assets/proto.js 在殼層內自動載入，頁面不用另外引用）
   - 殼層與內頁只用 postMessage 溝通（雙擊 file:// 也能用），所以框選疊層、擋互動、
     點狀態卡頭切狀態後的填值／點擊、把選中區塊捲到看得到都在內頁這一側做。
   - 框選樣式：滑過＝半透明品牌色底＋區塊名稱；選中＝只留 2px 品牌色框（不蓋住畫面內容、不顯示名稱）。
   - 訊息格式（都帶 wf:"notes"）：
       殼層 → 內頁：{ wf:"notes", type:"state", on, doc, regions:[{id,label}], selected, hover, reveal, brand, draftPrefixes }
                    on＝資訊備註模式且這一層是最上層；doc＝文件頁（照常可捲動、可點）；brand＝外殼品牌色（框線用）；
                    reveal＝殼層每次選中區塊／切狀態就加一的號碼，內頁看到新號碼就把選中區塊捲到看得到；
                    draftPrefixes＝表單草稿的分頁暫存 key 前綴（資訊備註模式下離開本頁時刪掉，切回「未填」狀態才不會殘留）
                    { wf:"notes", type:"hover", id }（右側區塊 chip 滑過）
                    { wf:"notes", type:"run", runId, fill, click }（點狀態卡頭切狀態後填值／點擊）
                    { wf:"notes", type:"probe", probeId, id }（自檢：這個區塊現在框得到嗎）
       內頁 → 殼層：{ wf:"notes", type:"hello" }（本檔載入完成，請殼層補送狀態）
                    { wf:"notes", type:"select", id }（點了某個區塊；id＝null 代表點空白處）
                    { wf:"notes", type:"run-start" }／{ type:"run-end" }（程式點擊開始／結束；資訊備註模式期間換頁一律擋掉）
                    { wf:"notes", type:"probe-result", probeId, found }
   - 頁面標區塊：在元素寫 data-note-region="區塊 id"（id 對到 assets/region-notes/<模組>.js）；
     同一個 id 可以標在多個元素上，框線會包住全部。
   ============================================================ */
(function () {
  "use strict";

  if (window.parent === window || window.__wfNotesFrame) return;
  window.__wfNotesFrame = true;

  var state = { on: false, doc: false, regions: [], selected: null, hover: null, draftPrefixes: [] };
  var localHover = null; // 滑鼠在畫面上滑過的區塊
  var lastRunId = 0;
  var lastReveal = 0; // 已處理過的 reveal 號碼

  // 框線顏色＝外殼品牌色（殼層在 state 訊息帶 brand 過來；沒帶就用預設中性灰）
  var DEFAULT_BRAND = "#475467";
  var brand = DEFAULT_BRAND;
  function mix(pct, other) {
    return "color-mix(in srgb, " + brand + " " + pct + "%, " + other + ")";
  }
  function buildCss() {
    return [
      "html.wf-notes, html.wf-notes body, html.wf-notes body * { cursor: default !important; caret-color: transparent !important; }",
      "html.wf-notes [data-note-region], html.wf-notes [data-note-region] * { cursor: pointer !important; }",
      // 頁內再嵌的 iframe：點擊穿過去由外層接，才選得到區塊、也不會在裡面互動
      "html.wf-notes iframe { pointer-events: none !important; }",
      ".wf-notes-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; }",
      ".wf-notes-box { position: absolute; border-radius: 8px; box-sizing: border-box; }",
      // 滑過：半透明品牌色底＋區塊名稱；選中：只留品牌色框，不蓋住畫面內容（切狀態對照時才看得清楚）
      ".wf-notes-box--hover { background: " + mix(14, "transparent") + "; }",
      ".wf-notes-box--selected { border: 2px solid " + brand + "; }",
      ".wf-notes-tag { position: absolute; left: -2px; top: -24px; padding: 2px 8px; border-radius: 6px; background: " + brand + "; color: #fff;",
      "  font: 600 12px/18px Inter, 'Noto Sans TC', -apple-system, 'PingFang TC', sans-serif; white-space: nowrap; box-shadow: 0 1px 2px rgba(16,24,40,.12); }",
      ".wf-notes-box--hover .wf-notes-tag { background: #fff; color: " + mix(85, "#000") + "; border: 1px solid " + mix(27, "#fff") + "; }",
      ".wf-notes-tag--inside { top: 4px; left: 4px; }",
    ].join("\n");
  }

  // 資訊備註模式擋掉的使用者操作（程式觸發的 element.click() 不擋，fill／click 才做得到）
  var BLOCKED = ["click", "dblclick", "auxclick", "pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "submit", "keydown", "keypress", "keyup", "beforeinput", "input", "change", "contextmenu", "dragstart"];

  function post(msg) {
    msg.wf = "notes";
    try {
      window.parent.postMessage(msg, "*");
    } catch (err) {}
  }

  function active() {
    return state.on && !state.doc;
  }

  function labelOf(id) {
    for (var i = 0; i < state.regions.length; i++) if (state.regions[i].id === id) return state.regions[i].label;
    return null;
  }

  function regionIdFrom(target) {
    if (!target || !target.closest) return null;
    var node = target.closest("[data-note-region]");
    while (node) {
      var id = node.getAttribute("data-note-region");
      if (labelOf(id) != null) return id;
      // 外層也可能標了別的區塊（巢狀）：往外找第一個有登記的
      node = node.parentElement ? node.parentElement.closest("[data-note-region]") : null;
    }
    return null;
  }

  /* ---------- 疊層 ---------- */
  var styleEl = null;
  var layer = null;
  function ensureStyle() {
    if (styleEl || !document.head) return;
    styleEl = document.createElement("style");
    styleEl.setAttribute("data-wf-notes", "");
    styleEl.textContent = buildCss();
    document.head.appendChild(styleEl);
  }

  function regionRect(id) {
    var nodes = document.querySelectorAll('[data-note-region="' + String(id).replace(/"/g, '\\"') + '"]');
    var box = null;
    Array.prototype.forEach.call(nodes, function (node) {
      if (layer && layer.contains(node)) return;
      var r = node.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      if (!box) box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      else {
        box.left = Math.min(box.left, r.left);
        box.top = Math.min(box.top, r.top);
        box.right = Math.max(box.right, r.right);
        box.bottom = Math.max(box.bottom, r.bottom);
      }
    });
    return box;
  }

  function redraw() {
    document.documentElement.classList.toggle("wf-notes", active());
    if (!active()) {
      if (layer) layer.remove();
      layer = null;
      return;
    }
    ensureStyle();
    if (!document.body) return;
    if (!layer || !layer.parentNode) {
      layer = document.createElement("div");
      layer.className = "wf-notes-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
    }
    layer.innerHTML = "";
    var hover = state.hover || localHover;
    var ids = [];
    if (state.selected) ids.push(state.selected);
    if (hover && hover !== state.selected) ids.push(hover);
    ids.forEach(function (id) {
      var label = labelOf(id);
      var rect = label != null ? regionRect(id) : null;
      if (!rect) return;
      var pad = 4;
      var box = document.createElement("div");
      box.className = "wf-notes-box " + (id === state.selected ? "wf-notes-box--selected" : "wf-notes-box--hover");
      box.style.left = rect.left - pad + "px";
      box.style.top = rect.top - pad + "px";
      box.style.width = rect.right - rect.left + pad * 2 + "px";
      box.style.height = rect.bottom - rect.top + pad * 2 + "px";
      // 選中的區塊不掛名稱（右側面板已寫明是哪一塊）
      if (id !== state.selected) {
        var tag = document.createElement("span");
        tag.className = "wf-notes-tag" + (rect.top < 30 ? " wf-notes-tag--inside" : "");
        tag.textContent = label;
        box.appendChild(tag);
      }
      layer.appendChild(box);
    });
  }

  var queued = false;
  function queueRedraw() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      redraw();
    });
  }

  /* ---------- 擋互動、框選 ---------- */
  BLOCKED.forEach(function (type) {
    window.addEventListener(type, function (event) {
      if (!active() || !event.isTrusted) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (type === "click") {
        var id = regionIdFrom(event.target);
        state.selected = id;
        redraw();
        post({ type: "select", id: id });
      }
    }, true);
  });
  // 擋掉焦點（避免鍵盤、游標停在輸入框）
  window.addEventListener("focusin", function (event) {
    if (!active() || !event.isTrusted) return;
    if (event.target && event.target.blur) event.target.blur();
  }, true);

  window.addEventListener("mousemove", function (event) {
    if (!active()) return;
    var id = regionIdFrom(event.target);
    if (id !== localHover) {
      localHover = id;
      redraw();
    }
  }, true);
  document.addEventListener("mouseleave", function () {
    if (localHover) {
      localHover = null;
      redraw();
    }
  });
  // 內頁捲動（含內層捲動容器）、視窗寬度改變（RWD 切換、左右面板開合）都重算框線位置
  window.addEventListener("scroll", function () { if (active()) queueRedraw(); }, true);
  window.addEventListener("resize", function () { if (active()) queueRedraw(); });
  if (window.ResizeObserver) {
    new ResizeObserver(function () { if (active()) queueRedraw(); }).observe(document.documentElement);
  }
  function watchDom() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (records) {
      if (!active()) return;
      // 疊層自己的變動不算，不然會一直重畫
      for (var i = 0; i < records.length; i++) {
        if (!layer || !layer.contains(records[i].target)) {
          queueRedraw();
          return;
        }
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  }

  /* ---------- 選中區塊時自動捲到看得到 ---------- */

  // 區塊是否完整落在畫面與所有可捲動的外層容器內；比容器還高的區塊，開頭在容器內就算看得到
  function fitsIn(r, top, bottom) {
    if (r.bottom - r.top > bottom - top) return r.top >= top - 1 && r.top < bottom - 40;
    return r.top >= top - 1 && r.bottom <= bottom + 1;
  }
  function isFullyVisible(node) {
    var r = node.getBoundingClientRect();
    if (!fitsIn(r, 0, window.innerHeight)) return false;
    for (var p = node.parentElement; p && p !== document.body; p = p.parentElement) {
      var oy = window.getComputedStyle(p).overflowY;
      if (oy !== "auto" && oy !== "scroll") continue;
      var pr = p.getBoundingClientRect();
      if (!fitsIn(r, pr.top, pr.bottom)) return false;
    }
    return true;
  }

  /** 區塊第一個看得到的元素（同一個 id 標在多個元素上時，捲到第一個） */
  function firstRegionNode(id) {
    var nodes = document.querySelectorAll('[data-note-region="' + String(id).replace(/"/g, '\\"') + '"]');
    for (var i = 0; i < nodes.length; i++) {
      if (layer && layer.contains(nodes[i])) continue;
      var r = nodes[i].getBoundingClientRect();
      if (r.width >= 1 && r.height >= 1) return nodes[i];
    }
    return null;
  }

  // 只捲最近一層可捲動的容器（沒有就捲整份文件），不用 scrollIntoView：它會連殼層一起捲，手機外框會跑掉
  function scrollRegionIntoView(node, smooth) {
    var box = null;
    for (var p = node.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      var oy = window.getComputedStyle(p).overflowY;
      if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 1) {
        box = p;
        break;
      }
    }
    var scroller = box || document.scrollingElement || document.documentElement;
    var view = box ? box.getBoundingClientRect() : { top: 0, height: window.innerHeight };
    var r = node.getBoundingClientRect();
    var height = r.bottom - r.top;
    // 放得下就置中；比容器高就讓開頭貼齊容器頂端
    var offset = height > view.height * 0.8 ? 0 : (view.height - height) / 2;
    var target = scroller.scrollTop + (r.top - view.top) - offset;
    if (scroller.scrollTo) scroller.scrollTo({ top: Math.max(0, target), behavior: smooth ? "smooth" : "auto" });
    else scroller.scrollTop = Math.max(0, target);
  }

  // 切狀態可能內容晚出現、或填值／點擊後頁面重鋪打斷捲動：3 秒內反覆檢查，
  // 區塊一旦完整看得到就停（之後使用者自己捲動不搶回來）
  var scrollRun = 0;
  function scrollToSelected() {
    if (!state.selected) return;
    var run = ++scrollRun;
    var id = state.selected;
    var tries = 0;
    function tick(spent) {
      if (run !== scrollRun || !active() || state.selected !== id || spent > 3000) return;
      var node = firstRegionNode(id);
      if (node && isFullyVisible(node)) return;
      var wait = 200;
      if (node) {
        // 第一次平滑捲動；被打斷或沒跑完就直接跳過去
        scrollRegionIntoView(node, tries++ === 0);
        wait = 500;
      }
      window.setTimeout(function () { tick(spent + wait); }, wait);
    }
    window.setTimeout(function () { tick(0); }, 150);
  }

  /* ---------- 點狀態卡頭切狀態：填值與點擊 ---------- */
  function afterBoot(fn) {
    // 等頁面 registerPage 的 apply 跑完（DOMContentLoaded 之後）再動手，避免被預設值蓋掉
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { window.setTimeout(fn, 80); });
    } else {
      window.setTimeout(fn, 80);
    }
  }

  function runFill(fill) {
    Object.keys(fill || {}).forEach(function (selector) {
      var input = null;
      try { input = document.querySelector(selector); } catch (err) {}
      if (!input) return;
      input.value = fill[selector];
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function runClicks(steps, runId, done) {
    var i = 0;
    function findTarget(step) {
      var nodes = [];
      try { nodes = document.querySelectorAll(step.selector); } catch (err) {}
      for (var n = nodes.length - 1; n >= 0; n--) {
        if (!step.text || (nodes[n].textContent || "").trim() === step.text) return nodes[n];
      }
      return null;
    }
    function next(waited) {
      if (runId !== lastRunId || i >= steps.length) return done();
      var target = findTarget(steps[i]);
      if (!target) {
        if (waited < 15000) window.setTimeout(function () { next(waited + 250); }, 250);
        else done();
        return;
      }
      target.click();
      i++;
      window.setTimeout(function () { next(0); }, 250);
    }
    next(0);
  }

  function run(msg) {
    if (!msg.runId || msg.runId <= lastRunId) return;
    lastRunId = msg.runId;
    var runId = msg.runId;
    afterBoot(function () {
      if (runId !== lastRunId) return;
      runFill(msg.fill);
      var steps = msg.click || [];
      if (!steps.length) {
        redraw();
        return;
      }
      post({ type: "run-start" });
      runClicks(steps, runId, function () {
        post({ type: "run-end" });
        redraw();
      });
    });
  }

  /* ---------- 殼層訊息 ---------- */
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || msg.wf !== "notes") return;
    if (msg.type === "state") {
      state.on = !!msg.on;
      state.doc = !!msg.doc;
      state.regions = msg.regions || [];
      state.selected = msg.selected || null;
      state.hover = msg.hover || null;
      state.draftPrefixes = Array.isArray(msg.draftPrefixes) ? msg.draftPrefixes : [];
      if (!state.on) localHover = null;
      var nextBrand = /^[#a-zA-Z0-9(),.%\s-]{3,60}$/.test(msg.brand || "") ? msg.brand : DEFAULT_BRAND;
      if (nextBrand !== brand) {
        brand = nextBrand;
        if (styleEl) styleEl.textContent = buildCss();
      }
      redraw();
      // 殼層選了新的區塊／切了狀態（號碼變了）：捲到看得到；重新載入的內頁收到第一則 state 也會捲一次
      var reveal = Number(msg.reveal) || 0;
      if (reveal !== lastReveal) {
        lastReveal = reveal;
        if (active() && state.selected) scrollToSelected();
      }
      return;
    }
    if (msg.type === "hover") {
      state.hover = msg.id || null;
      redraw();
      return;
    }
    if (msg.type === "run") run(msg);
    if (msg.type === "probe") post({ type: "probe-result", probeId: msg.probeId, found: !!regionRect(msg.id) });
  });

  // 資訊備註模式不留表單草稿：頁面若在 pagehide 存草稿、下次載入再還原，切回「未填」狀態會殘留剛填的字。
  // 本檔比頁面的監聽晚註冊，會在頁面存完之後執行，把剛存的草稿刪掉（前綴見 wireframe.config.js 的 notesDraftPrefixes）
  window.addEventListener("pagehide", function () {
    if (!state.on || !state.draftPrefixes.length) return;
    try {
      var store = window.sessionStorage;
      Object.keys(store).forEach(function (key) {
        state.draftPrefixes.forEach(function (prefix) {
          if (prefix && key.indexOf(prefix) === 0) store.removeItem(key);
        });
      });
    } catch (err) {}
  });

  function hello() {
    watchDom();
    post({ type: "hello" });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hello);
  else hello();
})();

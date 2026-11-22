/* ============================================================
   殼層兩種模式（殼層 index.html 用；內頁那一側在 assets/notes-frame.js）
   - Prototype（預設）：畫面照常可點可互動、可換頁，右側不放工程標註。
   - 資訊備註（網址 ?mode=notes，可直接分享）：畫面不能互動、不換頁；右側面板一律展開（不提供收合開關）；
     滑過可點區塊畫半透明品牌色底＋名稱，點下去只留品牌色框（不顯示名稱），右側只顯示該區塊所有狀態的備註；
     點畫面空白處回到「整頁通則」。左側選單的狀態頁碼縮排列在主頁碼底下：點主頁碼＝整頁通則，
     點狀態頁碼＝直接選中對應區塊的那個狀態。
   - 右側狀態卡：進區塊預設全部收合（只顯示序號、名稱、頁碼）；點卡片頭＝只把左側畫面切到這個狀態、不展開；
     展開／收合只靠卡片右側箭頭；上方「全部展開／全部收合」只動備註、不換畫面。
   - 選中區塊（從畫面、右側或選單選、或切狀態後）：內頁把左側畫面捲到看得到這個區塊（做法見 notes-frame.js）。
     區塊資料在 assets/region-notes/<模組>.js；還沒拆區塊的頁，右側照舊顯示整頁標註並附提示。
   - 切狀態（點狀態卡頭）：先清掉 wireframe.config.js 登記的示範暫存（notesDraftKeys／notesDraftPrefixes）；
     同一份檔、而且上個狀態有填值／點擊或剛清過暫存時，整份內頁重新導向（不用 reload，免得瀏覽器還原表單），
     載完先以「從選單點進來」重套狀態，再跑這個狀態的填值／點擊。切狀態期間內頁自己發出的換頁一律擋掉。
   - 自檢：console 跑 await WfNotesMode.selfCheck("A1") → 逐狀態切換，確認每個區塊在畫面上框得到，回傳 { checked, misses }。
   - 網址只帶 ?notes=1（舊的「打開工程標註」參數，截圖腳本會用）而沒寫 mode 時，也視為資訊備註模式。
   - 殼層與內頁只用 postMessage 溝通（{ wf:"notes", … }，格式見 notes-frame.js），不直接讀 iframe 內容，
     所以雙擊 file:// 也能用。
   - 本檔不碰殼層內部變數：殼層呼叫 WfNotesMode.install(shell) 時把要用的函式交給本檔。
   ============================================================ */
window.WfNotesMode = (function () {
  "use strict";

  var shell = null; // 殼層交進來的函式（見 index.html「資訊備註模式接點」）
  var q = new URLSearchParams(window.location.search);
  var mode = q.get("mode") === "notes" || (!q.get("mode") && q.get("notes") === "1") ? "notes" : "prototype";

  var selectedGroup = null;
  var selectedRegion = null; // 目前鎖定的區塊 id；null＝整頁通則
  var hoverRegion = null; // 右側 chip 滑過的區塊
  var shownStateKey = ""; // 最近一次點狀態卡頭切出的狀態（區塊 id:序號）
  var expandedStates = {}; // 狀態卡展開與否（區塊 id:序號 → true）；換區塊就清空＝全部收合
  var revealSeq = 0; // 每次選中區塊／切狀態就加一，內頁看到新的號碼才捲到選中區塊（只捲一次，不搶使用者手動捲動）
  var pendingRun = null; // 換頁後要交給內頁的填值／點擊
  var runSeq = 0;
  var lastStateDirty = false; // 上一個切出的狀態有填值／點擊（畫面已被改過）
  var awaitingReload = false; // 內頁重新導向中：等新的一份載完（ready）才補送狀態與填值／點擊
  var reloadTimer = 0;
  var probeSeq = 0;
  var probeWaiters = {}; // selfCheck 問內頁「這個區塊框得到嗎」的回覆

  function isNotes() {
    return mode === "notes";
  }

  function data() {
    return window.WfRegionNotes || null;
  }

  /** 某頁碼的區塊資料；看舊版本快照時一律不用（區塊資料只對目前工作版） */
  function groupFor(code) {
    var d = data();
    if (!d || !shell || shell.versionId()) return null;
    return d.groupFor(code);
  }

  function regionById(group, id) {
    if (!group || !id) return null;
    for (var i = 0; i < group.regions.length; i++) if (group.regions[i].id === id) return group.regions[i];
    return null;
  }

  function isDoc(code) {
    var s = shell.map().spec(code);
    return !!s && s.kind === "doc";
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- 示範暫存（wireframe.config.js 的 notesDraftKeys／notesDraftPrefixes） ---------- */

  function draftConfig() {
    var c = window.WfConfig || {};
    return {
      keys: Array.isArray(c.notesDraftKeys) ? c.notesDraftKeys : [],
      prefixes: Array.isArray(c.notesDraftPrefixes) ? c.notesDraftPrefixes : ["wf-form-draft:"],
    };
  }

  /** 清掉原型存在分頁暫存的示範資料與表單草稿；回傳有沒有清到東西 */
  function clearDrafts() {
    var cfg = draftConfig();
    var cleared = false;
    var store = null;
    try { store = window.sessionStorage; } catch (err) { return false; }
    if (!store) return false;
    try {
      cfg.keys.forEach(function (key) {
        if (store.getItem(key) != null) cleared = true;
        store.removeItem(key);
      });
      Object.keys(store).forEach(function (key) {
        for (var i = 0; i < cfg.prefixes.length; i++) {
          if (cfg.prefixes[i] && key.indexOf(cfg.prefixes[i]) === 0) {
            store.removeItem(key);
            cleared = true;
            return;
          }
        }
      });
    } catch (err) {}
    return cleared;
  }

  /* ---------- 和內頁溝通 ---------- */

  /** 外殼品牌色（--brand，見 assets/shell/shell-saas.css／wireframe.config.js 的 shellBrandColor）：內頁框線跟著用 */
  function brandColor() {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
    } catch (err) {
      return "";
    }
  }

  /** 把目前模式、區塊清單、選取狀態送給每一層 iframe；只有最上層開框選 */
  function sendState() {
    if (!shell) return;
    var brand = brandColor();
    var code = shell.currentCode();
    var group = isNotes() ? groupFor(code) : null;
    var regions = group ? group.regions.map(function (r) { return { id: r.id, label: r.label }; }) : [];
    var frames = shell.frames();
    frames.forEach(function (f, i) {
      var isTop = i === frames.length - 1;
      try {
        if (f && f.contentWindow) {
          f.contentWindow.postMessage({
            wf: "notes",
            type: "state",
            on: isNotes() && isTop,
            doc: isDoc(code),
            regions: isTop ? regions : [],
            selected: isTop ? selectedRegion : null,
            hover: isTop ? hoverRegion : null,
            reveal: isTop ? revealSeq : 0,
            brand: brand,
            draftPrefixes: draftConfig().prefixes, // 內頁離開前（pagehide）要刪掉的表單草稿前綴
          }, "*");
        }
      } catch (err) {}
    });
  }

  function postTop(msg) {
    var frames = shell.frames();
    var top = frames[frames.length - 1];
    try {
      if (top && top.contentWindow) top.contentWindow.postMessage(msg, "*");
    } catch (err) {}
  }

  function flushRun() {
    if (!pendingRun || awaitingReload) return;
    postTop(pendingRun); // 內頁依 runId 去重，重送不會跑兩次
  }

  /**
   * 切到某個狀態的頁碼：清示範暫存 → 換頁碼；同一份檔、且清過暫存或上個狀態改過畫面時，整份內頁重新導向。
   * dirty＝這個狀態有填值／點擊。回傳 true＝內頁會重新載入（填值／點擊等它回報載完再送）。
   */
  function goState(code, dirty) {
    var cleared = clearDrafts() || lastStateDirty;
    lastStateDirty = !!dirty;
    var reloaded = shell.go(code); // 等同從選單點：同檔＝內頁先重設回預設值再套用狀態；換檔＝重新載入
    if (!reloaded && cleared) {
      awaitingReload = shell.reloadTop();
      reloaded = awaitingReload;
      window.clearTimeout(reloadTimer);
      if (awaitingReload) {
        // 保險：太久沒回報載完就照常往下
        reloadTimer = window.setTimeout(function () {
          if (!awaitingReload) return;
          awaitingReload = false;
          sendState();
          flushRun();
        }, 6000);
      }
    }
    return reloaded;
  }

  /** 依狀態準備填值／點擊並切過去；回傳 goState 的結果 */
  function runState(st) {
    pendingRun = null;
    var dirty = !!(st.fill || (st.click && st.click.length));
    if (dirty) {
      runSeq += 1;
      pendingRun = { wf: "notes", type: "run", runId: runSeq, fill: st.fill || null, click: st.click || null };
    }
    return goState(st.code, dirty);
  }

  /* ---------- 模式切換 ---------- */

  function syncModeUi() {
    document.body.classList.toggle("is-mode-notes", isNotes());
    document.body.classList.toggle("is-mode-prototype", !isNotes());
    Array.prototype.forEach.call(document.querySelectorAll("[data-shell-mode]"), function (btn) {
      var on = btn.getAttribute("data-shell-mode") === mode;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function setMode(next) {
    if (next !== "notes") next = "prototype";
    if (next === mode) return;
    mode = next;
    selectedRegion = null;
    hoverRegion = null;
    shownStateKey = "";
    expandedStates = {};
    pendingRun = null;
    lastStateDirty = false;
    // 進資訊備註就打開右側面板（資訊備註模式一律展開，不提供收合開關）
    if (isNotes()) shell.openPanel();
    syncModeUi();
    shell.rewriteLocation();
    decorateMenu();
    shell.refresh(); // 重畫右側面板、選單高亮
    sendState();
  }

  /** 寫網址時要不要帶 mode=notes */
  function locationParam() {
    return isNotes() ? "notes" : "";
  }

  /* ---------- 左側選單：狀態頁碼縮排列在主頁碼底下 ---------- */

  function decorateMenu() {
    var d = data();
    Array.prototype.forEach.call(document.querySelectorAll(".menu__item[data-wf-p]"), function (item) {
      var code = item.getAttribute("data-wf-p");
      item.hidden = false;
      item.classList.toggle("menu__item--state", !!d && !!groupFor(code) && d.isStateCode(code));
    });
  }

  /** 選單要高亮哪個頁碼（狀態頁碼在選單上有自己的一列，直接高亮它） */
  function menuCode(code) {
    return code;
  }

  /**
   * 資訊備註模式下從左側選單點了某個頁碼（殼層已照常換頁）：
   * 主頁碼＝整頁通則；狀態頁碼＝直接選中對應區塊的那個狀態（同一頁碼有多個狀態時，優先不用填值／點擊的那個）。
   */
  function onMenuPick(code) {
    if (!isNotes()) return;
    var group = groupFor(code);
    if (!group) return;
    selectedGroup = group;
    selectedRegion = null;
    shownStateKey = "";
    expandedStates = {};
    hoverRegion = null;
    pendingRun = null;
    lastStateDirty = false;
    if (code !== group.main) {
      var best = null;
      group.regions.forEach(function (region) {
        region.states.forEach(function (st, index) {
          if (st.code !== code) return;
          var plain = !st.fill && !(st.click && st.click.length);
          if (!best || (plain && !best.plain)) best = { region: region, index: index, plain: plain };
        });
      });
      if (best) {
        selectedRegion = best.region.id;
        shownStateKey = best.region.id + ":" + best.index;
        revealSeq += 1;
      }
    }
    shell.openPanel();
    shell.renderPanel();
    sendState();
    var onScreen = document.querySelector(".notes-state.is-on-screen");
    if (onScreen && onScreen.scrollIntoView) onScreen.scrollIntoView({ block: "nearest" });
  }

  /* ---------- 擋掉內頁自行換頁 ---------- */

  /**
   * 內頁送來 go／goCode／goBack／close 時問：可不可以換頁。
   * 資訊備註模式一律不換頁（含切狀態期間、填值／點擊觸發的換頁）；文件頁（G1 欄位連結等）照常。
   * 殼層自己的選單、面板連結不經過這裡，照常可換頁。
   */
  function allowNav() {
    if (!isNotes()) return true;
    return isDoc(shell.currentCode());
  }

  /* ---------- 選區塊 ---------- */

  function selectRegion(id, fromScreen) {
    var group = groupFor(shell.currentCode());
    selectedGroup = group;
    selectedRegion = regionById(group, id) ? id : null;
    shownStateKey = "";
    expandedStates = {};
    hoverRegion = null;
    if (selectedRegion) revealSeq += 1;
    if (fromScreen && selectedRegion) shell.openPanel();
    shell.renderPanel();
    sendState();
  }

  function setHover(id) {
    hoverRegion = id;
    postTop({ wf: "notes", type: "hover", id: id });
  }

  function showState(region, index, st) {
    var keepRegion = selectedRegion;
    var key = region.id + ":" + index;
    shownStateKey = key;
    var reloaded = runState(st);
    selectedRegion = keepRegion;
    shownStateKey = key;
    revealSeq += 1;
    shell.renderPanel();
    sendState();
    if (!reloaded) flushRun(); // 同一份檔：直接接著填值／點擊；換檔的等內頁回報載入完成再送
    var onScreen = document.querySelector(".notes-state.is-on-screen");
    if (onScreen && onScreen.scrollIntoView) onScreen.scrollIntoView({ block: "nearest" });
  }

  function isStateOnScreen(region, index, st) {
    var code = shell.currentCode();
    if (shownStateKey) return shownStateKey === region.id + ":" + index;
    if (st.code !== code || st.fill || st.click) return false;
    // 沒點過狀態卡頭時，只標第一個符合目前頁碼的狀態
    for (var i = 0; i < region.states.length; i++) {
      var s = region.states[i];
      if (s.code === code && !s.fill && !s.click) return i === index;
    }
    return false;
  }

  /* ---------- 右側面板 ---------- */

  function renderNotesBody(container, features, hints, emptyText) {
    var has = shell.featureBlocks(container, features || [], []);
    if (hints && hints.length) {
      container.appendChild(el("p", "notes-sub", "測試值（怎麼觸發）"));
      container.appendChild(shell.hintCards(hints));
    }
    if (!has && !(hints && hints.length)) container.appendChild(el("p", "panel__empty", emptyText));
  }

  function renderGroup(panel, group) {
    var map = shell.map();
    var mainSpec = map.spec(group.main);
    var head = el("div", "notes-head");
    head.appendChild(el("span", "notes-head__code", mainSpec ? mainSpec.p : group.main));
    head.appendChild(el("h2", "notes-head__title", mainSpec ? mainSpec.label : ""));
    panel.appendChild(head);

    var region = regionById(group, selectedRegion);
    if (!region) {
      panel.appendChild(el("p", "notes-tip", "點左邊畫面上的區塊，這裡只顯示該區塊的備註；點空白處回到整頁通則。"));
      var chips = el("div", "notes-chips");
      group.regions.forEach(function (r) {
        var chip = el("button", "notes-chip", r.label);
        chip.type = "button";
        chip.addEventListener("mouseenter", function () { setHover(r.id); });
        chip.addEventListener("mouseleave", function () { setHover(null); });
        chip.addEventListener("click", function () { selectRegion(r.id, false); });
        chips.appendChild(chip);
      });
      shell.block("畫面區塊", null, chips, panel).classList.add("notes-block");
      var pageBody = el("div");
      renderNotesBody(pageBody, group.page.features, group.page.hints, "這頁沒有整頁層級的備註。");
      shell.block("整頁通則", null, pageBody, panel).classList.add("notes-block");
      return;
    }

    var back = el("button", "notes-back", "整頁通則");
    back.type = "button";
    back.insertBefore(el("span", "notes-back__arrow", "←"), back.firstChild);
    back.addEventListener("click", function () { selectRegion(null, false); });
    panel.appendChild(back);

    var regionHead = el("div", "notes-region");
    regionHead.appendChild(el("h3", "notes-region__title", region.label));
    regionHead.appendChild(el("span", "notes-region__count", region.states.length + " 種狀態"));
    panel.appendChild(regionHead);

    if (region.fields && region.fields.length) {
      var fieldsWrap = el("div", "notes-fields");
      fieldsWrap.appendChild(el("span", "notes-fields__label", "欄位規則"));
      region.fields.forEach(function (f) {
        var chip = el("button", "panel__chip", f.label);
        chip.type = "button";
        chip.addEventListener("click", function () { shell.goDoc(f.id); });
        fieldsWrap.appendChild(chip);
      });
      panel.appendChild(fieldsWrap);
    }

    // 全部展開／全部收合：只動備註，不換左側畫面
    var tools = el("div", "notes-state-tools");
    [["全部展開", true], ["全部收合", false]].forEach(function (pair) {
      var btn = el("button", "notes-state-tools__btn", pair[0]);
      btn.type = "button";
      btn.addEventListener("click", function () {
        expandedStates = {};
        if (pair[1]) region.states.forEach(function (s, i) { expandedStates[region.id + ":" + i] = true; });
        shell.renderPanel();
      });
      tools.appendChild(btn);
    });
    panel.appendChild(tools);

    region.states.forEach(function (st, index) {
      var key = region.id + ":" + index;
      var card = el("section", "notes-state");
      var onScreen = isStateOnScreen(region, index, st);
      var expanded = !!expandedStates[key];
      if (onScreen) card.classList.add("is-on-screen");
      if (expanded) card.classList.add("is-expanded");

      // 卡片頭（序號＋名稱＋頁碼）整塊可點：只切左側畫面，不展開；展開收合只靠右側箭頭
      var summary = el("div", "notes-state__summary");
      summary.setAttribute("role", "button");
      summary.setAttribute("tabindex", "0");
      summary.setAttribute("aria-label", "在畫面查看這個狀態");
      function activate() {
        if (!onScreen) showState(region, index, st);
      }
      summary.addEventListener("click", activate);
      summary.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activate();
      });

      var stHead = el("div", "notes-state__head");
      var titleWrap = el("div", "notes-state__title-wrap");
      titleWrap.appendChild(el("span", "notes-state__index", String(index + 1)));
      titleWrap.appendChild(el("h4", "notes-state__title", st.label));
      stHead.appendChild(titleWrap);
      var side = el("div", "notes-state__side");
      if (onScreen) side.appendChild(el("span", "notes-badge", "畫面中"));
      // 箭頭只展開／收合備註，不換畫面
      var chevron = el("button", "notes-chevron");
      chevron.type = "button";
      chevron.setAttribute("aria-label", expanded ? "收合備註" : "展開備註");
      chevron.setAttribute("aria-expanded", expanded ? "true" : "false");
      chevron.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>';
      chevron.addEventListener("click", function (event) {
        event.stopPropagation();
        if (expandedStates[key]) delete expandedStates[key];
        else expandedStates[key] = true;
        shell.renderPanel();
      });
      side.appendChild(chevron);
      stHead.appendChild(side);
      summary.appendChild(stHead);
      var spec = map.spec(st.code);
      if (spec) summary.appendChild(el("p", "notes-state__code", "頁碼 " + spec.p + (spec.p !== group.main ? "｜" + spec.label : "")));
      card.appendChild(summary);
      if (expanded) {
        var body = el("div", "notes-state__body");
        renderNotesBody(body, st.features, st.hints, "這個狀態沒有額外備註。");
        card.appendChild(body);
      }
      panel.appendChild(card);
    });
  }

  /**
   * 殼層 renderPanel 一開頭呼叫。回傳：
   *   "done"     ＝面板已由本檔畫好（Prototype 模式清空、或已拆區塊的頁）
   *   "fallback" ＝資訊備註模式、這頁還沒拆區塊：殼層照舊畫整頁標註，畫完再呼叫 fallbackNotice
   *   ""         ＝不處理（文件頁）
   */
  function renderPanel(panel, code) {
    panel.classList.remove("is-notes");
    if (!isNotes()) {
      panel.innerHTML = "";
      shell.setPanelVisible(false);
      return "done";
    }
    if (isDoc(code)) return "";
    shell.openPanel(); // 資訊備註模式：右側面板一律展開
    var group = groupFor(code);
    if (!group) {
      selectedGroup = null;
      selectedRegion = null;
      shownStateKey = "";
      expandedStates = {};
      return "fallback";
    }
    if (group !== selectedGroup) {
      selectedGroup = group;
      selectedRegion = null;
      shownStateKey = "";
      expandedStates = {};
    }
    panel.innerHTML = "";
    panel.classList.add("is-notes");
    renderGroup(panel, group);
    shell.setPanelVisible(true);
    return "done";
  }

  /** 還沒拆區塊的頁：整頁標註上方加一行提示 */
  function fallbackNotice(panel) {
    var tip = el("p", "notes-tip notes-tip--warn", "這頁還沒拆成畫面區塊，先顯示整頁標註。");
    panel.insertBefore(tip, panel.firstChild);
  }

  /* ---------- 殼層事件 ---------- */

  /** 內頁 { wf:"notes" } 訊息（只收最上層） */
  function onMessage(msg) {
    if (msg.type === "hello") {
      sendState();
      flushRun();
      return;
    }
    if (msg.type === "select") {
      if (!isNotes()) return;
      selectRegion(msg.id || null, true);
      return;
    }
    if (msg.type === "probe-result") {
      var done = probeWaiters[msg.probeId];
      delete probeWaiters[msg.probeId];
      if (done) done(!!msg.found);
    }
  }

  /** 最上層內頁回報載入完成（{wf:"ready"}） */
  function onReady() {
    if (awaitingReload) {
      // 重新導向後載完：先以「從選單點進來」重套一次狀態（部分頁面只在這時鋪示範資料），再跑填值／點擊
      awaitingReload = false;
      window.clearTimeout(reloadTimer);
      shell.reapply();
    }
    sendState();
    flushRun();
  }

  /* ---------- 自檢：每個區塊狀態在畫面上框得到 ---------- */

  function wait(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  /** 問最上層內頁：這個區塊目前有沒有可見元素（1 秒沒回覆＝沒有） */
  function probe(id) {
    return new Promise(function (resolve) {
      probeSeq += 1;
      var pid = probeSeq;
      probeWaiters[pid] = resolve;
      postTop({ wf: "notes", type: "probe", probeId: pid, id: id });
      window.setTimeout(function () {
        if (!probeWaiters[pid]) return;
        delete probeWaiters[pid];
        resolve(false);
      }, 1000);
    });
  }

  /**
   * 開發用（console 跑 await WfNotesMode.selfCheck("A1")）：只檢查 group id 等於 prefix、或以 prefix 後接「.」「-」開頭的頁
   * （"A1.1" 比到 A1.1、A1.1-2，不會比到 A1.10）；不給＝全部。
   * 逐一切到每個區塊狀態，每 300ms 看一次該區塊框不框得到，最多等 8 秒（有點擊步驟每步再加 4 秒）。
   * 回傳 { checked, misses:[ "頁 / 區塊（id）/ 狀態 @頁碼", … ] }。
   */
  /** 精確前綴：id＝prefix，或 id 以 prefix 後接「.」「-」開頭 */
  function matchPrefix(id, prefix) {
    return id === prefix || id.indexOf(prefix + ".") === 0 || id.indexOf(prefix + "-") === 0;
  }

  function selfCheck(prefix) {
    var d = data();
    if (!d || !shell) return Promise.resolve({ checked: 0, misses: ["沒有區塊資料或殼層未就緒"] });
    if (!isNotes()) setMode("notes");
    var jobs = [];
    d.groups.forEach(function (group) {
      if (prefix && !matchPrefix(String(group.id), String(prefix))) return;
      group.regions.forEach(function (region) {
        region.states.forEach(function (st) { jobs.push({ group: group, region: region, state: st }); });
      });
    });
    var misses = [];
    return jobs.reduce(function (chain, job) {
      return chain.then(function () {
        if (!shell.map().spec(job.state.code)) {
          misses.push(job.group.id + " / " + job.region.label + "（" + job.region.id + "）/ " + job.state.label + " @" + job.state.code + "（頁碼不存在）");
          return null;
        }
        runState(job.state);
        sendState();
        flushRun();
        var limit = 8000 + (job.state.click ? job.state.click.length * 4000 : 0);
        function poll(spent) {
          var ask = awaitingReload ? Promise.resolve(false) : probe(job.region.id);
          return ask.then(function (found) {
            if (found) return null;
            if (spent >= limit) {
              misses.push(job.group.id + " / " + job.region.label + "（" + job.region.id + "）/ " + job.state.label + " @" + job.state.code);
              return null;
            }
            return wait(300).then(function () { return poll(spent + 300); });
          });
        }
        return wait(600).then(function () { return poll(600); });
      });
    }, Promise.resolve()).then(function () {
      shownStateKey = "";
      shell.renderPanel();
      return { checked: jobs.length, misses: misses };
    });
  }

  function install(api) {
    shell = api;
    syncModeUi();
    Array.prototype.forEach.call(document.querySelectorAll("[data-shell-mode]"), function (btn) {
      btn.addEventListener("click", function () { setMode(btn.getAttribute("data-shell-mode")); });
    });
    if (isNotes()) shell.openPanel();
  }

  return {
    install: install,
    isNotes: isNotes,
    setMode: setMode,
    locationParam: locationParam,
    renderPanel: renderPanel,
    fallbackNotice: fallbackNotice,
    decorateMenu: decorateMenu,
    menuCode: menuCode,
    onMenuPick: onMenuPick,
    selfCheck: selfCheck,
    allowNav: allowNav,
    onMessage: onMessage,
    onReady: onReady,
    sendState: sendState,
    /** 除錯與自動化測試用：目前選取的區塊 */
    selected: function () { return selectedRegion; },
    select: function (id) { selectRegion(id, true); },
  };
})();

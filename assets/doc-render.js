/* ============================================================
   文件頁的畫法（共用邏輯，不用改）
   - 資料在 assets/doc-pages.js（window.WfDocPages），本檔只負責把資料畫成文件頁。
   - 四種文件頁：資訊架構（ia）、API 缺口清單（apiGaps）、模組錯誤處理（moduleErrors）、專案 UX 準則（uxRules）。
   - 每張卡下方的頁碼按鈕點了跳到殼層裡那一頁。
   ============================================================ */
window.WfDocRender = (function () {
  "use strict";

  var DATA = window.WfDocPages || {};

  // 建一個元素：tag、class、文字
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // 頁碼按鈕：點了跳到殼層裡那一頁（頁名從 page-map.js 查）
  function chips(codes) {
    var wrap = el("div", "doc-chips");
    var map = window.WfPageMap;
    (codes || []).forEach(function (code) {
      var s = map && map.spec ? map.spec(code) : null;
      var b = el("button", "doc-chip", s ? (s.hideCode ? s.label : code + " " + s.label) : code);
      b.type = "button";
      b.addEventListener("click", function () { window.WfProto.goCode(code); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  // 條列
  function bullets(list) {
    var ul = el("ul", "doc-list");
    (list || []).forEach(function (t) { ul.appendChild(el("li", "", t)); });
    return ul;
  }

  // 表格：{ headers: [...], rows: [[...], ...] }
  function table(t) {
    var wrap = el("div", "doc-table-wrap");
    var tb = el("table", "doc-table");
    var thead = el("thead");
    var tr = el("tr");
    (t.headers || []).forEach(function (h) { tr.appendChild(el("th", "", h)); });
    thead.appendChild(tr);
    tb.appendChild(thead);
    var tbody = el("tbody");
    (t.rows || []).forEach(function (row) {
      var r = el("tr");
      row.forEach(function (c) { r.appendChild(el("td", "", c)); });
      tbody.appendChild(r);
    });
    tb.appendChild(tbody);
    wrap.appendChild(tb);
    return wrap;
  }

  // 頁首的目錄（點了捲到該卡）
  function index(root, items) {
    if (!items.length) return;
    var nav = el("nav", "doc-index");
    nav.setAttribute("aria-label", "目錄");
    items.forEach(function (it) {
      var a = el("a", "doc-index__link", it.title);
      a.href = "#" + it.id;
      a.addEventListener("click", function (e) {
        e.preventDefault();
        focus(it.id);
      });
      nav.appendChild(a);
    });
    root.appendChild(nav);
  }

  function focus(id) {
    document.querySelectorAll(".doc-card.is-focus").forEach(function (n) { n.classList.remove("is-focus"); });
    var target = id && document.getElementById(id);
    if (!target) return;
    target.classList.add("is-focus");
    target.scrollIntoView({ block: "start" });
  }

  function empty(root, text) {
    root.appendChild(el("div", "doc-empty", text));
  }

  // 一張卡：標題、標籤、摘要、條列、表格、頁碼
  function card(o) {
    var c = el("article", "doc-card");
    c.id = o.id || "";
    var head = el("div", "doc-card__head");
    head.appendChild(el("h2", "doc-card__title", o.title || ""));
    if (o.meta) head.appendChild(el("span", "doc-card__meta", o.meta));
    c.appendChild(head);
    if (o.summary) c.appendChild(el("p", "doc-card__summary", o.summary));
    (o.blocks || []).forEach(function (b) {
      if (!b.items || !b.items.length) return;
      if (b.label) c.appendChild(el("h4", "", b.label));
      c.appendChild(bullets(b.items));
    });
    if (o.table) c.appendChild(table(o.table));
    if (o.pages && o.pages.length) c.appendChild(chips(o.pages));
    return c;
  }

  /* ---------- 資訊架構：產品 → 功能模組（橫向）→ 頁面（直向）＋每頁方框結構 ---------- */
  function ia(root) {
    var d = DATA.IA || {};
    var mods = d.modules || [];
    if (!mods.length) return empty(root, "還沒有資訊架構。到 assets/doc-pages.js 的 IA 填入功能模組與頁面。");
    var cfg = window.WfConfig || {};
    var tree = el("div", "ia");
    tree.appendChild(el("div", "ia__root", d.product || cfg.projectName || "產品"));
    var row = el("div", "ia__modules");
    mods.forEach(function (m) {
      var col = el("section", "ia__module");
      col.id = "ia-" + (m.code || m.title);
      col.appendChild(el("h2", "ia__module-title", (m.code ? m.code + " " : "") + m.title));
      (m.pages || []).forEach(function (p) {
        var box = el("article", "ia__page" + (p.key ? " ia__page--key" : ""));
        var head = el("div", "ia__page-head");
        head.appendChild(el("span", "ia__page-name", (p.code ? p.code + " " : "") + p.name));
        if (p.key) head.appendChild(el("span", "ia__key", "key page"));
        box.appendChild(head);
        if (p.key) box.appendChild(el("p", "ia__key-why", p.key));
        var frame = el("div", "ia__frame");
        (p.boxes || []).forEach(function (b) {
          var label = typeof b === "string" ? b : b.label;
          var size = typeof b === "string" ? "" : b.size || "";
          frame.appendChild(el("div", "ia__box" + (size ? " ia__box--" + size : ""), label));
        });
        if ((p.boxes || []).length) box.appendChild(frame);
        if (p.code && window.WfPageMap && window.WfPageMap.spec(p.code)) {
          box.classList.add("is-link");
          box.tabIndex = 0;
          box.addEventListener("click", function () { window.WfProto.goCode(p.code); });
        }
        col.appendChild(box);
      });
      row.appendChild(col);
    });
    tree.appendChild(row);
    root.appendChild(tree);
  }

  /* ---------- API 缺口清單 ---------- */
  function apiGaps(root) {
    var list = DATA.API_GAPS || [];
    if (!list.length) return empty(root, "目前沒有缺口。API 錯誤碼對帳時，到 assets/doc-pages.js 的 API_GAPS 新增。");
    index(root, list);
    list.forEach(function (g) {
      root.appendChild(card({
        id: g.id,
        title: g.title,
        meta: [g.kind, g.source ? "依據：" + g.source : ""].filter(Boolean).join("｜"),
        summary: g.summary,
        blocks: [
          { label: "畫面先怎麼做", items: g.decision ? [].concat(g.decision) : [] },
          { label: "待後端確認", items: g.ask ? [].concat(g.ask) : [] },
        ],
        pages: g.pages,
      }));
    });
  }

  /* ---------- 模組錯誤處理 ---------- */
  function moduleErrors(root) {
    var mods = DATA.MODULE_ERRORS || [];
    if (!mods.length) return empty(root, "還沒有模組錯誤處理。API 錯誤碼對帳後，到 assets/doc-pages.js 的 MODULE_ERRORS 新增。");
    var items = [];
    mods.forEach(function (m) { (m.sections || []).forEach(function (s) { items.push({ id: s.id, title: (m.code ? m.code + "｜" : "") + s.title }); }); });
    index(root, items);
    mods.forEach(function (m) {
      root.appendChild(el("h2", "doc-group", (m.code ? m.code + " " : "") + m.title));
      (m.sections || []).forEach(function (s) {
        root.appendChild(card({ id: s.id, title: s.title, summary: s.summary, blocks: [{ items: s.bullets }], table: s.table, pages: s.pages }));
      });
    });
  }

  /* ---------- 專案 UX 準則 ---------- */
  function uxRules(root) {
    var mods = DATA.UX_RULES || [];
    if (!mods.length) return empty(root, "還沒有專案 UX 準則。到 assets/doc-pages.js 的 UX_RULES 新增。");
    var items = [];
    mods.forEach(function (m) { (m.rules || []).forEach(function (r) { items.push({ id: r.id, title: (m.code ? m.code + "｜" : "") + r.title }); }); });
    index(root, items);
    mods.forEach(function (m) {
      root.appendChild(el("h2", "doc-group", (m.code ? m.code + " " : "") + m.title));
      (m.rules || []).forEach(function (r) {
        root.appendChild(card({ id: r.id, title: r.title, summary: r.summary, blocks: [{ items: r.bullets }], pages: r.pages }));
      });
    });
  }

  var KINDS = { ia: ia, apiGaps: apiGaps, moduleErrors: moduleErrors, uxRules: uxRules };

  /** 畫一種文件頁：WfDocRender.render("apiGaps", 根元素, "G5") */
  function render(kind, root, defaultCode) {
    KINDS[kind](root);
    if (window.WfProto && window.WfProto.registerPage) {
      window.WfProto.registerPage({
        defaultCode: defaultCode,
        apply: function () {
          var id = decodeURIComponent(String(location.hash || "").slice(1));
          if (id) window.setTimeout(function () { focus(id); }, 0);
        },
      });
    }
  }

  return { render: render };
})();

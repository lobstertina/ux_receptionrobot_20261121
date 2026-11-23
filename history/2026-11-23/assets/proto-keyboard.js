/* ============================================================
   模擬鍵盤（WfKeyboard，選配）：App 頁在 proto.js 之後載入
     <script src="../assets/proto.js"></script>
     <script src="../assets/proto-keyboard.js"></script>
   - 點輸入框 → 鍵盤由下升起（系統層，疊在所有浮層之上）。
   - 讓位規則（樣式在 shared.css「模擬鍵盤」一段）：
       一般頁：可捲動區縮短，置底區（主按鈕）貼在鍵盤上緣，焦點欄位捲進可見範圍；內容本身不位移
       底部面板裡：只把面板推到鍵盤上緣，背後頁面不動
       對話框裡：對話框在鍵盤以上的空間置中，背後頁面不動
   - 數字欄（inputmode="numeric"／type="tel"、驗證碼格子）顯示數字鍵盤；其他顯示英文鍵盤。
   - 驗證碼格子的容器加 data-wf-otp-suggest="123456" → 鍵盤上方出現「從訊息」候選碼，點了自動填入。
   - 輸入框有字、且頁面有主送出鈕（不在處理中、倒數中）時，右下「完成」變成深色「送出」，按了等同按主按鈕（由主按鈕檢查欄位）。
   - 點輸入框以外的地方、按「完成」或送出 → 鍵盤收下。
   - 欄位加 autofocus：進頁就聚焦並叫出鍵盤（表單頁進入即聚焦第一欄）。
   - 實體鍵盤照樣可以打字；模擬鍵盤只是畫面示意與點擊輸入。
   ============================================================ */
window.WfKeyboard = (function () {
  "use strict";

  var scr = null;
  var kb = null;
  var active = null;
  var shifted = false;
  var mode = "";
  var hideTimer = null;

  function isTypingField(el) {
    if (!el || !el.tagName) return false;
    if (el.tagName === "TEXTAREA") return !el.readOnly && !el.disabled;
    if (el.tagName !== "INPUT" || el.readOnly || el.disabled) return false;
    var type = (el.type || "text").toLowerCase();
    return ["text", "search", "tel", "email", "number", "password", "url"].indexOf(type) >= 0;
  }

  function modeFor(el) {
    var im = (el.getAttribute("inputmode") || "").toLowerCase();
    var type = (el.type || "").toLowerCase();
    if (el.closest(".code-cells") || im === "numeric" || im === "decimal" || type === "tel" || type === "number") return "numeric";
    return "text";
  }

  function key(label, value, cls) {
    return '<button type="button" tabindex="-1" class="kb__key' + (cls ? " " + cls : "") + '" data-key="' + value + '">' + label + "</button>";
  }

  function rowOf(chars) {
    return chars.split("").map(function (c) {
      var k = shifted ? c.toUpperCase() : c;
      return key(k, k);
    }).join("");
  }

  function render() {
    var html;
    if (mode === "numeric") {
      html = '<div class="kb__pad">' +
        "123456789".split("").map(function (n) { return key(n, n); }).join("") +
        key("", "noop", "kb__key--blank") + key("0", "0") + key("⌫", "backspace", "kb__key--util") +
        "</div>";
    } else {
      html = '<div class="kb__rows">' +
        '<div class="kb__row">' + rowOf("qwertyuiop") + "</div>" +
        '<div class="kb__row kb__row--inset">' + rowOf("asdfghjkl") + "</div>" +
        '<div class="kb__row">' + key("⇧", "shift", "kb__key--util") + rowOf("zxcvbnm") + key("⌫", "backspace", "kb__key--util") + "</div>" +
        '<div class="kb__row">' + key("123", "noop", "kb__key--util") + key("空白", " ", "kb__key--space") + key("完成", "done", "kb__key--util") + "</div>" +
        "</div>";
    }
    kb.querySelector(".kb__body").innerHTML = html;
    syncAction();
    syncSuggest();
  }

  /** 頁面的主送出鈕（置底區的主按鈕或表單的 submit 鈕） */
  function submitBtn() {
    if (!active) return null;
    var form = active.form || active.closest("form");
    var btn = form ? (form.querySelector('[type="submit"]') || (form.id && document.querySelector('[form="' + form.id + '"]'))) : null;
    return btn || null;
  }

  /** 右下鍵何時變「送出」：目前輸入框有字，且主送出鈕不在處理中、倒數中（停用） */
  function canSubmit() {
    var btn = submitBtn();
    var typed = !!(active && String(active.value || "").trim());
    return !!(typed && btn && !btn.disabled && !btn.classList.contains("is-loading"));
  }

  function syncAction() {
    var k = kb.querySelector('[data-key="done"], [data-key="submit"]');
    if (!k) {
      // 數字鍵盤沒有完成鍵：維持數字鍵盤的系統長相
      return;
    }
    var go = canSubmit();
    k.setAttribute("data-key", go ? "submit" : "done");
    k.textContent = go ? "送出" : "完成";
    k.classList.toggle("kb__key--go", go);
  }

  function syncSuggest() {
    var bar = kb.querySelector(".kb__suggest");
    var box = active && active.closest("[data-wf-otp-suggest]");
    if (box) {
      var code = box.getAttribute("data-wf-otp-suggest");
      bar.innerHTML = '<button type="button" tabindex="-1" class="kb__chip" data-key="suggest" data-code="' + code + '"><b>' + code + "</b><span>從訊息</span></button>";
    } else {
      bar.innerHTML = "";
    }
  }

  /** 依焦點位置決定讓位方式 */
  function placeFor(el) {
    if (el.closest(".sheet-layer")) return "sheet";
    if (el.closest(".alert-layer")) return "alert";
    return "page";
  }

  function show(el) {
    window.clearTimeout(hideTimer);
    active = el;
    var m = modeFor(el);
    if (m !== mode) {
      mode = m;
      shifted = false;
      render();
    } else {
      syncAction();
      syncSuggest();
    }
    kb.hidden = false;
    scr.style.setProperty("--kb-h", kb.offsetHeight + "px");
    scr.classList.remove("is-kb-page", "is-kb-sheet", "is-kb-alert");
    scr.classList.add("is-kb-open", "is-kb-" + placeFor(el));
    void kb.offsetHeight;
    kb.classList.add("is-open");
    // 等讓位動態結束再把欄位捲進可見範圍（只捲可捲動區，不整頁位移）
    window.setTimeout(function () {
      if (active === el && el.scrollIntoView && placeFor(el) === "page") el.scrollIntoView({ block: "nearest" });
    }, 260);
  }

  function hide() {
    active = null;
    kb.classList.remove("is-open");
    scr.classList.remove("is-kb-open", "is-kb-page", "is-kb-sheet", "is-kb-alert");
    hideTimer = window.setTimeout(function () { if (!active) kb.hidden = true; }, 260);
  }

  function insert(text) {
    if (!active) return;
    var el = active;
    if (el.maxLength > 0 && el.value.length >= el.maxLength && el.selectionStart === el.selectionEnd) {
      // 驗證碼格子：滿了就交給 input 事件跳下一格
      if (!el.closest(".code-cells")) return;
      el.value = "";
    }
    var start = el.selectionStart == null ? el.value.length : el.selectionStart;
    var end = el.selectionEnd == null ? el.value.length : el.selectionEnd;
    try {
      el.setRangeText(text, start, end, "end");
    } catch (err) {
      el.value += text; // type="email"／"number" 不支援選取範圍
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function backspace() {
    if (!active) return;
    var el = active;
    if (!el.value) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      return;
    }
    var start = el.selectionStart == null ? el.value.length : el.selectionStart;
    var end = el.selectionEnd == null ? el.value.length : el.selectionEnd;
    try {
      if (start === end) start = Math.max(0, start - 1);
      el.setRangeText("", start, end, "end");
    } catch (err) {
      el.value = el.value.slice(0, -1);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function onKey(k, btn) {
    if (k === "noop") return;
    if (k === "shift") {
      shifted = !shifted;
      render();
      return;
    }
    if (k === "backspace") return backspace();
    if (k === "done") {
      if (active) active.blur();
      return;
    }
    if (k === "submit") {
      var s = submitBtn();
      if (active) active.blur();
      if (s) s.click();
      return;
    }
    if (k === "suggest") {
      var box = active && active.closest(".code-cells");
      var code = btn.getAttribute("data-code");
      if (box && box._wfOtp) box._wfOtp.fill(code);
      else insert(code);
      return;
    }
    insert(k);
    if (shifted) {
      shifted = false;
      render();
    }
    syncAction();
  }

  function boot() {
    scr = document.querySelector(".scr");
    if (!scr || scr.querySelector(".kb")) return;
    kb = document.createElement("div");
    kb.className = "kb";
    kb.hidden = true;
    kb.setAttribute("aria-hidden", "true");
    kb.innerHTML = '<div class="kb__suggest"></div><div class="kb__body"></div>';
    scr.appendChild(kb);

    // 點鍵盤不搶走輸入框的焦點
    kb.addEventListener("mousedown", function (e) { e.preventDefault(); });
    kb.addEventListener("click", function (e) {
      var b = e.target.closest("[data-key]");
      if (b) onKey(b.getAttribute("data-key"), b);
    });
    document.addEventListener("focusin", function (e) {
      if (isTypingField(e.target) && scr.contains(e.target)) show(e.target);
    });
    document.addEventListener("focusout", function () {
      window.setTimeout(function () {
        var now = document.activeElement;
        if (!isTypingField(now) || !scr.contains(now)) hide();
      }, 0);
    });
    document.addEventListener("input", function () { if (active) syncAction(); });
    // 點輸入框以外的空白處收鍵盤（點按鈕會照常觸發按鈕，焦點離開後自然收下）
    scr.addEventListener("mousedown", function (e) {
      if (!active || kb.contains(e.target) || isTypingField(e.target)) return;
      if (!e.target.closest("button, a, label, [data-wf-keep-kb]")) active.blur();
    });
    var auto = scr.querySelector("[autofocus]");
    if (auto) window.setTimeout(function () { auto.focus(); }, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  return {
    isOpen: function () { return !!active; },
    hide: function () { if (active) active.blur(); },
  };
})();

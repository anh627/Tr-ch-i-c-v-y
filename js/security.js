// security.js – các helper an toàn

(function () {
  const Security = {
    escapeHTML(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },
    setText(el, s) {
      if (!el) return;
      el.textContent = s ?? "";
    },
    setHTMLSafe(el, html) {
      // Cho phép <b>, <i>, <strong>, <em>, <br> tối thiểu
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      const allowed = new Set(["B", "I", "STRONG", "EM", "BR"]);
      tmp.querySelectorAll("*").forEach(node => {
        if (!allowed.has(node.tagName)) {
          node.replaceWith(document.createTextNode(node.textContent));
        }
      });
      el.innerHTML = tmp.innerHTML;
    },
    safeLocalGet(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch { return fallback; }
    },
    safeLocalSet(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    },
    clampNumber(n, min, max) {
      const x = Number(n);
      if (Number.isNaN(x)) return min;
      return Math.max(min, Math.min(max, x));
    }
  };
  window.Security = Security;

  // Giới hạn dán HTML nguy hiểm
  document.addEventListener("paste", (e) => {
    const t = e.target;
    if (t && (t.tagName === "DIV" || t.tagName === "SPAN") && t.isContentEditable) {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      document.execCommand("insertText", false, text);
    }
  });

  // Cấm kéo thả file lạ vào trang
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (!(e.target && (e.target.id === "sgfText" || e.target.id === "sgfFile"))) {
      e.preventDefault();
    }
  });
})();
// security.js
function sanitizeInput(input) {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

function validateKomi(value) {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0 ? num : 6.5;
}

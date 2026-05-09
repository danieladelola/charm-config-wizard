/* TradesHorizons Live Chat — embed loader
 * Usage:
 *   <script src="https://chat.tradeshorizons.vip/chat-widget.js"
 *           data-widget-key="YOUR_PUBLIC_KEY"></script>
 */
(function () {
  if (window.__TH_CHAT_LOADED__) return;
  window.__TH_CHAT_LOADED__ = true;

  var script = document.currentScript || (function () {
    var ss = document.getElementsByTagName("script");
    return ss[ss.length - 1];
  })();
  var key = script.getAttribute("data-widget-key");
  if (!key) {
    console.warn("[TH chat] missing data-widget-key");
    return;
  }
  var BASE = (script.getAttribute("data-base-url") || "https://chat.tradeshorizons.vip").replace(/\/$/, "");
  var color = script.getAttribute("data-color") || "#1e90ff";
  var btnText = script.getAttribute("data-button-text") || "Support";
  var logoUrl = script.getAttribute("data-logo-url") || (BASE + "/tz-logo.png");
  var gradient = "linear-gradient(135deg,#7c3aed 0%," + color + " 100%)";

  var domain = location.hostname;
  var page = location.href;

  // ---------- styles ----------
  var css =
    "#th-chat-root{position:fixed;right:20px;bottom:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
    "#th-chat-button{position:relative;display:flex;align-items:center;gap:10px;background:" + gradient + ";color:#fff;border:none;border-radius:9999px;padding:8px 18px 8px 8px;box-shadow:0 8px 28px rgba(124,58,237,.35),0 2px 8px rgba(30,144,255,.25);cursor:pointer;font-size:14px;font-weight:600;transition:transform .15s,box-shadow .15s}" +
    "#th-chat-button:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(124,58,237,.45),0 4px 12px rgba(30,144,255,.35)}" +
    "#th-chat-button .th-avatar{width:36px;height:36px;border-radius:9999px;background:#000;object-fit:cover;display:block}" +
    "#th-chat-button .th-dot{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:9999px;min-width:18px;height:18px;font-size:11px;display:none;align-items:center;justify-content:center;padding:0 5px}" +
    "#th-chat-frame-wrap{position:fixed;right:20px;bottom:20px;width:380px;height:600px;max-width:calc(100vw - 24px);max-height:calc(100vh - 40px);border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.25);background:#fff;display:none}" +
    "#th-chat-frame{width:100%;height:100%;border:0;display:block}" +
    "@media(max-width:480px){#th-chat-frame-wrap{right:0;bottom:0;width:100vw;height:100vh;max-width:100vw;max-height:100vh;border-radius:0}}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- DOM ----------
  var root = document.createElement("div");
  root.id = "th-chat-root";
  root.innerHTML =
    '<div id="th-chat-frame-wrap"><iframe id="th-chat-frame" allow="clipboard-write" title="Live chat"></iframe></div>' +
    '<button id="th-chat-button" type="button" aria-label="Open chat">' +
    '<img class="th-avatar" src="' + logoUrl + '" alt="" />' +
    '<span>' + btnText + '</span>' +
    '<span class="th-dot" id="th-chat-unread">1</span>' +
    "</button>";

  function ensureBody(cb) {
    if (document.body) cb();
    else document.addEventListener("DOMContentLoaded", cb);
  }
  ensureBody(function () { document.body.appendChild(root); });

  var open = false;
  var loaded = false;
  var unread = 0;

  function btn() { return document.getElementById("th-chat-button"); }
  function wrap() { return document.getElementById("th-chat-frame-wrap"); }
  function dot() { return document.getElementById("th-chat-unread"); }
  function frame() { return document.getElementById("th-chat-frame"); }

  function setOpen(v) {
    open = v;
    var w = wrap(); var b = btn();
    if (!w || !b) return;
    if (v) {
      if (!loaded) {
        var url = BASE + "/widget?key=" + encodeURIComponent(key)
          + "&domain=" + encodeURIComponent(domain)
          + "&page=" + encodeURIComponent(page);
        frame().src = url;
        loaded = true;
      }
      w.style.display = "block";
      b.style.display = "none";
      unread = 0;
      dot().style.display = "none";
    } else {
      w.style.display = "none";
      b.style.display = "flex";
    }
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    while (t && t !== document) {
      if (t.id === "th-chat-button") { setOpen(true); return; }
      t = t.parentNode;
    }
  });

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || !d.__thChat) return;
    if (d.type === "close") setOpen(false);
    if (d.type === "unread" && !open) {
      unread += (d.count || 1);
      var el = dot();
      if (el) { el.textContent = String(unread); el.style.display = "flex"; }
    }
  });

  // expose tiny API
  window.THChat = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
  };
})();

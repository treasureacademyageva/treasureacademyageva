/* Privacy-first journey diagnostics.
   Stores only coarse action categories in this browser session. It never stores
   names, form values, raw search text, phone numbers or persistent visitor IDs. */
(function () {
  "use strict";
  var KEY = "taa_safe_journey_v1";
  var MAX_EVENTS = 16;
  var allowedTypes = ["page","navigate","search","search_refine","search_result","resource_error","script_error"];

  function clean(value, fallback) {
    var text = String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    return text || fallback || "other";
  }
  function read() {
    try {
      var value = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      return Array.isArray(value) ? value.slice(-MAX_EVENTS) : [];
    } catch (error) { return []; }
  }
  function save(events) {
    try { sessionStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS))); } catch (error) {}
  }
  function pathGroup(pathname) {
    var path = String(pathname || location.pathname).toLowerCase();
    if (/\/(?:index\.html)?$/.test(path)) return "home";
    if (path.indexOf("admission") >= 0 || path.indexOf("welcome") >= 0) return "admissions";
    if (path.indexOf("class") >= 0 || path.indexOf("academic") >= 0 || path.indexOf("learning") >= 0) return "learning";
    if (path.indexOf("fee") >= 0 || path.indexOf("uniform") >= 0 || path.indexOf("transport") >= 0 || path.indexOf("shop") >= 0) return "family_essentials";
    if (path.indexOf("search") >= 0) return "search";
    if (path.indexOf("contact") >= 0 || path.indexOf("safeguard") >= 0 || path.indexOf("website-help") >= 0) return "help";
    if (path.indexOf("news") >= 0 || path.indexOf("calendar") >= 0) return "news_dates";
    if (path.indexOf("about") >= 0 || path.indexOf("story") >= 0) return "our_school";
    return "other";
  }
  function resultBucket(count) {
    count = Number(count || 0);
    if (count <= 0) return "zero";
    if (count === 1) return "one";
    if (count <= 5) return "few";
    return "many";
  }
  function record(type, data) {
    if (allowedTypes.indexOf(type) < 0) return;
    data = data || {};
    var event = {t:type, p:pathGroup(), at:Math.round((Date.now() - performance.timeOrigin) / 1000)};
    if (type === "navigate") event.to = clean(data.to, "other");
    if (type === "search" || type === "search_refine") {
      event.family = clean(data.family, "other");
      event.results = resultBucket(data.resultCount);
      event.answer = data.hasAnswer ? "yes" : "no";
    }
    if (type === "search_result") event.family = clean(data.family, "other");
    if (type === "resource_error") event.kind = clean(data.kind, "asset");
    var events = read();
    var last = events[events.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(event)) return;
    events.push(event); save(events);
  }
  function viewportBucket() {
    var width = Math.round(window.innerWidth || 0);
    return width < 360 ? "under_360" : width < 600 ? "phone" : width < 960 ? "tablet" : "desktop";
  }
  function browserFamily() {
    var ua = navigator.userAgent || "";
    if (/Edg\//.test(ua)) return "edge";
    if (/Firefox\//.test(ua)) return "firefox";
    if (/CriOS|Chrome\//.test(ua)) return "chrome";
    if (/Safari\//.test(ua)) return "safari";
    return "other";
  }
  function snapshot() {
    return {
      v:1,
      page:pathGroup(),
      path:String(location.pathname || "/").replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 120),
      viewport:viewportBucket(),
      browser:browserFamily(),
      theme:document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      online:navigator.onLine === false ? "no" : "yes",
      events:read().slice(-10)
    };
  }
  function encode(report) {
    try {
      var bytes = new TextEncoder().encode(JSON.stringify(report || snapshot()));
      var binary = "";
      bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
      return "TAUX1-" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    } catch (error) { return "TAUX1-unavailable"; }
  }
  function decode(code) {
    var value = String(code || "").match(/TAUX1-[A-Za-z0-9_-]+/);
    if (!value) throw new Error("No TAUX1 diagnostic code found.");
    var base = value[0].slice(6).replace(/-/g, "+").replace(/_/g, "/");
    while (base.length % 4) base += "=";
    var binary = atob(base), bytes = Uint8Array.from(binary, function (ch) { return ch.charCodeAt(0); });
    var report = JSON.parse(new TextDecoder().decode(bytes));
    if (!report || report.v !== 1 || !Array.isArray(report.events)) throw new Error("Unsupported diagnostic code.");
    return report;
  }
  function insightChoice(link) {
    var href = String(link.getAttribute("href") || "").toLowerCase();
    if (href.indexOf("admission") >= 0) return "admissions";
    if (href.indexOf("fee") >= 0) return "fees";
    if (href.indexOf("class") >= 0 || href.indexOf("academic") >= 0) return "classes";
    if (href.indexOf("search") >= 0) return "search";
    if (href.indexOf("contact") >= 0 || href.indexOf("wa.me") >= 0 || href.indexOf("tel:") === 0) return "contact";
    if (href.indexOf("website-help") >= 0) return "website_help";
    if (href.indexOf("news") >= 0 || href.indexOf("calendar") >= 0) return "news_dates";
    if (/^https?:/.test(href)) return "external";
    return pathGroup(href);
  }
  function privateSearchForms() {
    document.querySelectorAll("form[data-private-search]").forEach(function (form) {
      form.addEventListener("submit", function (event) {
        var field = form.querySelector('input[type="search"]');
        if (!field || !String(field.value || "").trim()) return;
        event.preventDefault();
        try { sessionStorage.setItem("taa_pending_search", String(field.value).trim().slice(0, 240)); } catch (error) {}
        location.assign("/search.html");
      });
    });
  }
  function canMeasure() {
    return navigator.doNotTrack !== "1" && navigator.globalPrivacyControl !== true && /(^|\.)treasureacademyageva\.com$|\.vercel\.app$/.test(location.hostname);
  }
  function loadRemoteScript(src, marker) {
    if (document.querySelector("script[" + marker + "]")) return;
    var script = document.createElement("script");
    script.defer = true; script.src = src; script.setAttribute(marker, "1");
    document.head.appendChild(script);
  }
  var WEB_ANALYTICS_ENABLED = false;
  function enableAnonymousInsights() {
    if (!canMeasure()) return;
    /* Speed Insights is enabled for this Vercel project. It records aggregate
       Web Vitals and broad route/device/browser classes, not form values. */
    loadRemoteScript("/_vercel/speed-insights/script.js", "data-ta-speed-insights");
    /* Web Analytics currently returns 404 and must not be requested on visitor
       pages. Set this reviewed flag only after the owner enables the service and
       the Developer Operations live check confirms that its script is available. */
    if (WEB_ANALYTICS_ENABLED) loadRemoteScript("/_vercel/insights/script.js", "data-ta-web-analytics");
  }

  window.TA_VISITOR_INSIGHTS = {record:record, snapshot:snapshot, encode:encode, decode:decode, pathGroup:pathGroup};
  document.addEventListener("DOMContentLoaded", function () {
    record("page");
    privateSearchForms();
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest("a[href]");
      if (link) record("navigate", {to:insightChoice(link)});
    });
    enableAnonymousInsights();
  });
  window.addEventListener("error", function (event) {
    if (event.target && event.target !== window && event.target.tagName) record("resource_error", {kind:String(event.target.tagName).toLowerCase()});
    else record("script_error");
  }, true);
  window.addEventListener("unhandledrejection", function () { record("script_error"); });
})();

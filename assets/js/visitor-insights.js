/* Privacy-first journey diagnostics v2.
   Only allowlisted categories are kept in this tab session. Never read or store
   names, contact details, form values, raw search text, payment data or IDs. */
(function () {
  "use strict";
  var KEY = "taa_safe_journey_v2";
  var MAX_EVENTS = 24;
  var WEB_ANALYTICS_ENABLED = false;
  var allowedTypes = [
    "page","navigate","cta","search","search_refine","search_result",
    "form_start","form_complete","form_abandon","resource_error","script_error"
  ];

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
    if (path.indexOf("admission") >= 0 || path.indexOf("welcome") >= 0 || path.indexOf("openday") >= 0) return "admissions";
    if (path.indexOf("class") >= 0 || path.indexOf("academic") >= 0 || path.indexOf("learning") >= 0 || path.indexOf("elearning") >= 0) return "learning";
    if (path.indexOf("fee") >= 0 || path.indexOf("uniform") >= 0 || path.indexOf("transport") >= 0 || path.indexOf("shop") >= 0) return "family_essentials";
    if (path.indexOf("search") >= 0 || path.indexOf("explore") >= 0) return "find_information";
    if (path.indexOf("contact") >= 0 || path.indexOf("safeguard") >= 0 || path.indexOf("website-help") >= 0) return "help";
    if (path.indexOf("news") >= 0 || path.indexOf("calendar") >= 0) return "news_dates";
    if (path.indexOf("about") >= 0 || path.indexOf("story") >= 0 || path.indexOf("anthem") >= 0) return "our_school";
    if (path.indexOf("portal") >= 0) return "parent_support";
    return "other";
  }
  function resultBucket(count) {
    count = Number(count || 0);
    if (count <= 0) return "zero";
    if (count === 1) return "one";
    if (count <= 5) return "few";
    return "many";
  }
  function stageFor(group) {
    if (group === "home" || group === "our_school" || group === "news_dates") return "discover";
    if (group === "find_information" || group === "learning" || group === "family_essentials") return "explore";
    if (group === "admissions") return "decide";
    if (group === "help" || group === "parent_support") return "handoff";
    return "explore";
  }
  function record(type, data) {
    if (allowedTypes.indexOf(type) < 0) return;
    data = data || {};
    var group = pathGroup();
    var event = {
      t:type,
      p:group,
      stage:clean(data.stage, stageFor(group)),
      at:Math.max(0, Math.round((Date.now() - performance.timeOrigin) / 5000) * 5)
    };
    if (type === "navigate" || type === "cta") {
      event.to = clean(data.to, "other");
      event.channel = clean(data.channel, "content");
      if (type === "cta") event.goal = clean(data.goal, "general");
    }
    if (type === "search" || type === "search_refine") {
      event.family = clean(data.family, "other");
      event.results = resultBucket(data.resultCount);
      event.answer = data.hasAnswer ? "yes" : "no";
    }
    if (type === "search_result") event.family = clean(data.family, "other");
    if (type.indexOf("form_") === 0) event.form = clean(data.form, "other");
    if (type === "resource_error") event.kind = clean(data.kind, "asset");
    var events = read();
    var comparable = JSON.stringify(Object.assign({}, event, {at:0}));
    var last = events[events.length - 1];
    if (last && JSON.stringify(Object.assign({}, last, {at:0})) === comparable) return;
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
  function acquisitionChannel() {
    if (!document.referrer) return "direct";
    try {
      var ref = new URL(document.referrer);
      if (ref.origin === location.origin) return "internal";
      if (/google\.|bing\.|duckduckgo\.|yahoo\./i.test(ref.hostname)) return "search_engine";
      if (/facebook\.|instagram\.|youtube\.|tiktok\.|twitter\.|x\.com$/i.test(ref.hostname)) return "social";
      return "external";
    } catch (error) { return "unknown"; }
  }
  function safePageId() {
    var path = String(location.pathname || "/").toLowerCase();
    if (/\/classes\//.test(path)) return "class_detail";
    if (/\/news\//.test(path)) return "news_detail";
    if (/\/portal\//.test(path)) return "parent_help";
    var name = (path.split("/").pop() || "index").replace(/\.html$/, "") || "index";
    var allowed = "|index|about|academics|admissions|admission-form|fees|contact|news|calendar|uniform|transport|shop|homework|exams|elearning|search|explore|website-help|safeguarding|privacy|welcome|reading|careers|openday|photo-day|holiday|lost-found|support|volunteer|pta|board|alumni|anthem|birthdays|class|story|poster|receipt|testimonials|404|";
    return allowed.indexOf("|" + name + "|") >= 0 ? clean(name, "other") : "other";
  }
  function snapshot() {
    return {
      v:2,
      page:pathGroup(),
      path:safePageId(),
      viewport:viewportBucket(),
      browser:browserFamily(),
      acquisition:acquisitionChannel(),
      theme:document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      online:navigator.onLine === false ? "no" : "yes",
      events:read().slice(-16)
    };
  }
  function encode(report) {
    try {
      var safe = report || snapshot();
      var bytes = new TextEncoder().encode(JSON.stringify(safe));
      var binary = "";
      bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
      return "TAUX" + (safe.v === 1 ? "1" : "2") + "-" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    } catch (error) { return "TAUX2-unavailable"; }
  }
  function decode(code) {
    var value = String(code || "").match(/TAUX([12])-[A-Za-z0-9_-]+/);
    if (!value) throw new Error("No supported TAUX diagnostic code found.");
    var base = value[0].slice(6).replace(/-/g, "+").replace(/_/g, "/");
    while (base.length % 4) base += "=";
    var binary = atob(base), bytes = Uint8Array.from(binary, function (ch) { return ch.charCodeAt(0); });
    var report = JSON.parse(new TextDecoder().decode(bytes));
    if (!report || [1,2].indexOf(report.v) < 0 || !Array.isArray(report.events)) throw new Error("Unsupported diagnostic code.");
    return report;
  }
  function targetGroup(link) {
    var href = String(link.getAttribute("href") || "").toLowerCase().split("?", 1)[0];
    if (href.indexOf("admission") >= 0) return "admissions";
    if (href.indexOf("fee") >= 0) return "family_essentials";
    if (href.indexOf("class") >= 0 || href.indexOf("academic") >= 0) return "learning";
    if (href.indexOf("search") >= 0 || href.indexOf("explore") >= 0) return "find_information";
    if (href.indexOf("contact") >= 0 || href.indexOf("wa.me") >= 0 || href.indexOf("tel:") === 0 || href.indexOf("maps") >= 0) return "help";
    if (href.indexOf("website-help") >= 0) return "website_help";
    if (href.indexOf("news") >= 0 || href.indexOf("calendar") >= 0) return "news_dates";
    if (href.indexOf("portal") >= 0) return "parent_support";
    if (/^https?:/.test(href)) return "external";
    return pathGroup(href);
  }
  function linkChannel(link) {
    if (link.closest(".mobile-dock")) return "mobile_dock";
    if (link.closest("footer")) return "footer";
    if (link.closest("nav")) return "navigation";
    if (link.closest(".route-actions")) return "route_action";
    return "content";
  }
  function goalFor(group) {
    return ({admissions:"apply",help:"contact",website_help:"report_problem",parent_support:"get_support",find_information:"find_information",family_essentials:"plan_costs"})[group] || "learn";
  }
  function privateSearchForms() {
    document.querySelectorAll("form[data-private-search]").forEach(function (form) {
      form.addEventListener("submit", function (event) {
        var field = form.querySelector('input[type="search"]');
        if (!field || !String(field.value || "").trim()) return;
        event.preventDefault();
        try { sessionStorage.setItem("taa_pending_search", String(field.value).trim().slice(0, 240)); } catch (error) {}
        location.assign("/search");
      });
    });
  }
  function formCategory(form) {
    var id = String(form.id || "").toLowerCase();
    if (id.indexOf("contact") >= 0) return "contact";
    if (id.indexOf("problem") >= 0) return "website_help";
    if (id.indexOf("feedback") >= 0) return "feedback";
    if (id.indexOf("practice") >= 0) return "practice";
    if (form.matches("[data-private-search], [role=search]")) return "search";
    return pathGroup();
  }
  var formStates = [];
  function instrumentForms() {
    var states = formStates;
    document.querySelectorAll("form").forEach(function (form) {
      var state = {form:form, category:formCategory(form), started:false, complete:false};
      states.push(state);
      function start(event) {
        if (state.started || !event.target.matches("input,select,textarea")) return;
        state.started = true;
        record("form_start", {form:state.category, stage:"act"});
      }
      form.addEventListener("focusin", start);
      form.addEventListener("input", start);
      form.addEventListener("change", start);
    });
    window.addEventListener("pagehide", function () {
      states.forEach(function (state) {
        if (state.started && !state.complete) record("form_abandon", {form:state.category, stage:"friction"});
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
  function enableAnonymousInsights() {
    if (!canMeasure()) return;
    loadRemoteScript("/_vercel/speed-insights/script.js", "data-ta-speed-insights");
    if (WEB_ANALYTICS_ENABLED) loadRemoteScript("/_vercel/insights/script.js", "data-ta-web-analytics");
  }

  window.TA_VISITOR_INSIGHTS = {record:record, snapshot:snapshot, encode:encode, decode:decode, pathGroup:pathGroup};
  // Register before later action scripts: some safe handoffs intentionally stop
  // submit propagation after this metrics-only completion marker runs.
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches("form")) return;
    var state = formStates.find(function (item) { return item.form === form; });
    if (state) state.complete = true;
    record("form_complete", {form:state ? state.category : formCategory(form), stage:"handoff"});
  }, true);
  document.addEventListener("DOMContentLoaded", function () {
    record("page");
    privateSearchForms();
    instrumentForms();
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest("a[href]");
      if (!link) return;
      var group = targetGroup(link), channel = linkChannel(link);
      var isCta = link.classList.contains("btn") || channel === "route_action" || group === "help" || group === "admissions";
      record(isCta ? "cta" : "navigate", {to:group, channel:channel, goal:goalFor(group), stage:isCta?"act":"explore"});
    });
    enableAnonymousInsights();
  });
  window.addEventListener("error", function (event) {
    if (event.target && event.target !== window && event.target.tagName) record("resource_error", {kind:String(event.target.tagName).toLowerCase()});
    else record("script_error");
  }, true);
  window.addEventListener("unhandledrejection", function () { record("script_error"); });
})();

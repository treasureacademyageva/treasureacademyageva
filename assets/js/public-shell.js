/* Treasure Academy public shell — intentionally small, dependency-free and private-by-design. */
(function () {
  "use strict";

  var SCHOOL = {
    name: "Treasure Academy, Ageva",
    phone: "+234 814 194 3478",
    email: "treasuregroupofschool@gmail.com",
    address: "Opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State",
    motto: "Our God is able"
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  }
  function toast(message) {
    var box = document.getElementById("toast");
    if (!box) {
      box = document.createElement("div");
      box.id = "toast";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { box.classList.remove("show"); }, 2800);
  }

  /* Preserve the tiny helper surface used by the admissions, contact and home pages. */
  window.U = window.U || {};
  if (!window.U.esc) window.U.esc = escapeHtml;
  if (!window.U.toast) window.U.toast = toast;
  if (!window.U.todayStr) window.U.todayStr = function () { return new Date().toISOString().slice(0, 10); };
  if (!window.U.shortDate) window.U.shortDate = function (value) {
    if (!value) return "";
    try { return new Intl.DateTimeFormat("en-NG", {day:"numeric", month:"short", year:"numeric"}).format(new Date(value + "T12:00:00")); }
    catch (error) { return value; }
  };

  function injectSchool() {
    document.querySelectorAll("[data-school-name]").forEach(function (node) { node.textContent = SCHOOL.name; });
    document.querySelectorAll("[data-school-phone]").forEach(function (node) {
      node.textContent = SCHOOL.phone;
      if (node.tagName === "A") node.href = "tel:+2348141943478";
    });
    document.querySelectorAll("[data-school-email]").forEach(function (node) {
      node.textContent = SCHOOL.email;
      if (node.tagName === "A") node.href = "mailto:" + SCHOOL.email;
    });
    document.querySelectorAll("[data-school-address]").forEach(function (node) { node.textContent = SCHOOL.address; });
    document.querySelectorAll("[data-school-motto]").forEach(function (node) { node.textContent = SCHOOL.motto; });
  }

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem("treasure_theme"); } catch (error) {}
    var dark = false;
    try { dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (error) {}
    var current = stored || (dark ? "dark" : "light");
    document.documentElement.dataset.theme = current;
    document.querySelectorAll(".theme-btn").forEach(function (button) {
      function paint() {
        var isDark = document.documentElement.dataset.theme === "dark";
        button.setAttribute("aria-label", isDark ? "Switch to daytime" : "Switch to night mode");
        button.title = button.getAttribute("aria-label");
        button.innerHTML = isDark
          ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>'
          : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>';
      }
      paint();
      button.addEventListener("click", function () {
        var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("treasure_theme", next); } catch (error) {}
        paint();
      });
    });
  }

  function initReveal() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(".clip,.clip-up"));
    if (!nodes.length) return;
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (error) {}
    if (reduce || !("IntersectionObserver" in window)) {
      nodes.forEach(function (node) { node.classList.add("revealed"); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      });
    }, {rootMargin:"0px 0px -6%", threshold:.04});
    nodes.forEach(function (node) { observer.observe(node); });
  }

  function enhanceFaqs() {
    document.querySelectorAll(".faq-q").forEach(function (button) {
      if (button.dataset.accessible === "1") return;
      button.dataset.accessible = "1";
      button.setAttribute("aria-expanded", button.closest(".faq-item") && button.closest(".faq-item").classList.contains("open") ? "true" : "false");
      button.addEventListener("click", function () {
        setTimeout(function () {
          var item = button.closest(".faq-item");
          button.setAttribute("aria-expanded", item && item.classList.contains("open") ? "true" : "false");
        }, 0);
      });
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  }

  function markCurrentDockItem() {
    var path = location.pathname.toLowerCase();
    var key = "explore";
    if (/\/(?:index\.html)?$/.test(path)) key = "home";
    else if (path.indexOf("admission") >= 0) key = "admissions";
    else if (path.indexOf("search") >= 0) key = "search";
    else if (path.indexOf("contact") >= 0) key = "contact";
    document.querySelectorAll(".mobile-dock a[data-dock]").forEach(function (link) {
      if (link.dataset.dock === key) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    injectSchool();
    initTheme();
    initReveal();
    enhanceFaqs();
    markCurrentDockItem();
    registerServiceWorker();
  });
})();

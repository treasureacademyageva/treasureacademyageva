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

  function initSkipLinks() {
    document.querySelectorAll('a.skip-link[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function () {
        var target = document.getElementById(link.getAttribute("href").slice(1));
        if (!target) return;
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        setTimeout(function () { target.focus(); }, 0);
      });
    });
  }

  function initPageOutline() {
    var main = document.querySelector("main#main");
    if (!main || /\/$/.test(location.pathname) || /\/(?:index|search|explore|404|website-help)\.html$/.test(location.pathname)) return;
    var headings = Array.prototype.slice.call(main.querySelectorAll("h2")).filter(function (heading) {
      return heading.textContent.trim().length > 2 && !heading.closest(".page-outline") && !heading.closest("[hidden]");
    });
    var unique = [];
    headings.forEach(function (heading) {
      var label = heading.textContent.replace(/\s+/g, " ").trim();
      if (unique.some(function (item) { return item.label === label; }) || unique.length >= 7) return;
      if (!heading.id) heading.id = "section-" + (unique.length + 1);
      unique.push({id:heading.id,label:label});
    });
    if (unique.length < 3) return;
    var wrap = document.createElement("div");
    wrap.className = "page-outline-wrap container";
    wrap.innerHTML = '<details class="page-outline"><summary>On this page</summary><nav aria-label="On this page">' + unique.map(function (item) {
      return '<a href="#' + escapeHtml(item.id) + '">' + escapeHtml(item.label) + '</a>';
    }).join("") + '</nav></details>';
    main.insertBefore(wrap, main.firstChild);
    try { if (window.matchMedia("(min-width: 960px)").matches) wrap.firstElementChild.open = true; } catch (error) {}
  }

  function initAccessibleForms() {
    var fieldCount = 0;
    document.querySelectorAll("form").forEach(function (form) {
      var firstInvalid = null;
      function errorText(control) {
        if (control.validity.valueMissing) return "Complete this required field.";
        if (control.validity.typeMismatch && control.type === "email") return "Enter an email address in the format name@example.com.";
        if (control.validity.tooLong) return "Shorten this answer to " + control.maxLength + " characters or fewer.";
        if (control.validity.patternMismatch) return control.title || "Use the requested format.";
        return "Check this field and try again.";
      }
      function clearError(control) {
        control.removeAttribute("aria-invalid");
        var id = control.id ? control.id + "-error" : "";
        var error = id && document.getElementById(id);
        if (error) error.remove();
        if (id) {
          var described = String(control.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (value) { return value && value !== id; });
          if (described.length) control.setAttribute("aria-describedby", described.join(" "));
          else control.removeAttribute("aria-describedby");
        }
      }
      form.addEventListener("invalid", function (event) {
        var control = event.target;
        if (!control.matches("input,select,textarea")) return;
        event.preventDefault();
        if (!control.id) { fieldCount += 1; control.id = "field-auto-" + fieldCount; }
        clearError(control);
        var id = control.id + "-error";
        var error = document.createElement("p");
        error.id = id; error.className = "field-error"; error.setAttribute("role", "alert");
        error.textContent = errorText(control);
        control.setAttribute("aria-invalid", "true");
        var described = String(control.getAttribute("aria-describedby") || "").trim();
        control.setAttribute("aria-describedby", (described ? described + " " : "") + id);
        control.insertAdjacentElement("afterend", error);
        if (!firstInvalid) {
          firstInvalid = control;
          setTimeout(function () { firstInvalid.focus(); firstInvalid.scrollIntoView({block:"center", behavior:"smooth"}); firstInvalid = null; }, 0);
        }
      }, true);
      form.addEventListener("input", function (event) {
        if (event.target.matches("input,select,textarea") && event.target.validity.valid) clearError(event.target);
      });
      form.addEventListener("change", function (event) {
        if (event.target.matches("input,select,textarea") && event.target.validity.valid) clearError(event.target);
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
    initSkipLinks();
    initAccessibleForms();
    initPageOutline();
    markCurrentDockItem();
    registerServiceWorker();
  });
})();

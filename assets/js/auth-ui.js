/* ===========================================================================
   Treasure Academy — auth dialog + navigation drawer

   Two pieces of UI:

   1. A glass login/register dialog that opens over the landing page. The page
      behind stays visible but is blurred, so the panel can be very transparent
      without its words colliding with the page's words.

   2. A slide-out drawer holding every link on the site, opened from a button
      beside Login/Register in the top bar.

   Registration handles the household case: one parent, several children, one
   account. If a phone number is already on file the dialog asks whether this is
   another child. Yes continues and attaches the new pupil to the same account;
   no sends them to login, because they already have one.

   Nothing here writes a pupil record on its own - it calls into store.js so the
   admin portal remains the single source of truth.
   =========================================================================== */
(function () {
  "use strict";

  var ACCOUNTS_KEY = "treasure_parent_accounts_v1";

  /* ---------- small helpers ---------- */
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function phoneKey(v) {
    var d = String(v || "").replace(/\D/g, "");
    if (d.length > 10) d = d.slice(-10);
    return d;
  }
  function toast(msg) {
    if (window.U && U.toast) { U.toast(msg); return; }
    alert(msg);
  }
  function base() {
    /* portal/ pages sit one level down. */
    return /\/portal\//.test(location.pathname) ? "../" : "";
  }

  /* ---------- parent accounts (household grouping) ----------
     A household is keyed by the parent's phone number(s). Several pupils hang
     off one household, which is what lets a parent manage more than one child
     from a single login. */
  var Accounts = {
    all: function () {
      try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || []; }
      catch (e) { return []; }
    },
    save: function (list) {
      try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); } catch (e) {}
    },
    /* Match on either phone the parent gave at any point. */
    find: function (phone) {
      var k = phoneKey(phone);
      if (!k) return null;
      return this.all().find(function (a) {
        return (a.phones || []).some(function (p) { return phoneKey(p) === k; });
      }) || null;
    },
    /* Create the household, or attach another child to the existing one. */
    upsert: function (rec) {
      var list = this.all();
      var acct = null;
      [rec.phone, rec.phone2].forEach(function (p) {
        if (!acct && p) acct = list.find(function (a) {
          return (a.phones || []).some(function (q) { return phoneKey(q) === phoneKey(p); });
        });
      });
      if (!acct) {
        acct = {
          id: "PA" + Date.now().toString(36).toUpperCase(),
          parent: rec.parent,
          phones: [],
          pupils: [],
          createdAt: new Date().toISOString()
        };
        list.push(acct);
      }
      [rec.phone, rec.phone2].forEach(function (p) {
        if (p && !acct.phones.some(function (q) { return phoneKey(q) === phoneKey(p); })) {
          acct.phones.push(p);
        }
      });
      acct.pupils.push({
        name: rec.pupil,
        cls: rec.cls,
        addedAt: new Date().toISOString()
      });
      this.save(list);
      return acct;
    }
  };

  /* ---------- the glass dialog ---------- */
  var scrim = null;
  var lastFocus = null;

  /* Keyboard focus must not escape an open dialog behind the blurred page.
     Ported from the parallel batch-45 implementation. */
  var FOCUS_SEL = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
  function trapFocus(container, ev) {
    if (ev.key !== "Tab") return;
    var f = [].slice.call(container.querySelectorAll(FOCUS_SEL))
              .filter(function (n) { return n.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  function close() {
    if (!scrim) return;
    scrim.classList.remove("in");
    var s = scrim; scrim = null;
    setTimeout(function () { if (s && s.parentNode) s.remove(); }, 340);
    document.documentElement.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function shell(inner) {
    close();
    lastFocus = document.activeElement;
    scrim = el("div", { class: "ta-scrim", id: "taAuth", role: "dialog",
                        "aria-modal": "true", "aria-label": "Login or register" });
    /* School crest at the top of the panel: it anchors the popup to the
       school rather than reading as a generic form. */
    var card = el("div", { class: "ta-glass" },
      '<img class="ta-crest" src="' + base() + 'assets/img/logo.jpg" alt="" '
      + 'width="54" height="54" loading="lazy">' + inner);
    scrim.appendChild(card);
    document.body.appendChild(scrim);
    document.documentElement.style.overflow = "hidden";

    /* click the backdrop, not the panel, to dismiss */
    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Tab" && scrim && scrim.parentNode) trapFocus(scrim, e);
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); }
    });

    requestAnimationFrame(function () { scrim.classList.add("in"); });
    var f = card.querySelector("input, button");
    if (f) setTimeout(function () { f.focus(); }, 120);
    return card;
  }

  function tabsHtml(active) {
    return '<div class="ta-tabs" role="tablist">' +
      '<button type="button" role="tab" data-tab="login" aria-selected="' + (active === "login") + '">Login</button>' +
      '<button type="button" role="tab" data-tab="register" aria-selected="' + (active === "register") + '">Register</button>' +
      "</div>";
  }

  function wireTabs(card) {
    card.querySelectorAll(".ta-tabs button").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.tab === "login") openLogin(); else openRegister();
      });
    });
    var x = card.querySelector(".ta-x");
    if (x) x.addEventListener("click", close);
  }

  /* ---------- login ---------- */
  function openLogin(prefill) {
    var card = shell(
      '<button class="ta-x" type="button" aria-label="Close">&times;</button>' +
      tabsHtml("login") +
      "<h2>Welcome back</h2>" +
      "<p>Enter the phone number or ID you registered with.</p>" +
      '<form id="taLoginForm" autocomplete="off" style="margin-top:16px">' +
        '<div class="fld"><label for="taLid">Phone number or ID</label>' +
          '<input id="taLid" name="id" inputmode="tel" required value="' + esc(prefill || "") + '" placeholder="0805 123 4567"></div>' +
        '<div class="fld"><label for="taLpw">Password / PIN</label>' +
          '<input id="taLpw" name="pw" type="password" required placeholder="Your password or PIN"></div>' +
        '<button class="ta-btn" type="submit">Login</button>' +
      "</form>" +
      '<p style="margin-top:14px;font-size:.88rem">No account yet? ' +
        '<a href="#" data-go="register" style="text-decoration:underline">Register a pupil</a></p>'
    );
    wireTabs(card);
    card.querySelector('[data-go="register"]').addEventListener("click", function (e) {
      e.preventDefault(); openRegister();
    });

    card.querySelector("#taLoginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var id = card.querySelector("#taLid").value.trim();
      var pw = card.querySelector("#taLpw").value;

      /* Defer to the real auth in store.js when it is present. */
      if (window.Auth && Auth.pupilLogin) {
        var r = Auth.pupilLogin(id, pw);
        if (r && r.ok) {
          Auth.set(r.session, true);
          toast("Welcome back, " + (r.session.name || "") + "!");
          setTimeout(function () { location.href = "/portal/pupil.html"; }, 500);
          return;
        }
        if (r && r.reason === "nopassword") {
          toast("No password set yet — continue on the portal page to create one.");
          setTimeout(function () { location.href = base() + "portal/login.html"; }, 900);
          return;
        }
        /* Staff use IDs and PINs rather than a pupil record. */
        var staff = (Auth.staffLogin && (Auth.staffLogin("admin", id, pw) || Auth.staffLogin("teacher", id, pw))) || null;
        if (staff) {
          Auth.set(staff, true);
          toast("Welcome, " + staff.name);
          setTimeout(function () {
            location.href = base() + "portal/" + (staff.role === "admin" ? "admin.html" : "teacher.html");
          }, 500);
          return;
        }
        toast("We could not match those details. Check the number and password.");
        return;
      }
      location.href = base() + "portal/login.html";
    });
  }

  /* ---------- register ---------- */
  function openRegister(prefill) {
    prefill = prefill || {};
    var card = shell(
      '<button class="ta-x" type="button" aria-label="Close">&times;</button>' +
      tabsHtml("register") +
      "<h2>Register a pupil</h2>" +
      "<p>One account can hold all your children. If you have registered before, " +
      "use the same phone number and we will add this child to your account.</p>" +
      '<form id="taRegForm" autocomplete="off" style="margin-top:16px">' +
        '<div class="fld"><label for="taRparent">Parent / guardian full name</label>' +
          '<input id="taRparent" required value="' + esc(prefill.parent || "") + '" placeholder="e.g. Mrs. Aisha Yusuf"></div>' +
        '<div class="fld"><label for="taRphone">Phone number</label>' +
          '<input id="taRphone" inputmode="tel" required value="' + esc(prefill.phone || "") + '" placeholder="0806 123 4567"></div>' +
        '<div class="fld"><label for="taRphone2">Second phone number <span style="opacity:.75;font-weight:400">(optional)</span></label>' +
          '<input id="taRphone2" inputmode="tel" value="' + esc(prefill.phone2 || "") + '" placeholder="Another number we can reach you on"></div>' +
        '<div class="fld"><label for="taRpupil">Pupil\'s full name</label>' +
          '<input id="taRpupil" required placeholder="Child being registered"></div>' +
        '<div class="fld"><label for="taRclass">Class applying for</label>' +
          '<select id="taRclass" required>' +
            "<option value=''>Select a class</option>" +
            ["Creche", "Pre-Nursery", "Nursery 1", "Nursery 2", "Primary 1", "Primary 2",
             "Primary 3", "Primary 4", "Primary 6"]
              .map(function (c) { return "<option>" + c + "</option>"; }).join("") +
          "</select></div>" +
        '<button class="ta-btn" type="submit">Continue</button>' +
      "</form>" +
      '<p style="margin-top:14px;font-size:.88rem">Already have an account? ' +
        '<a href="#" data-go="login" style="text-decoration:underline">Login instead</a></p>'
    );
    wireTabs(card);
    card.querySelector('[data-go="login"]').addEventListener("click", function (e) {
      e.preventDefault(); openLogin();
    });

    card.querySelector("#taRegForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var rec = {
        parent: card.querySelector("#taRparent").value.trim(),
        phone:  card.querySelector("#taRphone").value.trim(),
        phone2: card.querySelector("#taRphone2").value.trim(),
        pupil:  card.querySelector("#taRpupil").value.trim(),
        cls:    card.querySelector("#taRclass").value
      };
      if (!rec.parent || !rec.phone || !rec.pupil || !rec.cls) {
        toast("Please fill in every required field.");
        return;
      }
      /* Either number may already belong to a household. */
      var known = Accounts.find(rec.phone) || (rec.phone2 ? Accounts.find(rec.phone2) : null);
      if (known) { askAnotherChild(rec, known); return; }
      commitRegistration(rec, null);
    });
  }

  /* The "is this another child?" question, exactly as the owner described. */
  function askAnotherChild(rec, acct) {
    var names = (acct.pupils || []).map(function (p) { return p.name; }).filter(Boolean);
    var card = shell(
      '<button class="ta-x" type="button" aria-label="Close">&times;</button>' +
      "<h2>We know this number</h2>" +
      "<p><b>" + esc(rec.phone) + "</b> is already registered to " +
        "<b>" + esc(acct.parent || "an existing account") + "</b>" +
        (names.length
          ? ", which currently holds " + names.length + " pupil" + (names.length > 1 ? "s" : "") +
            ": " + esc(names.join(", ")) + "."
          : ".") +
      "</p>" +
      "<p style='margin-top:10px'>Are you registering <b>another child</b>?</p>" +
      '<div style="display:flex;gap:10px;margin-top:18px">' +
        '<button class="ta-btn" type="button" data-yes>Yes, another child</button>' +
        '<button class="ta-btn ghost" type="button" data-no>No</button>' +
      "</div>"
    );
    var x = card.querySelector(".ta-x");
    if (x) x.addEventListener("click", close);

    card.querySelector("[data-yes]").addEventListener("click", function () {
      commitRegistration(rec, acct);
    });
    card.querySelector("[data-no]").addEventListener("click", function () {
      var c = shell(
        '<button class="ta-x" type="button" aria-label="Close">&times;</button>' +
        "<h2>You already have an account</h2>" +
        "<p>Since this is not a new pupil, please log in instead. Your account " +
        "already manages " + (names.length || "your") + " pupil" +
        (names.length === 1 ? "" : "s") + ".</p>" +
        '<button class="ta-btn" type="button" data-login style="margin-top:18px">Go to login</button>'
      );
      c.querySelector(".ta-x").addEventListener("click", close);
      c.querySelector("[data-login]").addEventListener("click", function () {
        openLogin(rec.phone);
      });
    });
  }

  function commitRegistration(rec, existing) {
    var acct = Accounts.upsert(rec);

    /* Mirror into the school database so the admin portal sees the applicant. */
    try {
      if (window.DB && DB.load) {
        var db = DB.load();
        db.applications = db.applications || [];
        db.applications.push({
          id: "AP" + Date.now().toString(36).toUpperCase(),
          accountId: acct.id,
          parent: rec.parent,
          phone: rec.phone,
          phone2: rec.phone2 || "",
          pupil: rec.pupil,
          cls: rec.cls,
          status: "pending",
          date: new Date().toISOString()
        });
        DB.save(db);
      }
    } catch (err) { /* the account still exists locally */ }

    var total = (acct.pupils || []).length;
    var card = shell(
      '<button class="ta-x" type="button" aria-label="Close">&times;</button>' +
      "<h2>" + (existing ? "Child added" : "Registration received") + "</h2>" +
      "<p><b>" + esc(rec.pupil) + "</b> has been registered for <b>" + esc(rec.cls) + "</b>" +
      (existing ? " under your existing account." : ".") + "</p>" +
      "<p style='margin-top:10px'>This account now manages <b>" + total + " pupil" +
      (total === 1 ? "" : "s") + "</b>. The school will call " + esc(rec.phone) +
      " to confirm the next steps.</p>" +
      '<div style="display:flex;gap:10px;margin-top:18px">' +
        '<button class="ta-btn" type="button" data-more>Register another child</button>' +
        '<button class="ta-btn ghost" type="button" data-done>Done</button>' +
      "</div>"
    );
    card.querySelector(".ta-x").addEventListener("click", close);
    card.querySelector("[data-done]").addEventListener("click", close);
    /* Carry the parent's details over so they only type the child's name. */
    card.querySelector("[data-more]").addEventListener("click", function () {
      openRegister({ parent: rec.parent, phone: rec.phone, phone2: rec.phone2 });
    });
  }

  /* ---------- navigation drawer ---------- */
  var TOP_LINKS = [
    { href: "index.html",   label: "Home",        icon: "ta-star" },
    { href: "news.html",    label: "News & Events",  icon: "ta-calendar" },
    { href: "about.html",   label: "About Us",    icon: "ta-book" },
    { href: "contact.html", label: "Contact Us",  icon: "ta-chat" },
    { href: "admissions.html", label: "Admissions", icon: "ta-cap" }
  ];
  var MORE_LINKS = [
    { href: "academics.html",    label: "Academics",        icon: "ta-book" },
    { href: "fees.html",         label: "School Fees",      icon: "ta-shield" },
    { href: "calendar.html",     label: "Term Calendar",    icon: "ta-calendar" },
    { href: "alumni.html",       label: "Staff & Alumni",   icon: "ta-cap" },
    { href: "uniform.html",      label: "Uniform",          icon: "ta-shirt" },
    { href: "transport.html",    label: "Transport",        icon: "ta-bus" },
    { href: "volunteer.html",    label: "Volunteer",        icon: "ta-star" },
    { href: "homework.html",     label: "Homework Board",   icon: "ta-book" },
    { href: "lost-found.html",   label: "Lost & Found",     icon: "ta-chat" },
    { href: "photo-day.html",    label: "Photo Day",        icon: "ta-star" },
    { href: "openday.html",      label: "Open Day",         icon: "ta-calendar" },
    { href: "reading.html",      label: "Reading Corner",   icon: "ta-book" },
    { href: "testimonials.html", label: "Testimonials",     icon: "ta-star" },
    { href: "support.html",      label: "Support the School", icon: "ta-pledge" },
    { href: "pta.html",          label: "PTA",              icon: "ta-pledge" },
    { href: "careers.html",      label: "Careers",          icon: "ta-cap" },
    { href: "search.html",       label: "Search",           icon: "ta-chat" }
  ];

  function icon(id) {
    return '<svg class="d-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
           '<use href="' + base() + 'assets/img/icons.svg#' + id + '"></use></svg>';
  }

  function closeDrawer() {
    var s = document.getElementById("taDrawerScrim");
    var d = document.getElementById("taDrawer");
    if (d) d.classList.remove("in");
    if (s) s.classList.remove("in");
    setTimeout(function () {
      if (d && d.parentNode) d.remove();
      if (s && s.parentNode) s.remove();
    }, 400);
    document.documentElement.style.overflow = "";
  }

  function openDrawer() {
    if (document.getElementById("taDrawer")) return;
    var here = (location.pathname.split("/").pop() || "index.html");

    function row(l) {
      var cur = l.href === here ? ' aria-current="page"' : "";
      return '<a href="' + base() + l.href + '"' + cur + ">" + icon(l.icon) +
             "<span>" + esc(l.label) + "</span></a>";
    }

    var session = null;
    try { session = window.Auth && Auth.get ? Auth.get() : null; } catch (e) {}

    var scr = el("div", { class: "ta-drawer-scrim", id: "taDrawerScrim" });
    var d = el("nav", { class: "ta-drawer", id: "taDrawer",
                        "aria-label": "All pages" },
      '<div class="d-head"><b>Menu</b>' +
        '<button class="ta-x" type="button" id="taDrawerX" aria-label="Close menu" ' +
        'style="position:static">&times;</button></div>' +
      TOP_LINKS.map(row).join("") +
      '<div class="d-sep">More pages</div>' +
      MORE_LINKS.map(row).join("") +
      '<div class="d-gap"></div>' +
      (session
        ? '<button class="d-out" type="button" id="taLogout">' + icon("ta-hand") +
            "<span>Logout</span></button>"
        : '<button class="d-out is-login" type="button" id="taDrawerLogin">' + icon("ta-cap") +
            "<span>Login / Register</span></button>")
    );

    document.body.appendChild(scr);
    document.body.appendChild(d);
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(function () { scr.classList.add("in"); d.classList.add("in"); });

    scr.addEventListener("click", closeDrawer);
    d.querySelector("#taDrawerX").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Tab" && d && d.parentNode) trapFocus(d, e);
      if (e.key === "Escape") { closeDrawer(); document.removeEventListener("keydown", onEsc); }
    });

    var out = d.querySelector("#taLogout");
    if (out) out.addEventListener("click", function () {
      try { Auth.set(null, false); localStorage.removeItem("treasure_session_v1");
            sessionStorage.removeItem("treasure_session_v1"); } catch (e) {}
      toast("You have been logged out.");
      closeDrawer();
      setTimeout(function () { location.href = base() + "index.html"; }, 400);
    });
    var lg = d.querySelector("#taDrawerLogin");
    if (lg) lg.addEventListener("click", function () { closeDrawer(); setTimeout(openLogin, 260); });
  }

  /* ---------- wire up ---------- */
  function mountBurger() {
    var nav = document.getElementById("mainNav") || document.querySelector(".nav-links");
    if (!nav || nav.querySelector(".nav-burger")) return;
    var b = el("button", {
      type: "button", class: "nav-burger", id: "taBurger",
      "aria-label": "Open menu", "aria-haspopup": "dialog"
    }, '<span class="bars"><i></i><i></i><i></i></span><span>Menu</span>');
    b.addEventListener("click", openDrawer);
    nav.appendChild(b);
  }

  function interceptLoginLinks() {
    /* Let the popup handle it on the public site; portal pages keep the page. */
    if (/\/portal\//.test(location.pathname)) return;
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href*="portal/login.html"]');
      if (!a) return;
      e.preventDefault();
      if (/mode=register/.test(a.getAttribute("href") || "")) openRegister();
      else openLogin();
    });
  }

  function init() {
    /* The public header now shows the six core routes directly. Do not mount
       a hamburger: secondary destinations remain available via search and
       the footer, while login links keep their existing modal behaviour. */
    interceptLoginLinks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.TAAuth = { login: openLogin, register: openRegister, drawer: openDrawer, close: close };
})();

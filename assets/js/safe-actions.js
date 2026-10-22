/* Treasure Academy — production-safe public actions.
   Public enquiries are handed to the school's verified WhatsApp number. The
   website does not claim that a browser-only save reached the office. */
(function () {
  "use strict";

  var WA = "2349063932487";
  function value(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }
  function line(label, v) { return v ? label + ": " + v : ""; }
  function compact(parts) { return parts.filter(Boolean).join("\n"); }
  function whatsapp(text) {
    var url = "https://wa.me/" + WA + "?text=" + encodeURIComponent(text);
    var opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
  }
  function actionName(button) {
    return String((button && button.getAttribute("onclick")) || "").split("(")[0].trim();
  }
  function showError(id, message) {
    var el = document.getElementById(id);
    if (!el) return false;
    el.setAttribute("aria-invalid", "true");
    var errorId = id + "Error";
    el.setAttribute("aria-describedby", errorId);
    var error = document.getElementById(errorId);
    if (!error) {
      error = document.createElement("p");
      error.id = errorId;
      error.className = "field-error";
      error.setAttribute("role", "alert");
      el.insertAdjacentElement("afterend", error);
    }
    error.textContent = message;
    el.focus();
    return false;
  }
  function requireValue(id, message) {
    var el = document.getElementById(id);
    var v = value(id);
    if (!el || !v) return showError(id, message);
    el.removeAttribute("aria-invalid");
    var error = document.getElementById(id + "Error");
    if (error) error.remove();
    return v;
  }
  function noteFor(button) {
    if (!button || button.dataset.safeNote === "1") return;
    button.dataset.safeNote = "1";
    var note = document.createElement("p");
    note.className = "safe-action-note";
    note.textContent = "This opens the school's verified WhatsApp. Nothing is stored by this form on the website.";
    button.insertAdjacentElement("afterend", note);
  }

  var ACTIONS = {
    trackApp: function () {
      var phone = requireValue("trkPhone", "Enter the phone number used for the application.");
      if (!phone) return;
      if (phone.replace(/\D/g, "").length < 7) return showError("trkPhone", "Enter a complete phone number.");
      whatsapp(compact(["Hello Treasure Academy, I want to check an admission application.", line("Phone used", phone)]));
    },
    verifyReceipt: function () {
      var reference = requireValue("rcNo", "Enter the receipt or payment reference.");
      if (!reference) return;
      whatsapp(compact(["Hello Treasure Academy, please help me verify this receipt.", line("Receipt/reference", reference)]));
    },
    sendSuggestion: function () {
      var suggestion = requireValue("sgText", "Write your suggestion or concern before continuing.");
      if (!suggestion) return;
      whatsapp(compact(["Hello Treasure Academy, I have a private suggestion for the Headmistress.", line("Suggestion", suggestion)]));
    }
  };

  document.addEventListener("input", function (event) {
    var el = event.target;
    if (!el || el.getAttribute("aria-invalid") !== "true" || !String(el.value || "").trim()) return;
    el.removeAttribute("aria-invalid");
    var error = document.getElementById(el.id + "Error");
    if (error) error.remove();
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("button[onclick]");
    if (!button) return;
    var name = actionName(button);
    if (!ACTIONS[name]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ACTIONS[name]();
  }, true);

  document.addEventListener("submit", function (event) {
    if (!event.target || event.target.id !== "contactForm") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.target.checkValidity()) {
      event.target.reportValidity();
      return;
    }
    var f = new FormData(event.target);
    whatsapp(compact([
      "Hello Treasure Academy, I have an enquiry from the website.",
      line("Name", f.get("name")), line("Email", f.get("email")),
      line("Subject", f.get("subject")), line("Message", f.get("message"))
    ]));
  }, true);

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("button[onclick]").forEach(function (button) {
      if (ACTIONS[actionName(button)]) noteFor(button);
    });
    var contactForm = document.getElementById("contactForm");
    if (contactForm) {
      var submit = contactForm.querySelector('[type="submit"]');
      if (submit) noteFor(submit);
    }
  });
})();

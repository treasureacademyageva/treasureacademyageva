/* Non-storing WhatsApp draft helper.
   The calling page must show the returned link and a manual copy fallback. It
   must never treat an opened draft as delivery confirmation. */
(function (global) {
  'use strict';
  const number = '2349063932487';
  function draftLink(text) {
    return `https://wa.me/${number}?text=${encodeURIComponent(String(text || '').trim())}`;
  }
  global.TAWhatsAppDraft = Object.freeze({ number, draftLink });
})(window);

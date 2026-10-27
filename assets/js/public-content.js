/* Run 8 public-content enhancements. All essential facts are server rendered. */
(function () {
  'use strict';

  function relativeLabel(value) {
    var time = new Date(value).getTime();
    if (!Number.isFinite(time)) return '';
    var seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (seconds < 60) return 'Just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + ' minute' + (minutes === 1 ? '' : 's') + ' ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
    var days = Math.floor(hours / 24);
    if (days < 2) return '1 day ago';
    if (days < 7) return days + ' days ago';
    var weeks = Math.floor(days / 7);
    if (days < 21) return weeks + ' week' + (weeks === 1 ? '' : 's') + ' ago';
    try { return new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(time)); }
    catch (error) { return ''; }
  }

  function eventLabel(node) {
    var status = node.dataset.status || 'scheduled';
    var fixed = { postponed: 'Event postponed', cancelled: 'Event cancelled', moved_online: 'Event moved online', completed: 'Event ended' };
    if (fixed[status]) return fixed[status];
    var starts = new Date(node.dataset.start || '').getTime();
    var ends = new Date(node.dataset.end || '').getTime();
    if (!Number.isFinite(starts)) return 'Date confirmation unavailable';
    if (Number.isFinite(ends) && Date.now() > ends) return 'Event ended';
    if (Date.now() >= starts && Number.isFinite(ends) && Date.now() <= ends) return 'Happening now';
    if (Date.now() >= starts && !Number.isFinite(ends)) return 'Event start time passed — confirm current status';
    var minutes = Math.max(0, Math.ceil((starts - Date.now()) / 60000));
    if (minutes > 1440) {
      var days = Math.ceil(minutes / 1440);
      return days + ' day' + (days === 1 ? '' : 's') + ' to go';
    }
    var hours = Math.floor(minutes / 60);
    var remainder = minutes % 60;
    var detail = [];
    if (hours) detail.push(hours + ' hour' + (hours === 1 ? '' : 's'));
    if (remainder) detail.push(remainder + ' minute' + (remainder === 1 ? '' : 's'));
    return 'Starts in ' + (detail.join(' ') || 'less than a minute');
  }

  function refreshTimeLabels() {
    document.querySelectorAll('[data-relative-time]').forEach(function (node) {
      var label = relativeLabel(node.dataset.relativeTime);
      if (label) node.textContent = label;
    });
    document.querySelectorAll('[data-event-state]').forEach(function (node) {
      node.textContent = eventLabel(node);
    });
  }

  function initShare() {
    document.querySelectorAll('.js-share').forEach(function (button) {
      button.addEventListener('click', async function () {
        var status = button.parentElement && button.parentElement.querySelector('.share-status');
        var data = { title: button.dataset.shareTitle || document.title, url: button.dataset.shareUrl || location.href };
        try {
          if (navigator.share) {
            await navigator.share(data);
            if (status) status.textContent = 'Sharing options opened.';
          } else if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(data.url);
            if (status) status.textContent = 'Canonical page link copied.';
          } else {
            if (status) status.textContent = 'Copy the canonical address from your browser.';
          }
        } catch (error) {
          if (error && error.name !== 'AbortError' && status) status.textContent = 'Sharing was not available. Copy the canonical address from your browser.';
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    refreshTimeLabels();
    initShare();
    window.setInterval(refreshTimeLabels, 60000);
  });
})();

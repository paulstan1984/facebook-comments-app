(function () {
  'use strict';

  var overlay = document.getElementById('global-loading');
  if (!overlay) return;

  function showLoading(label) {
    var span = overlay.querySelector('span');
    if (span) span.textContent = label || 'Loading\u2026';
    overlay.classList.add('visible');
  }

  function hideLoading() {
    overlay.classList.remove('visible');
  }

  // Show spinner for every same-origin <a> click that is a real navigation
  // (exclude anchors, blank targets, and download links handled elsewhere).
  document.addEventListener('click', function (e) {
    var el = e.target.closest('a[href]');
    if (!el) return;
    if (el.target === '_blank') return;           // opens new tab
    if (el.hasAttribute('download')) return;      // file download
    if (el.classList.contains('export-btn')) return; // handled by posts.js
    if (el.classList.contains('view-winner-link')) return; // opens new tab

    var href = el.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;

    // Only intercept same-origin links
    try {
      var url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
    } catch (err) { return; }

    showLoading('Loading\u2026');
  });

  // Hide if the browser navigates back (bfcache restore)
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) hideLoading();
  });

  // Expose for posts.js to call
  window.AppLoading = { show: showLoading, hide: hideLoading };
}());

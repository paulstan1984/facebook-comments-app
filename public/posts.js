(function () {
  'use strict';

  var load = window.AppLoading || { show: function(){}, hide: function(){} };

  // ── Winner picker ──────────────────────────────────────────────────────────
  document.querySelectorAll('.winner-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const pageId  = btn.dataset.pageId;
      const postId  = btn.dataset.postId;
      const viewBtn = btn.parentElement.querySelector('.view-winner-link');

      btn.disabled    = true;
      btn.textContent = 'Picking\u2026';
      load.show('Picking a winner\u2026');

      try {
        const res  = await fetch('/winner/' + pageId + '/' + postId);
        const data = await res.json();

        if (!res.ok || data.error) { alert(data.error || 'Failed to pick a winner.'); return; }
        if (!data.winner)          { alert('No comments found for this post.'); return; }

        // Populate and show the modal
        document.getElementById('winner-comment').textContent = data.winner.Comment;
        var modalLink = document.getElementById('winner-link');
        if (data.winner.Link) { modalLink.href = data.winner.Link; modalLink.style.display = ''; }
        else                  { modalLink.style.display = 'none'; }
        document.getElementById('winner-modal').classList.add('visible');

        // Show per-card "View the Winner" link
        if (viewBtn) {
          if (data.winner.Link) {
            viewBtn.href          = data.winner.Link;
            viewBtn.style.display = '';
          } else {
            viewBtn.style.display = 'none';
          }
        }
      } catch (e) {
        alert('An error occurred. Please try again.');
      } finally {
        load.hide();
        btn.disabled  = false;
        btn.innerHTML = '&#127942;\u00a0Choose Winner';
      }
    });
  });

  // ── Winner modal close ─────────────────────────────────────────────────────
  var modal = document.getElementById('winner-modal');
  if (modal) {
    document.getElementById('winner-close').addEventListener('click', function () {
      modal.classList.remove('visible');
    });
    modal.addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('visible');
    });
  }

  // ── CSV download spinner ───────────────────────────────────────────────────
  document.querySelectorAll('.export-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      load.show('Fetching all comments\u2026 this may take a moment.');
      window.addEventListener('focus', function hide() {
        load.hide();
        window.removeEventListener('focus', hide);
      });
    });
  });
}());


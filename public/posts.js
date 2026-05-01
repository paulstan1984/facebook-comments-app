(function () {
  'use strict';

  var load = window.AppLoading || { show: function(){}, hide: function(){} };

  // ── Slideshow gallery ──────────────────────────────────────────────────────
  var gallery = document.getElementById('gallery');
  if (gallery) {
    var slides = Array.from(gallery.querySelectorAll('.gallery-slide'));
    var dots   = Array.from(gallery.querySelectorAll('.gallery-dot'));
    var current = 0;
    var timer;

    function goTo(n) {
      slides[current].classList.remove('active');
      dots[current] && dots[current].classList.remove('active');
      current = (n + slides.length) % slides.length;
      slides[current].classList.add('active');
      dots[current] && dots[current].classList.add('active');
    }

    function startAuto() {
      timer = setInterval(function() { goTo(current + 1); }, 4000);
    }

    function resetAuto() {
      clearInterval(timer);
      startAuto();
    }

    var prevBtn = gallery.querySelector('.gallery-prev');
    var nextBtn = gallery.querySelector('.gallery-next');
    if (prevBtn) prevBtn.addEventListener('click', function() { goTo(current - 1); resetAuto(); });
    if (nextBtn) nextBtn.addEventListener('click', function() { goTo(current + 1); resetAuto(); });
    dots.forEach(function(dot, i) {
      dot.addEventListener('click', function() { goTo(i); resetAuto(); });
    });

    if (slides.length > 1) startAuto();
  }

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

}());


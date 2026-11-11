/* ==========================================================================
   FILE: privacy.js
   BUSINESS: SELFCARE DIAGNOSTICS (https://selfcarediagnostics.in)
   DESCRIPTION: Lightweight, privacy-respecting client controller.
                - No external libraries.
                - No tracking or telemetry.
                - No personal data collection or transmission.
   ========================================================================== */

(function () {
  'use strict';

  /* ==========================================================================
     CONFIGURATION
     To fix the policy date manually, set FIXED_LAST_UPDATED to a string, e.g.:
     const FIXED_LAST_UPDATED = "March 15, 2026";
     If set to null, it dynamically formats today's date in Indian English.
     ========================================================================== */
  const FIXED_LAST_UPDATED = null;

  document.addEventListener('DOMContentLoaded', initPrivacyPage);

  function initPrivacyPage() {
    renderDates();
    setupHeaderScroll();
    setupBackToTop();
    setupPrintButton();
    setupTableOfContents();
  }

  /* 1. DATE FORMATTING */
  function renderDates() {
    const updatedEl = document.getElementById('last-updated-date');
    const yearEl = document.getElementById('footer-year');

    const today = new Date();

    if (yearEl) {
      yearEl.textContent = today.getFullYear();
    }

    if (updatedEl) {
      if (FIXED_LAST_UPDATED && typeof FIXED_LAST_UPDATED === 'string') {
        updatedEl.textContent = FIXED_LAST_UPDATED;
      } else {
        const options = { day: '2-digit', month: 'long', year: 'numeric' };
        updatedEl.textContent = today.toLocaleDateString('en-IN', options);
      }
    }
  }

  /* 2. STICKY HEADER SCROLL SHADOW */
  function setupHeaderScroll() {
    const header = document.getElementById('policy-header');
    if (!header) return;

    let ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          if (window.scrollY > 15) {
            header.classList.add('scrolled');
          } else {
            header.classList.remove('scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* 3. BACK TO TOP BUTTON */
  function setupBackToTop() {
    const btn = document.getElementById('btn-back-to-top');
    if (!btn) return;

    let ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          if (window.scrollY > 400) {
            btn.classList.add('visible');
          } else {
            btn.classList.remove('visible');
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    btn.addEventListener('click', function () {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  /* 4. PRINT BUTTON */
  function setupPrintButton() {
    const printBtn = document.getElementById('btn-print-policy');
    if (printBtn) {
      printBtn.addEventListener('click', function () {
        window.print();
      });
    }
  }

  /* 5. TABLE OF CONTENTS CONTROLLER (Scrollspy + Smooth Offset Scroll + Mobile Toggle) */
  function setupTableOfContents() {
    const tocLinks = document.querySelectorAll('.toc-link');
    const sections = document.querySelectorAll('.policy-card');
    const mobileToggle = document.getElementById('toc-mobile-toggle');
    const tocNav = document.getElementById('toc-nav-list');
    const toggleText = document.getElementById('toc-toggle-text');

    // A. Mobile Collapse Toggle
    if (mobileToggle && tocNav) {
      mobileToggle.addEventListener('click', function () {
        const isOpen = tocNav.classList.toggle('open');
        mobileToggle.setAttribute('aria-expanded', isOpen);
        if (toggleText) {
          toggleText.textContent = isOpen ? 'Hide Sections' : 'Show Sections';
        }
      });

      // Close mobile TOC when link clicked
      tocLinks.forEach(function (link) {
        link.addEventListener('click', function () {
          if (window.innerWidth < 992 && tocNav.classList.contains('open')) {
            tocNav.classList.remove('open');
            mobileToggle.setAttribute('aria-expanded', 'false');
            if (toggleText) toggleText.textContent = 'Show Sections';
          }
        });
      });
    }

    // B. Smooth Scroll with Header Height Offset
    tocLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (!targetId || !targetId.startsWith('#')) return;

        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          const headerOffset = 80;
          const elementPosition = targetEl.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });

          // Focus target element for screen readers & keyboard accessibility
          targetEl.setAttribute('tabindex', '-1');
          targetEl.focus({ preventScroll: true });

          // Update active link immediately on click
          tocLinks.forEach(l => l.classList.remove('active'));
          this.classList.add('active');

          // Update URL hash without jumping
          if (history.pushState) {
            history.pushState(null, null, targetId);
          }
        }
      });
    });

    // C. IntersectionObserver Scrollspy for TOC Highlighting
    if ('IntersectionObserver' in window && sections.length > 0) {
      const observerOptions = {
        root: null,
        rootMargin: '-85px 0px -65% 0px',
        threshold: 0
      };

      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            const currentId = entry.target.getAttribute('id');
            tocLinks.forEach(function (link) {
              if (link.getAttribute('href') === '#' + currentId) {
                link.classList.add('active');
                // Ensure active link is visible in scrollable TOC sidebar
                if (link.scrollIntoViewIfNeeded) {
                  link.scrollIntoViewIfNeeded(false);
                }
              } else {
                link.classList.remove('active');
              }
            });
          }
        });
      }, observerOptions);

      sections.forEach(function (sec) {
        observer.observe(sec);
      });
    }
  }

})();

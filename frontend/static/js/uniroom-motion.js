/* Presentation only. No API, form, booking, authentication or navigation changes. */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) return;
  const hosts = ['app', 'rm-content', 'room-results', 'admin-booking-list'];
  const selector = ':scope > .row > [class*="col-"], :scope > .panel, :scope > .card, :scope > .page-heading, :scope > .rm-heading, :scope > .row, :scope > .rm-card, :scope > .table-responsive';
  const animate = (host) => {
    if (!host || !host.isConnected) return;
    const nodes = [...host.querySelectorAll(selector)].slice(0, 16);
    nodes.forEach((node, i) => {
      if (node.dataset.urAnimated === '1') return;
      node.dataset.urAnimated = '1';
      node.classList.add('ur-enter', `ur-delay-${Math.min(i % 5, 4)}`);
      node.addEventListener('animationend', () => {
        node.classList.remove('ur-enter', 'ur-delay-0', 'ur-delay-1', 'ur-delay-2', 'ur-delay-3', 'ur-delay-4');
      }, { once: true });
    });
  };
  const init = () => {
    for (const id of hosts) {
      const host = document.getElementById(id);
      if (!host) continue;
      animate(host);
      const observer = new MutationObserver(records => {
        if (records.some(r => r.addedNodes.length || r.removedNodes.length)) {
          requestAnimationFrame(() => animate(host));
        }
      });
      observer.observe(host, { childList: true, subtree: false });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

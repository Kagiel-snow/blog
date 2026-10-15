'use strict';
(() => {
  // Calendar difference between the birthday (00:00 in Japan) and now, read on Tokyo's wall clock.
  function lifeSince(birthday, now) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(now).map(part => [part.type, Number(part.value)]));
    const [by, bm, bd] = birthday.split('-').map(Number);
    let years = parts.year - by, months = parts.month - bm, days = parts.day - bd;
    if (days < 0) { months -= 1; days += new Date(Date.UTC(parts.year, parts.month - 1, 0)).getUTCDate(); }
    if (months < 0) { years -= 1; months += 12; }
    return { years, months, days, hours: parts.hour, minutes: parts.minute, seconds: parts.second };
  }
  const pad = n => String(n).padStart(2, '0');
  const formatLife = t => `${t.years}y ${t.months}mo ${t.days}d ${pad(t.hours)}h ${pad(t.minutes)}m ${pad(t.seconds)}s`;
  if (typeof module !== 'undefined' && module.exports) { module.exports = { lifeSince, formatLife }; return; }
  let cleanup = () => {};
  const init = () => {
    cleanup();
    const controller = new AbortController();
    const options = { signal: controller.signal };
    cleanup = () => controller.abort();
    const comments = document.querySelector('.collection-comments');
    if (comments) {
      const openComments = () => { if (location.hash === '#post-comment') comments.open = true; };
      openComments();
      window.addEventListener('hashchange', openComments, options);
      document.addEventListener('click', event => {
        const anchor = event.target.closest('a[href]');
        if (!anchor) return;
        const target = new URL(anchor.href, location.href);
        if (target.origin === location.origin && target.pathname === location.pathname && target.hash === '#post-comment') comments.open = true;
      }, options);
    }
    const filters = document.querySelector('.gallery-filters');
    if (filters) {
      filters.hidden = false;
      const cards = [...document.querySelectorAll('[data-gallery-group]')];
      filters.addEventListener('click', event => {
        const button = event.target.closest('[data-gallery-filter]');
        if (!button) return;
        const selected = button.dataset.galleryFilter;
        filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        cards.forEach(card => { card.hidden = selected !== 'all' && card.dataset.galleryGroup !== selected; });
      }, options);
    }
    // About page: time lived since midnight in Japan on the birthday, ticking every second.
    const alive = document.querySelector('[data-profile-alive]');
    if (alive) {
      const tick = () => { alive.textContent = 'alive ' + formatLife(lifeSince(alive.dataset.birthday, new Date())); };
      tick();
      const timer = setInterval(tick, 1000);
      controller.signal.addEventListener('abort', () => clearInterval(timer));
    }
    const clock = document.querySelector('[data-profile-clock]');
    if (clock) {
      const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
      const tick = () => { clock.textContent = 'now ' + format.format(new Date()); };
      tick(); clock.hidden = false;
      const timer = setInterval(tick, 30000);
      controller.signal.addEventListener('abort', () => clearInterval(timer));
    }
    document.querySelectorAll('.film-card video').forEach(video => {
      video.addEventListener('play', () => {
        document.querySelectorAll('.film-card video').forEach(other => { if (other !== video) other.pause(); });
      }, options);
    });
  };
  init();
  document.addEventListener('pjax:complete', init);
})();

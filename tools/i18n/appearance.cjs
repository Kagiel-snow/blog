'use strict';
const { escape } = require('./lib.cjs');

// Enhance the generated theme DOM without forking Butterfly or touching articles.
function enhanceAppearance($, record, locale) {
  $('body').attr('data-page-kind', record.kind);
  $('#nav .menus_item > .site-page.group').attr('tabindex', '0');
  $('#sidebar-menus .menus_item:not(.i18n-menu) > .site-page.group').addClass('hide');
  const compactCards = '#aside-content .card-archives, #aside-content .card-webinfo' + (record.kind === 'home' ? ', #aside-content .card-recent-post' : '');
  $(compactCards).each((_, el) => {
    const card = $(el), headline = card.find('.item-headline').first();
    if (!headline.length) return;
    const title = headline.html();
    headline.remove();
    const details = $('<details></details>').attr('class', card.attr('class') + ' site-details');
    details.append(`<summary>${title}</summary>`);
    details.append($('<div class="site-details-body"></div>').append(card.contents()));
    card.replaceWith(details);
  });
  const player = $('#kagiel-player');
  if (!player.length) return;
  const t = locale.appearance;
  const dock = $(`<div class="site-tools"><details class="music-dock"><summary><i class="fas fa-music" aria-hidden="true"></i><span>${escape(t.music)}</span></summary><div class="music-panel"><div class="music-panel-heading"><span>${escape(t.player)}</span><button class="music-close" type="button" aria-label="${escape(t.close)}">×</button></div></div></details><button type="button" class="mascot-toggle" hidden aria-pressed="false" data-show="${escape(t.showMascot)}" data-hide="${escape(t.hideMascot)}"><i class="fas fa-star" aria-hidden="true"></i><span></span></button></div>`);
  player.before(dock);
  dock.find('.music-panel').append(player);
}
module.exports = { enhanceAppearance };

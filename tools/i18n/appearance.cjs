'use strict';
const { escape } = require('./lib.cjs');
const collection = require('../../source/data/collections.json');
const traffic = require('../../source/data/traffic.json');
const { renderTraffic } = require('../traffic/cloudflare.cjs');

// Enhance the generated theme DOM without forking Butterfly or touching articles.
function enhanceAppearance($, record, locale) {
  $('body').attr('data-page-kind', record.kind);
  $('.fa-tiktok').each((_, el) => {
    const icon = $(el), link = icon.parent('a');
    if (!link.length) return;
    icon.attr('aria-hidden', 'true');
    link.attr({ 'aria-label': '关注我的抖音（抖音号：SNMYKGY，新窗口打开）', title: '关注我的抖音 · SNMYKGY', rel: 'noopener noreferrer' });
  });
  $('#nav .menus_item > .site-page.group').attr('tabindex', '0');
  $('#sidebar-menus .menus_item:not(.i18n-menu) > .site-page.group').addClass('hide');
  const webinfo = $('.card-webinfo');
  webinfo.find('.item-headline span').text('网站统计');
  webinfo.find('#busuanzi_value_site_pv').closest('.webinfo-item').find('.item-name')
    .text('累计访问量（PV）：').attr('title', '页面累计浏览次数，包含重复访问');
  webinfo.find('#busuanzi_value_site_uv').closest('.webinfo-item').find('.item-name')
    .text('累计访客数（UV）：').attr('title', '按统计服务的浏览器标识去重，不是当前在线人数');
  const runtime = webinfo.find('#runtimeshow');
  if (runtime.length) {
    runtime.closest('.webinfo-item').find('.item-name').text('本站已安全运行：')
      .attr('title', '自上线日期起累计的完整天数');
    runtime.attr('translate', 'no');
    const start = Date.parse(runtime.attr('data-publishdate'));
    if (Number.isFinite(start)) runtime.text(`${Math.max(0, Math.floor((Date.now() - start) / 86400000))} 天`);
  }
  const compactCards = '#aside-content .card-archives, #aside-content .card-webinfo' + (record.kind === 'home' ? ', #aside-content .card-recent-post' : '');
  renderTraffic($, traffic);
  $(compactCards).each((_, el) => {
    const card = $(el), headline = card.find('.item-headline').first();
    if (!headline.length) return;
    const title = headline.html();
    headline.remove();
    const details = $('<details></details>').attr('class', card.attr('class') + ' site-details');
    if (card.hasClass('card-webinfo')) details.attr('open', '');
    details.append(`<summary>${title}</summary>`);
    details.append($('<div class="site-details-body"></div>').append(card.contents()));
    card.replaceWith(details);
  });
  const player = $('#kagiel-player');
  if (!player.length) return;
  $('body').append(`<script id="site-music-data" type="application/json">${JSON.stringify(collection.tracks).replace(/</g, '\\u003c')}</script>`);
  const t = locale.appearance;
  const dock = $(`<div class="site-tools"><details class="music-dock"><summary><i class="fas fa-music" aria-hidden="true"></i><span>${escape(t.music)}</span></summary><div class="music-panel"><div class="music-panel-heading"><span>${escape(t.player)}</span><button class="music-close" type="button" aria-label="${escape(t.close)}">×</button></div></div></details><button type="button" class="mascot-toggle" hidden aria-pressed="false" data-show="${escape(t.showMascot)}" data-hide="${escape(t.hideMascot)}"><i class="fas fa-star" aria-hidden="true"></i><span></span></button></div>`);
  player.before(dock);
  dock.find('.music-panel').append(player);
}
module.exports = { enhanceAppearance };

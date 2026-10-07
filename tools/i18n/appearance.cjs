'use strict';
const { escape } = require('./lib.cjs');
const collection = require('../../source/data/collections.json');
const traffic = require('../../source/data/traffic.json');
const { renderTraffic } = require('../traffic/cloudflare.cjs');

// Enhance the generated theme DOM without forking Butterfly or touching articles.
function enhanceAppearance($, record, locale) {
  $('body').attr('data-page-kind', record.kind);
  // Keep Hexo's real page links and PJAX behavior; enhance only list pagination.
  const pager = $('#pagination:not(.pagination-post)');
  if (pager.find('.page-number').length) {
    pager.addClass('site-pagination').attr('aria-label', '文章列表分页');
    const current = pager.find('.page-number.current');
    const pages = pager.find('.page-number').map((_, el) => Number($(el).text())).get();
    current.attr('aria-current', 'page');
    pager.find('a.page-number').each((_, el) => $(el).attr('aria-label', `第 ${$(el).text()} 页`));
    pager.find('.prev').attr({ 'aria-label': '上一页', rel: 'prev' }).html('<span aria-hidden="true">‹</span><span>上一页</span>');
    pager.find('.next').attr({ 'aria-label': '下一页', rel: 'next' }).html('<span>下一页</span><span aria-hidden="true">›</span>');
    const controls = pager.find('.pagination');
    const numbers = $('<div class="pagination-pages"></div>');
    numbers.append(controls.children('.page-number, .space'));
    if (!controls.find('.prev').length) controls.prepend('<span class="extend prev" aria-disabled="true"><span aria-hidden="true">‹</span><span>上一页</span></span>');
    if (!controls.find('.next').length) controls.append('<span class="extend next" aria-disabled="true"><span>下一页</span><span aria-hidden="true">›</span></span>');
    controls.find('.prev').after(numbers);
    pager.prepend(`<p class="pagination-status">第 ${escape(current.text())} 页 / 共 ${Math.max(...pages)} 页</p>`);
  }
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
  // Outside #body-wrap: keep the companion and its conversation across PJAX.
  $('body').append(`<aside id="site-mascot" class="site-mascot" aria-label="KGY看板娘" translate="no">
    <button class="mascot-avatar" type="button" aria-label="和 KGY 聊聊" aria-controls="mascot-dialog" aria-expanded="false">
      <span class="mascot-rig"><img class="mascot-fallback" src="/img/mascot/kgy-snow-girl-v3.png" alt="KGY：银灰长发、浅红眼睛，戴银色雪花项链的动漫少女" width="1024" height="1536"><canvas class="mascot-canvas" width="512" height="768" aria-hidden="true"></canvas></span>
      <span class="mascot-sparkles" aria-hidden="true">✧</span>
    </button>
    <span class="mascot-hint">点我聊聊</span>
    <section id="mascot-dialog" class="mascot-dialog" aria-label="和看板娘聊天" hidden>
      <div class="mascot-dialog-heading"><span class="mascot-dialog-portrait" aria-hidden="true"><img src="/img/mascot/kgy-snow-girl-v3.png" alt="" width="1024" height="1536"></span><div><strong>KGY</strong><span>ONLY KGY</span></div><button class="mascot-close" type="button" aria-label="收起对话">×</button></div>
      <details class="mascot-ai-panel"><summary>免费 AI 聊天<span data-mascot-ai-mode>未开启</span></summary><p>在你的设备上运行，不收聊天费用。首次下载约 300 MB，建议使用 Wi-Fi。</p><div class="mascot-ai-controls"><button type="button" data-mascot-ai>开启 AI 聊天</button><button type="button" data-mascot-ai-stop hidden>取消下载</button></div><progress data-mascot-ai-progress value="0" max="100" aria-label="AI 准备进度" hidden></progress><p data-mascot-ai-status role="status">开启前使用简短对话。聊天内容不会上传。</p></details>
      <div class="mascot-chat-log" role="log" aria-label="和 KGY 的对话" aria-live="polite" aria-relevant="additions" tabindex="0"><p class="mascot-message" data-role="assistant">你好，我是 KGY。今天想聊什么？</p></div>
      <div class="mascot-topics"><button type="button" data-mascot-topic="聊聊学习">聊聊学习</button><button type="button" data-mascot-topic="听点音乐">听点音乐</button><button type="button" data-mascot-topic="聊聊日常">聊聊日常</button><button type="button" data-mascot-topic="讲个笑话">讲个笑话</button></div>
      <form class="mascot-form"><label for="mascot-input">和我说句话</label><div><input id="mascot-input" name="message" maxlength="320" placeholder="今天想聊什么？" autocomplete="off"><button type="submit" aria-label="发送给 KGY">发送</button></div></form>
      <div class="mascot-actions"><a href="/archives/">翻翻文章</a><button type="button" data-mascot-music>打开音乐</button><button type="button" data-mascot-reset>重新聊</button><button type="button" data-mascot-hide>暂时隐藏</button></div>
    </section>
  </aside>`);
}
module.exports = { enhanceAppearance };

'use strict';
const { escape: e } = require('./lib.cjs');
const collection = require('../../source/data/collections.json');
const labels = require('../../i18n/sections.json');
const icons = {music:'headphones',Gallery:'images',movies:'film',link:'link',about:'snowflake',tags:'hashtag',categories:'folder-open'};
const image = (url, alt, cls = '') => `<img class="${cls}" src="${e(url)}" alt="${e(alt)}" loading="lazy" decoding="async">`;
const action = (url, label) => `<a class="section-action" href="${e(url)}">${e(label)} <span aria-hidden="true">↗</span></a>`;

function renderSection($, record, locale) {
  const key = record.key.replace(/^page:/, '');
  if (record.kind !== 'page' || !icons[key]) return;
  const t = labels[locale.id];
  const hasFriends = $('#article-container .flink-list-item').length > 0;
  const intro = hasFriends ? `<p>${e(t[key][2])}</p>` : $('#article-container').html() || `<p>${e(t[key][2])}</p>`;
  const comments = $('#post-comment').clone();
  const notices = $('#page > .i18n-notices').clone();
  const originalLinks = $('#article-container').clone();
  const taxonomy = key === 'tags' ? $('#page .tag-cloud-list').clone() : $('#page .category-lists').clone();
  const heading = `<header class="section-heading"><span class="section-kicker"><i class="fas fa-${icons[key]}" aria-hidden="true"></i> KAGIEL / ${e(locale.menu[{music:5,Gallery:6,movies:7,link:8,about:9,tags:2,categories:3}[key]])}</span><h1>${e(t[key][0])}</h1><p class="section-subtitle">${e(t[key][1])}</p><div class="section-intro">${intro}</div></header>`;
  $('body').attr('data-section', key);
  const page = $('#page').empty().addClass('collection-page');
  page.append(heading);
  page.append(notices);
  if (key === 'music') {
    page.append(`<section class="listening-banner"><div class="record-art">${image(collection.tracks[0].cover,'')}<span></span></div><div><span class="section-kicker">${collection.tracks.length} ${e(t.tracks)}</span><h2>${e(t.musicBanner[0])}</h2><p>${e(t.musicBanner[1])}</p><div class="sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></section>`);
    page.append(`<div class="track-grid">${collection.tracks.map((song,index)=>`<article class="track-card">${image(song.cover,'')}<div class="track-body"><span class="track-number">${String(index+1).padStart(2,'0')} / KAGIEL</span><h2>${e(song.name)}</h2><p>${e(song.artist)}</p><a class="track-play section-action" data-track-id="${e(song.id)}" data-play-label="${e(t.play)}" data-playing-label="${e(t.listen)}" href="${e(song.url)}"><i class="fas fa-play" aria-hidden="true"></i><span>${e(t.play)}</span></a></div></article>`).join('')}</div>`);
  } else if (key === 'Gallery') {
    page.append(`<div class="gallery-toolbar"><span>${collection.images.length} ${e(t.pictures)}</span><div class="gallery-filters" role="group" aria-label="${e(t.filter)}" hidden>${['all','sky','snow','white'].map(x=>`<button type="button" data-gallery-filter="${x}" aria-pressed="${x==='all'}">${e(t[x])}</button>`).join('')}</div></div>`);
    page.append(`<div class="wallpaper-grid">${collection.images.map((item,i)=>`<figure class="wallpaper-card" data-gallery-group="${item.group}"><a class="wallpaper-preview" href="${e(item.url)}" target="_blank" rel="noopener">${image(item.url,item.title[locale.id])}<span class="wallpaper-index">${String(i+1).padStart(2,'0')}</span></a><figcaption><div><h2>${e(item.title[locale.id])}</h2><span>${e(t[item.group])}${item.width ? ` · ${item.width} × ${item.height}` : ''}</span></div>${action(item.url,t.open)}</figcaption></figure>`).join('')}</div><p class="collection-footnote">${e(t.galleryNote)}</p>`);
  } else if (key === 'movies') {
    page.append(`<div class="screening-list">${collection.videos.map((item,i)=>`<article class="film-card"><div class="film-heading"><span class="film-number">${String(i+1).padStart(2,'0')}</span><h2>${e(item.title[locale.id])}</h2><span class="film-format">MP4</span></div><video controls playsinline preload="metadata" aria-label="${e(item.title[locale.id])}"><source src="${e(item.url)}" type="video/mp4"><a href="${e(item.url)}">${e(t.play)}</a></video></article>`).join('')}</div><p class="collection-footnote">${e(t.videoNote)}</p>`);
  } else if (key === 'link') {
    // Keep user-maintained Butterfly friend entries if they are added later.
    if (hasFriends) page.append(originalLinks.addClass('friend-entries'));
    else page.append(`<section class="neighbour-card"><div class="neighbour-icon" aria-hidden="true">☁</div><div><h2>${e(t.friendTitle)}</h2><p>${e(t.friendText)}</p>${action('mailto:snow@kagiel.top',t.mail)}</div></section>`);
    const resources = [['https://hexo.io/','Hexo','H'],['https://butterfly.js.org/','Butterfly','B'],['https://www.irodori.jpf.go.jp/','いろどり','あ']];
    page.append(`<h2 class="section-label">${e(t.resources)}</h2><div class="resource-grid">${resources.map((r,i)=>`<a class="resource-card" href="${r[0]}" target="_blank" rel="noopener"><span class="resource-letter">${r[2]}</span><h3>${r[1]} <span aria-hidden="true">↗</span></h3><p>${e(t.resourceDescriptions[i])}</p></a>`).join('')}</div>`);
  } else if (key === 'about') {
    page.append(`<div class="about-grid"><section class="profile-card">${image('/img/avatar.jpg','Kagiel','profile-avatar')}<span class="section-kicker">LIKE SNOW</span><h2>Kagiel</h2><div class="interest-chips">${t.interests.map(x=>`<span>${e(x)}</span>`).join('')}</div>${action('mailto:snow@kagiel.top',t.mail)}</section><section class="about-letter"><h2>${e(t.profile)}</h2><p>${e(t.siteText)}</p><div class="about-routes">${[['archives/',t.reading],['music/',locale.menu[5]],['Gallery/',locale.menu[6]]].map((x,i)=>`<a href="${locale.root+x[0]}"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${e(x[1])}</strong><p>${e(t.routeText[i])}</p></div><span aria-hidden="true">↗</span></a>`).join('')}</div></section></div><section class="site-timeline"><h2>${e(t.timeline)}</h2><ol>${t.timelineItems.map(x=>`<li><time>${e(x[0])}</time><div><h3>${e(x[1])}</h3><p>${e(x[2])}</p></div></li>`).join('')}</ol></section>`);
  } else {
    const panel = $(`<section class="taxonomy-panel ${key}-panel"></section>`);
    panel.append(taxonomy);
    page.append(panel);
  }
  if (comments.length) {
    const title = comments.find('.comment-head').text().trim() || locale.menu[9];
    const panel = $(`<details class="collection-comments"><summary>${e(title)}</summary></details>`);
    panel.append(comments); page.append(panel);
  }
}
module.exports = { renderSection };

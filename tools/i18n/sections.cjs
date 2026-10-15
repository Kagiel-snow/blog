'use strict';
const { escape: e, inspectContent } = require('./lib.cjs');
const collection = require('../../source/data/collections.json');
const music = require('../../source/data/music.json');
const labels = require('../../i18n/sections.json');
const icons = {music:'headphones',Gallery:'images',movies:'film',link:'link',about:'snowflake',tags:'hashtag',categories:'folder-open'};
const image = (url, alt, cls = '') => `<img class="${cls}" src="${e(url)}" alt="${e(alt)}" loading="lazy" decoding="async">`;
const action = (url, label) => `<a class="section-action" href="${e(url)}">${e(label)} <span aria-hidden="true">↗</span></a>`;

function renderMusicBrowser() {
  const providers = music.catalogOnly
    ? '<button type="button" data-music-provider="audius" aria-pressed="true">Audius 音频</button>'
    : '<button type="button" data-music-provider="netease" aria-pressed="true">音乐</button>';
  return `<section class="music-browser" data-music-browser aria-label="在线音乐">
      <form class="music-search-form" data-music-search-form role="search"><label for="music-keyword">搜索歌曲或歌手</label><div class="music-input-row"><input id="music-keyword" name="keyword" type="search" maxlength="100" required placeholder="例如：Coffee beabadoobee" autocomplete="off"><button type="submit" class="section-action">搜索</button></div><div class="music-provider-tabs" role="group" aria-label="搜索版本">${providers}<button type="button" data-music-provider="soundcloud" aria-pressed="false">SoundCloud 音频</button><button type="button" data-music-provider="bilibili" aria-pressed="false">视频版本</button></div><p class="music-version-note">优先查找第三方同曲音频，未找到时尝试网易云公开原曲。搜索其他版本时，请核对歌曲、作者和版本。</p></form>
      <section class="music-video-tools" data-music-audio-tools aria-label="查找公开音频" hidden><a class="track-source" data-music-audio-search-link href="https://soundcloud.com/search/sounds" target="_blank" rel="noopener noreferrer">去 SoundCloud 查找更多音频 ↗</a><form data-music-audio-form><label for="music-audio-link">打开公开音频版本</label><div class="music-input-row"><input id="music-audio-link" name="audioLink" type="url" maxlength="2000" required placeholder="粘贴 SoundCloud 公开单曲链接" autocomplete="off"><button type="submit" class="section-action">打开音频播放器</button></div><p class="music-browser-status" data-music-audio-error role="status" aria-live="polite"></p></form></section>
      <section class="music-video-tools" data-music-video-tools aria-label="查找音乐视频" hidden><a class="track-source" data-music-video-search-link href="https://search.bilibili.com/all" target="_blank" rel="noopener noreferrer">去 B 站查找更多版本 ↗</a><form data-music-video-form><label for="music-video-link">打开一个视频版本</label><div class="music-input-row"><input id="music-video-link" name="videoLink" type="text" maxlength="1000" required placeholder="粘贴 B 站视频链接或 BV 号" autocomplete="off"><button type="submit" class="section-action">打开视频播放器</button></div><p class="music-browser-status" data-music-video-error role="status" aria-live="polite"></p></form></section>
      <details class="music-playlist-settings"><summary>换一个网易云歌单</summary><form data-music-playlist-form><label for="music-playlist-id">歌单链接或 ID</label><div class="music-input-row"><input id="music-playlist-id" name="playlist" type="text" maxlength="300" required value="${e(music.playlistId)}" placeholder="歌单链接、分享文本或数字 ID"><button type="submit" class="section-action">载入歌单</button></div><p class="music-browser-status" data-music-playlist-error role="status" aria-live="polite" translate="no"></p><a class="track-source" data-music-input-source target="_blank" rel="noopener noreferrer" hidden>打开分享链接 ↗</a></form></details>
      <div class="music-browser-toolbar"><div class="music-view-tabs" role="group" aria-label="音乐列表"><button type="button" data-music-view="playlist" aria-pressed="true">歌单</button><button type="button" data-music-view="search" aria-pressed="false">搜索结果</button></div><a data-music-playlist-source href="https://music.163.com/#/playlist?id=${e(music.playlistId)}" target="_blank" rel="noopener noreferrer">网易云原歌单 ↗</a></div><h2 class="music-list-title" data-music-list-title translate="no">${e(music.playlistName)}</h2><p class="music-browser-status" data-music-browser-status role="status" aria-live="polite" translate="no">正在加载在线歌单…</p><button class="service-retry" type="button" data-music-retry-list hidden>重试加载</button><div class="track-grid" data-music-results></div><button class="section-action music-load-more" type="button" data-music-more hidden>显示更多歌曲</button><noscript><p>请启用 JavaScript 来搜索和点播，也可以直接打开上方的网易云歌单。</p></noscript></section>`;
}

// About page: an English profile card, a short self-introduction and
// recent activity read from the published posts' dates at build time.
const BIRTHDAY = '2009-02-26';
const { lifeSince, formatLife } = require('../../source/js/sections.js');
// Broad English subject for each study tag; the newest study note decides what I'm learning now.
const SUBJECTS = { 'C语言': ['Programming', 'C'], '计算机基础': ['Computer science', 'the basics'], '软件工程': ['Software engineering', ''],
  '计算机网络': ['Networking', ''], '网络安全': ['Cybersecurity', ''], '离散数学': ['Mathematics', 'discrete math'],
  '概率论': ['Mathematics', 'probability'], '统计学': ['Mathematics', 'statistics'], '日语': ['Japanese', ''] };
function currentSubject() {
  const latest = inspectContent().filter(item => item.post && [].concat(item.doc.categories || [])[0] === '边学边记')
    .sort((a, b) => new Date(b.doc.date) - new Date(a.doc.date))[0];
  const tag = latest && [].concat(latest.doc.tags || []).find(name => SUBJECTS[name]);
  return tag ? { subject: SUBJECTS[tag][0], focus: SUBJECTS[tag][1] } : null;
}
function renderAbout(locale, now = new Date()) {
  const facts = [
    ['Name', `<span class="glitch" data-text="Kagiel">Kagiel</span> <span class="profile-ipa" lang="en-fonipa">/ˈkɑːɡiːl/</span>`],
    ['Born', `${BIRTHDAY.replace(/-/g, '.')} <span class="profile-alive" data-profile-alive data-birthday="${BIRTHDAY}">${formatLife(lifeSince(BIRTHDAY, now))}</span>`],
    ['Now', 'Computer science student'],
    ['Languages', 'Chinese · English · Japanese'],
    ['Hometown', 'China'],
    ['Based in', 'Japan · <abbr title="Japan Standard Time">JST</abbr> (UTC+9) <span class="profile-clock" data-profile-clock hidden></span>'],
    ['Someday', 'AI security · writing novels']
  ];
  const interests = ['🎮 Cozy games', '🎧 Quiet music', '🌸 Anime', '📖 Novels', '🤖 AI', '🛡️ Cybersecurity'];
  const bio = [
    "Hi, I'm Kagiel. I live in Japan and study computer science at university.",
    "I like relaxing games, quiet music, cheerful anime and easygoing novels.",
    "I'm also interested in AI and cybersecurity."
  ];
  const routes = [['archives/', 'Read the notes', 'See what I wrote recently'], ['music/', 'Listen along', 'Play a few songs from my list'], ['Gallery/', 'Wallpapers', 'Browse the pictures I keep']];
  const learning = currentSubject();
  // Earlier milestones stay below the current subject, newest first.
  const milestones = [['2025.04.01', 'Japanese', 'Started learning Japanese']];
  const activity = `<ol class="learning-log">${learning ? `<li class="now-learning"><span class="activity-kind activity-learning">NOW LEARNING</span><strong>${e(learning.subject)}</strong>${learning.focus ? `<p>Right now: ${e(learning.focus)}</p>` : ''}</li>` : ''}${milestones.map(([date, subject, note]) => `<li class="past-learning"><time datetime="${date.replace(/\./g, '-')}">${date}</time><strong>${e(subject)}</strong><p>${e(note)}</p></li>`).join('')}</ol>`;
  return `<div class="about-grid" lang="en" translate="no"><section class="profile-card">${image('/img/avatar.jpg','Kagiel','profile-avatar')}<span class="section-kicker">LIKE SNOW</span><h2><span class="glitch" data-text="Kagiel">Kagiel</span></h2>
    <dl class="profile-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="interest-chips">${interests.map(x => `<span>${e(x)}</span>`).join('')}</div>${action('mailto:snow@kagiel.top','Say hi')}</section>
    <section class="about-letter"><h2><span class="glitch" data-text="About me">About me</span></h2>${bio.map(x => `<p>${e(x)}</p>`).join('')}<div class="about-routes">${routes.map((x,i)=>`<a href="${locale.root+x[0]}"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${e(x[1])}</strong><p>${e(x[2])}</p></div><span aria-hidden="true">↗</span></a>`).join('')}</div></section></div>
    <section class="site-timeline" lang="en" translate="no"><h2><span class="glitch" data-text="Recent activity">Recent activity</span></h2>${activity}</section>`;
}

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
    page.append(`<section class="listening-banner"><div class="record-art">${image(music.fallbackCover,'')}<span></span></div><div><span class="section-kicker">MUSIC / 在线音乐</span><h2>让音乐陪你读下去</h2><p>导入「${e(music.playlistName)}」的歌曲目录，再选择第三方音频或视频版本。</p><div class="sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></section>`);
    if (music.catalogOnly) page.append('<div id="music-player-slot" class="music-player-slot" data-music-player-slot aria-hidden="true"></div>');
    page.append(renderMusicBrowser());
    page.append('<p class="collection-footnote">歌曲和视频的可用性随平台与地区变化；请选择想听的版本。</p>');
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
    page.append(renderAbout(locale));
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
module.exports = { renderAbout, renderSection, renderMusicBrowser };

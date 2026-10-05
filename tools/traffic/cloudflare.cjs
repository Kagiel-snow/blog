'use strict';
const fs = require('node:fs');
const path = require('node:path');
const HOSTNAME = 'kagiel.top';
const DAY = 86400000;

function emptySnapshot(status = 'not_configured') {
  return { status, provider: 'Cloudflare', hostname: HOSTNAME, bytes: null, periodStart: null, periodEnd: null, updatedAt: null };
}

// A single aggregate, with no dimensions, avoids truncating a list of hourly rows.
function buildQuery(zoneId, start, end) {
  if (!/^[a-f0-9]{32}$/i.test(zoneId)) throw new Error('invalid_zone_id');
  const startTime = Date.parse(start), endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || endTime - startTime !== DAY) throw new Error('invalid_period');
  return `{ viewer { zones(filter: { zoneTag: ${JSON.stringify(zoneId)} }) {
    httpRequestsAdaptiveGroups(limit: 1, filter: {
      datetime_geq: ${JSON.stringify(new Date(startTime).toISOString())},
      datetime_lt: ${JSON.stringify(new Date(endTime).toISOString())},
      clientRequestHTTPHost: "${HOSTNAME}", requestSource: "eyeball"
    }) { sum { edgeResponseBytes } }
  } } }`;
}

function parseBytes(result) {
  if (!result || (result.errors && (!Array.isArray(result.errors) || result.errors.length))) throw new Error('analytics_error');
  const zones = result.data?.viewer?.zones;
  if (!Array.isArray(zones) || zones.length !== 1) throw new Error('zone_unavailable');
  const groups = zones[0].httpRequestsAdaptiveGroups;
  if (!Array.isArray(groups) || groups.length > 1) throw new Error('invalid_aggregate');
  if (!groups.length) return 0;
  const bytes = groups[0]?.sum?.edgeResponseBytes;
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > Number.MAX_SAFE_INTEGER) throw new Error('invalid_bytes');
  return bytes;
}

async function collect({ token, zoneId, now = Date.now(), fetchImpl = fetch } = {}) {
  if (!token && !zoneId) return emptySnapshot();
  if (!token || !zoneId) throw new Error('incomplete_credentials');
  const end = Math.floor(now / 3600000) * 3600000;
  const periodStart = new Date(end - DAY).toISOString(), periodEnd = new Date(end).toISOString();
  const query = buildQuery(zoneId, periodStart, periodEnd);
  const response = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('analytics_http_error');
  return { status: 'ok', provider: 'Cloudflare', hostname: HOSTNAME, bytes: parseBytes(await response.json()), periodStart, periodEnd, updatedAt: new Date(now).toISOString() };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '暂不可用';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
  return `${Math.round(bytes)} B`;
}

function renderTraffic($, snapshot, now = Date.now()) {
  const host = $('.card-webinfo .webinfo');
  if (!host.length) return;
  const start = Date.parse(snapshot?.periodStart), end = Date.parse(snapshot?.periodEnd), updated = Date.parse(snapshot?.updatedAt);
  const valid = snapshot?.status === 'ok' && snapshot.hostname === HOSTNAME && snapshot.provider === 'Cloudflare'
    && Number.isFinite(snapshot.bytes) && snapshot.bytes >= 0 && snapshot.bytes <= Number.MAX_SAFE_INTEGER
    && Number.isFinite(start) && end - start === DAY && Number.isFinite(updated) && updated >= end && updated <= now + 60000;
  const row = $('<div class="webinfo-item"></div>');
  row.append('<div class="item-name">24小时传输流量：</div>');
  row.append($('<div class="item-count" data-traffic-value translate="no"></div>').text(valid ? formatBytes(snapshot.bytes) : snapshot?.status === 'not_configured' ? '暂未接入' : '暂不可用'));
  host.append(row);
  const note = $('<p class="traffic-note" data-traffic-note></p>');
  if (valid) {
    const date = value => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
    note.text(`Cloudflare 统计区间：${date(start)} 至 ${date(end)}（日本时间）。更新于 ${date(updated)}。`);
    if (now - updated > DAY) note.append(' 此为上次记录，尚未更新。');
  } else {
    note.text(snapshot?.status === 'not_configured' ? '流量数据尚未接入。' : '暂时无法获取流量数据。');
  }
  host.append(note);
}

if (require.main === module) {
  (async () => {
    let snapshot;
    try {
      snapshot = await collect({ token: process.env.CLOUDFLARE_ANALYTICS_TOKEN, zoneId: process.env.CLOUDFLARE_ZONE_ID });
    } catch {
      // Never print API response bodies or credentials into public CI logs/files.
      console.warn('Cloudflare traffic unavailable. Check Analytics read access, zone ID, token expiry and dataset availability.');
      snapshot = emptySnapshot('unavailable');
    }
    fs.writeFileSync(path.join(__dirname, '../../source/data/traffic.json'), JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`Cloudflare traffic snapshot: ${snapshot.status}`);
  })().catch(() => { console.error('Could not write the traffic snapshot.'); process.exitCode = 1; });
}
module.exports = { collect, buildQuery, parseBytes, formatBytes, renderTraffic, emptySnapshot };

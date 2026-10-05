'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const { collect, parseBytes, formatBytes, renderTraffic, emptySnapshot } = require('./cloudflare.cjs');
const response = groups => ({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: groups }] } } });

test('traffic collection requests one hostname and an exact 24-hour interval without exposing credentials', async () => {
  let request;
  const snapshot = await collect({ token: 'test-only-secret', zoneId: 'a'.repeat(32), now: Date.parse('2026-10-05T13:30:00Z'),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => response([{ sum: { edgeResponseBytes: 1250000000 } }]) };
    }
  });
  assert.equal(request.url, 'https://api.cloudflare.com/client/v4/graphql');
  assert.match(request.options.body, /kagiel.top/);
  assert.match(request.options.body, /requestSource: \\"eyeball\\"/);
  assert.ok(!request.options.body.includes('dimensions'));
  assert.equal(snapshot.periodStart, '2026-10-04T13:00:00.000Z');
  assert.equal(snapshot.periodEnd, '2026-10-05T13:00:00.000Z');
  assert.equal(snapshot.bytes, 1250000000);
  assert.ok(!JSON.stringify(snapshot).includes('test-only-secret'));
  assert.ok(!JSON.stringify(snapshot).includes('a'.repeat(32)));
});

test('missing access and API errors never become a false zero-byte count', async () => {
  const missing = await collect({ fetchImpl: () => { throw new Error('unexpected network request'); } });
  assert.equal(missing.status, 'not_configured');
  assert.equal(missing.bytes, null);
  await assert.rejects(collect({ token: 'test-only-secret' }), /incomplete_credentials/);
  await assert.rejects(collect({ token: 'test-only-secret', zoneId: 'wrong' }), /invalid_zone_id/);
  await assert.rejects(collect({ token: 'test-only-secret', zoneId: 'a'.repeat(32), fetchImpl: async () => ({ ok: false }) }), /analytics_http_error/);
  assert.throws(() => parseBytes({ errors: [{ message: 'denied' }], ...response([]) }), /analytics_error/);
  assert.throws(() => parseBytes({ data: { viewer: { zones: [] } } }), /zone_unavailable/);
  for (const bytes of [-1, null, '10', Infinity]) assert.throws(() => parseBytes(response([{ sum: { edgeResponseBytes: bytes } }])));
  assert.equal(parseBytes(response([])), 0, 'an accessible, valid empty aggregate is genuinely zero');
});

test('traffic uses decimal MB/GB and labels the actual recorded interval and stale snapshots', () => {
  assert.equal(formatBytes(1250000), '1.25 MB');
  assert.equal(formatBytes(1250000000), '1.25 GB');
  assert.equal(formatBytes(0), '0 B');
  const markup = '<div class="card-webinfo"><div class="webinfo"></div></div>';
  const snapshot = { ...emptySnapshot(), status: 'ok', bytes: 1250000,
    periodStart: '2026-10-04T13:00:00Z', periodEnd: '2026-10-05T13:00:00Z', updatedAt: '2026-10-05T13:30:00Z' };
  const $ = cheerio.load(markup);
  renderTraffic($, snapshot, Date.parse('2026-10-07T13:30:00Z'));
  assert.equal($('[data-traffic-value]').text(), '1.25 MB');
  assert.match($('[data-traffic-note]').text(), /2026\/10\/04 22:00/);
  assert.match($('[data-traffic-note]').text(), /上次记录/);
  for (const invalid of [emptySnapshot(), { ...snapshot, hostname: 'other.example' }, { ...snapshot, periodEnd: snapshot.periodStart }]) {
    const page = cheerio.load(markup);
    renderTraffic(page, invalid, Date.parse('2026-10-07T13:30:00Z'));
    assert.match(page('[data-traffic-value]').text(), /暂未接入|暂不可用/);
    assert.ok(!page('[data-traffic-value]').text().includes('0 B'));
  }
});

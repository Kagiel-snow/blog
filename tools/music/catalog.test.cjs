'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('./index-playlist.mjs');
const source = (fields = {}) => ({ id: 'netease:1', name: 'Coffee', artist: 'beabadoobee', ...fields });
const candidate = (fields = {}) => ({ id: 'soundcloud:342790792', provider: 'soundcloud', availability: 'public_full',
  name: 'Coffee', artist: 'beabadoobee', permalinkUrl: 'https://soundcloud.com/beabadoobee/coffee',
  durationMs: 127779, fullDurationMs: 127801, ...fields });

test('recording normalization accepts Unicode, punctuation, spacing and feat/ft synonyms only', async () => {
  const { isSameRecording, normalizeRecordingName, primaryArtist } = await modulePromise;
  assert.ok(isSameRecording(source({ name: 'Ｃｏｆｆｅｅ！', artist: 'Bea Badoobee' }), candidate()));
  assert.ok(isSameRecording(source({ name: 'time machine (feat. Aren Park)', artist: 'mj apanay/aren park' }),
    candidate({ name: 'Time Machine (ft. aren park)', artist: 'MJ Apanay' })));
  assert.equal(normalizeRecordingName('Coffee (LIVE)'), 'coffeelive');
  assert.equal(primaryArtist('Artist；Collaborator'), 'Artist');
});

test('same title with wrong artist, or alternate recording/version tags, never verifies', async () => {
  const { isSameRecording } = await modulePromise;
  for (const fields of [{ artist: 'Wrong artist' }, { artist: 'beabadoobee / Wrong artist' },
    { name: 'Coffee (live)' }, { name: 'Coffee remix' }, { name: 'Coffee (cover)' },
    { name: 'Coffee instrumental' }, { name: 'Coffee version 2' }, { name: 'Coffee (feat. Bob)' }]) {
    assert.equal(isSameRecording(source(), candidate(fields)), false);
  }
  assert.equal(isSameRecording(source({ name: 'Coffee (feat. Bob)' }), candidate({ name: 'Coffee (ft. Alice)' })), false);
});

test('unknown status, preview duration, malformed identity and private link never verify', async () => {
  const { isSameRecording } = await modulePromise;
  for (const fields of [{ availability: 'unchecked' }, { availability: undefined }, { durationMs: 30000 },
    { fullDurationMs: undefined }, { id: 'other:123' }, { provider: 'other' },
    { permalinkUrl: 'https://soundcloud.com/u/song?secret_token=private' }]) {
    assert.equal(isSameRecording(source(), candidate(fields)), false);
  }
  assert.equal(isSameRecording(source({ name: '', artist: '' }), candidate({ name: '', artist: '' })), false);
});

test('playlist metadata only recovers unique numeric IDs and never preserves playback URLs', async () => {
  const { playlistMetadata } = await modulePromise;
  const list = playlistMetadata([{ title: 'Coffee', author: 'beabadoobee', url: 'https://api.example/?id=1309995372&auth=never-return' },
    { title: 'duplicate', author: 'artist', url: 'https://api.example/?id=1309995372' },
    { title: 'Bad', author: 'artist', url: 'https://api.example/?id=invalid' },
    { title: '', author: 'artist', url: 'https://api.example/?id=2' }]);
  assert.deepEqual(list, [{ id: 'netease:1309995372', songId: '1309995372', name: 'Coffee', artist: 'beabadoobee' }]);
  assert.ok(!JSON.stringify(list).includes('never-return'));
});

test('audit skips previously verified tracks, selects only a first exact candidate and spaces sequential queries', async () => {
  const { auditDefaultPlaylist } = await modulePromise;
  let time = 0; const starts = [], queries = [];
  const playlist = [source({ id: 'netease:1309995372' }), source({ id: 'netease:1379918404' }), source(),
    source({ id: 'netease:2', name: 'Other' }), source({ id: 'netease:3', name: 'Beyond limit' })];
  const report = await auditDefaultPlaylist({ playlist, limit: 2, now: () => time,
    sleepImpl: async delay => { time += delay; }, service: { async search(query) {
      queries.push(query); starts.push(time); return { tracks: [candidate({ id: 'soundcloud:99', artist: 'Wrong' }), candidate(), candidate()] };
    } } });
  assert.deepEqual(queries, ['Coffee beabadoobee', 'Other beabadoobee']);
  assert.deepEqual(starts, [0, 1500]);
  assert.equal(report.executedQueries, 2); assert.equal(report.verifiedMatches, 1);
  assert.equal(report.matches['netease:1'].evidence.availability, 'public_full');
  assert.equal(report.unresolved[0].reason, 'NO_EXACT_PUBLIC_MATCH');
});

test('a platform denial stops the entire audit without retrying or searching subsequent songs', async () => {
  const { auditDefaultPlaylist } = await modulePromise;
  let calls = 0;
  const report = await auditDefaultPlaylist({ playlist: [source(), source({ id: 'netease:2' })], now: () => 0,
    service: { async search() { calls++; throw Object.assign(new Error('denied'), { code: 'UPSTREAM_BLOCKED', status: 502 }); } } });
  assert.equal(calls, 1); assert.equal(report.executedQueries, 1);
  assert.equal(report.stopped.code, 'UPSTREAM_BLOCKED');
  assert.equal(report.attempts[1].attempted, false);
  assert.equal(report.attempts[1].reason, 'AUDIT_STOPPED_PLATFORM_DENIED');
});

test('other network failures are explicit, do not retry, and do not manufacture matches', async () => {
  const { auditDefaultPlaylist } = await modulePromise;
  let time = 0, calls = 0;
  const report = await auditDefaultPlaylist({ playlist: [source(), source({ id: 'netease:2', name: 'Other' })], now: () => time,
    sleepImpl: async delay => { time += delay; }, service: { async search() {
      calls++; if (calls === 1) throw new Error('private diagnostic'); return { tracks: [] };
    } } });
  assert.equal(calls, 2); assert.equal(report.verifiedMatches, 0);
  assert.equal(report.attempts[0].reason, 'NETWORK_OR_PLATFORM_ERROR');
  assert.ok(!JSON.stringify(report).includes('private diagnostic'));
});

test('audit refuses a limit exceeding the bounded twelve-query budget', async () => {
  const { auditDefaultPlaylist } = await modulePromise;
  await assert.rejects(auditDefaultPlaylist({ playlist: [], service: {}, limit: 13 }), /1 to 12/);
});

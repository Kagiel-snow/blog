// Bounded public-metadata audit. This script never changes the website's source configuration.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createOpenAudioService, normalizeSoundCloudPermalink } from './open-audio.mjs';

const KNOWN = new Set(['netease:1309995372', 'netease:1379918404']);
const MAX_QUERIES = 12;
const META_ENDPOINT = 'https://api.i-meto.com/meting/api';

/** Preserve every version/collaborator word; only punctuation, spacing, and feat./ft. vary. */
export function normalizeRecordingName(value) {
  if (typeof value !== 'string' || value.length > 1000) return '';
  return value.normalize('NFKC').toLowerCase().replace(/\b(?:feat|ft)\.?\b/g, 'feat')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function primaryArtist(value) {
  return typeof value === 'string' ? value.normalize('NFKC').split(/[\/;]/)[0].trim() : '';
}

export function isSameRecording(source, candidate) {
  if (!source || !candidate || candidate.provider !== 'soundcloud' || candidate.availability !== 'public_full') return false;
  const title = normalizeRecordingName(source.name || source.title);
  const artist = normalizeRecordingName(primaryArtist(source.artist || source.author));
  if (!title || !artist || title !== normalizeRecordingName(candidate.name || candidate.title) ||
    artist !== normalizeRecordingName(candidate.artist)) return false;
  if (!/^soundcloud:[1-9]\d{0,15}$/.test(candidate.id || '')) return false;
  if (!Number.isSafeInteger(candidate.durationMs) || !Number.isSafeInteger(candidate.fullDurationMs) ||
    candidate.durationMs < 1000 || candidate.fullDurationMs < 1000 ||
    Math.abs(candidate.durationMs - candidate.fullDurationMs) > 3000) return false;
  try { return normalizeSoundCloudPermalink(candidate.permalinkUrl) === candidate.permalinkUrl; }
  catch { return false; }
}

function clean(value, limit = 200) {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

/** A media URL is inspected only as metadata to recover the NetEase ID; it is never requested. */
export function playlistMetadata(items) {
  if (!Array.isArray(items)) throw new Error('PLAYLIST_INVALID_RESPONSE');
  const seen = new Set(), tracks = [];
  for (const item of items.slice(0, 1000)) {
    if (!item || typeof item !== 'object') continue;
    let id;
    try { id = new URL(item.url).searchParams.get('id'); } catch { continue; }
    if (!/^[1-9]\d{0,19}$/.test(id || '') || seen.has(id)) continue;
    const name = clean(item.title || item.name), artist = clean(item.author || item.artist);
    if (!name || !artist) continue;
    seen.add(id); tracks.push({ id: 'netease:' + id, songId: id, name, artist });
  }
  return tracks;
}

function limitOf(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_QUERIES) throw new Error('limit must be an integer from 1 to 12');
  return value;
}

/** Never retries; a platform denial ends the whole audit. Search stays sequential. */
export async function auditDefaultPlaylist({ playlist, service, limit = MAX_QUERIES, now = Date.now,
  sleepImpl = sleep, intervalMs = 1500, onAttempt = () => {} } = {}) {
  limitOf(limit);
  const selected = playlist.filter(track => !KNOWN.has(track.id)).slice(0, limit);
  const report = { checkedAt: new Date(now()).toISOString(), playlistTracks: playlist.length,
    plannedQueries: selected.length, executedQueries: 0, matches: {}, attempts: [], stopped: null,
    verification: 'Public page metadata and exact normalized title plus primary artist; no media extraction or audio fingerprinting.',
    scope: 'First ' + limit + ' default playlist entries excluding the two previously verified tracks; no claim of full playlist coverage.' };
  let previousStart = -Infinity;
  for (const source of selected) {
    if (report.stopped) {
      report.attempts.push({ ...source, attempted: false, reason: 'AUDIT_STOPPED_PLATFORM_DENIED' });
      continue;
    }
    const query = (source.name + ' ' + primaryArtist(source.artist)).trim();
    if (!query || query.length > 100) {
      report.attempts.push({ ...source, query, attempted: false, reason: 'QUERY_TOO_LONG_OR_EMPTY' });
      continue;
    }
    const delay = Math.max(0, previousStart + Math.max(1500, intervalMs) - now());
    if (delay) await sleepImpl(delay);
    previousStart = now(); report.executedQueries++;
    const attempt = { ...source, query, attempted: true, startedAt: new Date(previousStart).toISOString() };
    try {
      const result = await service.search(query);
      const candidates = Array.isArray(result?.tracks) ? result.tracks.slice(0, 6) : [];
      attempt.publicCandidates = candidates.length;
      const seen = new Set();
      const match = candidates.find(candidate => {
        if (!candidate?.id || seen.has(candidate.id)) return false;
        seen.add(candidate.id); return isSameRecording(source, candidate);
      });
      if (match) {
        attempt.reason = 'VERIFIED_PUBLIC_MATCH';
        report.matches[source.id] = { url: match.permalinkUrl, name: match.name || match.title, artist: match.artist,
          durationMs: match.durationMs, fullDurationMs: match.fullDurationMs,
          evidence: { availability: 'public_full', method: 'public_page_metadata', sourceUrl: match.sourceUrl || match.permalinkUrl,
            checkedAt: new Date(now()).toISOString(), titleMatch: true, primaryArtistMatch: true } };
        attempt.match = report.matches[source.id];
      } else { attempt.reason = 'NO_EXACT_PUBLIC_MATCH'; }
    } catch (error) {
      attempt.reason = typeof error?.code === 'string' ? error.code : 'NETWORK_OR_PLATFORM_ERROR';
      attempt.status = Number.isInteger(error?.status) ? error.status : 502;
      if (attempt.reason === 'UPSTREAM_BLOCKED') {
        report.stopped = { code: attempt.reason, status: attempt.status,
          message: 'The platform denied this request; no retries or alternate endpoints were used.' };
      }
    }
    report.attempts.push(attempt); onAttempt(attempt);
  }
  report.verifiedMatches = Object.keys(report.matches).length;
  report.unresolved = report.attempts.filter(attempt => attempt.reason !== 'VERIFIED_PUBLIC_MATCH')
    .map(({ id, name, artist, attempted, reason, status }) => ({ id, name, artist, attempted, reason, ...(status ? { status } : {}) }));
  return report;
}

async function fetchPlaylist(config) {
  if (config.endpoint !== META_ENDPOINT || !/^[1-9]\d{0,19}$/.test(config.playlistId || '')) throw new Error('PLAYLIST_CONFIGURATION_INVALID');
  const url = new URL(META_ENDPOINT); url.searchParams.set('server', 'netease');
  url.searchParams.set('type', 'playlist'); url.searchParams.set('id', config.playlistId);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal: controller.signal });
    if (response.status !== 200 || Number(response.headers.get('content-length')) > 1048576) throw new Error('PLAYLIST_UNAVAILABLE');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let text = '', size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1048576) { await reader.cancel(); throw new Error('PLAYLIST_RESPONSE_TOO_LARGE'); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    return playlistMetadata(JSON.parse(text));
  } finally { clearTimeout(timer); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--limit' && /^\d+$/.test(args[1]))) throw new Error('Usage: node tools/music/index-playlist.mjs [--limit 1..12]');
  const limit = limitOf(args.length ? Number(args[1]) : MAX_QUERIES);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const config = JSON.parse(await readFile(resolve(root, 'source/data/music.json'), 'utf8'));
  const playlist = await fetchPlaylist(config);
  const report = await auditDefaultPlaylist({ playlist, service: createOpenAudioService(), limit,
    onAttempt: item => console.log(JSON.stringify({ id: item.id, name: item.name, reason: item.reason,
      ...(item.match ? { url: item.match.url } : {}) })) });
  report.playlistId = config.playlistId; report.playlistName = config.playlistName;
  const output = resolve(root, 'work/music/default-audio-audit.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ output, executedQueries: report.executedQueries, verifiedMatches: report.verifiedMatches, stopped: report.stopped }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

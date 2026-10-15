'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteMusicMatch = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const unknownArtists = new Set(['未知歌手', '未知作者', '未知用户', '用户已注销', '账号已注销', '帐号已注销',
    '已注销', 'unknown', 'unknownartist', 'unknownuser', 'deleteduser', 'deletedaccount', 'soundclouduser', 'anonymous']);

  function text(value) {
    return typeof value === 'string' && value.length <= 1000 && !/[\p{Cc}\p{Cf}]/u.test(value) ? value.normalize('NFKC').trim() : '';
  }

  // Version and collaborator words remain part of the identity. Only typography
  // and the conventional feat./ft. spelling may vary.
  function recordingName(value) {
    return text(value).toLowerCase().replace(/\b(?:feat|ft)\.?\b/g, 'feat').replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function primaryArtist(value) { return text(value).split(/[\/;]/)[0].trim(); }

  function knownArtist(value) {
    const name = recordingName(value);
    return Boolean(name && !unknownArtists.has(name) && !/^(?:user|soundclouduser)\d+$/.test(name));
  }

  function catalogArtists(value) {
    const names = text(value).split(/[\/;]/).map(part => part.trim());
    if (!names.length || names.some(part => !knownArtist(part))) return [];
    const normalized = names.map(recordingName);
    return new Set(normalized).size === normalized.length ? normalized : [];
  }

  function completeAttribution(value, artists) {
    if (!value || !artists.length) return false;
    // A single artist can legitimately contain "and" or "&" in their name.
    if (artists.length === 1) return recordingName(value) === artists[0];
    const parts = value.split(/\s+and\s+|\s*[&\/;]\s*/i).map(recordingName);
    return parts.length === artists.length && new Set(parts).size === parts.length
      && parts.every(part => artists.includes(part));
  }

  function titleIdentity(songName, trackName, artists) {
    const expected = recordingName(songName), candidate = text(trackName);
    if (!expected || !candidate) return null;
    if (expected === recordingName(candidate)) return { attributionRemoved: false };
    // Only a spaced dash can introduce a trailing attribution. Inspecting every
    // dash preserves preceding title/version text instead of guessing a title.
    const separator = /\s+[-–—]\s+/g;
    let match;
    while ((match = separator.exec(candidate))) {
      const title = candidate.slice(0, match.index), attribution = candidate.slice(separator.lastIndex);
      if (recordingName(title) === expected && completeAttribution(attribution, artists)) return { attributionRemoved: true };
    }
    return null;
  }

  function fullRecording(track) {
    if (track?.availability !== 'public_full') return 'NOT_PUBLIC_FULL';
    if (!Number.isSafeInteger(track.durationMs) || track.durationMs < 1000 || track.durationMs > 86400000) return 'INVALID_DURATION';
    if (track.provider === 'soundcloud') {
      if (!Number.isSafeInteger(track.fullDurationMs) || track.fullDurationMs < 1000 || track.fullDurationMs > 86400000
        || Math.abs(track.durationMs - track.fullDurationMs) > 3000) return 'INCOMPLETE_DURATION';
    } else if (track.provider !== 'audius') return 'UNSUPPORTED_PROVIDER';
    return '';
  }

  function explainMatch(song, track) {
    const unavailable = fullRecording(track);
    if (unavailable) return { match: false, reason: unavailable };
    const artists = catalogArtists(song?.artist);
    if (!artists.length || !knownArtist(track.artist)) return { match: false, reason: 'UNKNOWN_ARTIST' };
    // The uploader field must match the catalog's primary artist. Artist names
    // occurring in a title do not establish who uploaded a recording.
    if (artists[0] !== recordingName(track.artist)) return { match: false, reason: 'ARTIST_MISMATCH' };
    const title = titleIdentity(song?.name, track.name, artists);
    return title ? { match: true, reason: 'EXACT_RECORDING_METADATA', ...title }
      : { match: false, reason: 'TITLE_MISMATCH' };
  }

  function sameRecording(song, track) { return explainMatch(song, track).match; }
  return { recordingName, primaryArtist, sameRecording, explainMatch };
});

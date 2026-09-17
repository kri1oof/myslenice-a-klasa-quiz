export function played(match) {
  const state = String(match?.state || '').trim().toLocaleLowerCase('pl-PL');
  if (!state || state.includes('nierozegr')) return false;
  return state === 'rozegrany' || state === 'rozegrana' || state === 'played' || state === 'completed';
}

export function matchFingerprint(match) {
  const scores = match?.scores || {};
  const host = match?.host || {};
  const guest = match?.guest || {};
  return JSON.stringify({
    matchId: match?.matchId || null,
    state: match?.state || null,
    queue: match?.queue ?? null,
    dateTime: match?.dateTime || null,
    hostId: host?.id || null,
    hostName: host?.name || null,
    guestId: guest?.id || null,
    guestName: guest?.name || null,
    final: scores?.final || scores?.fullTime || null,
    half: scores?.half || null,
  });
}

export function indexMatches(matches) {
  return new Map((Array.isArray(matches) ? matches : [])
    .filter((m) => m?.matchId)
    .map((m) => [m.matchId, m]));
}

export function selectEventMatches(matches, cachedMatches = [], cachedEvents = {}, force = false) {
  const oldById = indexMatches(cachedMatches);
  return (Array.isArray(matches) ? matches : []).filter((match) => {
    if (!played(match) || !match?.matchId) return false;
    if (force) return true;
    const old = oldById.get(match.matchId);
    if (!cachedEvents?.[match.matchId]) return true;
    if (!old) return true;
    return matchFingerprint(old) !== matchFingerprint(match);
  });
}

export function shouldFreezeSeason(label, cachedSeason, force = false, currentSeason = '2026/27') {
  return label !== currentSeason && Boolean(cachedSeason) && !force;
}

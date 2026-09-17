import { chromium } from 'playwright';
import fs from 'node:fs';
import { played, selectEventMatches, shouldFreezeSeason } from './lnp_sync_helpers.mjs';

const SEASONS = [
  { label: '2024/25', id: '4be7b40c-84ff-4e5a-96e5-875d7f13483a', playId: 'e8609430-5f3f-4dea-8aac-c2184e985bfc', playName: 'Myślenice: Klasa A' },
  { label: '2025/26', id: 'e9d66181-d03e-4bb3-b889-4da848f4831d', playId: '83230fb6-b571-4c0d-ac1b-77d1a5d42475', playName: 'Myślenice: Klasa A "KEEZA"' },
  { label: '2026/27', id: '3c77d143-8010-4073-9842-d6b63365ffce', playId: '081b0700-ae25-4be8-a2bd-e38cad5bfc50', playName: 'Myślenice: Klasa A' },
];
const START_URL = 'https://www.laczynaspilka.pl/rozgrywki?season=3c77d143-8010-4073-9842-d6b63365ffce&group=081b0700-ae25-4be8-a2bd-e38cad5bfc50&genderType=Male';
const OUT = process.env.LNP_OUT || 'lnp_myslenice.json';
const CACHE = process.env.LNP_CACHE || '';
const FORCE_FULL = /^(1|true|yes)$/i.test(process.env.LNP_FORCE_FULL || '');
const CHUNK = Number(process.env.LNP_CHUNK || 24);
const EVENT_RETRIES = Number(process.env.LNP_EVENT_RETRIES || 3);
const EVENT_RETRY_BASE_MS = Number(process.env.LNP_EVENT_RETRY_BASE_MS || 15000);
const PLAYER_RETRIES = Number(process.env.LNP_PLAYER_RETRIES || 3);
const PLAYER_RETRY_BASE_MS = Number(process.env.LNP_PLAYER_RETRY_BASE_MS || 15000);

function loadCache() {
  if (!CACHE || !fs.existsSync(CACHE)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (!parsed?.seasons || typeof parsed.seasons !== 'object') return null;
    console.log('CACHE_LOADED', CACHE, Object.keys(parsed.seasons).join(','));
    return parsed;
  } catch (e) {
    console.log('CACHE_INVALID', CACHE, String(e));
    return null;
  }
}

const cached = loadCache();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
const page = await context.newPage();
page.setDefaultNavigationTimeout(90000);

let token = null;
let tokenAt = 0;
let apiBase = cached?.apiBase || null;
let authStatus = null;
page.on('response', async (resp) => {
  if (!resp.url().includes('/Authorize/recaptcha')) return;
  authStatus = resp.status();
  if (resp.status() !== 200) return;
  try {
    const body = (await resp.text()).replace(/^"|"$/g, '');
    if (body.split('.').length === 3) {
      token = body;
      tokenAt = Date.now();
      apiBase = resp.url().split('Authorize/recaptcha')[0];
      console.log('TOKEN', apiBase);
    }
  } catch {}
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitToken(maxMs = 12000) {
  for (let t = 0; t < maxMs; t += 100) {
    if (token && Date.now() - tokenAt < 1500) return token;
    if (authStatus === 403 || authStatus === 429) break;
    await sleep(100);
  }
  return null;
}

async function mintToken() {
  for (let attempt = 0; attempt < 3; attempt++) {
    token = null;
    tokenAt = 0;
    authStatus = null;
    if (!page.url().includes('laczynaspilka.pl/rozgrywki')) {
      await page.goto(START_URL, { waitUntil: 'commit', timeout: 90000 }).catch(() => undefined);
    } else {
      await page.reload({ waitUntil: 'commit', timeout: 90000 }).catch(() => undefined);
    }
    let tk = await waitToken();
    if (tk) return tk;
    console.log('TOKEN_MISS', authStatus, 'attempt', attempt + 1, page.url());
    if (authStatus === 429) await sleep(15000 * (attempt + 1));
    else await sleep(1500);
    await page.goto(START_URL, { waitUntil: 'commit', timeout: 90000 }).catch(() => undefined);
    tk = await waitToken();
    if (tk) return tk;
  }
  throw new Error(`Brak świeżego tokenu ŁNP (status ${authStatus ?? 'n/a'})`);
}

async function fire(endpoints, tk) {
  if (!apiBase) throw new Error('Nie ustalono API base');
  return await page.evaluate(async ({ base, bearer, eps }) => {
    return await Promise.all(eps.map(async (endpoint) => {
      try {
        const r = await fetch(base + endpoint, { headers: { Authorization: 'Bearer ' + bearer } });
        const txt = await r.text();
        let data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch {}
        return { endpoint, status: r.status, data };
      } catch (e) {
        return { endpoint, status: -1, data: null, error: String(e) };
      }
    }));
  }, { base: apiBase, bearer: tk, eps: endpoints });
}

async function fetchChunk(endpoints) {
  if (!endpoints.length) return [];
  let tk = await mintToken();
  let out = await fire(endpoints, tk);
  if (out.some((x) => x.status === 401 || x.status === 403)) {
    console.log('AUTH_RETRY', endpoints[0], endpoints.length);
    tk = await mintToken();
    out = await fire(endpoints, tk);
  }
  return out;
}

async function fetchAll(endpoints, label, checkpoint) {
  const out = [];
  for (let i = 0; i < endpoints.length; i += CHUNK) {
    const eps = endpoints.slice(i, i + CHUNK);
    try {
      const rows = await fetchChunk(eps);
      out.push(...rows);
      const ok = rows.filter((x) => x.status === 200).length;
      console.log(`${label} ${Math.min(i + eps.length, endpoints.length)}/${endpoints.length}: ${ok}/${eps.length} OK`);
    } catch (e) {
      console.log('CHUNK_ERROR', label, i, String(e));
      out.push(...eps.map((endpoint) => ({ endpoint, status: 0, data: null, error: String(e) })));
    }
    if (checkpoint) checkpoint(out);
    if (i + CHUNK < endpoints.length) await sleep(900);
  }
  return out;
}

function save(result) {
  result.apiBase = apiBase;
  result.fetchedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
}

function collectPlayerIds(seasonData) {
  const ids = new Set();
  for (const event of Object.values(seasonData?.events || {})) {
    if (!event) continue;
    for (const side of ['host', 'guest']) {
      for (const p of event?.[side]?.squad || []) if (p?.id) ids.add(p.id);
    }
  }
  return ids;
}

function attachPlayerProfile(result, playerIdsBySeason, id, row) {
  if (!id || row?.status !== 200 || !row.data) return;
  for (const season of SEASONS) {
    if (playerIdsBySeason[season.label]?.has(id) && result.seasons[season.label]) {
      result.seasons[season.label].players[id] = row.data;
    }
  }
}

function copyReusableEvents(matches, cachedSeason) {
  const currentPlayedIds = new Set(matches.filter(played).map((m) => m.matchId));
  return Object.fromEntries(Object.entries(cachedSeason?.events || {}).filter(([id]) => currentPlayedIds.has(id)));
}

console.log('OPEN', START_URL);
await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await waitToken(15000);
console.log('PAGE', await page.title(), page.url());

const result = {
  schemaVersion: 2,
  fetchedAt: new Date().toISOString(),
  source: 'https://www.laczynaspilka.pl/rozgrywki',
  apiBase,
  competition: 'Myślenice: Klasa A',
  cacheSource: cached ? CACHE : null,
  forceFull: FORCE_FULL,
  seasons: {},
  errors: [],
  syncStats: {},
};

const playerIdsBySeason = {};

for (const season of SEASONS) {
  console.log('\nSEASON', season.label);
  const cachedSeason = cached?.seasons?.[season.label] || null;

  if (shouldFreezeSeason(season.label, cachedSeason, FORCE_FULL)) {
    result.seasons[season.label] = structuredClone(cachedSeason);
    const ids = collectPlayerIds(result.seasons[season.label]);
    playerIdsBySeason[season.label] = ids;
    result.syncStats[season.label] = {
      mode: 'frozen-cache',
      matches: result.seasons[season.label].matches?.length || 0,
      eventRequests: 0,
      cachedEvents: Object.keys(result.seasons[season.label].events || {}).length,
      playerIds: ids.size,
    };
    console.log('FROZEN_CACHE', season.label, 'events', result.syncStats[season.label].cachedEvents, 'players', ids.size);
    save(result);
    continue;
  }

  const [tableRes, matchesRes] = await fetchChunk([
    `plays/${season.playId}/advanced-tables`,
    `plays/${season.playId}/matches`,
  ]);
  if (matchesRes?.status !== 200 || !Array.isArray(matchesRes.data)) {
    result.errors.push(`${season.label}: matches status ${matchesRes?.status}`);
    if (cachedSeason) {
      console.log('MATCH_LIST_FALLBACK_TO_CACHE', season.label);
      result.seasons[season.label] = structuredClone(cachedSeason);
      playerIdsBySeason[season.label] = collectPlayerIds(result.seasons[season.label]);
      result.syncStats[season.label] = { mode: 'cache-fallback', eventRequests: 0 };
    }
    save(result);
    continue;
  }

  const matches = matchesRes.data;
  const events = FORCE_FULL ? {} : copyReusableEvents(matches, cachedSeason);
  const players = FORCE_FULL ? {} : structuredClone(cachedSeason?.players || {});
  result.seasons[season.label] = {
    seasonId: season.id,
    playId: season.playId,
    playName: season.playName,
    table: tableRes?.status === 200 ? tableRes.data : (cachedSeason?.table || null),
    matches,
    events,
    players,
  };

  const playedMatches = matches.filter(played);
  const eventMatches = selectEventMatches(matches, cachedSeason?.matches || [], cachedSeason?.events || {}, FORCE_FULL);
  console.log('MATCHES', matches.length, 'PLAYED', playedMatches.length, 'EVENTS_TO_FETCH', eventMatches.length, 'EVENTS_FROM_CACHE', Object.keys(events).length);
  save(result);

  const eventEndpoints = eventMatches.map((m) => `matches/${m.matchId}/events`);
  const eventRows = await fetchAll(eventEndpoints, `${season.label} events`, (partial) => {
    partial.forEach((r, idx) => {
      const m = eventMatches[idx];
      if (m && r?.status === 200 && r.data) result.seasons[season.label].events[m.matchId] = r.data;
    });
    save(result);
  });

  for (let attempt = 1; attempt <= EVENT_RETRIES; attempt++) {
    const retryIndexes = [];
    eventRows.forEach((r, idx) => { if (r?.status === 429) retryIndexes.push(idx); });
    if (!retryIndexes.length) break;
    const waitMs = EVENT_RETRY_BASE_MS * attempt;
    console.log('EVENT_RATE_LIMIT_RETRY', season.label, attempt, 'pending', retryIndexes.length, 'waitMs', waitMs);
    await sleep(waitMs);
    const retryRows = await fetchAll(retryIndexes.map((idx) => eventEndpoints[idx]), `${season.label} events retry ${attempt}`, null);
    retryIndexes.forEach((originalIdx, retryIdx) => {
      const row = retryRows[retryIdx];
      if (row) eventRows[originalIdx] = row;
      const match = eventMatches[originalIdx];
      if (match && row?.status === 200 && row.data) result.seasons[season.label].events[match.matchId] = row.data;
    });
    save(result);
  }

  eventMatches.forEach((m, i) => {
    const r = eventRows[i];
    if (r?.status !== 200 || !r.data) result.errors.push(`${season.label} match ${m.matchId}: events status ${r?.status}`);
  });

  const ids = collectPlayerIds(result.seasons[season.label]);
  playerIdsBySeason[season.label] = ids;
  result.syncStats[season.label] = {
    mode: cachedSeason && !FORCE_FULL ? 'incremental' : 'full',
    matches: matches.length,
    playedMatches: playedMatches.length,
    eventRequests: eventMatches.length,
    cachedEvents: playedMatches.length - eventMatches.length,
    playerIds: ids.size,
  };
  console.log('PLAYERS_DISCOVERED', season.label, ids.size);
  save(result);
}

const missingProfileIds = new Set();
for (const season of SEASONS) {
  const data = result.seasons[season.label];
  if (!data) continue;
  for (const id of playerIdsBySeason[season.label] || []) {
    if (!data.players?.[id]) missingProfileIds.add(id);
  }
}

const allIds = [...missingProfileIds];
console.log('\nPLAYER_PROFILES_TO_FETCH', allIds.length);
const playerEndpoints = allIds.map((id) => `players/${id}`);
const playerRows = await fetchAll(playerEndpoints, 'players', (partial) => {
  partial.forEach((r, idx) => attachPlayerProfile(result, playerIdsBySeason, allIds[idx], r));
  save(result);
});

for (let attempt = 1; attempt <= PLAYER_RETRIES; attempt++) {
  const retryIndexes = [];
  playerRows.forEach((r, idx) => { if (r?.status === 429) retryIndexes.push(idx); });
  if (!retryIndexes.length) break;
  const waitMs = PLAYER_RETRY_BASE_MS * attempt;
  console.log('PLAYER_RATE_LIMIT_RETRY', attempt, 'pending', retryIndexes.length, 'waitMs', waitMs);
  await sleep(waitMs);
  const retryRows = await fetchAll(retryIndexes.map((idx) => playerEndpoints[idx]), `players retry ${attempt}`, null);
  retryIndexes.forEach((originalIdx, retryIdx) => {
    const row = retryRows[retryIdx];
    if (row) playerRows[originalIdx] = row;
    attachPlayerProfile(result, playerIdsBySeason, allIds[originalIdx], row);
  });
  save(result);
}

allIds.forEach((id, i) => {
  const r = playerRows[i];
  if (r?.status !== 200 || !r.data) result.errors.push(`player ${id}: status ${r?.status}`);
});
result.syncStats.playerProfileRequests = allIds.length;
result.syncStats.totalEventRequests = Object.values(result.syncStats)
  .filter((x) => x && typeof x === 'object' && Number.isFinite(x.eventRequests))
  .reduce((sum, x) => sum + x.eventRequests, 0);

save(result);
console.log('SYNC_STATS', JSON.stringify(result.syncStats));
console.log('DONE', OUT, 'errors', result.errors.length);
await browser.close();

import { chromium } from 'playwright';
import fs from 'node:fs';
import { played } from './lnp_sync_helpers.mjs';

const START_URL = 'https://www.laczynaspilka.pl/rozgrywki?season=3c77d143-8010-4073-9842-d6b63365ffce&group=081b0700-ae25-4be8-a2bd-e38cad5bfc50&genderType=Male';
const CLASS_A_ID = '63d04023-727a-4c0c-a8c6-4154fe1104b7';
const MALOPOLSKA_ID = '143a5a9a-5aa8-4186-ac19-d39e1d198ddb';
const OUT = process.env.LNP_OUT || 'lnp_myslenice_history.json';
const CACHE = process.env.LNP_CACHE || '';
const CHUNK = Math.max(1, Number(process.env.LNP_CHUNK || 20));
const RETRIES = Math.max(0, Number(process.env.LNP_RETRIES || 3));
const RETRY_BASE_MS = Math.max(1000, Number(process.env.LNP_RETRY_BASE_MS || 12000));
const MIN_START_YEAR = Number(process.env.LNP_MIN_START_YEAR || 1900);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadCache() {
  if (!CACHE || !fs.existsSync(CACHE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch (error) {
    console.log('CACHE_INVALID', String(error));
    return null;
  }
}

function seasonLabel(name) {
  const match = String(name || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) return null;
  return `${match[1]}/${match[2].slice(2)}`;
}

function seasonStart(label) {
  const match = String(label || '').match(/^(\d{4})\//);
  return match ? Number(match[1]) : 0;
}

function isMyśleniceA(name) {
  return /^Myślenice:\s*Klasa A(?:\s+"[^"]+")?$/i.test(String(name || '').trim());
}

function collectPlayerIds(seasonData) {
  const ids = new Set();
  for (const event of Object.values(seasonData?.events || {})) {
    if (!event) continue;
    for (const side of ['host', 'guest']) {
      for (const player of event?.[side]?.squad || []) {
        if (player?.id) ids.add(player.id);
      }
    }
  }
  return ids;
}

function mergeCachePlayers(cache, seasons, playerId) {
  for (const [label, season] of Object.entries(seasons)) {
    if (season?.players?.[playerId]) return season.players[playerId];
    if (cache?.seasons?.[label]?.players?.[playerId]) return cache.seasons[label].players[playerId];
  }
  return null;
}

const cache = loadCache();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale:'pl-PL', timezoneId:'Europe/Warsaw' });
const page = await context.newPage();
page.setDefaultNavigationTimeout(90000);

let token = null;
let tokenAt = 0;
let apiBase = cache?.apiBase || null;
let authStatus = null;

page.on('response', async response => {
  if (!response.url().includes('/Authorize/recaptcha')) return;
  authStatus = response.status();
  if (response.status() !== 200) return;
  try {
    const body = (await response.text()).replace(/^"|"$/g, '');
    if (body.split('.').length === 3) {
      token = body;
      tokenAt = Date.now();
      apiBase = response.url().split('Authorize/recaptcha')[0];
    }
  } catch {}
});

async function waitToken(maxMs = 12000) {
  for (let t = 0; t < maxMs; t += 100) {
    if (token && Date.now() - tokenAt < 1800) return token;
    if (authStatus === 403 || authStatus === 429) break;
    await sleep(100);
  }
  return null;
}

async function mintToken() {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    token = null;
    tokenAt = 0;
    authStatus = null;
    if (!page.url().includes('laczynaspilka.pl/rozgrywki')) {
      await page.goto(START_URL, { waitUntil:'commit', timeout:90000 }).catch(() => undefined);
    } else {
      await page.reload({ waitUntil:'commit', timeout:90000 }).catch(() => undefined);
    }
    const fresh = await waitToken();
    if (fresh) return fresh;
    console.log('TOKEN_MISS', attempt, authStatus);
    await sleep(authStatus === 429 ? 12000 * attempt : 1500 * attempt);
  }
  throw new Error(`Brak świeżego tokenu ŁNP (status ${authStatus ?? 'n/a'})`);
}

async function fire(endpoints, bearer) {
  if (!apiBase) throw new Error('Nie ustalono API base');
  return page.evaluate(async ({ base, bearer, endpoints }) => {
    return Promise.all(endpoints.map(async endpoint => {
      try {
        const response = await fetch(base + endpoint, { headers:{ Authorization:`Bearer ${bearer}` } });
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch {}
        return { endpoint, status:response.status, data };
      } catch (error) {
        return { endpoint, status:-1, data:null, error:String(error) };
      }
    }));
  }, { base:apiBase, bearer, endpoints });
}

async function fetchChunk(endpoints) {
  if (!endpoints.length) return [];
  let bearer = await mintToken();
  let rows = await fire(endpoints, bearer);
  if (rows.some(row => row.status === 401 || row.status === 403)) {
    bearer = await mintToken();
    rows = await fire(endpoints, bearer);
  }
  return rows;
}

async function fetchAll(endpoints, label, onPartial = null) {
  const rows = [];
  for (let i = 0; i < endpoints.length; i += CHUNK) {
    const chunk = endpoints.slice(i, i + CHUNK);
    let chunkRows = await fetchChunk(chunk).catch(error => chunk.map(endpoint => ({ endpoint, status:0, data:null, error:String(error) })));
    rows.push(...chunkRows);
    if (onPartial) onPartial(rows);
    const ok = chunkRows.filter(row => row.status === 200).length;
    console.log(label, `${Math.min(i + chunk.length, endpoints.length)}/${endpoints.length}`, `${ok}/${chunk.length} OK`);
    if (i + CHUNK < endpoints.length) await sleep(700);
  }
  return rows;
}

async function retryRateLimited(endpoints, rows, label, onSuccess) {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    const pending = rows.map((row, index) => ({ row, index })).filter(({ row }) => row?.status === 429 || row?.status === 0 || row?.status === -1);
    if (!pending.length) break;
    const waitMs = RETRY_BASE_MS * attempt;
    console.log('RETRY', label, attempt, 'pending', pending.length, 'waitMs', waitMs);
    await sleep(waitMs);
    const retried = await fetchAll(pending.map(item => endpoints[item.index]), `${label} retry ${attempt}`);
    pending.forEach((item, retryIndex) => {
      const row = retried[retryIndex];
      if (row) rows[item.index] = row;
      if (row?.status === 200 && row.data != null && onSuccess) onSuccess(item.index, row);
    });
  }
}

const result = {
  schemaVersion:3,
  source:'https://www.laczynaspilka.pl/rozgrywki',
  competition:'Myślenice: Klasa A',
  apiBase:null,
  fetchedAt:new Date().toISOString(),
  cacheSource:cache ? CACHE : null,
  discovery:{ officialSeasons:[], included:[], missingPlay:[], ambiguousPlay:[], failedPlayLookup:[] },
  seasons:{},
  warnings:[],
  errors:[],
  syncStats:{},
};

function save() {
  result.apiBase = apiBase;
  result.fetchedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
}

console.log('OPEN', START_URL);
await page.goto(START_URL, { waitUntil:'domcontentloaded', timeout:90000 });
await waitToken(15000);

const seasonDictionary = (await fetchChunk(['seasons/dictionaries']))[0];
if (seasonDictionary?.status !== 200 || !Array.isArray(seasonDictionary.data)) {
  throw new Error(`Nie udało się pobrać słownika sezonów: ${seasonDictionary?.status}`);
}

const officialSeasons = seasonDictionary.data
  .map(item => ({ id:item.id, name:item.name, label:seasonLabel(item.name), isCurrent:Boolean(item.isCurrent) }))
  .filter(item => item.id && item.label && seasonStart(item.label) >= MIN_START_YEAR)
  .sort((a,b) => seasonStart(b.label) - seasonStart(a.label));
result.discovery.officialSeasons = officialSeasons;
console.log('OFFICIAL_SEASONS', officialSeasons.map(item => item.label).join(','));

const playEndpoints = officialSeasons.map(season => `leagues/${CLASS_A_ID}/seasons/${season.id}/ZPNs/${MALOPOLSKA_ID}/play-dictionaries`);
const playRows = await fetchAll(playEndpoints, 'play dictionaries');
await retryRateLimited(playEndpoints, playRows, 'play dictionaries');

const discovered = [];
officialSeasons.forEach((season, index) => {
  const row = playRows[index];
  if (row?.status !== 200 || !Array.isArray(row.data)) {
    result.discovery.failedPlayLookup.push({ season:season.label, status:row?.status ?? null });
    return;
  }
  const candidates = row.data.filter(item => item?.id && isMyśleniceA(item.name));
  if (candidates.length === 1) {
    const play = candidates[0];
    const entry = { ...season, playId:play.id, playName:play.name };
    discovered.push(entry);
    result.discovery.included.push({ season:season.label, seasonId:season.id, playId:play.id, playName:play.name });
  } else if (!candidates.length) {
    result.discovery.missingPlay.push({ season:season.label });
  } else {
    result.discovery.ambiguousPlay.push({ season:season.label, candidates:candidates.map(item => ({ id:item.id, name:item.name })) });
  }
});
save();
console.log('DISCOVERED_PLAYS', discovered.length, discovered.map(item => `${item.label}:${item.playName}`).join(' | '));

for (const season of discovered) {
  console.log('\nSEASON', season.label, season.playId, season.playName);
  const cachedSeason = cache?.seasons?.[season.label] || null;
  if (cachedSeason && !season.isCurrent) {
    result.seasons[season.label] = structuredClone(cachedSeason);
    result.seasons[season.label].seasonId = season.id;
    result.seasons[season.label].playId = season.playId;
    result.seasons[season.label].playName = season.playName;
    const ids = collectPlayerIds(result.seasons[season.label]);
    result.syncStats[season.label] = {
      mode:'frozen-cache',
      matches:result.seasons[season.label].matches?.length || 0,
      playedMatches:(result.seasons[season.label].matches || []).filter(played).length,
      events:Object.keys(result.seasons[season.label].events || {}).length,
      players:Object.keys(result.seasons[season.label].players || {}).length,
      discoveredPlayerIds:ids.size,
    };
    console.log('FROZEN_CACHE', season.label, result.syncStats[season.label]);
    save();
    continue;
  }

  const [tableRow, matchesRow] = await fetchChunk([
    `plays/${season.playId}/advanced-tables`,
    `plays/${season.playId}/matches`,
  ]);
  if (matchesRow?.status !== 200 || !Array.isArray(matchesRow.data)) {
    result.errors.push({ season:season.label, stage:'matches', status:matchesRow?.status ?? null });
    if (cachedSeason) {
      result.seasons[season.label] = structuredClone(cachedSeason);
      result.syncStats[season.label] = { mode:'cache-fallback', matches:cachedSeason.matches?.length || 0 };
    }
    save();
    continue;
  }

  const matches = matchesRow.data;
  const playedMatches = matches.filter(played);
  const events = {};
  const cachedEvents = cachedSeason?.events || {};
  for (const match of playedMatches) {
    if (cachedEvents[match.matchId]) events[match.matchId] = structuredClone(cachedEvents[match.matchId]);
  }

  result.seasons[season.label] = {
    seasonId:season.id,
    playId:season.playId,
    playName:season.playName,
    table:tableRow?.status === 200 ? tableRow.data : (cachedSeason?.table || null),
    matches,
    events,
    players:structuredClone(cachedSeason?.players || {}),
  };
  save();

  const missingEventMatches = playedMatches.filter(match => !events[match.matchId]);
  const eventEndpoints = missingEventMatches.map(match => `matches/${match.matchId}/events`);
  const eventRows = await fetchAll(eventEndpoints, `${season.label} events`, partial => {
    partial.forEach((row, idx) => {
      const match = missingEventMatches[idx];
      if (match && row?.status === 200 && row.data != null) result.seasons[season.label].events[match.matchId] = row.data;
    });
    save();
  });
  await retryRateLimited(eventEndpoints, eventRows, `${season.label} events`, (idx, row) => {
    const match = missingEventMatches[idx];
    if (match) result.seasons[season.label].events[match.matchId] = row.data;
    save();
  });

  missingEventMatches.forEach((match, idx) => {
    const row = eventRows[idx];
    if (row?.status !== 200 || row.data == null) {
      result.warnings.push({ season:season.label, stage:'events', matchId:match.matchId, status:row?.status ?? null });
    }
  });

  const ids = collectPlayerIds(result.seasons[season.label]);
  result.syncStats[season.label] = {
    mode:cachedSeason ? 'incremental' : 'full',
    matches:matches.length,
    playedMatches:playedMatches.length,
    eventRequests:missingEventMatches.length,
    events:Object.keys(result.seasons[season.label].events).length,
    discoveredPlayerIds:ids.size,
  };
  console.log('SEASON_DONE', season.label, JSON.stringify(result.syncStats[season.label]));
  save();
}

const playerSeasons = {};
for (const [label, season] of Object.entries(result.seasons)) {
  for (const id of collectPlayerIds(season)) {
    if (!playerSeasons[id]) playerSeasons[id] = new Set();
    playerSeasons[id].add(label);
  }
}

const playerIds = Object.keys(playerSeasons);
const missingPlayerIds = playerIds.filter(id => !mergeCachePlayers(cache, result.seasons, id));
console.log('\nPLAYERS_TOTAL', playerIds.length, 'TO_FETCH', missingPlayerIds.length);
const playerEndpoints = missingPlayerIds.map(id => `players/${id}`);
const playerRows = await fetchAll(playerEndpoints, 'player profiles', partial => {
  partial.forEach((row, idx) => {
    const id = missingPlayerIds[idx];
    if (!id || row?.status !== 200 || !row.data) return;
    for (const label of playerSeasons[id] || []) result.seasons[label].players[id] = row.data;
  });
  save();
});
await retryRateLimited(playerEndpoints, playerRows, 'player profiles', (idx, row) => {
  const id = missingPlayerIds[idx];
  for (const label of playerSeasons[id] || []) result.seasons[label].players[id] = row.data;
  save();
});

for (const id of playerIds) {
  const cachedProfile = mergeCachePlayers(cache, result.seasons, id);
  if (!cachedProfile) continue;
  for (const label of playerSeasons[id] || []) {
    if (!result.seasons[label].players[id]) result.seasons[label].players[id] = structuredClone(cachedProfile);
  }
}

missingPlayerIds.forEach((id, idx) => {
  const row = playerRows[idx];
  if (row?.status !== 200 || !row.data) result.warnings.push({ stage:'player', playerId:id, status:row?.status ?? null });
});

for (const [label, season] of Object.entries(result.seasons)) {
  result.syncStats[label] = {
    ...(result.syncStats[label] || {}),
    players:Object.keys(season.players || {}).length,
  };
}
result.syncStats.totalSeasons = Object.keys(result.seasons).length;
result.syncStats.totalMatches = Object.values(result.seasons).reduce((sum, season) => sum + (season.matches?.length || 0), 0);
result.syncStats.totalEvents = Object.values(result.seasons).reduce((sum, season) => sum + Object.keys(season.events || {}).length, 0);
result.syncStats.totalPlayerProfiles = Object.values(result.seasons).reduce((sum, season) => sum + Object.keys(season.players || {}).length, 0);
save();

console.log('FINAL_STATS', JSON.stringify(result.syncStats));
console.log('MISSING_PLAYS', JSON.stringify(result.discovery.missingPlay));
console.log('AMBIGUOUS_PLAYS', JSON.stringify(result.discovery.ambiguousPlay));
console.log('WARNINGS', result.warnings.length, 'ERRORS', result.errors.length);
await browser.close();

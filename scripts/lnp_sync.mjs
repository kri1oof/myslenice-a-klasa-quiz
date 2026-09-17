import { chromium } from 'playwright';
import fs from 'node:fs';

const SEASONS = [
  { label: '2025/26', id: 'e9d66181-d03e-4bb3-b889-4da848f4831d' },
  { label: '2026/27', id: '3c77d143-8010-4073-9842-d6b63365ffce' },
];
const MALOPOLSKIE = '143a5a9a-5aa8-4186-ac19-d39e1d198ddb';
const CLASS_A = '63d04023-727a-4c0c-a8c6-4154fe1104b7';
const START_URL = 'https://www.laczynaspilka.pl/rozgrywki?season=e9d66181-d03e-4bb3-b889-4da848f4831d&leagueGroup=e978c8e5-d903-4a89-b6b5-8d5da6c567ee&leagueId=337bb869-0b42-484f-8eca-0c8842a13ec9&subLeague=63d04023-727a-4c0c-a8c6-4154fe1104b7&enumType=ZpnAndLeagueAndPlay&group=83230fb6-b571-4c0d-ac1b-77d1a5d42475&voivodeship=143a5a9a-5aa8-4186-ac19-d39e1d198ddb&isAdvanceMode=true&genderType=Male';
const OUT = process.env.LNP_OUT || 'lnp_myslenice.json';
const CHUNK = Number(process.env.LNP_CHUNK || 32);
const PLAYER_RETRIES = Number(process.env.LNP_PLAYER_RETRIES || 3);
const PLAYER_RETRY_BASE_MS = Number(process.env.LNP_PLAYER_RETRY_BASE_MS || 15000);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
const page = await context.newPage();
page.setDefaultNavigationTimeout(90000);

let token = null;
let tokenAt = 0;
let apiBase = null;
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

function pickMyslenicePlay(items) {
  const candidates = (Array.isArray(items) ? items : []).filter((x) =>
    /Myślenice:\s*Klasa A/i.test(x?.name || '') && !/baraż/i.test(x?.name || '')
  );
  return candidates.find((x) => /KEEZA/i.test(x.name || '')) || candidates[0] || null;
}

function played(match) {
  const state = (match?.state || '').trim().toLowerCase();
  return state === 'rozegrany';
}

async function one(endpoint) {
  const [r] = await fetchChunk([endpoint]);
  if (!r || r.status !== 200) throw new Error(`${endpoint}: status ${r?.status}`);
  return r.data;
}

function save(result) {
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
}

function attachPlayerProfile(result, playerIdsBySeason, id, row) {
  if (!id || row?.status !== 200 || !row.data) return;
  for (const season of SEASONS) {
    if (playerIdsBySeason[season.label]?.has(id) && result.seasons[season.label]) {
      result.seasons[season.label].players[id] = row.data;
    }
  }
}

console.log('OPEN', START_URL);
await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await waitToken(15000);
console.log('PAGE', await page.title(), page.url());

const result = {
  schemaVersion: 1,
  fetchedAt: new Date().toISOString(),
  source: 'https://www.laczynaspilka.pl/rozgrywki',
  apiBase: apiBase,
  competition: 'Myślenice: Klasa A',
  seasons: {},
  errors: [],
};
save(result);

const playerIdsBySeason = {};
const allPlayerIds = new Set();

for (const season of SEASONS) {
  console.log('\nSEASON', season.label);
  const dictionaries = await one(`leagues/${CLASS_A}/seasons/${season.id}/ZPNs/${MALOPOLSKIE}/play-dictionaries`);
  const play = pickMyslenicePlay(dictionaries);
  if (!play) {
    result.errors.push(`${season.label}: nie znaleziono Myślenice Klasa A`);
    save(result);
    continue;
  }
  console.log('PLAY', play.id, play.name);
  const [tableRes, matchesRes] = await fetchChunk([
    `plays/${play.id}/advanced-tables`,
    `plays/${play.id}/matches`,
  ]);
  if (matchesRes?.status !== 200 || !Array.isArray(matchesRes.data)) {
    result.errors.push(`${season.label}: matches status ${matchesRes?.status}`);
    save(result);
    continue;
  }
  const matches = matchesRes.data;
  const eventMatches = matches.filter(played);
  console.log('MATCHES', matches.length, 'EVENTS_TO_FETCH', eventMatches.length);
  result.seasons[season.label] = {
    seasonId: season.id,
    playId: play.id,
    playName: play.name,
    table: tableRes?.status === 200 ? tableRes.data : null,
    matches,
    events: {},
    players: {},
  };
  save(result);

  const eventEndpoints = eventMatches.map((m) => `matches/${m.matchId}/events`);
  const eventRows = await fetchAll(eventEndpoints, `${season.label} events`, (partial) => {
    partial.forEach((r, idx) => {
      const m = eventMatches[idx];
      if (m && r?.status === 200 && r.data) result.seasons[season.label].events[m.matchId] = r.data;
    });
    save(result);
  });

  const playerIds = new Set();
  eventMatches.forEach((m, i) => {
    const r = eventRows[i];
    if (r?.status === 200 && r.data) {
      for (const side of ['host', 'guest']) {
        for (const p of r.data?.[side]?.squad || []) {
          if (p?.id) {
            playerIds.add(p.id);
            allPlayerIds.add(p.id);
          }
        }
      }
    } else {
      result.errors.push(`${season.label} match ${m.matchId}: events status ${r?.status}`);
    }
  });
  playerIdsBySeason[season.label] = playerIds;
  console.log('PLAYERS_DISCOVERED', season.label, playerIds.size);
  save(result);
}

console.log('\nUNIQUE_PLAYERS_TO_FETCH', allPlayerIds.size);
const allIds = [...allPlayerIds];
const playerEndpoints = allIds.map((id) => `players/${id}`);
const playerRows = await fetchAll(playerEndpoints, 'players', (partial) => {
  partial.forEach((r, idx) => attachPlayerProfile(result, playerIdsBySeason, allIds[idx], r));
  save(result);
});

for (let attempt = 1; attempt <= PLAYER_RETRIES; attempt++) {
  const retryIndexes = [];
  playerRows.forEach((r, idx) => {
    if (r?.status === 429) retryIndexes.push(idx);
  });
  if (!retryIndexes.length) break;

  const waitMs = PLAYER_RETRY_BASE_MS * attempt;
  console.log('PLAYER_RATE_LIMIT_RETRY', attempt, 'pending', retryIndexes.length, 'waitMs', waitMs);
  await sleep(waitMs);
  const retryRows = await fetchAll(
    retryIndexes.map((idx) => playerEndpoints[idx]),
    `players retry ${attempt}`,
    null,
  );
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

save(result);
console.log('DONE', OUT, 'errors', result.errors.length);
await browser.close();

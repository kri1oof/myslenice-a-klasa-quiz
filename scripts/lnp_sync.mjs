import { chromium } from 'playwright';
import fs from 'node:fs';

const SEASONS = [
  { label: '2025/26', id: 'e9d66181-d03e-4bb3-b889-4da848f4831d' },
  { label: '2026/27', id: '3c77d143-8010-4073-9842-d6b63365ffce' },
];
const LOWER_GROUP = 'e978c8e5-d903-4a89-b6b5-8d5da6c567ee';
const MALOPOLSKIE = '143a5a9a-5aa8-4186-ac19-d39e1d198ddb';
const CLASS_A = '63d04023-727a-4c0c-a8c6-4154fe1104b7';
const START_URL = 'https://www.laczynaspilka.pl/rozgrywki?season=e9d66181-d03e-4bb3-b889-4da848f4831d&leagueGroup=e978c8e5-d903-4a89-b6b5-8d5da6c567ee&leagueId=337bb869-0b42-484f-8eca-0c8842a13ec9&subLeague=63d04023-727a-4c0c-a8c6-4154fe1104b7&enumType=ZpnAndLeagueAndPlay&group=83230fb6-b571-4c0d-ac1b-77d1a5d42475&voivodeship=143a5a9a-5aa8-4186-ac19-d39e1d198ddb&isAdvanceMode=true&genderType=Male';
const OUT = process.env.LNP_OUT || 'lnp_myslenice.json';
const CHUNK = Number(process.env.LNP_CHUNK || 8);

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
    if (token && Date.now() - tokenAt < 1200) return token;
    if (authStatus === 403) break;
    await sleep(100);
  }
  return null;
}

async function mintToken() {
  token = null;
  tokenAt = 0;
  authStatus = null;
  if (!page.url().includes('laczynaspilka.pl/rozgrywki')) {
    await page.goto(START_URL, { waitUntil: 'commit', timeout: 90000 }).catch(() => undefined);
  } else {
    await page.reload({ waitUntil: 'commit', timeout: 90000 }).catch(() => undefined);
  }
  let tk = await waitToken();
  if (!tk) {
    console.log('TOKEN_MISS', authStatus, page.url());
    await page.goto(START_URL, { waitUntil: 'commit', timeout: 90000 }).catch(() => undefined);
    tk = await waitToken();
  }
  if (!tk) throw new Error(`Brak świeżego tokenu ŁNP (status ${authStatus ?? 'n/a'})`);
  return tk;
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

async function fetchAll(endpoints, label) {
  const out = [];
  for (let i = 0; i < endpoints.length; i += CHUNK) {
    const eps = endpoints.slice(i, i + CHUNK);
    const rows = await fetchChunk(eps);
    out.push(...rows);
    const ok = rows.filter((x) => x.status === 200).length;
    console.log(`${label} ${Math.min(i + eps.length, endpoints.length)}/${endpoints.length}: ${ok}/${eps.length} OK`);
    if (i + CHUNK < endpoints.length) await sleep(700);
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
  const state = (match?.state || '').toLowerCase();
  return state.includes('rozegr') && !state.includes('walkower');
}

async function one(endpoint) {
  const [r] = await fetchChunk([endpoint]);
  if (!r || r.status !== 200) throw new Error(`${endpoint}: status ${r?.status}`);
  return r.data;
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

for (const season of SEASONS) {
  console.log('\nSEASON', season.label);
  const dictionaries = await one(`leagues/${CLASS_A}/seasons/${season.id}/ZPNs/${MALOPOLSKIE}/play-dictionaries`);
  const play = pickMyslenicePlay(dictionaries);
  if (!play) {
    result.errors.push(`${season.label}: nie znaleziono Myślenice Klasa A`);
    console.log('NO_PLAY');
    continue;
  }
  console.log('PLAY', play.id, play.name);
  const [tableRes, matchesRes] = await fetchChunk([
    `plays/${play.id}/advanced-tables`,
    `plays/${play.id}/matches`,
  ]);
  if (matchesRes?.status !== 200 || !Array.isArray(matchesRes.data)) {
    result.errors.push(`${season.label}: matches status ${matchesRes?.status}`);
    continue;
  }
  const matches = matchesRes.data;
  const eventMatches = matches.filter(played);
  console.log('MATCHES', matches.length, 'EVENTS_TO_FETCH', eventMatches.length);
  const eventRows = await fetchAll(eventMatches.map((m) => `matches/${m.matchId}/events`), `${season.label} events`);
  const events = {};
  const playerIds = new Set();
  eventMatches.forEach((m, i) => {
    const r = eventRows[i];
    if (r?.status === 200 && r.data) {
      events[m.matchId] = r.data;
      for (const side of ['host', 'guest']) {
        for (const p of r.data?.[side]?.squad || []) {
          if (p?.id) playerIds.add(p.id);
        }
      }
    } else {
      result.errors.push(`${season.label} match ${m.matchId}: events status ${r?.status}`);
    }
  });
  console.log('PLAYERS_TO_FETCH', playerIds.size);
  const ids = [...playerIds];
  const playerRows = await fetchAll(ids.map((id) => `players/${id}`), `${season.label} players`);
  const players = {};
  ids.forEach((id, i) => {
    const r = playerRows[i];
    if (r?.status === 200 && r.data) players[id] = r.data;
    else result.errors.push(`${season.label} player ${id}: status ${r?.status}`);
  });
  result.seasons[season.label] = {
    seasonId: season.id,
    playId: play.id,
    playName: play.name,
    table: tableRes?.status === 200 ? tableRes.data : null,
    matches,
    events,
    players,
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('CHECKPOINT', OUT);
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('DONE', OUT, 'errors', result.errors.length);
await browser.close();

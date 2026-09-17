import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.LNP_URL || 'https://www.laczynaspilka.pl/rozgrywki?season=e9d66181-d03e-4bb3-b889-4da848f4831d&leagueGroup=e978c8e5-d903-4a89-b6b5-8d5da6c567ee&leagueId=337bb869-0b42-484f-8eca-0c8842a13ec9&subLeague=63d04023-727a-4c0c-a8c6-4154fe1104b7&enumType=ZpnAndLeagueAndPlay&group=149b24f1-7492-4744-bd74-5ce4fa3cc5a8&voivodeship=143a5a9a-5aa8-4186-ac19-d39e1d198ddb&isAdvanceMode=true&genderType=Male';

const browser = await chromium.launch({headless:true});
const context = await browser.newContext({ locale: 'pl-PL' });
const page = await context.newPage();
const captured = [];
page.on('response', async (resp) => {
  try {
    const ct = (resp.headers()['content-type'] || '').toLowerCase();
    const u = resp.url();
    if (!u.includes('laczynaspilka') && !u.includes('pzpn')) return;
    if (!ct.includes('json')) return;
    let text = await resp.text();
    if (text.length > 250000) text = text.slice(0, 250000);
    captured.push({status:resp.status(), url:u, contentType:ct, body:text});
    console.log('JSON', resp.status(), u, text.slice(0, 500).replace(/\s+/g,' '));
  } catch (e) {
    console.log('CAPTURE_ERR', String(e));
  }
});

console.log('OPEN', url);
await page.goto(url, {waitUntil:'domcontentloaded', timeout:90000});
await page.waitForTimeout(12000);
console.log('TITLE', await page.title());
console.log('URL', page.url());
const bodyText = await page.locator('body').innerText().catch(()=>'');
console.log('BODY_START\n' + bodyText.slice(0,20000));
const links = await page.locator('a').evaluateAll(nodes => nodes.map(a => ({text:(a.innerText||'').trim(), href:a.href})).filter(x=>x.text||x.href));
console.log('LINKS', JSON.stringify(links.slice(0,250)));
fs.writeFileSync('lnp_probe.json', JSON.stringify({pageUrl:page.url(), title:await page.title(), bodyText, links, captured}, null, 2));
fs.writeFileSync('lnp_probe.html', await page.content());
await page.screenshot({path:'lnp_probe.png', fullPage:true});
await browser.close();

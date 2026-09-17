import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const ux = fs.readFileSync(new URL('../web/ux-polish.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../web/ux-polish.css', import.meta.url), 'utf8');
const readability = fs.readFileSync(new URL('../web/readability.js', import.meta.url), 'utf8');

assert.match(index, /ux-polish\.css/);
assert.match(index, /ux-polish\.js/);
assert.ok(index.indexOf('readability.css') < index.indexOf('ux-polish.css'), 'UX CSS must load after readability CSS');
assert.ok(index.indexOf('readability.js') < index.indexOf('ux-polish.js'), 'UX JS must load after readability orchestration');
assert.ok(index.indexOf('ux-polish.js') < index.indexOf('dev-tools.js'), 'developer tools stay last');

assert.match(ux, /Sezon i klub/);
assert.match(ux, /Jedna rozgrywka/);
assert.match(ux, /Ustawienia kariery/);
assert.match(ux, /Ustawienia prezesa/);
assert.match(ux, /ux-auto-hidden/);
assert.match(ux, /career-table-details/);
assert.match(ux, /president-trust-details/);
assert.match(ux, /president-option-details/);
assert.match(ux, /Skutki decyzji/);
assert.match(ux, /Wybierz jedną decyzję/);
assert.match(ux, /scenario\.nextElementSibling !== hud/);
assert.match(ux, /count\.textContent !== text/);
assert.match(ux, /uxObserverBusy/);

assert.match(readability, /'rpg-season-career-hud'/);
assert.match(readability, /secondaryHudNodes/);

assert.match(css, /\.ux-mode-group/);
assert.match(css, /\.ux-setup-guide/);
assert.match(css, /\.rpg-season-career-hud/);
assert.match(css, /\.career-table-details/);
assert.match(css, /\.president-option-wrap/);
assert.match(css, /\.president-trust-details/);
assert.match(css, /#question-type-label\s*\{\s*display:\s*none/);
assert.match(css, /background:\s*#fff\s*!important/);
assert.match(css, /color:\s*#172033\s*!important/);

console.log('UX polish smoke: OK');

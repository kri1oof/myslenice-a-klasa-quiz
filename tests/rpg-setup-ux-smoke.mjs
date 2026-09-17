import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../web/rpg-setup-ux.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../web/rpg-setup-ux.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

assert.match(js, /RPG_SETUP_MODE\s*=\s*'match90'/);
assert.match(js, /scope-mode'\)\) el\('scope-mode'\)\.value = 'club'/);
assert.match(js, /season-mode'\)\) el\('season-mode'\)\.value = 'single'/);
assert.match(js, /Wybierz swoją drużynę/);
assert.match(js, /Cała A-klasa Myślenice/);
assert.match(js, /rpgSetupLatestSeason/);
assert.match(js, /settings\.open = true/);
assert.match(js, /kickoff\.disabled = !ready/);
assert.match(js, /Domyślnie grasz pytaniami swojej drużyny/);
assert.match(js, /rpgSetupVisible\(\)/);

assert.match(css, /\.rpg-setup-heading/);
assert.match(css, /\.rpg-setup-club \{ order: -20; \}/);
assert.match(css, /\.rpg-setup-scope \{ order: -16; \}/);
assert.match(css, /Opcjonalnie: przełącz na całą ligę/);
assert.match(css, /#new-game:disabled/);

assert.match(index, /rpg-setup-ux\.css/);
assert.match(index, /rpg-setup-ux\.js/);
assert.ok(index.indexOf('ux-polish.js') < index.indexOf('rpg-setup-ux.js'));
assert.ok(index.indexOf('a-class-lifelines.js') < index.indexOf('rpg-setup-ux.js'));

console.log('RPG setup UX smoke: OK');

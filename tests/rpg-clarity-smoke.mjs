import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../web/rpg-clarity.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../web/rpg-clarity.js', import.meta.url), 'utf8');
const playerCss = fs.readFileSync(new URL('../web/player-characters.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

// The final layer must provide explicit readable foreground/background pairs.
assert.match(css, /--rpg2-ink:\s*#111827/);
assert.match(css, /body\.rpg-match-active \.rpg-score-row[\s\S]*background: var\(--rpg2-white\)[\s\S]*color: var\(--rpg2-ink\)/);
assert.match(css, /body\.rpg-match-active \.rpg-action[\s\S]*background: var\(--rpg2-white\)[\s\S]*color: var\(--rpg2-ink\)/);
assert.match(css, /body\.rpg-match-active \.answer[\s\S]*background: var\(--rpg2-white\)[\s\S]*color: var\(--rpg2-ink\)/);
assert.match(css, /rpg-context-content > \*[\s\S]*background: var\(--rpg2-white\) !important[\s\S]*color: var\(--rpg2-ink\) !important/);
assert.match(css, /rpg-question-stage \.rpg-pitch-shell/);
assert.match(css, /rpg-question-stage \.rpg-context-drawer/);
assert.match(css, /rpg-question-stage \.rpg-tools/);
assert.match(css, /#new-game:disabled[\s\S]*color: #334155/);

// Player selection must not inherit black text onto an old dark character card.
assert.match(playerCss, /\.character-selection-card[\s\S]*background:\s*#f8fafc[\s\S]*color:\s*#111827/);
assert.match(playerCss, /\.character-option[\s\S]*background:\s*#ffffff[\s\S]*color:\s*#111827\s*!important/);
assert.match(playerCss, /\.character-title strong[\s\S]*color:\s*#111827\s*!important/);
assert.match(playerCss, /\.character-title small[\s\S]*color:\s*#475569\s*!important/);

// Secondary match history is deliberately collapsed into a details drawer.
assert.match(js, /function ensureRpgLogDrawer/);
assert.match(js, /document\.createElement\('details'\)/);
assert.match(js, /Ostatnie akcje/);
assert.match(js, /board\.appendChild\(logDrawer\)/);
assert.match(js, /board\.appendChild\(contextDrawer\)/);
assert.match(js, /question\.scrollIntoView/);
assert.match(js, /Sytuacja na boisku/);

// This stylesheet/script must be the final UX layer, after setup polish.
assert.match(index, /rpg-clarity\.css/);
assert.match(index, /rpg-clarity\.js/);
assert.ok(index.indexOf('rpg-setup-ux.css') < index.indexOf('rpg-clarity.css'));
assert.ok(index.indexOf('rpg-setup-ux.js') < index.indexOf('rpg-clarity.js'));

console.log('RPG clarity smoke: OK');

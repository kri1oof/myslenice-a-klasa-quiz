// Persistent achievements layer. Loaded after gameplay/front wrappers so it observes final game state without changing outcomes.
const achievementsCore = globalThis.AchievementsCore;
const achievementBaseAnswer = answer;
const achievementBaseFinishGame = finishGame;
const ACHIEVEMENT_STORAGE_KEY = 'myslenice-a-klasa-achievements-v1';

let achievementProfile = loadAchievementProfile();
let achievementSessionCounter = 0;
let achievementCurrentSession = null;
let achievementRecordedSession = null;

const ACHIEVEMENT_CATEGORY_LABELS = Object.freeze({
  knowledge:'Wiedza',
  match:'Mecz RPG',
  aclass:'A-klasowe akcje',
  career:'Kariera',
  president:'Prezes',
});

function loadAchievementProfile() {
  try {
    const raw = window.localStorage?.getItem(ACHIEVEMENT_STORAGE_KEY);
    return raw ? achievementsCore.sanitizeProfile(JSON.parse(raw)) : achievementsCore.emptyProfile();
  } catch (_error) {
    return achievementsCore.emptyProfile();
  }
}

function saveAchievementProfile() {
  try {
    window.localStorage?.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(achievementProfile));
  } catch (_error) {
    // Storage can be unavailable in private/restricted contexts; the in-memory profile still works for this visit.
  }
}

function achievementEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ensureAchievementsUi() {
  let button = document.getElementById('achievement-fab');
  if (!button) {
    button = document.createElement('button');
    button.id = 'achievement-fab';
    button.type = 'button';
    button.className = 'achievement-fab';
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', openAchievementCabinet);
    document.body.appendChild(button);
  }

  let modal = document.getElementById('achievement-modal');
  if (!modal) {
    modal = document.createElement('section');
    modal.id = 'achievement-modal';
    modal.className = 'achievement-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'achievement-dialog-title');
    modal.innerHTML = `
      <div class="achievement-dialog">
        <div class="achievement-dialog-head">
          <div><small>🏅 GABLOTA</small><h2 id="achievement-dialog-title">Osiągnięcia</h2><p>Postęp jest zapisywany lokalnie w tej przeglądarce.</p></div>
          <button type="button" class="achievement-close" aria-label="Zamknij osiągnięcia">✕</button>
        </div>
        <div id="achievement-summary" class="achievement-summary"></div>
        <div id="achievement-sections"></div>
      </div>`;
    modal.querySelector('.achievement-close')?.addEventListener('click', closeAchievementCabinet);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeAchievementCabinet();
    });
    document.body.appendChild(modal);
  }

  if (!document.getElementById('achievement-toast-stack')) {
    const stack = document.createElement('div');
    stack.id = 'achievement-toast-stack';
    stack.className = 'achievement-toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  renderAchievementCabinet();
}

function renderAchievementCabinet() {
  const count = achievementsCore.unlockedCount(achievementProfile);
  const total = achievementsCore.ACHIEVEMENTS.length;
  const button = document.getElementById('achievement-fab');
  if (button) button.textContent = `🏅 ${count}/${total}`;

  const summary = document.getElementById('achievement-summary');
  if (summary) {
    const stats = achievementProfile.stats;
    summary.innerHTML = `
      <span><strong>${count}/${total}</strong> odblokowanych</span>
      <span><strong>${stats.correct}</strong> poprawnych</span>
      <span><strong>${stats.rpgWins}</strong> wygranych RPG</span>
      <span><strong>${stats.seasonsCompleted}</strong> ukończonych sezonów</span>`;
  }

  const sections = document.getElementById('achievement-sections');
  if (!sections) return;
  const categories = ['knowledge','match','aclass','career','president'];
  sections.innerHTML = categories.map(category => {
    const items = achievementsCore.ACHIEVEMENTS.filter(item => item.category === category);
    const cards = items.map(item => {
      const unlocked = Boolean(achievementProfile.unlocked[item.id]);
      const progress = achievementsCore.progress(item, achievementProfile.stats);
      const unlock = achievementProfile.unlocked[item.id];
      const when = unlock?.at ? new Date(unlock.at).toLocaleDateString('pl-PL') : 'jeszcze zablokowane';
      return `
        <article class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
          <span class="achievement-icon">${item.icon}</span>
          <div class="achievement-copy">
            <strong>${achievementEscape(item.title)}</strong>
            <p>${achievementEscape(item.desc)}</p>
            <div class="achievement-progress"><i style="width:${Math.round(progress.ratio * 100)}%"></i></div>
            <div class="achievement-meta"><span>${progress.label}</span><span>${unlocked ? `odblokowano ${achievementEscape(when)}` : '🔒'}</span></div>
          </div>
        </article>`;
    }).join('');
    return `<section class="achievement-section"><h3>${ACHIEVEMENT_CATEGORY_LABELS[category]}</h3><div class="achievement-grid">${cards}</div></section>`;
  }).join('');
}

function openAchievementCabinet() {
  ensureAchievementsUi();
  renderAchievementCabinet();
  document.getElementById('achievement-modal')?.classList.remove('hidden');
  document.querySelector('#achievement-modal .achievement-close')?.focus();
}

function closeAchievementCabinet() {
  document.getElementById('achievement-modal')?.classList.add('hidden');
  document.getElementById('achievement-fab')?.focus();
}

function showAchievementToast(item) {
  const stack = document.getElementById('achievement-toast-stack');
  if (!stack || !item) return;
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.innerHTML = `<span class="icon">${item.icon}</span><div><small>OSIĄGNIĘCIE ODBLOKOWANE</small><strong>${achievementEscape(item.title)}</strong><span>${achievementEscape(item.desc)}</span></div>`;
  stack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 5200);
}

function appendAchievementResultCard(ids) {
  if (!ids?.length) return;
  const result = document.getElementById('result');
  if (!result) return;
  let card = document.getElementById('achievement-result-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'achievement-result-card';
    card.className = 'achievement-result-card';
    const replay = document.getElementById('play-again');
    if (replay) replay.insertAdjacentElement('beforebegin', card);
    else result.appendChild(card);
  }
  const names = ids.map(id => {
    const item = achievementsCore.achievement(id);
    return item ? `${item.icon} ${item.title}` : id;
  });
  card.innerHTML = `<strong>🏅 Nowe osiągnięcia: ${ids.length}</strong><span>${achievementEscape(names.join(' · '))}</span>`;
}

function evaluateAchievements(options = {}) {
  const evaluated = achievementsCore.evaluate(achievementProfile);
  achievementProfile = evaluated.profile;
  saveAchievementProfile();
  renderAchievementCabinet();
  evaluated.newlyUnlocked.forEach(id => showAchievementToast(achievementsCore.achievement(id)));
  if (options.resultCard) appendAchievementResultCard(evaluated.newlyUnlocked);
  return evaluated.newlyUnlocked;
}

function rawGameFormat() {
  return document.getElementById('game-format')?.value || 'quick';
}

answer = function achievementAnswer(button, option) {
  const question = state.current;
  const beforeAnswered = Number(state.answered || 0);
  const correct = Boolean(question && String(option) === String(question.answer));
  const result = achievementBaseAnswer(button, option);
  const afterAnswered = Number(state.answered || 0);
  if (afterAnswered <= beforeAnswered) return result;

  if (beforeAnswered === 0) {
    achievementSessionCounter += 1;
    achievementCurrentSession = achievementSessionCounter;
    achievementRecordedSession = null;
    document.getElementById('achievement-result-card')?.remove();
  }
  achievementProfile = achievementsCore.recordAnswer(achievementProfile, {
    correct,
    streak: Number(state.streak || 0),
    difficulty: Number(question?.difficulty || 0),
  });
  evaluateAchievements();
  return result;
};

function achievementFinishSnapshot(format) {
  const playerGoals = Number(state.rpgPlayerGoals || 0);
  const opponentGoals = Number(state.rpgOpponentGoals || 0);
  const result = playerGoals > opponentGoals ? 'W' : playerGoals < opponentGoals ? 'L' : 'D';
  const powerupHistory = state.rpgPowerupHistory || [];
  const rerollSaved = powerupHistory.filter(item => item.rerolled && item.rerollSuccess).length;
  const rivalryLevel = state.rpgRivalryProfile?.classification?.id || 'normal';
  const currentCareerRound = Number(state.seasonCareer?.roundIndex || 0) + 1;
  const presidentDecisionMade = format === 'president' && Boolean(
    state.presidentMode?.history?.some(item => Number(item.round || 0) === currentCareerRound)
  );
  return {
    format,
    answered: Number(state.answered || 0),
    correct: Number(state.correct || 0),
    rpg: ['match90','career','president'].includes(format),
    playerGoals,
    opponentGoals,
    result,
    powerupsUsed: powerupHistory.length,
    powerupRerollsSaved: rerollSaved,
    rivalryLevel,
    aClassEvents: Number(state.rpgAClassEventHistory?.length || 0),
    substitutionQuizCorrect: Number(state.rpgSubstitutionQuizCorrect || 0),
    career: ['career','president'].includes(format),
    president: format === 'president',
    presidentDecisionMade,
  };
}

function enrichFinishSnapshotAfterBase(snapshot) {
  const career = state.seasonCareer || null;
  if (snapshot.career && career) {
    snapshot.seasonCompleted = Boolean(career.completed);
    if (snapshot.seasonCompleted && globalThis.SeasonCareerCore) {
      const position = globalThis.SeasonCareerCore.position(career.table, career.club);
      snapshot.objectiveAchieved = Boolean(position && position <= Number(career.objective?.targetPosition || 0));
    }
  }
  if (snapshot.president && state.presidentMode) {
    snapshot.presidentBudget = Number(state.presidentMode.budget || 0);
    snapshot.presidentAverageTrust = globalThis.PresidentModeCore
      ? globalThis.PresidentModeCore.averageTrust(state.presidentMode)
      : 0;
  }
  return snapshot;
}

finishGame = function achievementFinishGame() {
  const format = rawGameFormat();
  const snapshot = achievementFinishSnapshot(format);
  const result = achievementBaseFinishGame();

  // A finish can travel through several gameplay wrappers. Count only the outermost observed session once.
  if (achievementCurrentSession === null || achievementRecordedSession === achievementCurrentSession) return result;
  achievementRecordedSession = achievementCurrentSession;
  enrichFinishSnapshotAfterBase(snapshot);
  achievementProfile = achievementsCore.recordFinish(achievementProfile, snapshot);
  evaluateAchievements({ resultCard:true });
  return result;
};

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('achievement-modal')?.classList.contains('hidden')) closeAchievementCabinet();
});

ensureAchievementsUi();
evaluateAchievements();

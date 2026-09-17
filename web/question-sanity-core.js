(function initQuestionSanityCore(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.QuestionSanityCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function questionSanityFactory() {
  const SQUAD_MIN = 11;
  const SQUAD_MAX = 20;

  function fold(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function integerAnswer(value) {
    const text = String(value ?? '').trim();
    return /^\d+$/.test(text) ? Number.parseInt(text, 10) : null;
  }

  function isMatchSquadSizeQuestion(question) {
    if (!question) return false;
    const type = fold(question.type);
    if (/(squad|roster|match_players|lineup_count|team_sheet_count|kadra)/.test(type)) return true;
    const text = fold(question.question);
    return /\bile\b/.test(text) && text.includes('kadr') && text.includes('mecz');
  }

  function hashSeed(value) {
    let hash = 2166136261;
    for (const ch of String(value || '')) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function stableShuffle(values, seed) {
    const copy = [...values];
    let x = hashSeed(seed) || 1;
    for (let i = copy.length - 1; i > 0; i -= 1) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      const j = (x >>> 0) % (i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function plausibleSquadOptions(answer, seed = '') {
    const numeric = Number(answer);
    if (!Number.isInteger(numeric) || numeric < SQUAD_MIN || numeric > SQUAD_MAX) return [];
    const candidates = [];
    for (let value = SQUAD_MIN; value <= SQUAD_MAX; value += 1) {
      if (value !== numeric) candidates.push(value);
    }
    candidates.sort((a, b) => {
      const distance = Math.abs(a - numeric) - Math.abs(b - numeric);
      if (distance !== 0) return distance;
      return a - b;
    });
    return stableShuffle([numeric, ...candidates.slice(0, 3)].map(String), `${seed}|${numeric}`);
  }

  function normalizeQuestion(question) {
    if (!isMatchSquadSizeQuestion(question)) return question;
    const answer = integerAnswer(question.answer);
    if (answer == null || answer < SQUAD_MIN || answer > SQUAD_MAX) return null;
    return {
      ...question,
      answer: String(answer),
      options: plausibleSquadOptions(answer, question.id || question.question),
    };
  }

  function normalizeQuestions(questions) {
    return (Array.isArray(questions) ? questions : [])
      .map(normalizeQuestion)
      .filter(Boolean);
  }

  return {
    SQUAD_MIN,
    SQUAD_MAX,
    integerAnswer,
    isMatchSquadSizeQuestion,
    plausibleSquadOptions,
    normalizeQuestion,
    normalizeQuestions,
  };
});
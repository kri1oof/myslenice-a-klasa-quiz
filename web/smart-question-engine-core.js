(function initSmartQuestionEngineCore(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SmartQuestionEngineCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function smartQuestionEngineFactory() {
  const HISTORY_LIMIT = 30;
  const FACT_COOLDOWN = 10;
  const SUBJECT_COOLDOWN = 4;
  const CATEGORY_COOLDOWN = 2;

  function fold(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ł/g, 'l')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function categoryForType(type) {
    const value = String(type || '');
    if (value.startsWith('social_')) return 'ciekawostki';
    if (/captain|starting_xi|bench|substitution|shirt_number|substitutes/.test(value)) return 'sklady';
    if (/player|scorer|goal|brace|hattrick|hat_trick/.test(value)) return 'zawodnicy';
    if (/streak|biggest|highest|clean|btts|most_common|zero_zero|five_plus|h2h/.test(value)) return 'rekordy';
    if (/standing|position|points|season_|league_team|club_not_in/.test(value)) return 'sezon';
    if (/date|weekday|round|opponent/.test(value)) return 'terminarz';
    return 'mecze';
  }

  function typeFamily(type) {
    const value = String(type || '');
    if (value.startsWith('social_')) return 'social';
    if (/starting_xi|bench|substitution|captain|shirt_number|substitutes|match_player|player_match|match_card/.test(value)) return 'match-player';
    if (/player|scorer|brace|hattrick|hat_trick/.test(value)) return 'player';
    if (/standing|final_position|season_|club_home_points|club_away_points|league_team/.test(value)) return 'season';
    if (/round_|match_round|date|weekday/.test(value)) return 'schedule';
    if (/streak|biggest|highest|clean|btts|most_common|zero_zero|five_plus|h2h/.test(value)) return 'record';
    if (/match_|club_match|halftime/.test(value)) return 'match';
    return categoryForType(value);
  }

  function normalizedClubs(question) {
    return [...new Set((Array.isArray(question?.clubs) ? question.clubs : [])
      .map(fold)
      .filter(Boolean))]
      .sort();
  }

  function sourceEventKey(question) {
    const sources = Array.isArray(question?.sources) ? question.sources : [];
    if (!sources.length) return '';
    const normalized = sources
      .map(value => {
        try {
          const url = new URL(String(value));
          return fold(url.hostname + url.pathname);
        } catch (_error) {
          return fold(value);
        }
      })
      .filter(Boolean)
      .sort();
    return normalized.slice(0, 2).join('+');
  }

  function personSubjects(question) {
    const text = [question?.question, question?.explanation, question?.answer]
      .filter(Boolean)
      .join(' ');
    const clubs = normalizedClubs(question);
    const ignored = new Set([
      'laczy nas', 'laczy nas pilka', 'a klasa', 'a klasy', 'a klasie',
      'myslenice', 'pzpn', 'malopolski zwiazek', 'polski zwiazek',
      'pierwszy strzelec', 'ostatni strzelec', 'podstawowy sklad',
    ]);
    const matches = text.match(/\b\p{Lu}[\p{L}'’.-]+(?:\s+\p{Lu}[\p{L}'’.-]+){1,2}\b/gu) || [];
    const people = [];
    for (const raw of matches) {
      const value = fold(raw);
      if (!value || ignored.has(value)) continue;
      if (clubs.some(club => value.includes(club) || club.includes(value))) continue;
      if (/^(ile|kto|ktory|jaki|jakim|czy|remis|liga|sezon)/.test(value)) continue;
      people.push('person:' + value);
    }
    return [...new Set(people)].slice(0, 4);
  }

  function subjectKeys(question) {
    const clubs = normalizedClubs(question).map(club => 'club:' + club);
    return [...new Set([...clubs, ...personSubjects(question)])];
  }

  function factFingerprint(question) {
    const season = fold(question?.season || 'general');
    const clubs = normalizedClubs(question);
    const people = personSubjects(question);
    const family = typeFamily(question?.type);
    const source = sourceEventKey(question);

    if (people.length) {
      return ['person-fact', season, people[0], clubs.join('+'), family].join('|');
    }
    if (clubs.length >= 2) {
      return ['match-fact', season, clubs.join('+'), source || family].join('|');
    }
    if (clubs.length === 1) {
      return ['club-fact', season, clubs[0], family].join('|');
    }
    if (source) return ['source-fact', season, source, family].join('|');

    const normalizedPrompt = fold(question?.question)
      .replace(/\b\d{1,4}\b/g, '#')
      .split(' ')
      .slice(0, 14)
      .join(' ');
    return ['fallback', season, family, normalizedPrompt].join('|');
  }

  function historyEntry(question) {
    return {
      id:String(question?.id || ''),
      fact:factFingerprint(question),
      category:categoryForType(question?.type),
      type:String(question?.type || ''),
      season:String(question?.season || ''),
      subjects:subjectKeys(question),
    };
  }

  function normalizeHistory(history) {
    return (Array.isArray(history) ? history : [])
      .filter(Boolean)
      .slice(-HISTORY_LIMIT)
      .map(item => ({
        id:String(item.id || ''),
        fact:String(item.fact || ''),
        category:String(item.category || ''),
        type:String(item.type || ''),
        season:String(item.season || ''),
        subjects:Array.isArray(item.subjects) ? item.subjects.map(String) : [],
      }));
  }

  function recentSlice(history, count) {
    return history.slice(Math.max(0, history.length - count));
  }

  function overlapCount(a, b) {
    if (!a?.length || !b?.length) return 0;
    const set = new Set(a);
    return b.reduce((sum, item) => sum + (set.has(item) ? 1 : 0), 0);
  }

  function candidateScore(entry, context) {
    let score = Number(context.jitter || 0);

    if (context.recentFacts.some(item => item.fact && item.fact === entry.fact)) score -= 140;
    if (context.priorIds.has(entry.id)) score -= 55;

    const subjectOverlap = context.recentSubjects.reduce(
      (sum, item) => sum + overlapCount(entry.subjects, item.subjects),
      0,
    );
    score -= Math.min(72, subjectOverlap * 16);

    if (context.recentCategories.at(-1)?.category === entry.category) score -= 30;
    else if (context.recentCategories.some(item => item.category === entry.category)) score -= 11;
    else score += 18;

    if (context.recentFacts.at(-1)?.type === entry.type) score -= 16;
    if (context.recentFacts.at(-1)?.season === entry.season && entry.season) score -= 4;

    const currentCategoryCount = Number(context.categoryCounts.get(entry.category) || 0);
    score += Math.max(0, context.minCategoryCount + 1 - currentCategoryCount) * 13;

    return score;
  }

  function buildQuestionPool(questions, requestedCount, options = {}) {
    const candidates = (Array.isArray(questions) ? questions : []).filter(Boolean);
    const count = Math.max(0, Math.min(Number(requestedCount || 0), candidates.length));
    if (!count) return [];

    const random = typeof options.random === 'function' ? options.random : Math.random;
    const history = normalizeHistory(options.history);
    const priorIds = new Set(history.map(item => item.id).filter(Boolean));
    const remaining = candidates.map(question => ({
      question,
      entry:historyEntry(question),
      jitter:Number(random() || 0) * 5,
    }));
    const selected = [];
    const selectedEntries = [];
    const categoryCounts = new Map();

    while (selected.length < count && remaining.length) {
      const combined = [...history, ...selectedEntries];
      const recentFacts = recentSlice(combined, FACT_COOLDOWN);
      const recentSubjects = recentSlice(combined, SUBJECT_COOLDOWN);
      const recentCategories = recentSlice(combined, CATEGORY_COOLDOWN);
      const minCategoryCount = categoryCounts.size
        ? Math.min(...categoryCounts.values())
        : 0;
      let bestIndex = 0;
      let bestScore = -Infinity;

      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        const score = candidateScore(candidate.entry, {
          jitter:candidate.jitter,
          priorIds,
          recentFacts,
          recentSubjects,
          recentCategories,
          categoryCounts,
          minCategoryCount,
        });
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }

      const [picked] = remaining.splice(bestIndex, 1);
      selected.push(picked.question);
      selectedEntries.push(picked.entry);
      categoryCounts.set(
        picked.entry.category,
        Number(categoryCounts.get(picked.entry.category) || 0) + 1,
      );
    }
    return selected;
  }

  function appendHistory(history, question, limit = HISTORY_LIMIT) {
    const normalized = normalizeHistory(history);
    const entry = historyEntry(question);
    if (normalized.at(-1)?.id === entry.id) return normalized;
    return [...normalized, entry].slice(-Math.max(1, Number(limit || HISTORY_LIMIT)));
  }

  return {
    HISTORY_LIMIT,
    FACT_COOLDOWN,
    SUBJECT_COOLDOWN,
    CATEGORY_COOLDOWN,
    fold,
    categoryForType,
    typeFamily,
    subjectKeys,
    factFingerprint,
    historyEntry,
    normalizeHistory,
    buildQuestionPool,
    appendHistory,
  };
});

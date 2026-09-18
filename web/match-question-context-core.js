(function initMatchQuestionContextCore(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MatchQuestionContextCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function matchQuestionContextFactory() {
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

  function normalizeContext(context = {}) {
    const situationId = String(context.situationId || context.situation?.id || '');
    const actionKind = String(context.actionKind || context.action?.kind || '');
    const actionId = String(context.actionId || context.action?.id || '');
    const setPieceType = String(context.setPieceType || context.setPiece?.type || '');
    const minuteValue = Number(context.minute);
    const minute = Number.isFinite(minuteValue) ? minuteValue : 0;
    return { situationId, actionKind, actionId, setPieceType, minute };
  }

  function profileForContext(context = {}) {
    const ctx = normalizeContext(context);
    const text = [ctx.situationId, ctx.actionKind, ctx.actionId, ctx.setPieceType].join(' ').toLowerCase();

    if (/substitut|change|zmian/.test(text)) {
      return {
        id:'substitution',
        label:'Zmiana · składy i zawodnicy',
        categories:{ sklady:34, zawodnicy:18 },
        patterns:[
          [/substitution|substitute|bench|starting_xi|player_match|match_player/, 34],
          [/captain|shirt_number/, 14],
        ],
      };
    }

    if (/penalty|karn/.test(text)) {
      return {
        id:'penalty',
        label:'Rzut karny · strzelcy i zawodnicy',
        categories:{ zawodnicy:30, mecze:12, sklady:6 },
        patterns:[
          [/penalty|scorer|goal|player.*goal|brace|hattrick|hat_trick/, 34],
          [/goalkeeper|keeper|clean_sheet/, 22],
        ],
      };
    }

    if (/corner|free_kick|set_piece|wolny|rozny/.test(text)) {
      return {
        id:'set_piece',
        label:'Stały fragment · strzelcy i mecze',
        categories:{ zawodnicy:24, mecze:16, sklady:8 },
        patterns:[
          [/scorer|goal|player.*goal|match_score|match_winner/, 24],
          [/captain|starting_xi/, 10],
        ],
      };
    }

    if (/shot|box_chance|clear_chance|finish|danger_block|danger_shape|danger_tackle/.test(text)) {
      return {
        id:'finish',
        label:'Pole karne · gole i zawodnicy',
        categories:{ zawodnicy:26, mecze:14, rekordy:8 },
        patterns:[
          [/scorer|goal|player.*goal|brace|hattrick|hat_trick/, 30],
          [/match_score|match_winner|clean_sheet/, 16],
        ],
      };
    }

    if (/defend|opponent|block|tackle|press/.test(text)) {
      return {
        id:'defence',
        label:'Obrona · składy, kartki i zawodnicy',
        categories:{ sklady:24, zawodnicy:18, mecze:8 },
        patterns:[
          [/match_card|card|captain|starting_xi|bench/, 26],
          [/player_match|match_player|shirt_number/, 16],
        ],
      };
    }

    if (/counter|advance|create_chance|setup_chance|attack|midfield|opening|build/.test(text)) {
      return {
        id:'build_up',
        label:'Budowanie akcji · składy i zawodnicy',
        categories:{ sklady:22, zawodnicy:18, mecze:8 },
        patterns:[
          [/starting_xi|captain|player_match|match_player|substitution/, 22],
          [/scorer|player_season/, 12],
        ],
      };
    }

    if (ctx.minute >= 80 || /late_drama|late|stoppage/.test(text)) {
      return {
        id:'late_game',
        label:'Końcówka · wyniki i późne gole',
        categories:{ mecze:26, rekordy:16, terminarz:10, zawodnicy:10 },
        patterns:[
          [/match_score|match_winner|scorer_minute|goal_minute|late|comeback/, 30],
          [/h2h|streak|round|weekday|date/, 14],
        ],
      };
    }

    return {
      id:'general',
      label:'Test wiedzy meczowej',
      categories:{ mecze:8, zawodnicy:8, sklady:6 },
      patterns:[],
    };
  }

  function scoreQuestion(question, context = {}, options = {}) {
    const profile = profileForContext(context);
    const type = String(question?.type || '');
    const category = categoryForType(type);
    const targetDifficulty = Number(options.targetDifficulty || context.dc || 3);
    const difficulty = Number(question?.difficulty || 3);
    const distance = Math.abs(difficulty - targetDifficulty);

    let score = 40 - distance * 28;
    score += Number(profile.categories?.[category] || 0);

    for (const [pattern, bonus] of profile.patterns || []) {
      if (pattern.test(type)) score += Number(bonus || 0);
    }

    if (options.lastCategory && category === options.lastCategory) score -= 15;
    if (question?.special?.kind) score -= 50;

    return Math.round(score * 100) / 100;
  }

  function rankQuestions(questions, context = {}, options = {}) {
    return (Array.isArray(questions) ? questions : [])
      .filter(Boolean)
      .map((question, index) => ({
        question,
        index,
        score:scoreQuestion(question, context, options),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
  }

  function chooseQuestion(questions, context = {}, options = {}) {
    const ranked = rankQuestions(questions, context, options);
    if (!ranked.length) return null;
    const top = ranked[0];
    const profile = profileForContext(context);
    const genericScore = scoreQuestion(top.question, {}, options);
    const contextBoost = Math.round((top.score - genericScore) * 100) / 100;
    return {
      question:top.question,
      score:top.score,
      contextBoost,
      profile,
      contextual:profile.id !== 'general' && contextBoost >= 10,
    };
  }

  return {
    categoryForType,
    normalizeContext,
    profileForContext,
    scoreQuestion,
    rankQuestions,
    chooseQuestion,
  };
});

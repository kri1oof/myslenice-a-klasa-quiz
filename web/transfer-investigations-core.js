(function exposeTransferInvestigationCore(root) {
  function seasonStartYear(label) {
    const match = String(label || '').match(/^(\d{4})\/(\d{2}|\d{4})$/);
    return match ? Number.parseInt(match[1], 10) : null;
  }

  function stablePlayerKey(profile) {
    if (typeof profile?.player_key === 'string' && profile.player_key.startsWith('lnp:')) {
      return profile.player_key;
    }
    const parts = String(profile?.id || '').split('|');
    if (parts.length < 3) return null;
    const key = parts.slice(2).join('|');
    return key.startsWith('lnp:') ? key : null;
  }

  function unique(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function hash(value) {
    let result = 2166136261;
    for (const char of String(value || '')) {
      result ^= char.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return Math.abs(result >>> 0);
  }

  function rotate(values, seed) {
    const list = [...values];
    if (!list.length) return list;
    const offset = hash(seed) % list.length;
    return [...list.slice(offset), ...list.slice(0, offset)];
  }

  function profileGroups(profiles) {
    const groups = new Map();
    for (const profile of profiles || []) {
      const key = stablePlayerKey(profile);
      const seasonYear = seasonStartYear(profile?.season);
      if (!key || seasonYear === null || !profile?.club) continue;
      if (!groups.has(key)) groups.set(key, new Map());
      const bySeason = groups.get(key);
      if (!bySeason.has(profile.season)) bySeason.set(profile.season, []);
      bySeason.get(profile.season).push(profile);
    }
    return groups;
  }

  function detectTransitions(profiles) {
    const transitions = [];
    for (const [playerKey, bySeason] of profileGroups(profiles)) {
      const seasons = [...bySeason.keys()].sort((a, b) => seasonStartYear(a) - seasonStartYear(b));
      for (let index = 0; index + 1 < seasons.length; index += 1) {
        const fromSeason = seasons[index];
        const toSeason = seasons[index + 1];
        if (seasonStartYear(toSeason) !== seasonStartYear(fromSeason) + 1) continue;
        const fromProfiles = bySeason.get(fromSeason) || [];
        const toProfiles = bySeason.get(toSeason) || [];
        const fromClubs = unique(fromProfiles.map(item => item.club));
        const toClubs = unique(toProfiles.map(item => item.club));
        // If a player appears for multiple clubs in one season, the protocols do
        // not provide enough chronology here to infer one transfer direction.
        if (fromClubs.length !== 1 || toClubs.length !== 1) continue;
        if (fromClubs[0] === toClubs[0]) continue;
        const fromProfile = fromProfiles[0];
        const toProfile = toProfiles[0];
        transitions.push({
          id: `${playerKey}|${fromSeason}|${toSeason}`,
          playerKey,
          player: toProfile.player || fromProfile.player || 'Zawodnik',
          fromSeason,
          toSeason,
          fromClub: fromClubs[0],
          toClub: toClubs[0],
          confidence: Math.min(Number(fromProfile.confidence || 0), Number(toProfile.confidence || 0)),
          sources: unique([...(fromProfile.sources || []), ...(toProfile.sources || [])]),
        });
      }
    }
    return transitions.sort((a, b) =>
      seasonStartYear(a.toSeason) - seasonStartYear(b.toSeason) ||
      a.player.localeCompare(b.player, 'pl')
    );
  }

  function filterTransitions(transitions, { club = null, seasons = [] } = {}) {
    const seasonSet = new Set((seasons || []).filter(Boolean));
    return (transitions || []).filter(item => {
      if (club && item.fromClub !== club && item.toClub !== club) return false;
      if (seasonSet.size && !seasonSet.has(item.fromSeason) && !seasonSet.has(item.toSeason)) return false;
      return true;
    });
  }

  function clubsForSeason(profiles, season) {
    return unique((profiles || []).filter(item => item?.season === season).map(item => item.club))
      .sort((a, b) => a.localeCompare(b, 'pl'));
  }

  function optionSet(answer, candidates, seed, size = 4) {
    const distractors = rotate(unique(candidates).filter(value => value !== answer), seed);
    return unique([answer, ...distractors.slice(0, Math.max(1, size - 1))]);
  }

  function routeLabel(item) {
    return `${item.fromClub} → ${item.toClub}`;
  }

  function commonQuestionFields(item, type, answer, options, subtype) {
    return {
      id: `transfer:${subtype}:${item.id}`,
      type,
      difficulty: subtype === 'route' ? 4 : 3,
      answer,
      options,
      season: item.toSeason,
      transferSeasons: [item.fromSeason, item.toSeason],
      clubs: unique([item.fromClub, item.toClub]),
      confidence: item.confidence,
      sources: item.sources,
      special: {
        kind: 'transfer',
        subtype,
        playerKey: item.playerKey,
        player: item.player,
        fromSeason: item.fromSeason,
        toSeason: item.toSeason,
        fromClub: item.fromClub,
        toClub: item.toClub,
      },
    };
  }

  function buildQuestions(profiles, { club = null, seasons = [] } = {}) {
    const allTransitions = detectTransitions(profiles);
    const transitions = filterTransitions(allTransitions, { club, seasons });
    const questions = [];
    const routePool = unique(allTransitions.map(routeLabel));

    for (const item of transitions) {
      const fromOptions = optionSet(
        item.fromClub,
        clubsForSeason(profiles, item.fromSeason),
        `${item.id}:from`,
      );
      if (fromOptions.length >= 2) {
        questions.push({
          ...commonQuestionFields(item, 'transfer_from_club', item.fromClub, fromOptions, 'from'),
          question: `${item.player} występuje w protokołach ŁNP dla ${item.toClub} w sezonie ${item.toSeason}. W jakim klubie występował sezon wcześniej?`,
          explanation: `${item.player}: ${item.fromClub} (${item.fromSeason}) → ${item.toClub} (${item.toSeason}). To zmiana przynależności klubowej widoczna w protokołach ŁNP; mechanika nie określa formalnego rodzaju transferu ani umowy.`,
        });
      }

      const toOptions = optionSet(
        item.toClub,
        clubsForSeason(profiles, item.toSeason),
        `${item.id}:to`,
      );
      if (toOptions.length >= 2) {
        questions.push({
          ...commonQuestionFields(item, 'transfer_to_club', item.toClub, toOptions, 'to'),
          question: `Po sezonie ${item.fromSeason}, w którym ${item.player} występował dla ${item.fromClub}, w jakim klubie pojawia się w protokołach sezonu ${item.toSeason}?`,
          explanation: `${item.player}: ${item.fromClub} (${item.fromSeason}) → ${item.toClub} (${item.toSeason}). Wniosek dotyczy klubów widocznych w oficjalnych protokołach, nie formy prawnej przejścia.`,
        });
      }

      const route = routeLabel(item);
      const routeOptions = optionSet(route, routePool, `${item.id}:route`);
      if (routeOptions.length >= 2) {
        questions.push({
          ...commonQuestionFields(item, 'transfer_route', route, routeOptions, 'route'),
          question: `Która ścieżka klubowa między sezonami ${item.fromSeason} i ${item.toSeason} należy do zawodnika ${item.player}?`,
          explanation: `W danych ŁNP dla tych sezonów ${item.player} jest przypisany kolejno do: ${route}.`,
        });
      }
    }
    return questions;
  }

  function questionMatchesSelectedSeasons(question, seasons = []) {
    const selected = new Set((seasons || []).filter(Boolean));
    if (!selected.size) return true;
    const transferSeasons = Array.isArray(question?.transferSeasons) ? question.transferSeasons : [];
    return transferSeasons.some(season => selected.has(season));
  }

  root.TransferInvestigationCore = {
    stablePlayerKey,
    detectTransitions,
    filterTransitions,
    clubsForSeason,
    optionSet,
    routeLabel,
    buildQuestions,
    questionMatchesSelectedSeasons,
    seasonStartYear,
  };
}(typeof globalThis !== 'undefined' ? globalThis : window));

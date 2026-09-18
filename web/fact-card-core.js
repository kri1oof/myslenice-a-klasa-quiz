(function initFactCardCore(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FactCardCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function factCardFactory() {
  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function uniq(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function sourceLabel(url) {
    const value = clean(url);
    if (!value) return 'Źródło';
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.replace(/^www\./, '');
      if (host.includes('laczynaspilka.pl')) return 'Łączy Nas Piłka';
      if (host.includes('90minut.pl')) return '90minut.pl';
      if (host.includes('futbolowo.pl')) return 'Futbolowo';
      if (host.includes('malopolskizpn.pl')) return 'MZPN';
      return host || 'Źródło';
    } catch (_error) {
      return 'Źródło';
    }
  }

  function contextHighlights(question) {
    const text = clean([question?.question, question?.explanation].filter(Boolean).join(' '));
    if (!text) return [];

    const result = [];
    const minuteRegex = /\b(\d{1,3})\.?\s*(?:minucie|minuta|minuty|minut)\b/gi;
    const roundRegex = /\b(\d{1,2})\.?\s*(?:kolejce|kolejka|kolejki)\b/gi;
    const dateRegex = /\b(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})\b/g;
    let match;

    while ((match = minuteRegex.exec(text)) !== null) result.push(match[1] + '. minuta');
    while ((match = roundRegex.exec(text)) !== null) result.push(match[1] + '. kolejka');
    while ((match = dateRegex.exec(text)) !== null) result.push(match[1]);

    if (/score|wynik|winner|goals|gole|bramk/i.test(String(question?.type || ''))) {
      const scoreRegex = /\b(\d{1,2}\s*[:–-]\s*\d{1,2})\b/g;
      while ((match = scoreRegex.exec(text)) !== null) result.push(match[1].replace(/\s+/g, ''));
    }

    return uniq(result).slice(0, 4);
  }

  function metadata(question, typeLabel = null) {
    const items = [];
    if (question?.season) items.push({ kind:'season', label:'Sezon ' + clean(question.season) });
    const clubs = Array.isArray(question?.clubs) ? question.clubs.map(clean).filter(Boolean) : [];
    clubs.slice(0, 2).forEach(club => items.push({ kind:'club', label:club }));
    if (typeLabel) items.push({ kind:'type', label:clean(typeLabel) });
    if (Number.isFinite(Number(question?.difficulty))) {
      items.push({ kind:'difficulty', label:'Poziom ' + Number(question.difficulty) + '/5' });
    }
    return items;
  }

  function buildFactCard(question, options = {}) {
    const correct = Boolean(options.correct);
    const answer = clean(question?.answer);
    const explanation = clean(question?.explanation) || (answer ? 'Poprawna odpowiedź: ' + answer : '');
    const sources = (Array.isArray(question?.sources) ? question.sources : [])
      .map(url => ({ url:clean(url), label:sourceLabel(url) }))
      .filter(item => item.url);

    return {
      correct,
      status:correct ? 'correct' : 'wrong',
      statusLabel:correct ? 'Dobra odpowiedź' : 'Nie tym razem',
      statusIcon:correct ? '✓' : '✕',
      answer,
      explanation,
      highlights:contextHighlights(question),
      metadata:metadata(question, options.typeLabel),
      sources,
    };
  }

  return {
    clean,
    sourceLabel,
    contextHighlights,
    metadata,
    buildFactCard,
  };
});

(function initGameAnalytics(root) {
  const config = root.GAME_ANALYTICS_CONFIG || {};
  const measurementId = String(config.measurementId || '').trim().toUpperCase();
  const validMeasurementId = /^G-[A-Z0-9]+$/.test(measurementId);
  const consentRequired = config.consentRequired !== false;
  const consentKey = 'myslenice-quiz-analytics-consent-v1';
  let loaded = false;
  let lastCompletedRun = null;
  let currentRun = 0;

  function storageGet(key) {
    try {
      return root.localStorage ? root.localStorage.getItem(key) : null;
    } catch (_error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      if (root.localStorage) root.localStorage.setItem(key, value);
    } catch (_error) {
      // Analytics must never block the game.
    }
  }

  function consentState() {
    if (!consentRequired) return 'granted';
    return storageGet(consentKey) || 'unknown';
  }

  function loadGoogleTag() {
    if (!validMeasurementId || loaded || consentState() !== 'granted') return false;
    loaded = true;
    root.dataLayer = root.dataLayer || [];
    root.gtag = root.gtag || function gtag(){ root.dataLayer.push(arguments); };

    root.gtag('js', new Date());
    root.gtag('config', measurementId, {
      send_page_view: true,
      debug_mode: Boolean(config.debug),
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    script.dataset.gameAnalytics = 'ga4';
    document.head.appendChild(script);
    return true;
  }

  function cleanValue(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    return String(value).slice(0, 100);
  }

  function cleanParams(params) {
    const output = {};
    Object.entries(params || {}).forEach(([key, value]) => {
      const clean = cleanValue(value);
      if (clean !== undefined && clean !== '') output[key] = clean;
    });
    return output;
  }

  function track(name, params = {}) {
    if (!validMeasurementId || consentState() !== 'granted') return false;
    loadGoogleTag();
    if (typeof root.gtag !== 'function') return false;
    root.gtag('event', String(name), cleanParams(params));
    return true;
  }

  function readSetup() {
    const byId = (id) => document.getElementById(id);
    const scope = byId('scope-mode')?.value || 'league';
    const seasonMode = byId('season-mode')?.value || 'all';
    const seasonFrom = byId('season-from')?.value || '';
    const seasonTo = byId('season-to')?.value || '';
    const season = seasonMode === 'single'
      ? seasonFrom
      : seasonMode === 'range'
        ? [seasonFrom, seasonTo].filter(Boolean).join('–')
        : 'all';

    return {
      game_format: byId('game-format')?.value || 'unknown',
      scope,
      club: scope === 'club' ? (byId('club')?.value || '') : '',
      season_mode: seasonMode,
      season,
      difficulty: byId('difficulty')?.value || 'all',
      game_style: byId('game-style')?.value || '',
      special_round: byId('special-round')?.value || '',
    };
  }

  function resultParams() {
    const byId = (id) => document.getElementById(id);
    const percentText = byId('result-percent')?.textContent || '';
    const percent = Number.parseInt(percentText.replace(/[^0-9-]/g, ''), 10);
    return {
      ...readSetup(),
      result_title: byId('result-title')?.textContent || '',
      result_score: byId('result-score')?.textContent || '',
      success_percent: Number.isFinite(percent) ? percent : undefined,
    };
  }

  function removeConsentBanner() {
    document.getElementById('analytics-consent')?.remove();
  }

  function setConsent(value) {
    storageSet(consentKey, value);
    removeConsentBanner();
    if (value === 'granted') {
      loadGoogleTag();
      track('analytics_consent', { choice: 'granted' });
    }
  }

  function renderConsentBanner() {
    if (!validMeasurementId || !consentRequired || consentState() !== 'unknown') return;
    if (document.getElementById('analytics-consent')) return;

    const banner = document.createElement('aside');
    banner.id = 'analytics-consent';
    banner.className = 'analytics-consent';
    banner.setAttribute('aria-label', 'Ustawienia statystyk');
    banner.innerHTML =
      '<div class="analytics-consent__copy">' +
        '<strong>Pomóż nam ulepszać grę</strong>' +
        '<span>Chcemy anonimowo mierzyć liczbę wejść oraz to, które tryby są uruchamiane i kończone. Używamy Google Analytics.</span>' +
      '</div>' +
      '<div class="analytics-consent__actions">' +
        '<button type="button" data-analytics-choice="denied" class="ghost">Nie zgadzam się</button>' +
        '<button type="button" data-analytics-choice="granted">Zgadzam się</button>' +
      '</div>';

    banner.addEventListener('click', (event) => {
      const button = event.target.closest('[data-analytics-choice]');
      if (!button) return;
      setConsent(button.dataset.analyticsChoice);
    });
    document.body.appendChild(banner);
  }

  function bindGameEvents() {
    const newGame = document.getElementById('new-game');
    newGame?.addEventListener('click', () => {
      currentRun += 1;
      lastCompletedRun = null;
      root.setTimeout(() => track('game_start', { ...readSetup(), run: currentRun }), 0);
    });

    document.getElementById('play-again')?.addEventListener('click', () => {
      track('play_again', { ...readSetup(), run: currentRun });
    });

    document.getElementById('game-format')?.addEventListener('change', (event) => {
      track('game_format_change', { game_format: event.target.value || 'unknown' });
    });

    const result = document.getElementById('result');
    if (result && typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        if (result.classList.contains('hidden')) return;
        const runKey = currentRun || 1;
        if (lastCompletedRun === runKey) return;
        lastCompletedRun = runKey;
        track('game_complete', { ...resultParams(), run: runKey });
      });
      observer.observe(result, { attributes: true, attributeFilter: ['class'] });
    }
  }

  root.GameAnalytics = {
    enabled: validMeasurementId,
    measurementId: validMeasurementId ? measurementId : null,
    consentState,
    setConsent,
    track,
    readSetup,
  };

  if (!validMeasurementId) return;
  if (consentState() === 'granted') loadGoogleTag();

  bindGameEvents();
  renderConsentBanner();
})(typeof globalThis !== 'undefined' ? globalThis : window);

(function initAnalyticsConfig(root) {
  root.GAME_ANALYTICS_CONFIG = {
    provider: 'ga4',
    measurementId: '',
    consentRequired: true,
    debug: false,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

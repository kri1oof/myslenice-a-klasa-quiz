// Treat president mode as a season-career variant without changing the career engine itself.
const presidentCareerBaseSelected = seasonCareerSelected;
seasonCareerSelected = function presidentCareerSelected() {
  return el('game-format')?.value === 'president' || presidentCareerBaseSelected();
};

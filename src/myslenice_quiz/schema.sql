PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY,
    source_type TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    fetched_at TEXT,
    content_hash TEXT,
    authority REAL NOT NULL DEFAULT 0.5 CHECK(authority BETWEEN 0 AND 1),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    competition_name TEXT NOT NULL DEFAULT 'Myślenice: Klasa A',
    start_year INTEGER,
    end_year INTEGER,
    is_complete INTEGER NOT NULL DEFAULT 0 CHECK(is_complete IN (0,1)),
    UNIQUE(label, competition_name)
);


CREATE TABLE IF NOT EXISTS season_coverage (
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    dataset TEXT NOT NULL,
    is_complete INTEGER NOT NULL DEFAULT 0 CHECK(is_complete IN (0,1)),
    notes TEXT,
    PRIMARY KEY(season_id, dataset)
);

CREATE TABLE IF NOT EXISTS clubs (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS club_aliases (
    id INTEGER PRIMARY KEY,
    club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY,
    display_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    birth_date TEXT,
    external_key TEXT,
    UNIQUE(normalized_name, birth_date, external_key)
);

CREATE TABLE IF NOT EXISTS player_aliases (
    id INTEGER PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    UNIQUE(player_id, normalized_alias)
);

CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    round_no INTEGER,
    match_date TEXT,
    home_club_id INTEGER NOT NULL REFERENCES clubs(id),
    away_club_id INTEGER NOT NULL REFERENCES clubs(id),
    home_goals INTEGER,
    away_goals INTEGER,
    home_ht INTEGER,
    away_ht INTEGER,
    status TEXT NOT NULL DEFAULT 'played',
    venue TEXT,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    UNIQUE(season_id, round_no, home_club_id, away_club_id)
);

CREATE TABLE IF NOT EXISTS match_evidence (
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    source_match_key TEXT,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    PRIMARY KEY(match_id, source_id)
);

CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(id),
    player_id INTEGER REFERENCES players(id),
    minute INTEGER,
    minute_extra INTEGER,
    is_penalty INTEGER NOT NULL DEFAULT 0 CHECK(is_penalty IN (0,1)),
    is_own_goal INTEGER NOT NULL DEFAULT 0 CHECK(is_own_goal IN (0,1)),
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1)
);

CREATE TABLE IF NOT EXISTS goal_evidence (
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    PRIMARY KEY(goal_id, source_id)
);

CREATE TABLE IF NOT EXISTS appearances (
    id INTEGER PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(id),
    player_id INTEGER NOT NULL REFERENCES players(id),
    starter INTEGER CHECK(starter IN (0,1)),
    entered_minute INTEGER,
    left_minute INTEGER,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    UNIQUE(match_id, player_id, club_id)
);

CREATE TABLE IF NOT EXISTS appearance_evidence (
    appearance_id INTEGER NOT NULL REFERENCES appearances(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    PRIMARY KEY(appearance_id, source_id)
);

CREATE TABLE IF NOT EXISTS player_season_stats (
    id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(id),
    player_id INTEGER NOT NULL REFERENCES players(id),
    appearances INTEGER,
    goals INTEGER,
    yellow_cards INTEGER,
    red_cards INTEGER,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    UNIQUE(season_id, club_id, player_id)
);

CREATE TABLE IF NOT EXISTS player_season_stat_evidence (
    stat_id INTEGER NOT NULL REFERENCES player_season_stats(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    PRIMARY KEY(stat_id, source_id)
);

CREATE TABLE IF NOT EXISTS club_season_stats (
    id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(id),
    position INTEGER,
    played INTEGER,
    points INTEGER,
    wins INTEGER,
    draws INTEGER,
    losses INTEGER,
    goals_for INTEGER,
    goals_against INTEGER,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    UNIQUE(season_id, club_id)
);

CREATE TABLE IF NOT EXISTS club_season_stat_evidence (
    stat_id INTEGER NOT NULL REFERENCES club_season_stats(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    PRIMARY KEY(stat_id, source_id)
);


CREATE TABLE IF NOT EXISTS data_conflicts (
    id INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    existing_value TEXT,
    incoming_value TEXT,
    source_id INTEGER REFERENCES sources(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0,1))
);

CREATE TABLE IF NOT EXISTS question_bank (
    id TEXT PRIMARY KEY,
    question_type TEXT NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 2 CHECK(difficulty BETWEEN 1 AND 5),
    prompt TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    options_json TEXT NOT NULL,
    explanation TEXT,
    season_id INTEGER REFERENCES seasons(id),
    confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
    provenance_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_matches_season_round ON matches(season_id, round_no);
CREATE INDEX IF NOT EXISTS idx_matches_clubs ON matches(home_club_id, away_club_id);
CREATE INDEX IF NOT EXISTS idx_goals_match ON goals(match_id);
CREATE INDEX IF NOT EXISTS idx_goals_player ON goals(player_id);
CREATE INDEX IF NOT EXISTS idx_appearances_player ON appearances(player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_season ON player_season_stats(season_id, club_id);
CREATE INDEX IF NOT EXISTS idx_club_stats_season ON club_season_stats(season_id, position);
CREATE INDEX IF NOT EXISTS idx_questions_type ON question_bank(question_type, enabled);

-- Extended historical/team metadata. Kept in side tables so existing quiz.db files
-- can be migrated safely by running any CLI command (init_db executes this file).
CREATE TABLE IF NOT EXISTS club_profiles (
    club_id INTEGER PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
    short_name TEXT,
    city TEXT,
    founded_year INTEGER,
    crest_path TEXT,
    crest_remote_url TEXT,
    crest_source_url TEXT,
    website_url TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS club_season_memberships (
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    PRIMARY KEY(season_id, club_id)
);

CREATE TABLE IF NOT EXISTS appearance_details (
    appearance_id INTEGER PRIMARY KEY REFERENCES appearances(id) ON DELETE CASCADE,
    shirt_number INTEGER,
    is_captain INTEGER NOT NULL DEFAULT 0 CHECK(is_captain IN (0,1)),
    role TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS match_coverage (
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    dataset TEXT NOT NULL,
    is_complete INTEGER NOT NULL DEFAULT 0 CHECK(is_complete IN (0,1)),
    notes TEXT,
    PRIMARY KEY(match_id, dataset)
);

CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(id),
    player_id INTEGER REFERENCES players(id),
    minute INTEGER,
    card_type TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS idx_club_memberships_season ON club_season_memberships(season_id, club_id);
CREATE INDEX IF NOT EXISTS idx_match_coverage ON match_coverage(match_id, dataset, is_complete);

CREATE TABLE IF NOT EXISTS match_team_coverage (
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    dataset TEXT NOT NULL,
    is_complete INTEGER NOT NULL DEFAULT 0 CHECK(is_complete IN (0,1)),
    notes TEXT,
    PRIMARY KEY(match_id, club_id, dataset)
);

CREATE INDEX IF NOT EXISTS idx_match_team_coverage ON match_team_coverage(match_id, club_id, dataset, is_complete);


CREATE TABLE IF NOT EXISTS player_roster_memberships (
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    role TEXT,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    PRIMARY KEY(season_id, club_id, player_id)
);

CREATE TABLE IF NOT EXISTS player_roster_membership_evidence (
    season_id INTEGER NOT NULL,
    club_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    PRIMARY KEY(season_id, club_id, player_id, source_id),
    FOREIGN KEY(season_id, club_id, player_id) REFERENCES player_roster_memberships(season_id, club_id, player_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS club_season_coverage (
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    dataset TEXT NOT NULL,
    is_complete INTEGER NOT NULL DEFAULT 0 CHECK(is_complete IN (0,1)),
    notes TEXT,
    PRIMARY KEY(season_id, club_id, dataset)
);

CREATE INDEX IF NOT EXISTS idx_roster_memberships ON player_roster_memberships(season_id, club_id, player_id);
CREATE INDEX IF NOT EXISTS idx_club_season_coverage ON club_season_coverage(season_id, club_id, dataset, is_complete);

-- Social/local context layer. These tables store public club posts and other
-- narrative sources separately from official match facts. A post can be linked
-- to a match only after matching/verification; it never overwrites the result.
CREATE TABLE IF NOT EXISTS club_social_pages (
    id INTEGER PRIMARY KEY,
    club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    page_name TEXT,
    page_url TEXT NOT NULL UNIQUE,
    verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    notes TEXT,
    UNIQUE(club_id, platform, page_url)
);

CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY,
    social_page_id INTEGER NOT NULL REFERENCES club_social_pages(id) ON DELETE CASCADE,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    post_url TEXT NOT NULL UNIQUE,
    published_at TEXT,
    text_content TEXT,
    content_hash TEXT,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS social_post_match_links (
    social_post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'related',
    match_score REAL NOT NULL DEFAULT 0.5 CHECK(match_score BETWEEN 0 AND 1),
    verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
    evidence_json TEXT,
    PRIMARY KEY(social_post_id, match_id)
);

CREATE TABLE IF NOT EXISTS match_context_facts (
    id INTEGER PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
    social_post_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    fact_type TEXT NOT NULL,
    subject TEXT,
    value TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
    verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_social_pages_club ON club_social_pages(club_id, platform, verified);
CREATE INDEX IF NOT EXISTS idx_social_posts_page_date ON social_posts(social_page_id, published_at);
CREATE INDEX IF NOT EXISTS idx_social_links_match ON social_post_match_links(match_id, verified, match_score);
CREATE INDEX IF NOT EXISTS idx_match_context_facts ON match_context_facts(match_id, fact_type, verified);

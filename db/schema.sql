-- Production Incident Game - Database Schema
-- PostgreSQL

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    anonymous_id VARCHAR(255) UNIQUE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE UNIQUE INDEX idx_users_anonymous_id ON users(anonymous_id);

-- Scenarios table
CREATE TABLE IF NOT EXISTS scenarios (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    difficulty VARCHAR(50) DEFAULT 'medium',
    max_points INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint on slug
CREATE UNIQUE INDEX idx_scenarios_slug ON scenarios(slug);

-- Nodes table (states in the decision tree)
CREATE TABLE IF NOT EXISTS nodes (
    id SERIAL PRIMARY KEY,
    scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    node_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    content TEXT,
    content_type VARCHAR(50) DEFAULT 'text',
    is_start BOOLEAN DEFAULT FALSE,
    is_terminal BOOLEAN DEFAULT FALSE,
    UNIQUE(scenario_id, node_id)
);

CREATE INDEX idx_nodes_scenario ON nodes(scenario_id);

-- Actions table (choices available at each node)
CREATE TABLE IF NOT EXISTS actions (
    id SERIAL PRIMARY KEY,
    node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    action_order INTEGER DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_actions_node ON actions(node_id);

-- Edges table (transitions from action to node)
CREATE TABLE IF NOT EXISTS edges (
    id SERIAL PRIMARY KEY,
    action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    to_node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edges_action ON edges(action_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_node_id);

-- Attempts table (user's progress through a scenario)
CREATE TABLE IF NOT EXISTS attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    current_node_id INTEGER REFERENCES nodes(id),
    score INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    explanation TEXT
);

CREATE INDEX idx_attempts_user ON attempts(user_id);
CREATE INDEX idx_attempts_scenario ON attempts(scenario_id);

-- Attempt actions table (log of all actions taken)
CREATE TABLE IF NOT EXISTS attempt_actions (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    node_id INTEGER NOT NULL REFERENCES nodes(id),
    action_id INTEGER REFERENCES actions(id),
    action_label VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    points_earned INTEGER DEFAULT 0
);

CREATE INDEX idx_attempt_actions_attempt ON attempt_actions(attempt_id);

-- Admin user (can be created after schema)
-- INSERT INTO users (username, email, is_admin) VALUES ('admin', 'admin@incident.game', TRUE);

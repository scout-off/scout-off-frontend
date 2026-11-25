const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const playerService = require('../playerService');

const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 10;
const MAX_NAME_LENGTH = 100;

// Normalize unicode names (NFKD) and strip combining marks so accents match.
function normalizeName(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseLimit(raw) {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseMinLevel(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function sanitizeFilter(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return null;
  return trimmed;
}

// GET /players/search?name=&limit=&region=&position=&minLevel=
router.get('/search', async (req, res) => {
  try {
    const rawName = typeof req.query.name === 'string' ? req.query.name : '';
    if (rawName.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: 'name query too long' });
    }

    const name = normalizeName(rawName);
    const limit = parseLimit(req.query.limit);
    const region = sanitizeFilter(req.query.region);
    const position = sanitizeFilter(req.query.position);
    const minLevel = parseMinLevel(req.query.minLevel);

    if (!name) {
      return res.json({ players: [] });
    }

    const db = getDb();

    // FTS5 trigram match; bm25 ranks relevance, progress level breaks ties.
    const conditions = ['player_search_fts MATCH ?'];
    const params = [name];

    if (region) {
      conditions.push('ps.region = ?');
      params.push(region);
    }
    if (position) {
      conditions.push('ps.position = ?');
      params.push(position);
    }
    if (minLevel !== null) {
      conditions.push('ps.progress_level >= ?');
      params.push(minLevel);
    }

    params.push(limit);

    const rows = db
      .prepare(
        `SELECT ps.player_id AS playerId,
                ps.name AS name,
                ps.position AS position,
                ps.region AS region,
                ps.nationality AS nationality,
                ps.progress_level AS progressLevel
           FROM player_search_fts fts
           JOIN player_search ps ON ps.rowid = fts.rowid
          WHERE ${conditions.join(' AND ')}
          ORDER BY bm25(player_search_fts), ps.progress_level DESC
          LIMIT ?`
      )
      .all(...params);

    return res.json({ players: rows });
  } catch (err) {
    // Fall back to the service layer if FTS is unavailable.
    try {
      const name = normalizeName(
        typeof req.query.name === 'string' ? req.query.name : ''
      );
      if (!name) return res.json({ players: [] });
      const players = await playerService.searchPlayers(name, {
        limit: parseLimit(req.query.limit),
      });
      return res.json({ players });
    } catch (fallbackErr) {
      return res.status(500).json({ error: 'search failed' });
    }
  }
});

module.exports = router;

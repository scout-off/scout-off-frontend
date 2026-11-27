const db = require('./db');

function toPlayerDTO(row) {
  if (!row) return null;
  return {
    id: row.player_id,
    displayName: row.display_name || null,
    bio: row.bio || null,
    avatarUrl: row.avatar_url || null,
    archived: Boolean(row.archived),
    archivedAt: row.archived_at || null,
    backupWallet: row.backup_wallet || null,
  };
}

function toCommentDTO(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    author: row.author,
    body: row.body,
    createdAt: row.created_at,
  };
}

function ensurePlayer(playerId) {
  db.prepare(
    'INSERT OR IGNORE INTO players_offchain (player_id) VALUES (?)',
  ).run(playerId);
}

function getPlayer(playerId) {
  const row = db
    .prepare('SELECT * FROM players_offchain WHERE player_id = ?')
    .get(playerId);
  return toPlayerDTO(row);
}

function listComments(playerId) {
  const rows = db
    .prepare(
      'SELECT * FROM player_comments WHERE player_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(playerId);
  return rows.map(toCommentDTO);
}

function archivePlayer(playerId) {
  ensurePlayer(playerId);
  db.prepare(
    `UPDATE players_offchain
       SET archived = 1, archived_at = datetime('now'), updated_at = datetime('now')
     WHERE player_id = ?`,
  ).run(playerId);
  return getPlayer(playerId);
}

function unarchivePlayer(playerId) {
  ensurePlayer(playerId);
  db.prepare(
    `UPDATE players_offchain
       SET archived = 0, archived_at = NULL, updated_at = datetime('now')
     WHERE player_id = ?`,
  ).run(playerId);
  return getPlayer(playerId);
}

function removeBackupWallet(playerId) {
  ensurePlayer(playerId);
  db.prepare(
    `UPDATE players_offchain
       SET backup_wallet = NULL, updated_at = datetime('now')
     WHERE player_id = ?`,
  ).run(playerId);
  return getPlayer(playerId);
}

module.exports = {
  getPlayer,
  listComments,
  archivePlayer,
  unarchivePlayer,
  removeBackupWallet,
};

const express = require('express');
const playerService = require('../playerService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function handleError(res, err) {
  const status = err && err.status ? err.status : 500;
  const message = err && err.message ? err.message : 'Internal server error';
  return res.status(status).json({ error: message });
}

// GET /players/:id
router.get('/:id', async (req, res) => {
  try {
    const player = await playerService.getPlayer(req.params.id);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    return res.json(player);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /players/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await playerService.listComments(req.params.id);
    if (comments === null) {
      return res.status(404).json({ error: 'Player not found' });
    }
    return res.json(comments);
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /players/:id/archive
router.post('/:id/archive', requireAuth, async (req, res) => {
  try {
    const player = await playerService.archivePlayer(
      req.params.id,
      req.user.id,
    );
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    return res.json(player);
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /players/:id/unarchive
router.post('/:id/unarchive', requireAuth, async (req, res) => {
  try {
    const player = await playerService.unarchivePlayer(
      req.params.id,
      req.user.id,
    );
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    return res.json(player);
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /players/:id/backup-wallet/remove
router.post('/:id/backup-wallet/remove', requireAuth, async (req, res) => {
  try {
    const player = await playerService.removeBackupWallet(
      req.params.id,
      req.user.id,
    );
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    return res.json(player);
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;

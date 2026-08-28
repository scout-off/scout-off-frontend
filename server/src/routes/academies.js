const express = require('express');
const academyService = require('../academyService');

const router = express.Router();

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// POST /academies
// Body: { name: string, ownerWallet: string, createdBy: string }
// Admin-gated by the caller (see app/api/admin/academies/route.ts) —
// this service has no auth of its own, matching the referrals router.
router.post('/', (req, res) => {
  const { name, ownerWallet, createdBy } = req.body ?? {};
  if (
    !isNonEmptyString(name) ||
    !isNonEmptyString(ownerWallet) ||
    !isNonEmptyString(createdBy)
  ) {
    return res
      .status(400)
      .json({ error: 'name, ownerWallet, and createdBy are required' });
  }

  try {
    const academy = academyService.createAcademy(name, ownerWallet, createdBy);
    return res.status(201).json(academy);
  } catch (err) {
    if (err instanceof academyService.WalletAlreadyAssignedError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
});

// GET /academies
router.get('/', (req, res) => {
  return res.json(academyService.listAcademies());
});

// GET /academies/wallet/:wallet
// Public lookup — unauthenticated, used by milestone-attribution UI
// (ValidatorChip) to show "Academy X" instead of a bare wallet address.
router.get('/wallet/:wallet', (req, res) => {
  const academy = academyService.getAcademyForWallet(req.params.wallet);
  if (!academy) {
    return res
      .status(404)
      .json({ error: 'Wallet is not a registered signer for any academy' });
  }
  return res.json(academy);
});

// GET /academies/owner/:wallet
// Used by app/api/admin/academies/mine (see lib/academyAuth.ts) to resolve
// whether a session wallet is a scoped academy-owner (issue #1173). Not
// itself an admin action — it only reveals which academies (if any) a
// wallet owns, the same shape of information `GET /academies` already
// exposes to any super-admin caller. Route-level authorization for actually
// *managing* a roster is enforced by the Next.js proxy, not here — this
// service has no auth of its own, matching every other route in this file.
router.get('/owner/:wallet', (req, res) => {
  return res.json(academyService.listAcademiesByOwnerWallet(req.params.wallet));
});

// POST /academies/:id/members
// Body: { wallet: string, addedBy: string }
router.post('/:id/members', (req, res) => {
  const { wallet, addedBy } = req.body ?? {};
  if (!isNonEmptyString(wallet) || !isNonEmptyString(addedBy)) {
    return res.status(400).json({ error: 'wallet and addedBy are required' });
  }

  try {
    const academy = academyService.addMember(req.params.id, wallet, addedBy);
    return res.status(201).json(academy);
  } catch (err) {
    if (err instanceof academyService.AcademyNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof academyService.WalletAlreadyAssignedError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
});

// DELETE /academies/:id/members/:wallet
router.delete('/:id/members/:wallet', (req, res) => {
  const removed = academyService.removeMember(req.params.id, req.params.wallet);
  if (!removed) {
    return res.status(404).json({ error: 'Membership not found' });
  }
  return res.json({ success: true });
});

// PATCH /academies/:id/quorum
// Body: { quorum: number | null } — see issue #1185. null clears a
// previously-configured quorum, restoring today's default behavior.
router.patch('/:id/quorum', (req, res) => {
  const { quorum } = req.body ?? {};
  if (quorum !== null && (!Number.isInteger(quorum) || quorum < 1)) {
    return res
      .status(400)
      .json({ error: 'quorum must be a positive integer, or null to clear it' });
  }

  try {
    const academy = academyService.setAcademyQuorum(req.params.id, quorum);
    return res.json(academy);
  } catch (err) {
    if (err instanceof academyService.AcademyNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    throw err;
  }
});

module.exports = router;

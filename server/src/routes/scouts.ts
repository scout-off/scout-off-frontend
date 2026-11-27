import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

/**
 * Scout off-chain data model and endpoints.
 *
 * Profile fields (display name, organisation, bio) are off-chain and editable
 * only by the scout's own wallet. Contact and trial-offer counts are derived
 * from indexed on-chain events (`pay_to_contact`, `log_trial_offer`) via the
 * indexer event store, never from client-incremented counters.
 */

export interface ScoutProfile {
  id: string;
  displayName: string;
  organisation: string;
  bio: string;
  updatedAt: string;
}

export interface ScoutStats {
  scoutId: string;
  contacts: number;
  trialOffers: number;
}

export interface ScoutContact {
  playerId: string;
  contactedAt: string;
  txHash?: string;
}

export interface ScoutStore {
  getProfile(id: string): Promise<ScoutProfile | null>;
  upsertProfile(
    id: string,
    patch: Partial<Omit<ScoutProfile, 'id' | 'updatedAt'>>,
  ): Promise<ScoutProfile>;
  countEvents(scoutId: string, type: string): Promise<number>;
  listContacts(scoutId: string): Promise<ScoutContact[]>;
}

export interface ScoutRouterDeps {
  store: ScoutStore;
  /** Resolves the authenticated wallet for a request, or null when unauthenticated. */
  getAuthenticatedWallet(req: Request): string | null;
}

const MAX_DISPLAY_NAME = 64;
const MAX_ORGANISATION = 128;
const MAX_BIO = 1000;

const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME).optional(),
    organisation: z.string().trim().max(MAX_ORGANISATION).optional(),
    bio: z.string().trim().max(MAX_BIO).optional(),
  })
  .strict();

const CONTACT_EVENT = 'pay_to_contact';
const TRIAL_OFFER_EVENT = 'log_trial_offer';

function isOwner(
  req: Request,
  deps: ScoutRouterDeps,
  scoutId: string,
): boolean {
  const wallet = deps.getAuthenticatedWallet(req);
  if (!wallet) return false;
  return wallet.toLowerCase() === scoutId.toLowerCase();
}

export function createScoutRouter(deps: ScoutRouterDeps): Router {
  const router = Router();

  // GET /scouts/:id — public profile, or 404.
  router.get('/:id', async (req: Request, res: Response) => {
    const profile = await deps.store.getProfile(req.params.id);
    if (!profile) {
      res.status(404).json({ error: 'scout_not_found' });
      return;
    }
    res.json(profile);
  });

  // PUT /scouts/:id — owner-only profile edit with length validation.
  router.put('/:id', async (req: Request, res: Response) => {
    const scoutId = req.params.id;
    if (!isOwner(req, deps, scoutId)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'invalid_profile', details: parsed.error.flatten() });
      return;
    }

    const profile = await deps.store.upsertProfile(scoutId, parsed.data);
    res.json(profile);
  });

  // GET /scouts/:id/stats — counts derived from indexed on-chain events.
  router.get('/:id/stats', async (req: Request, res: Response) => {
    const scoutId = req.params.id;
    const [contacts, trialOffers] = await Promise.all([
      deps.store.countEvents(scoutId, CONTACT_EVENT),
      deps.store.countEvents(scoutId, TRIAL_OFFER_EVENT),
    ]);
    const stats: ScoutStats = { scoutId, contacts, trialOffers };
    res.json(stats);
  });

  // GET /scouts/:id/contacts — owner-only; commercially sensitive.
  router.get('/:id/contacts', async (req: Request, res: Response) => {
    const scoutId = req.params.id;
    if (!isOwner(req, deps, scoutId)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const contacts = await deps.store.listContacts(scoutId);
    res.json({ scoutId, contacts });
  });

  return router;
}

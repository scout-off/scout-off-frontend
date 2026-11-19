import type { Database } from '../db';

export interface ScoutProfile {
  id: string;
  displayName: string;
  organisation: string;
  bio: string;
  updatedAt: string;
}

export interface ScoutStats {
  contacts: number;
  trialOffers: number;
}

export interface ScoutContact {
  playerId: string;
  contactedAt: string;
}

export interface ScoutProfileInput {
  displayName?: string;
  organisation?: string;
  bio?: string;
}

export const PROFILE_LIMITS = {
  displayName: 80,
  organisation: 120,
  bio: 1000,
} as const;

export class ScoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoutValidationError';
  }
}

export class ScoutForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ScoutForbiddenError';
  }
}

interface ScoutRow {
  id: string;
  display_name: string | null;
  organisation: string | null;
  bio: string | null;
  updated_at: string | null;
}

interface EventRow {
  type: string;
  payload: string | null;
  created_at: string | null;
}

function toProfile(row: ScoutRow): ScoutProfile {
  return {
    id: row.id,
    displayName: row.display_name ?? '',
    organisation: row.organisation ?? '',
    bio: row.bio ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

function validateField(field: keyof typeof PROFILE_LIMITS, value: unknown): string {
  if (typeof value !== 'string') {
    throw new ScoutValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > PROFILE_LIMITS[field]) {
    throw new ScoutValidationError(
      `${field} must be at most ${PROFILE_LIMITS[field]} characters`,
    );
  }
  return trimmed;
}

function parsePayload(payload: string | null): Record<string, unknown> {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function eventScoutId(payload: Record<string, unknown>): string | null {
  const candidate = payload.scout ?? payload.scoutId ?? payload.scout_id;
  return typeof candidate === 'string' ? candidate : null;
}

function eventPlayerId(payload: Record<string, unknown>): string | null {
  const candidate = payload.player ?? payload.playerId ?? payload.player_id;
  return typeof candidate === 'string' ? candidate : null;
}

export class ScoutService {
  constructor(private readonly db: Database) {}

  async getProfile(id: string): Promise<ScoutProfile | null> {
    const row = await this.db.get<ScoutRow>(
      'SELECT id, display_name, organisation, bio, updated_at FROM scouts WHERE id = ?',
      [id],
    );
    return row ? toProfile(row) : null;
  }

  async updateProfile(
    id: string,
    requester: string,
    input: ScoutProfileInput,
  ): Promise<ScoutProfile> {
    if (!requester || requester !== id) {
      throw new ScoutForbiddenError('Only the owning scout may edit this profile');
    }

    const updates: Record<string, string> = {};
    if (input.displayName !== undefined) {
      updates.display_name = validateField('displayName', input.displayName);
    }
    if (input.organisation !== undefined) {
      updates.organisation = validateField('organisation', input.organisation);
    }
    if (input.bio !== undefined) {
      updates.bio = validateField('bio', input.bio);
    }

    const existing = await this.getProfile(id);
    if (!existing) {
      await this.db.run(
        'INSERT INTO scouts (id, display_name, organisation, bio, updated_at) VALUES (?, ?, ?, ?, ?)',
        [
          id,
          updates.display_name ?? '',
          updates.organisation ?? '',
          updates.bio ?? '',
          new Date().toISOString(),
        ],
      );
    } else if (Object.keys(updates).length > 0) {
      const assignments = Object.keys(updates).map((column) => `${column} = ?`);
      assignments.push('updated_at = ?');
      await this.db.run(
        `UPDATE scouts SET ${assignments.join(', ')} WHERE id = ?`,
        [...Object.values(updates), new Date().toISOString(), id],
      );
    }

    const profile = await this.getProfile(id);
    if (!profile) {
      throw new Error('Failed to persist scout profile');
    }
    return profile;
  }

  private async scoutEvents(id: string, type: string): Promise<EventRow[]> {
    return this.db.all<EventRow>(
      'SELECT type, payload, created_at FROM contract_events WHERE type = ? ORDER BY created_at ASC',
      [type],
    );
  }

  async getStats(id: string): Promise<ScoutStats> {
    const [contactEvents, trialEvents] = await Promise.all([
      this.scoutEvents(id, 'pay_to_contact'),
      this.scoutEvents(id, 'log_trial_offer'),
    ]);

    const contacts = new Set<string>();
    for (const event of contactEvents) {
      const payload = parsePayload(event.payload);
      if (eventScoutId(payload) !== id) continue;
      const playerId = eventPlayerId(payload);
      if (playerId) contacts.add(playerId);
    }

    let trialOffers = 0;
    for (const event of trialEvents) {
      const payload = parsePayload(event.payload);
      if (eventScoutId(payload) === id) trialOffers += 1;
    }

    return { contacts: contacts.size, trialOffers };
  }

  async getContacts(id: string, requester: string): Promise<ScoutContact[]> {
    if (!requester || requester !== id) {
      throw new ScoutForbiddenError('Contacts are visible only to the owning scout');
    }

    const events = await this.scoutEvents(id, 'pay_to_contact');
    const contacts = new Map<string, string>();
    for (const event of events) {
      const payload = parsePayload(event.payload);
      if (eventScoutId(payload) !== id) continue;
      const playerId = eventPlayerId(payload);
      if (!playerId) continue;
      const contactedAt = event.created_at ?? '';
      const previous = contacts.get(playerId);
      if (!previous || contactedAt < previous) {
        contacts.set(playerId, contactedAt);
      }
    }

    return Array.from(contacts.entries())
      .map(([playerId, contactedAt]) => ({ playerId, contactedAt }))
      .sort((a, b) => (a.contactedAt < b.contactedAt ? -1 : 1));
  }
}

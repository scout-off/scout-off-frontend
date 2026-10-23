/**
 * Scout-domain API helpers (issue #1516).
 *
 * All calls go through the shared axios client against the external backend.
 */
import { backendClient as api } from './playersApi';
import type { ScoutContact } from '../scoutContactsCsv';

export interface ScoutStats {
  contactedCount: number;
  trialOffersCount: number;
}

export const fetchScoutProfile = (scoutId: string) =>
  api.get(`/scouts/${scoutId}`).then((r) => r.data);

export const fetchScoutContacts = (scoutId: string): Promise<ScoutContact[]> =>
  api.get(`/scouts/${scoutId}/contacts`).then((r) => r.data);

export const fetchScoutStats = (scoutId: string): Promise<ScoutStats> =>
  api.get(`/scouts/${scoutId}/stats`).then((r) => r.data);

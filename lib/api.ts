/**
 * lib/api.ts — backward-compatible re-export facade (issue #1516).
 *
 * The 615-line monolith has been split into focused domain modules under
 * lib/api/. This file re-exports everything from those modules so all
 * existing `import … from 'lib/api'` or `import … from '@/lib/api'`
 * call-sites continue to work without change.
 *
 * New code should import directly from the domain module it needs,
 * e.g. `import { fetchAcademies } from '@/lib/api/academiesApi'`.
 */

export {
  backendClient,
  SearchRateLimitedError,
  fetchPlayerProfile,
  searchPlayersByName,
  fetchPlayerComments,
  archivePlayerProfile,
  unarchivePlayerProfile,
  linkBackupWallet,
  removeBackupWallet,
  claimAccountWithBackupWallet,
} from './api/playersApi';

export {
  fetchScoutProfile,
  fetchScoutContacts,
  fetchScoutStats,
} from './api/scoutsApi';
export type { ScoutStats } from './api/scoutsApi';

export { subscribeToPush, unsubscribeFromPush } from './api/pushApi';

export { fetchActivityEvents } from './api/activityApi';
export type { ActivityEventType, ActivityEvent } from './api/activityApi';

export { fetchValidatorMilestoneCount } from './api/validatorsApi';

export {
  generateReferralCode,
  getReferralStats,
  listReferralCodes,
  fetchAllReferralCodes,
  getReferralOverview,
} from './api/referralsApi';

export {
  checkFraudThrottle,
  REFERRAL_THROTTLE_MESSAGE,
  redeemReferralCode,
  fetchFraudFlags,
  fetchFraudFlagsStatus,
  fetchFraudThrottles,
  liftFraudThrottle,
  dismissFraudFlag,
} from './api/fraudApi';

export {
  fetchAcademies,
  fetchMyAcademies,
  createAcademy,
  addAcademyMember,
  removeAcademyMember,
  setAcademyQuorum,
  fetchAcademyForWallet,
  fetchMilestoneEndorsements,
  endorseMilestone,
  fetchAcademyMilestoneRollup,
} from './api/academiesApi';

export {
  fetchPendingMilestoneSubmissions,
  decideMilestoneSubmission,
  createMilestoneSubmission,
} from './api/milestoneSubmissionsApi';

export { joinSponsorshipWaitlist } from './api/sponsorshipApi';
export type { InterestType } from './api/sponsorshipApi';

// Default export: the shared axios backend client, matching the previous
// `export default api` so any `import api from '@/lib/api'` still works.
export { backendClient as default } from './api/playersApi';

/**
 * Barrel re-export for all domain API modules (issue #1516).
 *
 * lib/api.ts now re-exports from here; consumers can either continue
 * importing from `lib/api` (unchanged), or migrate to the specific
 * domain module for better tree-shaking and clearer ownership.
 */

export { backendClient } from './playersApi';
export {
  SearchRateLimitedError,
  fetchPlayerProfile,
  searchPlayersByName,
  fetchPlayerComments,
  archivePlayerProfile,
  unarchivePlayerProfile,
  linkBackupWallet,
  removeBackupWallet,
  claimAccountWithBackupWallet,
} from './playersApi';

export {
  fetchScoutProfile,
  fetchScoutContacts,
  fetchScoutStats,
} from './scoutsApi';
export type { ScoutStats } from './scoutsApi';

export { subscribeToPush, unsubscribeFromPush } from './pushApi';

export { fetchActivityEvents } from './activityApi';
export type { ActivityEventType, ActivityEvent } from './activityApi';

export { fetchValidatorMilestoneCount } from './validatorsApi';

export {
  generateReferralCode,
  getReferralStats,
  listReferralCodes,
  fetchAllReferralCodes,
  getReferralOverview,
} from './referralsApi';

export {
  checkFraudThrottle,
  REFERRAL_THROTTLE_MESSAGE,
  redeemReferralCode,
  fetchFraudFlags,
  fetchFraudFlagsStatus,
  fetchFraudThrottles,
  liftFraudThrottle,
  dismissFraudFlag,
} from './fraudApi';

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
} from './academiesApi';

export {
  fetchPendingMilestoneSubmissions,
  decideMilestoneSubmission,
  createMilestoneSubmission,
} from './milestoneSubmissionsApi';

export { joinSponsorshipWaitlist } from './sponsorshipApi';
export type { InterestType } from './sponsorshipApi';

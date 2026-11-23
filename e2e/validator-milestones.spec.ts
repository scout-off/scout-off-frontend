import { test, expect } from './fixtures';
import {
  DEFAULT_PLAYER,
  mockSorobanRpc,
  scv,
  type SorobanRpcMock,
} from './fixtures/mock-contract';
import { mockIndexer } from './fixtures/mock-indexer';

const MILESTONE = 'Signed first professional contract';

test.describe('validator approve / revoke milestone', () => {
  test('approves a milestone, verifies progress, then revokes and verifies revert', async ({
    page,
    wallet,
  }) => {
    test.setTimeout(120_000);

    // get_player reflects what this test has submitted so far: approving
    // adds a milestone and bumps the level, revoking takes it away again.
    let rpc: SorobanRpcMock | null = null;
    const approved = () =>
      (rpc?.submitted.filter((m) => m === 'approve_milestone').length ?? 0) >
      (rpc?.submitted.filter((m) => m === 'revoke_milestone').length ?? 0);
    rpc = mockSorobanRpc(page, {
      isValidator: true,
      returns: {
        // The approve/revoke forms check membership in this list
        // (hooks/useValidator.ts), not is_validator.
        get_validators: scv([
          { address: wallet.publicKey, addedAt: 1_700_000_000 },
        ]),
        get_player: () =>
          scv(
            approved()
              ? {
                  ...DEFAULT_PLAYER,
                  progressLevel: 2,
                  milestones: [
                    {
                      id: 'm-1',
                      description: MILESTONE,
                      evidenceHash: '',
                      validator: wallet.publicKey,
                      timestamp: 1_700_000_100,
                    },
                  ],
                }
              : DEFAULT_PLAYER,
          ),
      },
    });
    mockIndexer(page);
    // Approval waits for the indexer to see the event before reporting
    // success (lib/confirmApprovalSubmission.ts) — serve it once submitted.
    await page.route('**/api/indexer/players/*/events**', (route) =>
      route.fulfill({
        json: {
          events: approved()
            ? [
                {
                  id: 1,
                  type: 'milestone_approved',
                  validator: wallet.publicKey,
                  playerId: DEFAULT_PLAYER.id,
                  ledger: 1000,
                  timestamp: 1_700_000_100,
                  data: {},
                },
              ]
            : [],
          nextCursor: null,
        },
      }),
    );

    await page.goto('/en');
    await page.getByRole('button', { name: 'Connect Wallet' }).click();
    await page.getByRole('button', { name: /freighter/i }).click();
    await expect(
      page.getByText(
        wallet.publicKey.slice(0, 4) + '…' + wallet.publicKey.slice(-4),
      ),
    ).toBeVisible();

    await page.goto('/en/validator', { timeout: 60_000 });

    // ── Approve ────────────────────────────────────────────────────────────
    const search = page.getByLabel('Search players');
    await search.fill(DEFAULT_PLAYER.id);
    await page.getByRole('button', { name: 'Select', exact: true }).click();

    const approveForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'Approve Milestone' }),
    });
    await approveForm.getByLabel('Player ID').fill(DEFAULT_PLAYER.id);
    await approveForm.getByRole('button', { name: 'Look up' }).click();
    await expect(approveForm.getByText('Test Player')).toBeVisible();
    await approveForm.getByLabel('Milestone Description').fill(MILESTONE);
    await approveForm
      .getByLabel('Evidence URL')
      .fill('https://example.com/evidence');
    await approveForm
      .getByRole('button', { name: 'Approve Milestone' })
      .click();

    await expect(approveForm.getByText('Transaction confirmed.')).toBeVisible({
      timeout: 30_000,
    });
    expect(rpc.submitted).toContain('approve_milestone');

    // ── Verify progress, then revoke ───────────────────────────────────────
    // Re-run the search so the selected player reflects the new milestone.
    await search.fill('');
    await search.fill(DEFAULT_PLAYER.id);
    await expect(page.getByText('Performance Milestones')).toBeVisible();
    await page.getByRole('button', { name: 'Select', exact: true }).click();

    await page.getByRole('button', { name: MILESTONE }).click();
    await page
      .getByRole('button', { name: 'Revoke Selected Milestone' })
      .click();
    await page
      .getByRole('dialog', { name: 'Revoke Milestone' })
      .getByRole('button', { name: 'Confirm' })
      .click();

    await expect(
      page.getByText('✓ Milestone revoked successfully'),
    ).toBeVisible({ timeout: 30_000 });
    expect(rpc.submitted).toContain('revoke_milestone');

    // ── Verify revert ──────────────────────────────────────────────────────
    await search.fill('');
    await search.fill(DEFAULT_PLAYER.id);
    await expect(page.getByText('Verified Identity')).toBeVisible();
  });
});

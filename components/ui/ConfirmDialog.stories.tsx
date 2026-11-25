import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from '@storybook/test';
import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import Button from './Button';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  args: { onConfirm: fn(), onCancel: fn() },
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

/**
 * Default confirmation dialog — non-destructive, used for neutral confirmations
 * such as pausing a contract or confirming a settings change.
 */
export const Default: Story = {
  args: {
    isOpen: true,
    title: 'Remove Validator',
    message:
      'Are you sure you want to remove this validator? This action cannot be undone.',
  },
};

/**
 * Destructive action dialog — confirm button signals danger.
 * The component always renders its confirm button with `variant="danger"`,
 * so this story documents that the default appearance is already destructive.
 * Pass a `confirmLabel` that reinforces the irreversible nature of the action.
 */
export const Destructive: Story = {
  name: 'Destructive action',
  args: {
    isOpen: true,
    title: 'Archive Player Profile',
    message:
      'Archiving this profile will hide it from scouts and remove it from search results. This cannot be reversed without contacting support.',
    confirmLabel: 'Archive Profile',
    cancelLabel: 'Keep Profile',
  },
};

/**
 * Loading / pending state — the confirm button shows a spinner and is disabled
 * while an async operation (e.g. an on-chain transaction) is in progress.
 */
export const Loading: Story = {
  args: {
    isOpen: true,
    title: 'Confirm Withdrawal',
    message: 'Withdraw all accumulated platform fees to the admin wallet?',
    loading: true,
  },
};

export const LongDescription: Story = {
  name: 'Long description (scroll test)',
  args: {
    isOpen: true,
    title: 'Revoke All Validator Privileges',
    message:
      'You are about to revoke validator privileges for this wallet. This means they will no longer be able to approve milestones, manage player profiles, or access the validator dashboard. All pending milestones assigned to this validator will be reassigned to the next available validator. This action is permanent and cannot be reversed without re-adding the validator manually through the admin dashboard. Please double-check the wallet address before proceeding.',
    confirmLabel: 'Yes, Revoke',
    cancelLabel: 'Cancel',
  },
};

export const Interactive: Story = {
  name: 'Interactive (open/close)',
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);
      const [loading, setLoading] = useState(false);

      const handleConfirm = async () => {
        setLoading(true);
        await new Promise((r) => setTimeout(r, 1500));
        setLoading(false);
        setOpen(false);
      };

      return (
        <div className="p-8">
          <Button variant="danger" onClick={() => setOpen(true)}>
            Remove Validator
          </Button>
          <ConfirmDialog
            isOpen={open}
            onConfirm={handleConfirm}
            onCancel={() => setOpen(false)}
            title="Remove Validator"
            message="This will permanently revoke this wallet's validator privileges on-chain."
            confirmLabel="Remove"
            loading={loading}
          />
        </div>
      );
    }
    return <Demo />;
  },
};

/** Helper: renders a trigger button that opens ConfirmDialog so we can verify
 *  focus restoration after Escape / Cancel. */
function ConfirmDialogDemo({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-8">
      <Button data-testid="open-btn" variant="danger" onClick={() => setOpen(true)}>
        Remove Validator
      </Button>
      <ConfirmDialog
        isOpen={open}
        onConfirm={() => { onConfirm(); setOpen(false); }}
        onCancel={() => { onCancel(); setOpen(false); }}
        title="Remove Validator"
        message="This will permanently revoke validator privileges."
        confirmLabel="Remove"
        cancelLabel="Keep"
      />
    </div>
  );
}

/**
 * Verifies aria semantics for ConfirmDialog: role="dialog", aria-modal="true",
 * aria-labelledby pointing at the visible h2 title, aria-describedby pointing
 * at the message paragraph.
 */
export const AriaSemantics: Story = {
  name: 'ARIA semantics (play)',
  tags: ['play-fn'],
  args: {
    isOpen: true,
    title: 'Remove Validator',
    message: 'Remove this validator?',
  },
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement).findByRole('dialog');

    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelId = dialog.getAttribute('aria-labelledby');
    await expect(labelId).toBeTruthy();
    const labelEl = canvasElement.querySelector(`#${labelId}`);
    await expect(labelEl).not.toBeNull();
    await expect(labelEl).toHaveTextContent('Remove Validator');

    const descId = dialog.getAttribute('aria-describedby');
    await expect(descId).toBeTruthy();
    const descEl = canvasElement.querySelector(`#${descId}`);
    await expect(descEl).not.toBeNull();
    await expect(descEl).toHaveTextContent('Remove this validator?');
  },
};

/**
 * Focus trap: Tab and Shift+Tab stay inside the dialog; Escape closes it and
 * returns focus to the trigger button.
 */
export const FocusTrapPlay: Story = {
  name: 'Focus trap and Escape (play)',
  tags: ['play-fn'],
  render: (args) => (
    <ConfirmDialogDemo
      onConfirm={args.onConfirm as () => void}
      onCancel={args.onCancel as () => void}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByTestId('open-btn');

    await userEvent.click(trigger);

    const dialog = await canvas.findByRole('dialog');

    // Initial focus lands inside the dialog after the opening rAF tick.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    // Tab forward — every step must keep focus inside.
    const tabbable = within(dialog).getAllByRole('button');
    for (let i = 0; i <= tabbable.length; i++) {
      await userEvent.tab();
      await expect(dialog.contains(document.activeElement)).toBe(true);
    }

    // Shift+Tab backward — same constraint.
    for (let i = 0; i <= tabbable.length; i++) {
      await userEvent.tab({ shift: true });
      await expect(dialog.contains(document.activeElement)).toBe(true);
    }

    // Escape closes and restores focus to the trigger.
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(canvas.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** Interaction test (issue #1322): Cancel, Escape and Confirm call the right handlers. */
export const ConfirmCancelPlay: Story = {
  name: 'Confirm / cancel (play)',
  tags: ['play-fn'],
  args: {
    isOpen: true,
    title: 'Remove Validator',
    message: 'Remove this validator?',
    confirmLabel: 'Remove',
    cancelLabel: 'Keep',
  },
  play: async ({ args, canvasElement }) => {
    const dialog = within(await within(canvasElement).findByRole('dialog'));

    await userEvent.click(dialog.getByRole('button', { name: 'Keep' }));
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    await expect(args.onCancel).toHaveBeenCalledTimes(2);

    await userEvent.click(dialog.getByRole('button', { name: 'Remove' }));
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
  },
};

/**
 * Confirm fires exactly once even when the button is pressed twice quickly —
 * provided the caller puts the dialog in a loading state while the async
 * handler runs. This story simulates that pattern with a stateful render.
 *
 * Without a loading state the button stays enabled between clicks, so a
 * double-press would fire twice. If a useSubmissionGuard is added to
 * ConfirmDialog itself, this story's render can be simplified to just args.
 */
export const ConfirmOncePlay: Story = {
  name: 'Confirm fires once on double-press (play)',
  tags: ['play-fn'],
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(true);
      const [loading, setLoading] = useState(false);
      const [callCount, setCallCount] = useState(0);

      const handleConfirm = async () => {
        setLoading(true);
        setCallCount((n) => n + 1);
        // Simulate an async operation (e.g. on-chain tx) keeping the button
        // disabled so a second click cannot fire while the first is in flight.
        await new Promise((r) => setTimeout(r, 200));
        setLoading(false);
        setOpen(false);
      };

      return (
        <div className="p-8">
          <p data-testid="call-count">{callCount}</p>
          <ConfirmDialog
            isOpen={open}
            onConfirm={handleConfirm}
            onCancel={() => setOpen(false)}
            title="Archive Player"
            message="Archive this player profile?"
            confirmLabel="Archive"
            cancelLabel="Cancel"
            loading={loading}
          />
        </div>
      );
    }
    return <Demo />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = within(await canvas.findByRole('dialog'));
    const confirmBtn = dialog.getByRole('button', { name: 'Archive' });

    // Click once — the button goes into a loading state immediately,
    // so the second click hits a disabled button and cannot fire.
    await userEvent.click(confirmBtn);
    await userEvent.click(confirmBtn);

    // Wait for the async handler to resolve and the dialog to close.
    await waitFor(() =>
      expect(canvas.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The counter must be exactly 1.
    await expect(canvas.getByTestId('call-count')).toHaveTextContent('1');
  },
};

/** Interaction test: while loading, neither button can fire. */
export const LoadingBlocksPlay: Story = {
  name: 'Loading blocks actions (play)',
  tags: ['play-fn'],
  args: {
    isOpen: true,
    title: 'Confirm Withdrawal',
    message: 'Withdraw all fees?',
    loading: true,
  },
  play: async ({ args, canvasElement }) => {
    const dialog = within(await within(canvasElement).findByRole('dialog'));
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: /Confirm/ }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }), {
      pointerEventsCheck: 0,
    });
    await expect(args.onCancel).not.toHaveBeenCalled();
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};

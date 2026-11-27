import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from '@storybook/test';
import { useState } from 'react';
import QRModal from './QRModal';
import Button from './Button';

const meta: Meta<typeof QRModal> = {
  title: 'UI/QRModal',
  component: QRModal,
  tags: ['autodocs'],
  args: { onClose: fn() },
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof QRModal>;

// Obviously-fake sample URL — not a real profile link.
const SAMPLE_URL = 'https://scout-off.example/player/DEMO-PLAYER-0001';

export const Open: Story = {
  args: {
    isOpen: true,
    url: SAMPLE_URL,
  },
};

export const WithCustomTitle: Story = {
  args: {
    isOpen: true,
    url: SAMPLE_URL,
    title: 'Share This Profile',
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
    url: SAMPLE_URL,
  },
};

/** Helper: renders a trigger button that opens QRModal so we can verify focus
 *  restoration after close. */
function QRModalDemo({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-8">
      <Button data-testid="open-btn" onClick={() => setOpen(true)}>
        Share Profile
      </Button>
      <QRModal
        isOpen={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        url={SAMPLE_URL}
        title="Share This Profile"
      />
    </div>
  );
}

/**
 * Verifies aria semantics: role="dialog", aria-modal="true", and an accessible
 * name via aria-labelledby pointing at the visible title element.
 */
export const AriaSemantics: Story = {
  name: 'ARIA semantics (play)',
  tags: ['play-fn'],
  args: {
    isOpen: true,
    url: SAMPLE_URL,
    title: 'Share This Profile',
  },
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement).findByRole('dialog');

    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelId = dialog.getAttribute('aria-labelledby');
    await expect(labelId).toBeTruthy();
    const labelEl = canvasElement.ownerDocument.getElementById(labelId!);
    await expect(labelEl).not.toBeNull();
    await expect(labelEl).toHaveTextContent('Share This Profile');
  },
};

/**
 * Verifies that:
 *  - The QR canvas renders inside the dialog.
 *  - Opening moves focus to the first focusable element (the close button or
 *    the Download QR button — both inside the dialog).
 *  - Tab and Shift+Tab keep focus trapped inside the dialog.
 *  - Escape closes the modal and returns focus to the trigger button.
 */
export const FocusTrapPlay: Story = {
  name: 'Focus trap and Escape (play)',
  tags: ['play-fn'],
  render: (args) => <QRModalDemo onClose={args.onClose as () => void} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByTestId('open-btn');

    await userEvent.click(trigger);

    const dialog = await canvas.findByRole('dialog');

    // The QR code canvas should be present inside the dialog.
    await expect(dialog.querySelector('canvas')).not.toBeNull();

    // Initial focus lands inside the dialog after the opening rAF tick.
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );

    // Tab forward — every step must keep focus inside the dialog.
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

    // Escape closes and restores focus to the trigger button.
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(canvas.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** Interaction test (issue #1322): the QR code renders and Escape closes the dialog. */
export const ClosePlay: Story = {
  name: 'Renders and closes (play)',
  tags: ['play-fn'],
  args: { isOpen: true, url: SAMPLE_URL },
  play: async ({ args, canvasElement }) => {
    const dialog = await within(canvasElement).findByRole('dialog');
    await expect(dialog.querySelector('canvas, img, svg')).not.toBeNull();
    await expect(dialog).toHaveTextContent(SAMPLE_URL);

    await userEvent.keyboard('{Escape}');
    await expect(args.onClose).toHaveBeenCalled();
  },
};

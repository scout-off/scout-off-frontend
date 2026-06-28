'use client';

/**
 * TruncatedAddress
 *
 * Displays a Stellar wallet address in a compact "GABC…WXYZ" format.
 *
 * On hover / focus a tooltip shows the full address alongside a
 * copy-to-clipboard button. Feedback ("Copied!") replaces the copy icon
 * briefly after a successful write so the user knows it worked.
 *
 * Usage:
 *   <TruncatedAddress address="GABC...XYZ" />
 *   <TruncatedAddress address="GABC...XYZ" className="text-white" />
 */

import { useState, useRef, useEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface TruncatedAddressProps {
  /** Full Stellar public key (56-character G… string). */
  address: string;
  /** Optional extra classes applied to the trigger `<span>`. */
  className?: string;
}

interface Position {
  top: number;
  left: number;
  above: boolean;
}

const FLIP_THRESHOLD = 80;
const AUTO_HIDE_MS = 5000;
const COPIED_RESET_MS = 2000;

function truncate(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function computePosition(el: HTMLElement): Position {
  const rect = el.getBoundingClientRect();
  const above = rect.top > FLIP_THRESHOLD;
  return {
    top: above ? rect.top - 6 : rect.bottom + 6,
    left: rect.left + rect.width / 2,
    above,
  };
}

export default function TruncatedAddress({
  address,
  className,
}: TruncatedAddressProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    above: true,
  });

  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  // ── Tooltip show / hide ──────────────────────────────────────────────────

  const clearHide = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearHide();
    if (triggerRef.current) setPosition(computePosition(triggerRef.current));
    setVisible(true);
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }, [clearHide]);

  const hide = useCallback(() => {
    clearHide();
    setVisible(false);
  }, [clearHide]);

  useEffect(
    () => () => {
      clearHide();
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    },
    [clearHide],
  );

  // ── Copy to clipboard ────────────────────────────────────────────────────

  const copy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        if (copyTimer.current !== null) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
      } catch {
        // Clipboard API unavailable — silent fail.
      }
    },
    [address],
  );

  // ── Tooltip position styles ──────────────────────────────────────────────

  const tooltipStyle = position.above
    ? {
        top: position.top,
        left: position.left,
        transform: 'translate(-50%, -100%)',
      }
    : {
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
      };

  return (
    <span className="inline-flex" ref={triggerRef}>
      {/* Trigger */}
      <span
        aria-describedby={visible ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        role="button"
        aria-label={`Wallet address ${address}`}
        className={[
          'font-mono cursor-default select-all outline-none',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {truncate(address)}
      </span>

      {/* Portal tooltip */}
      {visible &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            className="fixed z-[9999] flex items-center gap-2 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-gray-200 shadow-xl"
            style={tooltipStyle}
          >
            {/* Full address */}
            <span className="font-mono break-all">{address}</span>

            {/* Copy button */}
            <button
              type="button"
              onClick={copy}
              aria-label="Copy full address to clipboard"
              className="shrink-0 flex items-center justify-center w-6 h-6 rounded hover:bg-gray-700 transition text-gray-400 hover:text-white pointer-events-auto"
            >
              {copied ? (
                // Checkmark icon
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4 text-emerald-400"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                // Copy icon
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path d="M8 3a1 1 0 000 2h2a1 1 0 100-2H8z" />
                  <path d="M6 4.5A2.5 2.5 0 018.5 2h3A2.5 2.5 0 0114 4.5v.5h.5A2.5 2.5 0 0117 7.5v7A2.5 2.5 0 0114.5 17h-7A2.5 2.5 0 015 14.5v-7A2.5 2.5 0 017.5 5H8v-.5zM7 7.5A.5.5 0 017.5 7h5a.5.5 0 010 1h-5A.5.5 0 017 7.5zm0 3a.5.5 0 01.5-.5h5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5z" />
                </svg>
              )}
            </button>
          </span>,
          document.body,
        )}
    </span>
  );
}

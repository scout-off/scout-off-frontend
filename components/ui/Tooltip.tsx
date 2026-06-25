'use client';
import {
  useState,
  useRef,
  useEffect,
  useId,
  useCallback,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

interface Position {
  top: number;
  left: number;
  above: boolean;
}

const FLIP_THRESHOLD = 80;
const AUTO_HIDE_MS = 5000;

function computePosition(trigger: HTMLElement): Position {
  const rect = trigger.getBoundingClientRect();
  const above = rect.top > FLIP_THRESHOLD;
  const top = above ? rect.top - 6 : rect.bottom + 6;
  const left = rect.left + rect.width / 2;
  return { top, left, above };
}

export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0, above: true });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearHideTimer();
    if (triggerRef.current) {
      setPosition(computePosition(triggerRef.current));
    }
    setVisible(true);
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }, [clearHideTimer]);

  const hide = useCallback(() => {
    clearHideTimer();
    setVisible(false);
  }, [clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const tooltipStyle = position.above
    ? { top: position.top, left: position.left, transform: 'translate(-50%, -100%)' }
    : { top: position.top, left: position.left, transform: 'translateX(-50%)' };

  return (
    <span className="inline-flex" ref={triggerRef}>
      <span
        aria-describedby={visible ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="cursor-default outline-none"
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            className="fixed z-[9999] w-max max-w-xs rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-gray-200 shadow-xl pointer-events-none"
            style={tooltipStyle}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}

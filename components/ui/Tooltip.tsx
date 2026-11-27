'use client';
import {
  useState,
  useRef,
  useEffect,
  useId,
  useCallback,
  isValidElement,
  cloneElement,
  type ReactNode,
  type ReactElement,
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
const HIDE_DELAY_MS = 100;

function computePosition(trigger: HTMLElement): Position {
  const rect = trigger.getBoundingClientRect();
  const above = rect.top > FLIP_THRESHOLD;
  const top = above ? rect.top - 6 : rect.bottom + 6;
  const left = rect.left + rect.width / 2;
  return { top, left, above };
}

export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    above: true,
  });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      setPosition(computePosition(triggerRef.current));
    }
  }, []);

  const show = useCallback(() => {
    clearHideTimer();
    updatePosition();
    setVisible(true);
  }, [clearHideTimer, updatePosition]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  }, [clearHideTimer]);

  const hide = useCallback(() => {
    clearHideTimer();
    setVisible(false);
  }, [clearHideTimer]);

  // Escape key dismissal
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hide();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, hide]);

  // Reposition on scroll/resize while visible
  useEffect(() => {
    if (!visible) return;
    window.addEventListener('scroll', updatePosition, {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', updatePosition, { passive: true });
    return () => {
      window.removeEventListener('scroll', updatePosition, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener('resize', updatePosition);
    };
  }, [visible, updatePosition]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const tooltipStyle = position.above
    ? {
        top: position.top,
        left: position.left,
        transform: 'translate(-50%, -100%)',
      }
    : { top: position.top, left: position.left, transform: 'translateX(-50%)' };

  // Clone the child element to add aria-describedby directly on the focusable trigger.
  // Fall back to the wrapper span for non-element children (e.g. plain strings).
  const triggerChild =
    isValidElement(children) && visible
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          'aria-describedby': tooltipId,
        })
      : children;

  return (
    <span className="inline-flex" ref={triggerRef}>
      <span
        aria-describedby={
          visible && !isValidElement(children) ? tooltipId : undefined
        }
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        className="cursor-default outline-none"
      >
        {triggerChild}
      </span>
      {visible &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
            className="fixed z-[9999] w-max max-w-xs rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-gray-200 shadow-xl"
            style={tooltipStyle}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}

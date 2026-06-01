'use client';
import {
  useState,
  useRef,
  useEffect,
  useId,
  type ReactNode,
  type CSSProperties,
} from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [above, setAbove] = useState(true);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  function show() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    // Determine flip: if trigger is in top 80px of viewport, show below
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setAbove(rect.top > 80);
    }
    setVisible(true);
    hideTimer.current = setTimeout(() => setVisible(false), 5000);
  }

  function hide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(false);
  }

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const tooltipStyle: CSSProperties = above
    ? { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }
    : { top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' };

  return (
    <span className="relative inline-flex" ref={triggerRef}>
      <span
        aria-describedby={tooltipId}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        className="cursor-default outline-none"
      >
        {children}
      </span>
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute z-50 w-max max-w-xs rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-gray-200 shadow-xl pointer-events-none"
          style={tooltipStyle}
        >
          {content}
        </span>
      )}
    </span>
  );
}

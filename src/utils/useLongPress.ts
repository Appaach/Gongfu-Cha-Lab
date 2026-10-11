import { useRef, useCallback } from 'react';

interface LongPressOptions {
  thresholdMs?: number;
  onLongPress: () => void;
  onClick?: () => void;
}

export function useLongPress({
  thresholdMs = 450,
  onLongPress,
  onClick,
}: LongPressOptions) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = useRef<boolean>(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback((e: React.PointerEvent) => {
    // Only primary button / touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    isLongPressActiveRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
      onLongPress();
    }, thresholdMs);
  }, [onLongPress, thresholdMs]);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const move = useCallback((e: React.PointerEvent) => {
    if (startPosRef.current && timerRef.current) {
      const dist = Math.hypot(e.clientX - startPosRef.current.x, e.clientY - startPosRef.current.y);
      if (dist > 12) {
        clear();
      }
    }
  }, [clear]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isLongPressActiveRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressActiveRef.current = false;
      return;
    }
    if (onClick) {
      onClick();
    }
  }, [onClick]);

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onPointerMove: move,
    onClick: handleClick,
  };
}

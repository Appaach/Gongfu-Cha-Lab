import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  ChevronLeft,
  ChevronRight,
  BellRing,
  Maximize2
} from 'lucide-react';

export interface SteepTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenModal: () => void;
  targetSeconds: number;
  steepNumber: number; // -1 for Rinse #0, 1..N for regular steeps
  teaName: string;
  hasRinse?: boolean;
  onSelectSteepIndex?: (index: number) => void;
  totalSteepsCount?: number;
}

export const SteepTimerModal: React.FC<SteepTimerModalProps> = ({
  isOpen,
  onClose,
  onOpenModal,
  targetSeconds,
  steepNumber,
  teaName,
  hasRinse = true,
  onSelectSteepIndex,
  totalSteepsCount = 8,
}) => {
  const [totalTime, setTotalTime] = useState<number>(Math.max(1, targetSeconds));
  // Continuous sub-second floating timer state for 60/120 FPS buttery-smooth animation
  const [preciseSecondsLeft, setPreciseSecondsLeft] = useState<number>(Math.max(1, targetSeconds));
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const startTimeRef = useRef<number | null>(null);
  const initialRemainingRef = useRef<number>(Math.max(1, targetSeconds));
  const prevSteepRef = useRef<number>(steepNumber);

  // Sync when steepNumber or targetSeconds changes
  useEffect(() => {
    const isNewSteep = prevSteepRef.current !== steepNumber;
    prevSteepRef.current = steepNumber;

    if (isNewSteep || (!isRunning && !isFinished && preciseSecondsLeft >= totalTime - 0.05)) {
      const validSec = Math.max(1, targetSeconds);
      setTotalTime(validSec);
      setPreciseSecondsLeft(validSec);
      initialRemainingRef.current = validSec;
      startTimeRef.current = null;
      setIsRunning(false);
      setIsFinished(false);
    }
  }, [targetSeconds, steepNumber, isRunning, isFinished, preciseSecondsLeft, totalTime]);

  // Clean, harmonic singing bowl bell synthesis using Web Audio API
  const playGongChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Harmonic series for authentic Tibetan singing bowl resonance:
      // Fundamental (261.63Hz - C4), Octave (523.25Hz), Fifth (784.88Hz), Octave 2 (1046.5Hz)
      const harmonics = [
        { freq: 261.63, gain: 0.40, decay: 3.2 },
        { freq: 523.25, gain: 0.22, decay: 2.6 },
        { freq: 784.88, gain: 0.14, decay: 2.0 },
        { freq: 1046.5, gain: 0.08, decay: 1.5 },
      ];

      harmonics.forEach(({ freq, gain, decay }) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gainNode.gain.setValueAtTime(gain, now);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + decay);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + decay);
      });
    } catch {
      // Audio context might be restricted before user gesture
    }
  }, [soundEnabled]);

  // Mobile haptic vibration feedback
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([150, 80, 200, 80, 300]);
      } catch {}
    }
  }, []);

  // Smooth RAF Animation Engine with background heartbeat fallback
  useEffect(() => {
    if (!isRunning) {
      startTimeRef.current = null;
      return;
    }

    startTimeRef.current = performance.now();
    initialRemainingRef.current = preciseSecondsLeft;

    let animFrameId: number;
    let heartbeatInterval: NodeJS.Timeout;

    const tick = () => {
      if (!startTimeRef.current) return;
      const now = performance.now();
      const elapsed = (now - startTimeRef.current) / 1000;
      const current = Math.max(0, initialRemainingRef.current - elapsed);

      setPreciseSecondsLeft(current);

      if (current <= 0) {
        setIsRunning(false);
        setIsFinished(true);
        playGongChime();
        triggerHaptic();
        return;
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);

    // Heartbeat for background tabs or when RAF is throttled by the OS
    heartbeatInterval = setInterval(() => {
      if (!startTimeRef.current) return;
      const now = performance.now();
      const elapsed = (now - startTimeRef.current) / 1000;
      const current = Math.max(0, initialRemainingRef.current - elapsed);
      if (current <= 0) {
        setIsRunning(false);
        setIsFinished(true);
        setPreciseSecondsLeft(0);
        playGongChime();
        triggerHaptic();
      }
    }, 250);

    return () => {
      cancelAnimationFrame(animFrameId);
      clearInterval(heartbeatInterval);
    };
  }, [isRunning, playGongChime, triggerHaptic]);

  // Handle Spacebar to start/pause, Escape to minimize/close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space' && isOpen) {
        e.preventDefault();
        setIsRunning((prev) => !prev);
      } else if (e.code === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Continuous real-time smooth progress calculation
  const progressPercent = totalTime > 0 ? Math.max(0, Math.min(100, (preciseSecondsLeft / totalTime) * 100)) : 0;
  const radius = 96;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  // Clean whole second countdown for digital readout
  const displaySeconds = Math.ceil(preciseSecondsLeft);
  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const steepTitle = steepNumber === -1 ? 'Промыв листа #0' : `Пролив #${steepNumber}`;

  const handleReset = () => {
    setIsRunning(false);
    setIsFinished(false);
    setPreciseSecondsLeft(totalTime);
    initialRemainingRef.current = totalTime;
    startTimeRef.current = null;
  };

  const currentIdx = steepNumber === -1 ? -1 : steepNumber - 1;
  const minIdx = hasRinse ? -1 : 0;
  const canGoPrev = currentIdx > minIdx;
  const canGoNext = currentIdx < totalSteepsCount - 1;

  // Safeguard: If current tea has no rinse but timer was on steep -1, automatically advance to steep 0
  useEffect(() => {
    if (!hasRinse && steepNumber === -1 && onSelectSteepIndex) {
      onSelectSteepIndex(0);
    }
  }, [hasRinse, steepNumber, onSelectSteepIndex]);

  const handlePrev = () => {
    if (onSelectSteepIndex && canGoPrev) {
      onSelectSteepIndex(Math.max(minIdx, currentIdx - 1));
    }
  };

  const handleNext = () => {
    if (onSelectSteepIndex && canGoNext) {
      onSelectSteepIndex(currentIdx + 1);
    }
  };

  const handleNextSteep = () => {
    if (canGoNext && onSelectSteepIndex) {
      onSelectSteepIndex(currentIdx + 1);
    } else {
      handleReset();
    }
  };

  const [isScrolledToTop, setIsScrolledToTop] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolledToTop(typeof window !== 'undefined' ? window.scrollY < 90 : true);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isTimerActiveInBackground = !isOpen && (isRunning || isFinished || (preciseSecondsLeft > 0 && preciseSecondsLeft < totalTime));

  return (
    <>
      {/* 1. TOP FLOATING COUNTDOWN BAR (Visible when modal is exited/minimized while timer is active) */}
      {isTimerActiveInBackground && (
        <div 
          className={`fixed ${
            isScrolledToTop ? 'top-[128px] sm:top-[72px]' : 'top-3 sm:top-3.5'
          } left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-3.5 sm:px-4 py-2 rounded-full shadow-xl border backdrop-blur-md transition-all duration-300 cursor-pointer select-none max-w-[calc(100vw-24px)] animate-in slide-in-from-top-4`}
          style={{
            backgroundColor: 'var(--color-card-bg)',
            borderColor: isFinished ? '#10b981' : isRunning ? 'var(--color-accent-solid)' : 'var(--color-card-border)',
            color: 'var(--color-text-primary)'
          }}
          onClick={onOpenModal}
          title="Нажмите, чтобы развернуть таймер на весь экран"
        >
          {/* Mini Smooth Circular Radial Gauge */}
          {isFinished ? (
            <BellRing className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 transform -rotate-90">
                <circle
                  cx="10"
                  cy="10"
                  r="7.5"
                  stroke="var(--color-chart-grid)"
                  strokeWidth="2.5"
                  fill="transparent"
                />
                <circle
                  cx="10"
                  cy="10"
                  r="7.5"
                  stroke={isFinished ? '#10b981' : 'var(--color-accent-solid)'}
                  strokeWidth="2.5"
                  strokeDasharray={2 * Math.PI * 7.5}
                  strokeDashoffset={2 * Math.PI * 7.5 * (1 - progressPercent / 100)}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-none"
                />
              </svg>
            </div>
          )}

          {/* Steep & Tea info */}
          <div className="flex flex-col text-left leading-none min-w-0">
            <span 
              className="text-[10px] font-mono uppercase tracking-wider font-bold truncate max-w-[100px] sm:max-w-[140px]"
              style={{ color: 'var(--color-accent-text)' }}
            >
              {teaName}
            </span>
            <span 
              className="text-xs font-bold font-serif mt-0.5 truncate"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {steepTitle}
            </span>
          </div>

          {/* Time Display */}
          <div 
            className="font-mono font-black text-xs sm:text-sm px-2.5 py-0.5 rounded-lg border shrink-0 transition-colors"
            style={{
              backgroundColor: isFinished ? 'rgba(16, 185, 129, 0.16)' : 'var(--color-accent-soft-bg)',
              borderColor: isFinished ? '#10b981' : 'var(--color-accent-soft-border)',
              color: isFinished ? '#10b981' : 'var(--color-accent-text)'
            }}
          >
            {isFinished ? 'СЛИВ!' : formattedTime}
          </div>

          {/* Controls: Play/Pause/Next */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isFinished) {
                handleNextSteep();
              } else {
                setIsRunning(!isRunning);
              }
            }}
            className="p-1.5 rounded-full border transition-all cursor-pointer shrink-0 active:scale-95"
            style={{
              backgroundColor: 'var(--color-panel-bg)',
              borderColor: 'var(--color-card-border)',
              color: 'var(--color-text-primary)'
            }}
            title={isFinished ? (canGoNext ? 'К следующему проливу' : 'Сброс') : isRunning ? 'Пауза' : 'Продолжить'}
          >
            {isFinished ? (
              <ChevronRight className="w-4 h-4 text-emerald-500" />
            ) : isRunning ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
          </button>

          {/* Expand Modal */}
          <button
            type="button"
            onClick={onOpenModal}
            className="p-1.5 rounded-full border transition-all cursor-pointer shrink-0 active:scale-95"
            style={{
              backgroundColor: 'var(--color-panel-bg)',
              borderColor: 'var(--color-card-border)',
              color: 'var(--color-text-primary)'
            }}
            title="Развернуть таймер"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Dismiss Timer */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleReset();
            }}
            className="p-1.5 rounded-full border hover:bg-rose-500/20 hover:border-rose-500 text-stone-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0 active:scale-95"
            style={{
              backgroundColor: 'var(--color-panel-bg)',
              borderColor: 'var(--color-card-border)'
            }}
            title="Сбросить и убрать таймер"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. FULL SCREEN LIGHT THEME TIMER MODAL */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={onClose}
        >
          <div 
            className="relative w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col items-center select-none border transition-colors"
            style={{
              backgroundColor: 'var(--color-card-bg)',
              borderColor: 'var(--color-card-border)',
              color: 'var(--color-text-primary)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Header */}
            <div 
              className="w-full flex items-center justify-between border-b pb-3 mb-4"
              style={{ borderColor: 'var(--color-card-border)' }}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={!canGoPrev}
                  className="p-1.5 rounded-lg border transition-all cursor-pointer active:scale-95"
                  style={{
                    backgroundColor: 'var(--color-panel-bg)',
                    borderColor: 'var(--color-card-border)',
                    color: canGoPrev ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    opacity: canGoPrev ? 1 : 0.35,
                    cursor: canGoPrev ? 'pointer' : 'not-allowed'
                  }}
                  title="Предыдущий пролив"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-left">
                  <span 
                    className="text-[10px] font-mono uppercase tracking-wider font-bold block"
                    style={{ color: 'var(--color-accent-text)' }}
                  >
                    {teaName}
                  </span>
                  <h4 
                    className="text-sm font-bold font-serif leading-none mt-0.5"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {steepTitle}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canGoNext}
                  className="p-1.5 rounded-lg border transition-all cursor-pointer active:scale-95"
                  style={{
                    backgroundColor: 'var(--color-panel-bg)',
                    borderColor: 'var(--color-card-border)',
                    color: canGoNext ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    opacity: canGoNext ? 1 : 0.35,
                    cursor: canGoNext ? 'pointer' : 'not-allowed'
                  }}
                  title="Следующий пролив"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="p-2 rounded-xl transition-all cursor-pointer border active:scale-95"
                  style={{
                    backgroundColor: soundEnabled ? 'var(--color-accent-soft-bg)' : 'var(--color-panel-bg)',
                    borderColor: soundEnabled ? 'var(--color-accent-soft-border)' : 'var(--color-card-border)',
                    color: soundEnabled ? 'var(--color-accent-text)' : 'var(--color-text-muted)'
                  }}
                  title={soundEnabled ? 'Звук включен (гонга)' : 'Звук выключен'}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl border transition-all cursor-pointer active:scale-95"
                  style={{
                    backgroundColor: 'var(--color-panel-bg)',
                    borderColor: 'var(--color-card-border)',
                    color: 'var(--color-text-muted)'
                  }}
                  title="Свернуть таймер (Esc) — отсчёт продолжится сверху"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Circular Countdown Ring with Ultra-Smooth Sweep */}
            <div className="relative my-2 flex items-center justify-center">
              <svg className="w-56 h-56 transform -rotate-90">
                {/* Background Ring */}
                <circle
                  cx="112"
                  cy="112"
                  r={radius}
                  stroke="var(--color-chart-grid)"
                  strokeWidth="8"
                  fill="transparent"
                />
                {/* Active Animated Smooth Ring */}
                <circle
                  cx="112"
                  cy="112"
                  r={radius}
                  stroke={isFinished ? '#10b981' : 'var(--color-accent-solid)'}
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-none"
                />
              </svg>

              {/* Center Digital Display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {isFinished ? (
                  <div className="flex flex-col items-center">
                    <BellRing className="w-8 h-8 text-emerald-500 mb-1" />
                    <span className="text-2xl font-bold font-serif text-emerald-500">
                      СЛИВ!
                    </span>
                    <span 
                      className="text-[11px] font-mono mt-0.5"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Экспозиция завершена
                    </span>
                  </div>
                ) : (
                  <>
                    <span 
                      className="text-4xl sm:text-5xl font-mono font-black tracking-tight drop-shadow-2xs"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {formattedTime}
                    </span>
                    <span 
                      className="text-xs font-mono font-bold mt-1 uppercase tracking-wider"
                      style={{ color: 'var(--color-accent-text)' }}
                    >
                      {isRunning ? 'Заваривание...' : preciseSecondsLeft === totalTime ? 'Готов к старту' : 'Пауза'}
                    </span>
                    <span 
                      className="text-xs font-mono mt-0.5"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      цель: {totalTime}с
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Reset button */}
            <div className="flex items-center justify-center mt-2 mb-4">
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer active:scale-95"
                style={{
                  backgroundColor: 'var(--color-panel-bg)',
                  borderColor: 'var(--color-card-border)',
                  color: 'var(--color-text-muted)'
                }}
                title="Сбросить таймер к началу"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сброс</span>
              </button>
            </div>

            {/* Primary Action Button (Start / Pause / Next Steep) */}
            <div className="w-full flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (isFinished) {
                    handleNextSteep();
                  } else {
                    setIsRunning(!isRunning);
                  }
                }}
                className="w-full py-3.5 px-4 rounded-2xl font-bold font-serif text-base flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-98"
                style={{
                  backgroundColor: isFinished ? '#10b981' : 'var(--color-accent-solid)',
                  color: isFinished ? '#ffffff' : 'var(--color-accent-solid-text)',
                  boxShadow: isRunning ? '0 0 16px rgba(245, 158, 11, 0.35)' : undefined
                }}
              >
                {isFinished ? (
                  canGoNext ? (
                    <>
                      <span>Следующий пролив</span>
                      <ChevronRight className="w-5 h-5" />
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-5 h-5" />
                      <span>Завершить (сброс)</span>
                    </>
                  )
                ) : isRunning ? (
                  <>
                    <Pause className="w-5 h-5 fill-current" />
                    <span>Пауза</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    <span>Начать заваривание</span>
                  </>
                )}
              </button>
            </div>

            {/* Bottom Hint */}
            <div 
              className="mt-3.5 text-[11px] text-center font-mono"
              style={{ color: 'var(--color-text-muted)' }}
            >
              💡 При закрытии окна таймер продолжит отсчёт вверху экрана
            </div>
          </div>
        </div>
      )}
    </>
  );
};

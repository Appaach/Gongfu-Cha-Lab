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
  const canGoPrev = currentIdx > -1;
  const canGoNext = currentIdx < totalSteepsCount - 1;

  const handlePrev = () => {
    if (onSelectSteepIndex && canGoPrev) {
      onSelectSteepIndex(currentIdx - 1);
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
          } left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-3.5 sm:px-4 py-2 rounded-full shadow-xl border backdrop-blur-md transition-all duration-300 cursor-pointer select-none max-w-[calc(100vw-24px)] animate-in slide-in-from-top-4 ${
            isFinished 
              ? 'bg-emerald-50/95 border-emerald-300 text-emerald-950 ring-2 ring-emerald-500/40 shadow-emerald-900/10' 
              : isRunning 
              ? 'bg-white/95 border-amber-300 text-stone-900 ring-2 ring-amber-500/30 shadow-amber-900/10' 
              : 'bg-white/95 border-stone-300 text-stone-800 shadow-stone-900/10'
          }`}
          onClick={onOpenModal}
          title="Нажмите, чтобы развернуть таймер на весь экран"
        >
          {/* Mini Smooth Circular Radial Gauge */}
          {isFinished ? (
            <BellRing className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 transform -rotate-90">
                <circle
                  cx="10"
                  cy="10"
                  r="7.5"
                  stroke="#e7e5e4"
                  strokeWidth="2.5"
                  fill="transparent"
                />
                <circle
                  cx="10"
                  cy="10"
                  r="7.5"
                  stroke="#b45309"
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
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-800 font-bold truncate max-w-[100px] sm:max-w-[140px]">
              {teaName}
            </span>
            <span className="text-xs font-bold font-serif text-stone-900 mt-0.5 truncate">
              {steepTitle}
            </span>
          </div>

          {/* Time Display */}
          <div className="font-mono font-black text-xs sm:text-sm px-2.5 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 shrink-0">
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
            className="p-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer shrink-0 active:scale-95"
            title={isFinished ? (canGoNext ? 'К следующему проливу' : 'Сброс') : isRunning ? 'Пауза' : 'Продолжить'}
          >
            {isFinished ? (
              <ChevronRight className="w-4 h-4 text-emerald-700" />
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
            className="p-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer shrink-0 active:scale-95"
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
            className="p-1.5 rounded-full hover:bg-rose-100 text-stone-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0 active:scale-95"
            title="Сбросить и убрать таймер"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. FULL SCREEN LIGHT THEME TIMER MODAL */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={onClose}
        >
          <div 
            className="relative w-full max-w-sm bg-white/98 border border-stone-200/90 rounded-3xl p-6 shadow-2xl text-stone-900 flex flex-col items-center select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Header */}
            <div className="w-full flex items-center justify-between border-b border-stone-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={!canGoPrev}
                  className={`p-1.5 rounded-lg border border-stone-200 transition-colors cursor-pointer active:scale-95 ${
                    canGoPrev ? 'hover:bg-stone-100 text-stone-700' : 'opacity-30 cursor-not-allowed text-stone-400'
                  }`}
                  title="Предыдущий пролив"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-left">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-800 font-bold block">
                    {teaName}
                  </span>
                  <h4 className="text-sm font-bold text-stone-900 font-serif leading-none mt-0.5">
                    {steepTitle}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canGoNext}
                  className={`p-1.5 rounded-lg border border-stone-200 transition-colors cursor-pointer active:scale-95 ${
                    canGoNext ? 'hover:bg-stone-100 text-stone-700' : 'opacity-30 cursor-not-allowed text-stone-400'
                  }`}
                  title="Следующий пролив"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-2 rounded-xl transition-colors cursor-pointer border active:scale-95 ${
                    soundEnabled 
                      ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100' 
                      : 'bg-stone-100 border-stone-200 text-stone-400 hover:bg-stone-200'
                  }`}
                  title={soundEnabled ? 'Звук включен (гонга)' : 'Звук выключен'}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer active:scale-95"
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
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-stone-100"
                />
                {/* Active Animated Smooth Ring */}
                <circle
                  cx="112"
                  cy="112"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className={`transition-none ${
                    isFinished 
                      ? 'text-emerald-500' 
                      : isRunning 
                      ? 'text-amber-700' 
                      : 'text-amber-600/80'
                  }`}
                />
              </svg>

              {/* Center Digital Display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {isFinished ? (
                  <div className="flex flex-col items-center">
                    <BellRing className="w-8 h-8 text-emerald-600 mb-1" />
                    <span className="text-2xl font-bold font-serif text-emerald-700">
                      СЛИВ!
                    </span>
                    <span className="text-[11px] text-stone-500 font-mono mt-0.5">
                      Экспозиция завершена
                    </span>
                  </div>
                ) : (
                  <>
                    <span className="text-4xl sm:text-5xl font-mono font-black tracking-tight text-stone-900 drop-shadow-2xs">
                      {formattedTime}
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-800 mt-1 uppercase tracking-wider">
                      {isRunning ? 'Заваривание...' : preciseSecondsLeft === totalTime ? 'Готов к старту' : 'Пауза'}
                    </span>
                    <span className="text-xs text-stone-500 font-mono mt-0.5">
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-xs font-mono font-bold text-stone-700 transition-all cursor-pointer active:scale-95"
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
                className={`w-full py-3.5 px-4 rounded-2xl font-bold font-serif text-base flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-98 ${
                  isFinished
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-900/20'
                    : isRunning
                    ? 'bg-amber-800 hover:bg-amber-900 text-white shadow-amber-900/20 ring-2 ring-amber-400/40'
                    : 'bg-amber-800 hover:bg-amber-900 text-white shadow-amber-900/20'
                }`}
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
            <div className="mt-3.5 text-[11px] text-stone-500 text-center font-mono">
              💡 При закрытии окна таймер продолжит отсчёт вверху экрана
            </div>
          </div>
        </div>
      )}
    </>
  );
};

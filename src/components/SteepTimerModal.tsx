import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  Plus,
  Minus,
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
  const [timeLeft, setTimeLeft] = useState<number>(Math.max(1, targetSeconds));
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevSteepRef = useRef<number>(steepNumber);

  // Sync when steepNumber or targetSeconds changes (if timer is not actively running)
  useEffect(() => {
    const isNewSteep = prevSteepRef.current !== steepNumber;
    prevSteepRef.current = steepNumber;

    if (isNewSteep || (!isRunning && !isFinished && timeLeft === totalTime)) {
      const validSec = Math.max(1, targetSeconds);
      setTotalTime(validSec);
      setTimeLeft(validSec);
      setElapsedSec(0);
      setIsRunning(false);
      setIsFinished(false);
    }
  }, [targetSeconds, steepNumber, isRunning, isFinished, timeLeft, totalTime]);

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

  // Timer Tick Engine — runs persistently regardless of whether modal is open or closed
  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          setIsFinished(true);
          playGongChime();
          triggerHaptic();
          return 0;
        }
        return prev - 1;
      });
      setElapsedSec((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
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

  const progressPercent = totalTime > 0 ? Math.max(0, Math.min(100, (timeLeft / totalTime) * 100)) : 0;
  const radius = 96;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const steepTitle = steepNumber === -1 ? 'Промыв листа #0' : `Пролив #${steepNumber}`;

  const handleAdjustTime = (delta: number) => {
    const newTotal = Math.max(1, totalTime + delta);
    setTotalTime(newTotal);
    setTimeLeft((prev) => Math.max(0, prev + delta));
    setIsFinished(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsFinished(false);
    setTimeLeft(totalTime);
    setElapsedSec(0);
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

  const isTimerActiveInBackground = !isOpen && (isRunning || isFinished || (timeLeft > 0 && timeLeft < totalTime));

  return (
    <>
      {/* 1. TOP FLOATING COUNTDOWN BAR (Visible when modal is exited/minimized while timer is active) */}
      {isTimerActiveInBackground && (
        <div 
          className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 rounded-2xl shadow-xl border backdrop-blur-md transition-all cursor-pointer select-none animate-in slide-in-from-top-4 duration-200 ${
            isFinished 
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950 ring-2 ring-emerald-500/40 animate-pulse' 
              : isRunning 
              ? 'bg-white/95 border-amber-300 text-stone-900 ring-2 ring-amber-500/30' 
              : 'bg-white/95 border-stone-300 text-stone-800'
          }`}
          onClick={onOpenModal}
          title="Нажмите, чтобы развернуть таймер на весь экран"
        >
          {/* Status Indicator */}
          {isFinished ? (
            <BellRing className="w-4 h-4 text-emerald-600 animate-bounce shrink-0" />
          ) : (
            <div className="relative w-4 h-4 flex items-center justify-center shrink-0">
              <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-amber-600 animate-ping opacity-75' : 'bg-stone-400'}`} />
              <span className={`absolute w-2 h-2 rounded-full ${isRunning ? 'bg-amber-700' : 'bg-stone-500'}`} />
            </div>
          )}

          {/* Steep & Tea info */}
          <div className="flex flex-col text-left leading-none">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-800 font-bold truncate max-w-[110px] sm:max-w-[150px]">
              {teaName}
            </span>
            <span className="text-xs font-bold font-serif text-stone-900 mt-0.5">
              {steepTitle}
            </span>
          </div>

          {/* Time Display */}
          <div className="font-mono font-black text-sm sm:text-base px-2.5 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950">
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
            className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer"
            title={isFinished ? (canGoNext ? 'К следующему проливу' : 'Сброс') : isRunning ? 'Пауза' : 'Продолжить'}
          >
            {isFinished ? (
              canGoNext ? (
                <ChevronRight className="w-4 h-4 text-emerald-700" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )
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
            className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer"
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
            className="p-1.5 rounded-xl hover:bg-rose-100 text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
            title="Сбросить и убрать таймер"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. FULL SCREEN LIGHT THEME TIMER MODAL */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/45 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={onClose}
        >
          <div 
            className="relative w-full max-w-sm bg-white border border-stone-200/90 rounded-3xl p-6 shadow-2xl text-stone-900 flex flex-col items-center select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Header */}
            <div className="w-full flex items-center justify-between border-b border-stone-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={!canGoPrev}
                  className={`p-1.5 rounded-lg border border-stone-200 transition-colors cursor-pointer ${
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
                  className={`p-1.5 rounded-lg border border-stone-200 transition-colors cursor-pointer ${
                    canGoNext ? 'hover:bg-stone-100 text-stone-700' : 'opacity-30 cursor-not-allowed text-stone-400'
                  }`}
                  title="Следующий пролив"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-2 rounded-xl transition-colors cursor-pointer border ${
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
                  className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                  title="Свернуть таймер (Esc) — отсчёт продолжится сверху"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Circular Countdown Ring */}
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
                {/* Active Animated Ring */}
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
                  className={`transition-all duration-300 ease-linear ${
                    isFinished 
                      ? 'text-emerald-500 animate-pulse' 
                      : isRunning 
                      ? 'text-amber-700' 
                      : 'text-amber-600/70'
                  }`}
                />
              </svg>

              {/* Center Digital Display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {isFinished ? (
                  <div className="flex flex-col items-center animate-bounce">
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
                      {isRunning ? 'Заваривание...' : timeLeft === totalTime ? 'Готов к старту' : 'Пауза'}
                    </span>
                    <span className="text-xs text-stone-500 font-mono mt-0.5">
                      цель: {totalTime}с
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Quick adjustment buttons (-5s, Reset, +5s) */}
            <div className="flex items-center gap-2 mt-2 mb-4">
              <button
                type="button"
                onClick={() => handleAdjustTime(-5)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-xs font-mono font-bold text-stone-700 transition-all cursor-pointer active:scale-95"
                title="Уменьшить время на 5 секунд"
              >
                <Minus className="w-3.5 h-3.5" />
                <span>5с</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 transition-all cursor-pointer active:scale-95"
                title="Сбросить таймер"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleAdjustTime(5)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-xs font-mono font-bold text-stone-700 transition-all cursor-pointer active:scale-95"
                title="Увеличить время на 5 секунд"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>5с</span>
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

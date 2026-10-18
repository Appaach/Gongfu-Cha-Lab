import { memo } from 'react';
import { Thermometer, RotateCcw } from 'lucide-react';
import { BrewingMethod } from '../types';
import { useLongPress } from '../utils/useLongPress';

export interface SteepBubbleCardProps {
  idx: number;
  steepNum: number;
  isSelected: boolean;
  baselineSec: number;
  statusObj?: { deviationSec: number; isAdaptedReference?: boolean };
  userVal: number | null;
  effectiveSec: number;
  isEditing: boolean;
  isManualModeActive: boolean;
  brewingMethod?: BrewingMethod;
  rootFraction?: number;
  waterVolume?: number;
  useDynamicTemperatures?: boolean;
  steepTempC?: number;
  isCustomTemp?: boolean;
  onSaveTemp?: (idx: number, val: number | null) => void;
  onSelect: (idx: number) => void;
  onDoubleClick: (idx: number) => void;
  onLongPress: (idx: number) => void;
  onSaveTime: (idx: number, val: number | null) => void;
  onCancelEdit: () => void;
}

/**
 * Unified, memoized steep bubble card with double-click inline editing and clean indicators.
 */
export const SteepBubbleCard = memo(function SteepBubbleCard({
  idx,
  steepNum,
  isSelected,
  baselineSec,
  statusObj,
  userVal,
  effectiveSec,
  isEditing,
  isManualModeActive,
  brewingMethod = 'gongfu',
  rootFraction = 0.33,
  waterVolume = 100,
  useDynamicTemperatures = false,
  steepTempC,
  isCustomTemp = false,
  onSaveTemp,
  onSelect,
  onDoubleClick,
  onLongPress,
  onSaveTime,
  onCancelEdit,
}: SteepBubbleCardProps) {
  const isCustom = userVal !== null && userVal !== undefined && userVal > 0;
  const isAdapted = !isCustom && Boolean(statusObj?.isAdaptedReference);
  const isLiuGen = brewingMethod === 'liu_gen';
  const isGrandpaCup = brewingMethod === 'grandpa_cup';
  const refillMl = Math.round(waterVolume * (isGrandpaCup ? 0.67 : (1 - rootFraction)));

  const longPressProps = useLongPress({
    onLongPress: () => {
      onSelect(idx);
      onLongPress(idx);
    },
    onClick: () => onSelect(idx),
  });

  if (isEditing) {
    return (
      <div
        className="group relative min-h-[92px] rounded-xl border p-2 flex flex-col justify-between text-left transition-all shadow-xs ring-2 ring-amber-800 border-amber-800 bg-amber-50/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <span className="text-[11px] font-bold font-mono text-amber-950 font-black">
            {isGrandpaCup ? (steepNum === 1 ? '#1 НАСТОЙ' : `#${steepNum} ДОЛИВ`) : `#${steepNum}`}
          </span>
          <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-800 text-amber-50 px-1 py-0.2 rounded leading-none">
            ввод
          </span>
        </div>

        <div className="my-0.5 flex items-center justify-center space-x-1 w-full">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
            defaultValue={userVal ?? effectiveSec}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const raw = (e.target as HTMLInputElement).value.trim();
                const parsed = parseInt(raw.replace(/\D/g, ''), 10);
                if (!isNaN(parsed) && parsed > 0) {
                  onSaveTime(idx, Math.min(600, parsed));
                } else if (raw === '') {
                  onSaveTime(idx, null);
                }
                onCancelEdit();
              } else if (e.key === 'Escape') {
                onCancelEdit();
              }
            }}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const parsed = parseInt(raw.replace(/\D/g, ''), 10);
              if (!isNaN(parsed) && parsed > 0) {
                onSaveTime(idx, Math.min(600, parsed));
              } else if (raw === '') {
                onSaveTime(idx, null);
              }
              onCancelEdit();
            }}
            className="w-14 text-center font-mono font-extrabold text-base sm:text-lg py-0.5 px-1 bg-white border border-amber-500 rounded-md text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-800 shadow-xs"
          />
          <span className="text-xs sm:text-sm font-mono font-bold text-amber-900/70">
            с
          </span>
        </div>

        <div className="pt-0.5 border-t border-amber-200/80 text-center flex items-center justify-center leading-none text-[8.5px] text-amber-900 font-semibold w-full">
          Enter — готово
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      {...longPressProps}
      onDoubleClick={(e) => {
        e.preventDefault();
        if (isManualModeActive) {
          onDoubleClick(idx);
        }
      }}
      title={isManualModeActive ? "Клик для выбора, двойной клик для ввода времени, удержание для таймера" : "Клик для выбора, удержание для таймера"}
      className={`group relative min-h-[92px] rounded-xl border p-2.5 flex flex-col justify-between text-left transition-all cursor-pointer select-none shadow-2xs ${
        isSelected
          ? 'ring-2 ring-amber-800 border-amber-800 bg-amber-50/90 shadow-xs'
          : isCustom
          ? 'bg-amber-50 border-amber-300 text-amber-950 hover:border-amber-400'
          : isAdapted
          ? 'bg-amber-50/50 border-amber-200 text-amber-900 hover:bg-amber-50'
          : 'bg-white border-stone-200 hover:border-amber-300 hover:bg-stone-50 text-stone-800'
      }`}
    >
      {/* Top: Steep Number & Status Badge */}
      <div className="flex items-center justify-between gap-1 w-full">
        <span className={`text-[11px] font-bold font-mono ${
          isSelected ? 'text-amber-950 font-black' : isCustom ? 'text-amber-950' : isAdapted ? 'text-amber-900' : 'text-stone-700'
        }`}>
          {isGrandpaCup ? (steepNum === 1 ? '#1 НАСТОЙ' : `#${steepNum} ДОЛИВ`) : `#${steepNum}`}
        </span>

        {isCustom ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-800 text-amber-50 px-1 py-0.2 rounded leading-none">
              факт
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onSaveTime(idx, null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onSaveTime(idx, null);
                }
              }}
              className="p-0.5 rounded hover:bg-amber-200/90 text-amber-900 transition-colors cursor-pointer"
              title="Сбросить время этого пролива к эталону"
            >
              <RotateCcw className="w-2.5 h-2.5" />
            </span>
          </span>
        ) : isAdapted ? (
          <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-100 text-amber-900 border border-amber-200 px-1 py-0.2 rounded leading-none">
            адапт
          </span>
        ) : isGrandpaCup && steepNum === 1 ? (
          <span className="text-[8.5px] font-bold bg-amber-100 text-amber-900 px-1 py-0.2 rounded leading-none">
            стакан
          </span>
        ) : isGrandpaCup ? (
          <span className="text-[8.5px] font-mono font-medium text-amber-800 bg-amber-100/70 px-1 py-0.2 rounded leading-none">
            +{refillMl}мл
          </span>
        ) : isLiuGen && steepNum === 1 ? (
          <span className="text-[8.5px] font-bold bg-emerald-100 text-emerald-900 px-1 py-0.2 rounded leading-none">
            корень
          </span>
        ) : isLiuGen ? (
          <span className="text-[8.5px] font-mono font-medium text-amber-800 bg-amber-100/70 px-1 py-0.2 rounded leading-none">
            +{refillMl}мл
          </span>
        ) : null}
      </div>

      {/* Center: Exposure time & dynamic temperature */}
      <div className="my-1 flex flex-col items-center justify-center w-full">
        <div className="flex items-center justify-center space-x-1">
          <span className={`text-base sm:text-lg font-mono font-extrabold tracking-tight ${
            isSelected ? 'text-amber-950 font-black' : isCustom ? 'text-amber-950' : isAdapted ? 'text-amber-900' : 'text-stone-800'
          }`}>
            {effectiveSec}
          </span>
          <span className="text-xs sm:text-sm font-mono font-bold text-amber-900/70">
            с
          </span>
        </div>

        {useDynamicTemperatures && (
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <span className={`text-[10px] font-mono leading-tight flex items-center gap-0.5 ${
              isCustomTemp
                ? 'text-rose-700 font-bold'
                : 'text-stone-600 font-medium'
            }`}>
              <Thermometer className="w-2.5 h-2.5 text-rose-600 shrink-0" />
              <span>{steepTempC ?? 95}°C</span>
            </span>
            {isCustomTemp && onSaveTemp && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveTemp(idx, null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    onSaveTemp(idx, null);
                  }
                }}
                className="p-0.5 rounded hover:bg-rose-200 text-rose-900 transition-colors cursor-pointer"
                title="Сбросить t°C к авто-профилю"
              >
                <RotateCcw className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom: Benchmark comparison if custom/adapted */}
      {isCustom || isAdapted ? (
        <div className="pt-0.5 border-t border-stone-200/80 text-center flex items-center justify-center gap-1 leading-none w-full">
          <span className="text-[9.5px] text-stone-400">
            эт: <strong className="font-mono text-stone-600 font-medium">{baselineSec}с</strong>
          </span>
          {isCustom && statusObj && statusObj.deviationSec !== 0 && (
            <span className={`text-[9px] font-mono font-bold ${
              statusObj.deviationSec > 0 ? 'text-amber-800' : 'text-stone-600'
            }`}>
              {statusObj.deviationSec > 0 ? `+${statusObj.deviationSec}` : `${statusObj.deviationSec}`}
            </span>
          )}
          {isAdapted && statusObj && statusObj.deviationSec !== 0 && (
            <span className={`text-[9px] font-mono font-bold ${
              statusObj.deviationSec > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}>
              {statusObj.deviationSec > 0 ? `+${statusObj.deviationSec}` : `${statusObj.deviationSec}`}
            </span>
          )}
        </div>
      ) : isGrandpaCup ? (
        <div className="pt-0.5 border-t border-stone-100 text-center flex items-center justify-center leading-none w-full">
          <span className="text-[8.5px] font-mono text-stone-500">
            {steepNum === 1 ? '1-й залив' : '2/3 долив'}
          </span>
        </div>
      ) : isLiuGen ? (
        <div className="pt-0.5 border-t border-stone-100 text-center flex items-center justify-center leading-none w-full">
          <span className="text-[8.5px] font-mono text-stone-500">
            {steepNum === 1 ? '100% залив' : '1/3 буфер'}
          </span>
        </div>
      ) : (
        <div className="pt-0.5 min-h-[14px]" />
      )}
    </button>
  );
});

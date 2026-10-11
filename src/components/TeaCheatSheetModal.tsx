import React, { useState, useEffect, useRef } from 'react';
import { TeaVariety, BrewingMethod, VesselMaterialType, WaterHardnessLevel } from '../types';
import { 
  X, 
  Copy, 
  Check, 
  Flame, 
  Scale, 
  Droplet, 
  Coffee, 
  Sparkles, 
  Clock, 
  ShieldCheck, 
  Layers,
  Download,
  Loader2
} from 'lucide-react';
import { exportElementToPdf } from '../utils/pdfExport';

export interface TeaCheatSheetModalProps {
  tea: TeaVariety;
  waterTemp: number;
  teaMass: number;
  waterVolume: number;
  steepsCount: number;
  steepSchedule?: number[];
  rinseSeconds?: number;
  isRinseEnabled?: boolean;
  brewingMethod?: BrewingMethod;
  vesselMaterial?: VesselMaterialType;
  vesselUsed?: string;
  waterHardness?: WaterHardnessLevel;
  vintageYear?: number;
  onClose: () => void;
}

const BREWING_METHOD_NAMES: Record<BrewingMethod, string> = {
  gongfu: 'Гунфу Ча (Классический пролив)',
  liu_gen: 'Лю Гэнь Пао (Оставление корня)',
  grandpa_cup: '«Ленивый» метод (Бэй Пао Фа)'
};

const VESSEL_MATERIAL_NAMES: Record<string, string> = {
  porcelain: 'Фарфор / Глазурованная гайвань',
  yixing_clay: 'Пористая Исинская глина',
  glass: 'Боросиликатное термостекло',
  glass_regular: 'Стекло',
  ceramic_regular: 'Керамика',
  ceramic_thick: 'Толстая керамика (Цзяньшуй / Нисин)',
  metal_silver: 'Серебро / Металл',
  thermos: 'Термос',
  cast_iron: 'Чугун'
};

const WATER_HARDNESS_NAMES: Record<string, string> = {
  soft: 'Мягкая вода (20–60 ppm)',
  optimal: 'Оптимальная бутилированная (70–130 ppm)',
  hard: 'Минерализованная / Жёсткая (>180 ppm)'
};

const morphologyLabels: Record<string, string> = {
  tight_ball: 'Сферическая скрутка (шарики)',
  twisted_strip: 'Продольная скрутка (полосы)',
  flat: 'Плоский лист (приплюснутый)',
  needle: 'Иглы (почки)',
  compressed_cake: 'Прессованный (блин / кирпич / точа)'
};

export const TeaCheatSheetModal: React.FC<TeaCheatSheetModalProps> = ({
  tea,
  waterTemp,
  teaMass,
  waterVolume,
  steepsCount,
  steepSchedule: providedSchedule,
  rinseSeconds = 5,
  isRinseEnabled = true,
  brewingMethod = 'gongfu',
  vesselMaterial = 'porcelain',
  vesselUsed,
  waterHardness = 'optimal',
  vintageYear,
  onClose
}) => {
  const [copied, setCopied] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const ratio = Math.round((waterVolume / Math.max(0.1, teaMass)) * 10) / 10;

  const activeMethodName = BREWING_METHOD_NAMES[brewingMethod] || BREWING_METHOD_NAMES.gongfu;
  const activeVesselName = vesselUsed || tea.recommendedVesselRu || 'Гайвань 120 мл';
  const activeVesselMatName = VESSEL_MATERIAL_NAMES[vesselMaterial] || 'Фарфор';
  const activeWaterName = WATER_HARDNESS_NAMES[waterHardness] || 'Оптимальная (70–130 ppm)';
  const effectiveVintageYear = vintageYear || tea.vintageYear;

  // Keyboard Escape listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Generate steep seconds curve if not fully passed
  const steepSchedule = providedSchedule && providedSchedule.length >= steepsCount
    ? providedSchedule.slice(0, steepsCount)
    : Array.from({ length: steepsCount }, (_, idx) => {
        if (idx === 0) return 8;
        if (idx === 1) return 6;
        if (idx === 2) return 8;
        return 8 + Math.round(Math.pow(idx - 2, 1.35) * 5);
      });

  const handleExportPdf = async () => {
    if (!sheetRef.current || isExportingPdf) return;
    setIsExportingPdf(true);
    setExportNotice('Формирование PDF шпаргалки...');
    await new Promise((resolve) => setTimeout(resolve, 60));

    try {
      const filename = `шпаргалка_${tea.nameRu.replace(/[^\w\u0400-\u04FF]/gi, '_')}`;
      const title = `Шпаргалка: ${tea.nameRu}`;
      await exportElementToPdf(sheetRef.current, filename, { title });
      setExportNotice('PDF сформирован! Выберите, куда сохранить файл.');
      setTimeout(() => setExportNotice(null), 4500);
    } catch (err) {
      console.warn('PDF export failed:', err);
      setExportNotice('Не удалось сохранить PDF файл.');
      setTimeout(() => setExportNotice(null), 4500);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCopyText = async () => {
    const transcriptionLine = tea.transcriptionRu ? `• Торговое / транскрибированное имя: ${tea.transcriptionRu}\n` : '';
    const rinseLine = isRinseEnabled 
      ? `• Пролив #0 (Промывка / Прогрев): ${rinseSeconds} сек (Слить не пробуя!)\n` 
      : '• Пролив #0: Без промывки (прямой первый пролив)\n';
    const rinseNoteLine = tea.rinseNoteRu ? `• Особенность промывки: ${tea.rinseNoteRu}\n` : '';
    const shapeLine = tea.leafMorphology ? `• Форма листа: ${morphologyLabels[tea.leafMorphology] || tea.leafMorphology}\n` : '';
    const vintageLine = effectiveVintageYear ? `• Год урожая: ${effectiveVintageYear} г.\n` : '';

    const blendSection = tea.blendComponents && tea.blendComponents.length > 0
      ? `\n🧪 СОСТАВ КУПАЖА:\n` + tea.blendComponents.map(c => `• ${c.teaNameRu}: ${Math.round(c.ratioFraction * 100)}% (${c.baseWeightG}г)${c.vintageYear ? ` [${c.vintageYear}г.]` : ''}`).join('\n') + '\n'
      : '';

    const text = `🍵 ШПАРГАЛКА: ${tea.nameRu} ${tea.nameZh ? `(${tea.nameZh})` : ''}
${transcriptionLine}• Категория: ${tea.typeNameRu} • ${tea.origin}
• Ферментация: ${tea.oxidationLevel}${shapeLine ? ` • ${shapeLine.replace('• ', '')}` : ''}${vintageLine ? ` • ${vintageLine.replace('• ', '')}` : ''}${blendSection}
ПАРАМЕТРЫ ЗАВАРИВАНИЯ:
• Метод: ${activeMethodName}
• Температура: ${waterTemp}°C
• Навеска / Объём: ${teaMass}г на ${waterVolume}мл (1:${ratio})
• Посуда: ${activeVesselName}
• Вода: ${activeWaterName}
${rinseLine}${rinseNoteLine}• Проливов: ${steepsCount}

⏱️ ВРЕМЯ ПРОЛИВОВ:
${steepSchedule.map((sec, idx) => `#${idx + 1}: ${sec}с`).join(', ')}

✨ Вкусы: ${(tea.keySensoryNotes || []).join(', ')}`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto cursor-pointer"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-2xl w-full my-auto shadow-2xl border border-stone-300 overflow-hidden flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-150 cursor-default"
      >
        {/* Modal Header & Actions (Hidden on Print) */}
        <div className="p-3.5 sm:p-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-amber-800" />
            <h3 className="text-xs sm:text-sm font-bold text-stone-900">
              Шпаргалка
            </h3>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={handleCopyText}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Скопировать рецепт в буфер обмена"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Скопировано!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Скопировать</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 disabled:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer disabled:cursor-wait"
              title="Сохранить шпаргалку в файл PDF"
            >
              {isExportingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200/80 transition-colors cursor-pointer ml-1"
              title="Закрыть памятку"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {exportNotice && (
          <div className="bg-amber-100/90 text-amber-950 px-4 py-2 text-xs font-semibold flex items-center justify-between border-b border-amber-200">
            <span>{exportNotice}</span>
            <button
              type="button"
              onClick={() => setExportNotice(null)}
              className="text-amber-800 hover:text-amber-950 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Printable Cheat-Sheet Card */}
        <div 
          ref={sheetRef}
          id="printable-cheat-sheet" 
          className="p-5 sm:p-6 overflow-y-auto space-y-4 bg-white text-stone-900 font-sans"
        >
          {/* Top Title Banner */}
          <div className="border-b-2 border-stone-900 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-amber-900 font-bold flex items-center gap-1.5">
                <span>{tea.typeNameRu}</span>
                <span>•</span>
                <span>{activeMethodName}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-serif font-black text-stone-950 tracking-tight mt-0.5">
                {tea.nameRu}
              </h2>
              {tea.transcriptionRu && (
                <div className="text-xs font-medium text-amber-900/90 mt-0.5">
                  {tea.transcriptionRu}
                </div>
              )}
              {tea.nameZh && (
                <div className="text-xs sm:text-sm font-serif italic text-stone-500 mt-0.5">
                  {tea.nameZh} {tea.namePinyin && `[${tea.namePinyin}]`}
                </div>
              )}
            </div>

            <div className="text-left sm:text-right text-xs space-y-0.5 shrink-0 bg-stone-50 sm:bg-transparent p-2.5 sm:p-0 rounded-xl border border-stone-200 sm:border-none">
              <div><span className="text-stone-400">Регион:</span> <strong className="text-stone-800">{tea.origin}</strong></div>
              <div><span className="text-stone-400">Ферментация:</span> <span className="text-stone-700 font-semibold">{tea.oxidationLevel}</span></div>
              {tea.leafMorphology && <div><span className="text-stone-400">Форма листа:</span> <span className="text-stone-700">{morphologyLabels[tea.leafMorphology] || tea.leafMorphology}</span></div>}
              {effectiveVintageYear && (
                <div><span className="text-stone-400">Урожай:</span> <strong className="text-amber-950 font-mono">{effectiveVintageYear} г.</strong></div>
              )}
            </div>
          </div>

          {/* Blend Components Breakdown if Available */}
          {tea.blendComponents && tea.blendComponents.length > 0 && (
            <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200 text-xs space-y-1.5">
              <span className="font-bold text-purple-950 flex items-center gap-1.5 text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-purple-700" />
                <span>Состав купажа:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {tea.blendComponents.map((comp, idx) => (
                  <div key={idx} className="bg-white px-2 py-0.5 rounded-md border border-purple-200 shadow-2xs text-[11px]">
                    <strong className="text-purple-950">{comp.teaNameRu}</strong>: <span className="font-mono font-bold text-amber-900">{Math.round(comp.ratioFraction * 100)}%</span> ({comp.baseWeightG}г)
                    {comp.vintageYear && <span className="text-stone-500 font-mono text-[10px]"> [{comp.vintageYear}г.]</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Brewing Parameters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-amber-900">
                <Flame className="w-3.5 h-3.5 text-amber-700" />
                <span>Температура</span>
              </div>
              <div className="text-lg sm:text-xl font-mono font-black text-amber-950 mt-0.5">
                {waterTemp}°C
              </div>
              <div className="text-[10px] text-stone-500 font-mono">
                {tea.tempRange ? `диапазон ${tea.tempRange[0]}–${tea.tempRange[1]}°C` : 'оптимум'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
              <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-stone-700">
                <Scale className="w-3.5 h-3.5 text-stone-600" />
                <span>Масса листа</span>
              </div>
              <div className="text-lg sm:text-xl font-mono font-black text-stone-950 mt-0.5">
                {teaMass} г
              </div>
              <div className="text-[10px] text-stone-500 font-mono">
                сухой лист
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200">
              <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-sky-900">
                <Droplet className="w-3.5 h-3.5 text-sky-700" />
                <span>Объём воды</span>
              </div>
              <div className="text-lg sm:text-xl font-mono font-black text-sky-950 mt-0.5">
                {waterVolume} мл
              </div>
              <div className="text-[10px] text-stone-500 font-mono">
                на один пролив
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-900">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                <span>Гидромодуль</span>
              </div>
              <div className="text-lg sm:text-xl font-mono font-black text-emerald-950 mt-0.5">
                1:{ratio}
              </div>
              <div className="text-[10px] text-stone-500 font-mono">
                {steepsCount} {steepsCount === 1 ? 'пролив' : (steepsCount < 5 ? 'пролива' : 'проливов')}
              </div>
            </div>
          </div>

          {/* Actual Vessel, Water & Rinse Specifications */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-stone-50 p-3 rounded-xl border border-stone-200">
            <div className="space-y-1">
              <div className="font-bold text-stone-900 flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                <span>Посуда:</span>
              </div>
              <p className="text-stone-800 font-medium leading-snug text-[11px]">
                {activeVesselName}
              </p>
            </div>

            <div className="space-y-1">
              <div className="font-bold text-stone-900 flex items-center gap-1.5">
                <Droplet className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                <span>Вода (минерализация):</span>
              </div>
              <p className="text-stone-800 font-medium leading-snug text-[11px]">
                {activeWaterName}
              </p>
            </div>

            <div className="space-y-1">
              <div className="font-bold text-stone-900 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Промыв листа (#0):</span>
              </div>
              <p className="text-stone-800 font-medium leading-snug text-[11px]">
                {isRinseEnabled 
                  ? `Промыв ${rinseSeconds} сек (слить)` 
                  : 'Без промывки листа'}
              </p>
              {tea.rinseNoteRu && (
                <p className="text-[10px] text-amber-900 italic">
                  {tea.rinseNoteRu}
                </p>
              )}
            </div>
          </div>

          {/* Actual Step-by-Step Steep Schedule */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-stone-900 border-b border-stone-200 pb-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-800" />
                <span>Время проливов ({steepsCount} чашек):</span>
              </span>
              <span className="text-[11px] font-mono text-stone-500 font-normal">
                Экспозиция в секундах
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {isRinseEnabled && (
                <div className="p-2 rounded-xl border border-amber-300 bg-amber-50/90 text-center space-y-0.5 shadow-2xs">
                  <div className="text-[10px] font-bold text-amber-800 font-mono">
                    Пролив #0
                  </div>
                  <div className="text-lg sm:text-xl font-mono font-black text-amber-950">
                    {rinseSeconds} <span className="text-xs font-bold text-amber-800/80">сек</span>
                  </div>
                  <div className="text-[9px] font-bold text-amber-900">
                    Слить
                  </div>
                </div>
              )}
              {steepSchedule.map((sec, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-xl border border-stone-200 bg-stone-50/70 text-center space-y-0.5"
                >
                  <div className="text-[10px] font-bold text-stone-500 font-mono">
                    Чашка #{idx + 1}
                  </div>
                  <div className="text-lg sm:text-xl font-mono font-black text-amber-900">
                    {sec} <span className="text-xs font-bold text-amber-700/80">сек</span>
                  </div>
                  <div className="text-[9px] text-stone-400">
                    {idx === 0 ? 'Быстрый пролив' : idx === 1 ? 'Пик аромата' : idx === 2 ? 'Баланс тела' : idx >= 3 && idx <= 5 ? 'Глубокий настой' : 'Хуэйгань'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Flavor Notes (Pure tastes only) */}
          <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200 space-y-1.5 text-xs">
            <span className="font-bold text-amber-950 block">Вкусы чая:</span>
            <div className="flex flex-wrap gap-1.5">
              {(tea.keySensoryNotes || []).map((note, nIdx) => (
                <span
                  key={nIdx}
                  className="bg-white border border-amber-200 text-amber-950 text-xs px-2.5 py-0.5 rounded-md font-medium shadow-2xs"
                >
                  {note}
                </span>
              ))}
            </div>
          </div>

          {/* Footer Note */}
          <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-[10px] text-stone-400">
            <span>Параметры рассчитаны в Gongfu Cha Lab</span>
            <span>Шпаргалка</span>
          </div>
        </div>
      </div>
    </div>
  );
};

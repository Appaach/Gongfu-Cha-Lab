/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  BrewingMethodId,
  BrewingSessionConfig,
  BrewingStepConfig,
  BrewingVessel,
} from '../../domain/brewing/types.ts';
import {
  BREWING_METHODS,
  DEFAULT_VESSELS,
  createDefaultSteps,
} from '../../domain/brewing/defaults.ts';
import { TeaSample } from '../../domain/tea/types.ts';
import { SectionCard } from '../../components/SectionCard.tsx';
import { DataOriginBadge } from '../../components/DataOriginBadge.tsx';
import { SimulationExecutionResult } from '../../engine/extraction/types.ts';
import { stage1EngineInstance } from '../../engine/extraction/contracts.ts';
import { SimulationResultsView } from '../results/SimulationResultsView.tsx';
import { Plus, Trash2, Play, Flame, Scale, Droplet, Clock } from 'lucide-react';

interface BrewingSimulatorViewProps {
  teas: TeaSample[];
  selectedTeaId: string;
  onSelectTeaId: (id: string) => void;
  onNavigateToCatalog: () => void;
}

export const BrewingSimulatorView: React.FC<BrewingSimulatorViewProps> = ({
  teas,
  selectedTeaId,
  onSelectTeaId,
  onNavigateToCatalog,
}) => {
  const currentTea = teas.find((t) => t.id === selectedTeaId) ?? teas[0];
  const [methodId, setMethodId] = useState<BrewingMethodId>('gongfu_cha');
  const [vessel, setVessel] = useState<BrewingVessel>(DEFAULT_VESSELS[0]);
  const [leafMassGrams, setLeafMassGrams] = useState<number>(6.0);
  const [baseWaterTemperatureC, setBaseWaterTemperatureC] = useState<number>(90);
  const [steps, setSteps] = useState<BrewingStepConfig[]>(() =>
    createDefaultSteps('gongfu_cha', DEFAULT_VESSELS[0].volumeMl, 90)
  );
  const [simulationResult, setSimulationResult] = useState<SimulationExecutionResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Переключение метода заваривания
  const handleMethodChange = (newMethodId: BrewingMethodId) => {
    setMethodId(newMethodId);
    let chosenVessel = vessel;
    let chosenMass = leafMassGrams;

    if (newMethodId === 'lazy_mug' && vessel.material !== 'glass') {
      chosenVessel = DEFAULT_VESSELS[2]; // Ставим кружку 350 мл
      chosenMass = 3.5;
    } else if (newMethodId !== 'lazy_mug' && vessel.volumeMl > 250) {
      chosenVessel = DEFAULT_VESSELS[0]; // Ставим гайвань 110 мл
      chosenMass = 6.0;
    }

    setVessel(chosenVessel);
    setLeafMassGrams(chosenMass);
    setSteps(createDefaultSteps(newMethodId, chosenVessel.volumeMl, baseWaterTemperatureC));
  };

  // Переключение сосуда
  const handleVesselChange = (newVesselId: string) => {
    const found = DEFAULT_VESSELS.find((v) => v.id === newVesselId) ?? DEFAULT_VESSELS[0];
    setVessel(found);
    setSteps(createDefaultSteps(methodId, found.volumeMl, baseWaterTemperatureC));
  };

  // Изменение шага
  const updateStep = (index: number, patch: Partial<BrewingStepConfig>) => {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, ...patch } : step))
    );
  };

  // Добавление шага
  const handleAddStep = () => {
    const lastStep = steps[steps.length - 1];
    const newStep: BrewingStepConfig = {
      stepNumber: steps.length + 1,
      infusionTimeSeconds: lastStep ? Math.round(lastStep.infusionTimeSeconds * 1.3) : 20,
      waterVolumeMl: lastStep ? lastStep.waterVolumeMl : vessel.volumeMl,
      waterTemperatureC: baseWaterTemperatureC,
      retainedLiquorPercent: methodId === 'liu_gen_pao' ? (lastStep?.retainedLiquorPercent ?? 40) : undefined,
    };
    setSteps((prev) => [...prev, newStep]);
  };

  // Удаление шага
  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return;
    const updated = steps
      .filter((_, i) => i !== index)
      .map((step, idx) => ({ ...step, stepNumber: idx + 1 }));
    setSteps(updated);
  };

  // Запуск симуляции
  const handleRunSimulation = async () => {
    setIsSimulating(true);
    const sessionConfig: BrewingSessionConfig = {
      methodId,
      teaId: currentTea.id,
      vessel,
      leafMassGrams,
      baseWaterTemperatureC,
      waterProfile: {
        id: 'water-soft',
        name: 'Мягкая вода',
        mineralizationTdsMgL: 50,
        ph: 6.8,
      },
      steps,
    };

    try {
      const res = await stage1EngineInstance.simulate(sessionConfig, currentTea);
      setSimulationResult(res);
    } finally {
      setIsSimulating(false);
    }
  };

  const activeMethod = BREWING_METHODS[methodId];
  const ratio = (vessel.volumeMl / leafMassGrams).toFixed(1);

  if (simulationResult) {
    return (
      <SimulationResultsView
        result={simulationResult}
        sessionConfig={{
          methodId,
          teaId: currentTea.id,
          vessel,
          leafMassGrams,
          baseWaterTemperatureC,
          waterProfile: {
            id: 'water-soft',
            name: 'Мягкая вода',
            mineralizationTdsMgL: 50,
            ph: 6.8,
          },
          steps,
        }}
        onBackToConfig={() => setSimulationResult(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Симулятор заваривания
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Настройка физических параметров экстракции, геометрии сосуда и протокола проливов
          </p>
        </div>

        <button
          onClick={handleRunSimulation}
          disabled={isSimulating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#224233] hover:bg-[#1A3327] active:bg-[#14281E] text-white text-xs font-medium rounded-md shadow-xs transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isSimulating ? 'Расчёт...' : 'Рассчитать экстракцию'}</span>
        </button>
      </div>

      {/* Блок 1: Выбор метода заваривания (3 метода) */}
      <SectionCard
        title="1. Метод заваривания"
        subtitle="Определяет гидродинамику, распределение объёмов жидкости во времени и характер контакта листа с водой"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['gongfu_cha', 'liu_gen_pao', 'lazy_mug'] as BrewingMethodId[]).map((id) => {
            const m = BREWING_METHODS[id];
            const isSelected = methodId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleMethodChange(id)}
                className={`p-4 text-left rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-emerald-800 bg-emerald-50/40 ring-1 ring-emerald-800'
                    : 'border-stone-200 bg-white hover:bg-stone-50/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-stone-900">
                      {m.name}
                    </span>
                    <span className="text-xs font-mono text-stone-400">
                      {m.nativeName}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed mb-3">
                    {m.summary}
                  </p>
                </div>
                <div className="pt-2 border-t border-stone-200/60 text-[11px] text-stone-500 font-mono">
                  Типичное соотношение: {m.typicalRatioRange.min}–{m.typicalRatioRange.max} г / 100 мл
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 p-3 bg-stone-50 rounded border border-stone-200/80 text-xs text-stone-600 leading-relaxed">
          <strong className="text-stone-900">Физический механизм выбранного метода: </strong>
          {activeMethod.physicalMechanism}
        </div>
      </SectionCard>

      {/* Блок 2: Выбор образца чая и сосуда */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="2. Чайный образец"
          subtitle="Исходные физико-химические характеристики матрицы сухого листа"
          action={
            <button
              onClick={onNavigateToCatalog}
              className="text-xs text-emerald-800 hover:text-emerald-950 font-medium cursor-pointer"
            >
              Смотреть каталог →
            </button>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1.5">
                Выберите сорт из каталога или лаборатории:
              </label>
              <select
                value={selectedTeaId}
                onChange={(e) => onSelectTeaId(e.target.value)}
                className="w-full text-xs font-medium py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
              >
                {teas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.nativeName ? `(${t.nativeName})` : ''} — {t.originRegion}
                  </option>
                ))}
              </select>
            </div>

            {/* Карточка характеристик выбранного чая */}
            <div className="p-3.5 bg-stone-50/70 border border-stone-200/80 rounded-md space-y-2 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-stone-200/60">
                <span className="text-stone-500">Регион происхождения:</span>
                <span className="font-medium text-stone-900">{currentTea.originRegion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Водопоглощение листа:</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-medium text-stone-900">
                    {currentTea.waterAbsorptionRatio.value ?? '—'} г/г
                  </span>
                  <DataOriginBadge origin={currentTea.waterAbsorptionRatio.origin} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Экстрактивные вещества (резервуар):</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-medium text-stone-900">
                    {currentTea.totalSolubleFraction.value ?? '—'} %
                  </span>
                  <DataOriginBadge origin={currentTea.totalSolubleFraction.origin} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Кофеин (алкалоиды):</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-medium text-stone-900">
                    {currentTea.caffeineEstimate.value !== null ? `${currentTea.caffeineEstimate.value} %` : 'Не определялся'}
                  </span>
                  <DataOriginBadge origin={currentTea.caffeineEstimate.origin} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">L-теанин (аминокислоты):</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-medium text-stone-900">
                    {currentTea.theanineEstimate.value !== null ? `${currentTea.theanineEstimate.value} %` : 'Не определялся'}
                  </span>
                  <DataOriginBadge origin={currentTea.theanineEstimate.origin} />
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="3. Посуда и объём"
          subtitle="Материал и термическая инерция заварочной ёмкости"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1.5">
                Заварочный сосуд:
              </label>
              <select
                value={vessel.id}
                onChange={(e) => handleVesselChange(e.target.value)}
                className="w-full text-xs font-medium py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
              >
                {DEFAULT_VESSELS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.volumeMl} мл)
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3.5 bg-stone-50/70 border border-stone-200/80 rounded-md space-y-2 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-stone-200/60">
                <span className="text-stone-500">Материал:</span>
                <span className="font-medium text-stone-900 capitalize">
                  {vessel.material === 'porcelain' ? 'Фарфор' : vessel.material === 'yixing_clay' ? 'Исинская глина' : 'Стекло'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Номинальный объём:</span>
                <span className="font-mono font-medium text-stone-900">{vessel.volumeMl} мл</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Тепловая инерция (коэфф.):</span>
                <span className="font-mono font-medium text-stone-900">{vessel.thermalInertiaFactor}</span>
              </div>
              <p className="text-[11px] text-stone-500 pt-1 leading-relaxed border-t border-stone-200/60">
                {vessel.notes}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Блок 3: Физические параметры воды и пропорция */}
      <SectionCard
        title="4. Базовые параметры среды"
        subtitle="Температура, навеска сухих листьев и гидромодуль заваривания"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-700" />
                Температура воды (°C)
              </label>
              <span className="text-sm font-mono font-semibold text-stone-900">
                {baseWaterTemperatureC} °C
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={100}
              step={1}
              value={baseWaterTemperatureC}
              onChange={(e) => {
                const val = Number(e.target.value);
                setBaseWaterTemperatureC(val);
                setSteps((prev) => prev.map((s) => ({ ...s, waterTemperatureC: val })));
              }}
              className="w-full accent-emerald-800 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-stone-400 mt-1">
              <span>60 °C (зелёный)</span>
              <span>85 °C (улун)</span>
              <span>100 °C (кипяток)</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-stone-600" />
                Навеска сухого листа (г)
              </label>
              <span className="text-sm font-mono font-semibold text-stone-900">
                {leafMassGrams.toFixed(1)} г
              </span>
            </div>
            <input
              type="range"
              min={1.0}
              max={15.0}
              step={0.5}
              value={leafMassGrams}
              onChange={(e) => setLeafMassGrams(Number(e.target.value))}
              className="w-full accent-emerald-800 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-stone-400 mt-1">
              <span>1.0 г</span>
              <span>6.0 г</span>
              <span>15.0 г</span>
            </div>
          </div>

          <div className="p-3.5 bg-stone-50 border border-stone-200/80 rounded-md flex flex-col justify-between">
            <span className="text-xs text-stone-500 font-medium">Рассчитанное соотношение (г:мл)</span>
            <div className="flex items-baseline my-1">
              <span className="text-2xl font-mono tabular-nums font-semibold text-stone-900">
                1:{ratio}
              </span>
              <span className="text-xs font-mono text-stone-500 ml-1.5">
                ({(leafMassGrams / (vessel.volumeMl / 100)).toFixed(1)} г / 100 мл)
              </span>
            </div>
            <p className="text-[11px] text-stone-500">
              {methodId === 'gongfu_cha' && 'Оптимально для Гунфу Ча: 1:15 – 1:20'}
              {methodId === 'liu_gen_pao' && 'Оптимально для Лю Гэнь Пао: 1:20 – 1:30'}
              {methodId === 'lazy_mug' && 'Оптимально для кружки: 1:50 – 1:100'}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Блок 4: Редактор протокола проливов */}
      <SectionCard
        title="5. Протокол проливов"
        subtitle="Экспозиция, объём заливаемой жидкости и процент сохранения корня настоя на каждом шаге"
        action={
          <button
            type="button"
            onClick={handleAddStep}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить пролив</span>
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-medium font-mono uppercase tracking-wider">
                <th className="py-2.5 px-3">Шаг</th>
                <th className="py-2.5 px-3">Экспозиция (секунды)</th>
                <th className="py-2.5 px-3">Объём заливки (мл)</th>
                <th className="py-2.5 px-3">Температура (°C)</th>
                {methodId === 'liu_gen_pao' && (
                  <th className="py-2.5 px-3">Остаток корня (%)</th>
                )}
                <th className="py-2.5 px-3 text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-mono">
              {steps.map((step, idx) => (
                <tr key={step.stepNumber} className="hover:bg-stone-50/50">
                  <td className="py-2.5 px-3 font-semibold text-stone-900">
                    #{step.stepNumber}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <input
                        type="number"
                        min={1}
                        max={1200}
                        value={step.infusionTimeSeconds}
                        onChange={(e) =>
                          updateStep(idx, { infusionTimeSeconds: Math.max(1, Number(e.target.value)) })
                        }
                        className="w-20 px-2 py-1 text-xs border border-stone-300 rounded font-mono text-stone-900 bg-white"
                      />
                      <span className="text-stone-400 text-[11px]">с</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <Droplet className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <input
                        type="number"
                        min={20}
                        max={1000}
                        value={step.waterVolumeMl}
                        onChange={(e) =>
                          updateStep(idx, { waterVolumeMl: Math.max(10, Number(e.target.value)) })
                        }
                        className="w-20 px-2 py-1 text-xs border border-stone-300 rounded font-mono text-stone-900 bg-white"
                      />
                      <span className="text-stone-400 text-[11px]">мл</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={50}
                        max={100}
                        value={step.waterTemperatureC}
                        onChange={(e) =>
                          updateStep(idx, { waterTemperatureC: Math.min(100, Math.max(40, Number(e.target.value))) })
                        }
                        className="w-16 px-2 py-1 text-xs border border-stone-300 rounded font-mono text-stone-900 bg-white"
                      />
                      <span className="text-stone-400 text-[11px]">°C</span>
                    </div>
                  </td>
                  {methodId === 'liu_gen_pao' && (
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={10}
                          max={90}
                          value={step.retainedLiquorPercent ?? 40}
                          onChange={(e) =>
                            updateStep(idx, { retainedLiquorPercent: Number(e.target.value) })
                          }
                          className="w-16 px-2 py-1 text-xs border border-stone-300 rounded font-mono text-stone-900 bg-white"
                        />
                        <span className="text-stone-400 text-[11px]">%</span>
                      </div>
                    </td>
                  )}
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      disabled={steps.length <= 1}
                      onClick={() => handleRemoveStep(idx)}
                      className="p-1.5 text-stone-400 hover:text-rose-700 disabled:opacity-20 cursor-pointer transition-colors"
                      title="Удалить пролив"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

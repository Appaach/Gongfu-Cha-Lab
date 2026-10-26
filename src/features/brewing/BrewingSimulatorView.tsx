/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  BrewingMethodId,
  BrewingSessionConfig,
  BrewingVessel,
  GongfuStepConfig,
  LiuGenPaoStepConfig,
  LazyMugTimelineEvent,
  WaterProfile,
} from '../../domain/brewing/types.ts';
import {
  BREWING_METHODS,
  DEFAULT_VESSELS,
  DEFAULT_WATER_PROFILES,
  createDefaultGongfuSteps,
  createDefaultLiuGenPaoSteps,
  createDefaultLazyMugEvents,
} from '../../domain/brewing/defaults.ts';
import { TeaSample } from '../../domain/tea/types.ts';
import { SectionCard } from '../../components/SectionCard.tsx';
import { DataOriginBadge } from '../../components/DataOriginBadge.tsx';
import { SimulationExecutionResult } from '../../engine/extraction/types.ts';
import { stage1EngineInstance } from '../../engine/extraction/contracts.ts';
import { SimulationResultsView } from '../results/SimulationResultsView.tsx';
import { Plus, Trash2, Play, Flame, Scale, Droplet, Clock, AlertCircle } from 'lucide-react';

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
  const [selectedWaterProfile, setSelectedWaterProfile] = useState<WaterProfile>(DEFAULT_WATER_PROFILES[0]);

  // Раздельные состояния параметров для разных методов
  const [gongfuSteps, setGongfuSteps] = useState<GongfuStepConfig[]>(() =>
    createDefaultGongfuSteps(100, 90)
  );
  const [liuGenPaoSteps, setLiuGenPaoSteps] = useState<LiuGenPaoStepConfig[]>(() =>
    createDefaultLiuGenPaoSteps(100, 90)
  );
  const [lazyMugEvents, setLazyMugEvents] = useState<LazyMugTimelineEvent[]>(() =>
    createDefaultLazyMugEvents(300, 88)
  );
  const [lazyInitialVolumeMl, setLazyInitialVolumeMl] = useState<number>(300);

  const [simulationResult, setSimulationResult] = useState<SimulationExecutionResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Переключение метода заваривания
  const handleMethodChange = (newMethodId: BrewingMethodId) => {
    setMethodId(newMethodId);

    if (newMethodId === 'lazy_mug') {
      const mug = DEFAULT_VESSELS[2];
      setVessel(mug);
      setLeafMassGrams(3.5);
      setLazyInitialVolumeMl(300);
      setLazyMugEvents(createDefaultLazyMugEvents(300, baseWaterTemperatureC));
    } else if (newMethodId === 'liu_gen_pao') {
      const gaiwan = DEFAULT_VESSELS[0];
      setVessel(gaiwan);
      setLeafMassGrams(5.0);
      setLiuGenPaoSteps(createDefaultLiuGenPaoSteps(100, baseWaterTemperatureC));
    } else {
      const gaiwan = DEFAULT_VESSELS[0];
      setVessel(gaiwan);
      setLeafMassGrams(6.0);
      setGongfuSteps(createDefaultGongfuSteps(100, baseWaterTemperatureC));
    }
  };

  // Переключение сосуда
  const handleVesselChange = (newVesselId: string) => {
    const found = DEFAULT_VESSELS.find((v) => v.id === newVesselId) ?? DEFAULT_VESSELS[0];
    setVessel(found);
    const workingPour = Math.round(found.volumeMl * 0.9);
    if (methodId === 'gongfu_cha') {
      setGongfuSteps(createDefaultGongfuSteps(workingPour, baseWaterTemperatureC));
    } else if (methodId === 'liu_gen_pao') {
      setLiuGenPaoSteps(createDefaultLiuGenPaoSteps(workingPour, baseWaterTemperatureC));
    } else {
      setLazyInitialVolumeMl(Math.round(found.volumeMl * 0.85));
      setLazyMugEvents(createDefaultLazyMugEvents(Math.round(found.volumeMl * 0.85), baseWaterTemperatureC));
    }
  };

  // Запуск симуляции
  const handleRunSimulation = async () => {
    setIsSimulating(true);

    let sessionConfig: BrewingSessionConfig;

    if (methodId === 'gongfu_cha') {
      sessionConfig = {
        methodId: 'gongfu_cha',
        teaId: currentTea.id,
        vessel,
        leafMassGrams,
        baseWaterTemperatureC,
        waterProfile: selectedWaterProfile,
        steps: gongfuSteps,
      };
    } else if (methodId === 'liu_gen_pao') {
      sessionConfig = {
        methodId: 'liu_gen_pao',
        teaId: currentTea.id,
        vessel,
        leafMassGrams,
        baseWaterTemperatureC,
        waterProfile: selectedWaterProfile,
        steps: liuGenPaoSteps,
      };
    } else {
      sessionConfig = {
        methodId: 'lazy_mug',
        teaId: currentTea.id,
        vessel,
        leafMassGrams,
        baseWaterTemperatureC,
        initialWaterVolumeMl: lazyInitialVolumeMl,
        waterProfile: selectedWaterProfile,
        timelineEvents: lazyMugEvents,
        scenarioType: 'preset_assumption',
      };
    }

    try {
      const res = await stage1EngineInstance.simulate(sessionConfig, currentTea);
      setSimulationResult(res);
    } finally {
      setIsSimulating(false);
    }
  };

  // Расчёт фактического гидромодуля (отношение реального объёма воды к сухой навеске)
  const actualWaterVolumeForRatio =
    methodId === 'lazy_mug'
      ? lazyInitialVolumeMl
      : methodId === 'liu_gen_pao'
      ? liuGenPaoSteps[0]?.addedWaterVolumeMl ?? 100
      : gongfuSteps[0]?.pourWaterVolumeMl ?? 100;

  const actualRatioWaterToLeaf = (actualWaterVolumeForRatio / leafMassGrams).toFixed(1);
  const actualGramsPer100Ml = ((leafMassGrams / actualWaterVolumeForRatio) * 100).toFixed(1);

  if (simulationResult) {
    let currentConfig: BrewingSessionConfig;
    if (methodId === 'gongfu_cha') {
      currentConfig = {
        methodId: 'gongfu_cha',
        teaId: currentTea.id,
        vessel,
        leafMassGrams,
        baseWaterTemperatureC,
        waterProfile: selectedWaterProfile,
        steps: gongfuSteps,
      };
    } else if (methodId === 'liu_gen_pao') {
      currentConfig = {
        methodId: 'liu_gen_pao',
        teaId: currentTea.id,
        vessel,
        leafMassGrams,
        baseWaterTemperatureC,
        waterProfile: selectedWaterProfile,
        steps: liuGenPaoSteps,
      };
    } else {
      currentConfig = {
        methodId: 'lazy_mug',
        teaId: currentTea.id,
        vessel,
        leafMassGrams,
        baseWaterTemperatureC,
        initialWaterVolumeMl: lazyInitialVolumeMl,
        waterProfile: selectedWaterProfile,
        timelineEvents: lazyMugEvents,
        scenarioType: 'preset_assumption',
      };
    }

    return (
      <SimulationResultsView
        result={simulationResult}
        sessionConfig={currentConfig}
        onBackToConfig={() => setSimulationResult(null)}
      />
    );
  }

  const activeMethod = BREWING_METHODS[methodId];

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Симулятор заваривания
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Настройка гидродинамического протокола, геометрии сосуда и параметров водной среды
          </p>
        </div>

        <button
          onClick={handleRunSimulation}
          disabled={isSimulating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#224233] hover:bg-[#1A3327] active:bg-[#14281E] text-white text-xs font-medium rounded-md shadow-xs transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isSimulating ? 'Расчёт...' : 'Рассчитать гидродинамику'}</span>
        </button>
      </div>

      {/* Блок 1: Выбор метода заваривания (3 метода с независимой логикой) */}
      <SectionCard
        title="1. Метод заваривания"
        subtitle="Определяет динамику объёмов жидкости во времени и характер контакта листьев с растворителем"
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
                  {m.typicalRatioRangeDescription}
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
          subtitle="Исходные свойства сухого сырья (входные данные, не результат модели)"
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
                    {t.name} {t.nativeName ? `(${t.nativeName})` : ''} — {t.originRegion || 'Регион не указан'}
                  </option>
                ))}
              </select>
            </div>

            {/* Карточка характеристик выбранного чая */}
            <div className="p-3.5 bg-stone-50/70 border border-stone-200/80 rounded-md space-y-2 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-stone-200/60">
                <span className="text-stone-500">Водопоглощение матрицы сухого листа:</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-medium text-stone-900">
                    {currentTea.waterAbsorptionRatio.value !== null ? `${currentTea.waterAbsorptionRatio.value} г/г` : 'Не определялось'}
                  </span>
                  <DataOriginBadge origin={currentTea.waterAbsorptionRatio.origin} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Водорастворимый экстракт (% сухой массы):</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-medium text-stone-900">
                    {currentTea.totalExtractableFraction.value !== null ? `${currentTea.totalExtractableFraction.value} %` : 'Не определялось'}
                  </span>
                  <DataOriginBadge origin={currentTea.totalExtractableFraction.origin} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Кофеин (% сухой массы):</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-medium text-stone-900">
                    {currentTea.caffeineFraction.value !== null ? `${currentTea.caffeineFraction.value} %` : 'Не определялся'}
                  </span>
                  <DataOriginBadge origin={currentTea.caffeineFraction.origin} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">L-теанин (% сухой массы):</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-medium text-stone-900">
                    {currentTea.theanineFraction.value !== null ? `${currentTea.theanineFraction.value} %` : 'Не определялся'}
                  </span>
                  <DataOriginBadge origin={currentTea.theanineFraction.origin} />
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="3. Заварочный сосуд"
          subtitle="Вместимость и материал ёмкости (вместимость не подменяет объём заливки)"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1.5">
                Заварочная ёмкость:
              </label>
              <select
                value={vessel.id}
                onChange={(e) => handleVesselChange(e.target.value)}
                className="w-full text-xs font-medium py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
              >
                {DEFAULT_VESSELS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} (Вместимость: {v.volumeMl} мл)
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3.5 bg-stone-50/70 border border-stone-200/80 rounded-md space-y-2 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-stone-200/60">
                <span className="text-stone-500">Материал:</span>
                <span className="font-medium text-stone-900 capitalize">
                  {vessel.material === 'porcelain' ? 'Фарфор' : vessel.material === 'yixing_clay' ? 'Исинская глина' : 'Боросиликатное стекло'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Номинальная вместимость сосуда:</span>
                <span className="font-mono font-medium text-stone-900">{vessel.volumeMl} мл</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Коэффициент теплоемкости:</span>
                <span className="font-mono font-medium text-stone-900">{vessel.thermalInertiaFactor}</span>
              </div>
              <p className="text-[11px] text-stone-500 pt-1 leading-relaxed border-t border-stone-200/60">
                {vessel.notes}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Блок 3: Физические параметры воды, навеска и гидромодуль */}
      <SectionCard
        title="4. Водная среда, навеска и гидромодуль"
        subtitle="Температура, профиль воды и соотношение массы сухого листа к реальному объёму заливки"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Температура воды */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-700" />
                Температура заливаемой воды (°C)
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
                if (methodId === 'gongfu_cha') {
                  setGongfuSteps((prev) => prev.map((s) => ({ ...s, waterTemperatureC: val })));
                } else if (methodId === 'liu_gen_pao') {
                  setLiuGenPaoSteps((prev) => prev.map((s) => ({ ...s, addedWaterTemperatureC: val })));
                }
              }}
              className="w-full accent-emerald-800 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-stone-400 mt-1">
              <span>60 °C (зелёный)</span>
              <span>85 °C (улун)</span>
              <span>100 °C (кипяток)</span>
            </div>
          </div>

          {/* Навеска сухого листа */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-stone-600" />
                Масса сухого листа (г)
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

          {/* Рассчитанный гидромодуль */}
          <div className="p-3.5 bg-stone-50 border border-stone-200/80 rounded-md flex flex-col justify-between">
            <span className="text-xs text-stone-500 font-medium">
              Фактический гидромодуль (1-й пролив)
            </span>
            <div className="flex items-baseline my-1">
              <span className="text-2xl font-mono tabular-nums font-semibold text-stone-900">
                1:{actualRatioWaterToLeaf}
              </span>
              <span className="text-xs font-mono text-stone-500 ml-1.5">
                ({actualGramsPer100Ml} г / 100 мл воды)
              </span>
            </div>
            <p className="text-[11px] text-stone-500">
              Рассчитано по фактической заливке ({actualWaterVolumeForRatio} мл), а не по вместимости сосуда ({vessel.volumeMl} мл).
            </p>
          </div>
        </div>

        {/* Выбор профиля воды */}
        <div className="mt-4 pt-4 border-t border-stone-200">
          <label className="block text-xs font-medium text-stone-700 mb-1.5">
            Профиль используемой воды:
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DEFAULT_WATER_PROFILES.map((wp) => {
              const isSelected = selectedWaterProfile.id === wp.id;
              return (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => setSelectedWaterProfile(wp)}
                  className={`p-3 text-left rounded-md border text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-emerald-800 bg-emerald-50/40 ring-1 ring-emerald-800'
                      : 'border-stone-200 bg-white hover:bg-stone-50'
                  }`}
                >
                  <div className="font-semibold text-stone-900 mb-0.5">
                    {wp.name}
                  </div>
                  {wp.isModelPreset ? (
                    <span className="text-[11px] text-amber-800 font-mono block mb-1">
                      [Модельное допущение]
                    </span>
                  ) : (
                    <span className="text-[11px] text-stone-500 font-mono block mb-1">
                      [Пользовательский профиль]
                    </span>
                  )}
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    {wp.presetDescription}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {/* Блок 4: Протокол шагов / событий в зависимости от выбранного метода */}
      {methodId === 'gongfu_cha' && (
        <SectionCard
          title="5. Протокол проливов Гунфу Ча"
          subtitle="Последовательность импульсных проливов с практически полным сливом"
          action={
            <button
              type="button"
              onClick={() => {
                const last = gongfuSteps[gongfuSteps.length - 1];
                const nextStep: GongfuStepConfig = {
                  stepNumber: gongfuSteps.length + 1,
                  infusionTimeSeconds: last ? Math.round(last.infusionTimeSeconds * 1.3) : 20,
                  pourWaterVolumeMl: last ? last.pourWaterVolumeMl : 100,
                  waterTemperatureC: baseWaterTemperatureC,
                };
                setGongfuSteps([...gongfuSteps, nextStep]);
              }}
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
                  <th className="py-2.5 px-3">Фактический объём заливки (мл)</th>
                  <th className="py-2.5 px-3">Температура воды (°C)</th>
                  <th className="py-2.5 px-3 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-mono">
                {gongfuSteps.map((step, idx) => (
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
                          max={600}
                          value={step.infusionTimeSeconds}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value));
                            setGongfuSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, infusionTimeSeconds: val } : s))
                            );
                          }}
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
                          max={500}
                          value={step.pourWaterVolumeMl}
                          onChange={(e) => {
                            const val = Math.max(10, Number(e.target.value));
                            setGongfuSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, pourWaterVolumeMl: val } : s))
                            );
                          }}
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
                          onChange={(e) => {
                            const val = Math.min(100, Math.max(40, Number(e.target.value)));
                            setGongfuSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, waterTemperatureC: val } : s))
                            );
                          }}
                          className="w-16 px-2 py-1 text-xs border border-stone-300 rounded font-mono text-stone-900 bg-white"
                        />
                        <span className="text-stone-400 text-[11px]">°C</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        disabled={gongfuSteps.length <= 1}
                        onClick={() => {
                          if (gongfuSteps.length <= 1) return;
                          setGongfuSteps(
                            gongfuSteps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepNumber: i + 1 }))
                          );
                        }}
                        className="p-1.5 text-stone-400 hover:text-rose-700 disabled:opacity-20 cursor-pointer transition-colors"
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
      )}

      {methodId === 'liu_gen_pao' && (
        <SectionCard
          title="5. Протокол Лю Гэнь Пао (Сохранение корней настоя)"
          subtitle="Доля удержания определена относительно ПОЛНОГО объёма жидкости перед сливом"
          action={
            <button
              type="button"
              onClick={() => {
                const last = liuGenPaoSteps[liuGenPaoSteps.length - 1];
                const nextStep: LiuGenPaoStepConfig = {
                  stepNumber: liuGenPaoSteps.length + 1,
                  infusionTimeSeconds: last ? Math.round(last.infusionTimeSeconds * 1.25) : 30,
                  addedWaterVolumeMl: last ? last.addedWaterVolumeMl : 60,
                  addedWaterTemperatureC: baseWaterTemperatureC,
                  retainedLiquorFractionOfTotal: last ? last.retainedLiquorFractionOfTotal : 0.4,
                };
                setLiuGenPaoSteps([...liuGenPaoSteps, nextStep]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить шаг долива</span>
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-medium font-mono uppercase tracking-wider">
                  <th className="py-2.5 px-3">Шаг</th>
                  <th className="py-2.5 px-3">Экспозиция (с)</th>
                  <th className="py-2.5 px-3">Доливаемая свежая вода (мл)</th>
                  <th className="py-2.5 px-3">Температура долива (°C)</th>
                  <th className="py-2.5 px-3">Доля удержания от полного объёма (%)</th>
                  <th className="py-2.5 px-3 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-mono">
                {liuGenPaoSteps.map((step, idx) => (
                  <tr key={step.stepNumber} className="hover:bg-stone-50/50">
                    <td className="py-2.5 px-3 font-semibold text-stone-900">
                      #{step.stepNumber}
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        min={1}
                        max={600}
                        value={step.infusionTimeSeconds}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value));
                          setLiuGenPaoSteps((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, infusionTimeSeconds: val } : s))
                          );
                        }}
                        className="w-16 px-2 py-1 text-xs border border-stone-300 rounded font-mono"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        min={10}
                        max={500}
                        value={step.addedWaterVolumeMl}
                        onChange={(e) => {
                          const val = Math.max(10, Number(e.target.value));
                          setLiuGenPaoSteps((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, addedWaterVolumeMl: val } : s))
                          );
                        }}
                        className="w-16 px-2 py-1 text-xs border border-stone-300 rounded font-mono"
                      />
                      <span className="text-stone-400 ml-1">мл</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        min={50}
                        max={100}
                        value={step.addedWaterTemperatureC}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(40, Number(e.target.value)));
                          setLiuGenPaoSteps((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, addedWaterTemperatureC: val } : s))
                          );
                        }}
                        className="w-16 px-2 py-1 text-xs border border-stone-300 rounded font-mono"
                      />
                      <span className="text-stone-400 ml-1">°C</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={10}
                          max={80}
                          value={Math.round(step.retainedLiquorFractionOfTotal * 100)}
                          onChange={(e) => {
                            const val = Math.min(80, Math.max(10, Number(e.target.value))) / 100;
                            setLiuGenPaoSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, retainedLiquorFractionOfTotal: val } : s))
                            );
                          }}
                          className="w-16 px-2 py-1 text-xs border border-stone-300 rounded font-mono"
                        />
                        <span className="text-stone-400">% от общего объёма</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        disabled={liuGenPaoSteps.length <= 1}
                        onClick={() => {
                          if (liuGenPaoSteps.length <= 1) return;
                          setLiuGenPaoSteps(
                            liuGenPaoSteps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepNumber: i + 1 }))
                          );
                        }}
                        className="p-1.5 text-stone-400 hover:text-rose-700 disabled:opacity-20 cursor-pointer"
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
      )}

      {methodId === 'lazy_mug' && (
        <SectionCard
          title="5. Событийная шкала открытого настаивания в кружке"
          subtitle="Непрерывный контакт: экстракция продолжается непрерывно между событиями питья и долива"
        >
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-md text-xs text-amber-900 mb-4 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Модельное допущение:</strong> Ниже приведён демонстрационный сценарий событий (отпивание и долив).
              Он не является записью фактического поведения конкретного человека. Между событиями листья не извлекаются,
              происходит непрерывная диффузия, а температура воды медленно снижается за счёт теплоотдачи кружки.
            </p>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {lazyMugEvents.map((evt, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200/80 rounded-md">
                <div className="flex items-center gap-3">
                  <span className="text-stone-400 text-[11px] w-14">
                    {Math.floor(evt.timestampSeconds / 60)}:{(evt.timestampSeconds % 60).toString().padStart(2, '0')} мин
                  </span>
                  <div>
                    <span className="font-semibold text-stone-900 block font-sans text-xs">
                      {evt.type === 'initial_pour' && 'Первоначальная заливка воды'}
                      {evt.type === 'sip_consumption' && 'Отпивание настоя'}
                      {evt.type === 'water_refill' && 'Долив свежей горячей воды'}
                      {evt.type === 'session_end' && 'Окончание сессии заваривания'}
                    </span>
                    <span className="text-stone-500 text-[11px]">
                      {evt.type === 'initial_pour' && `Залито ${evt.waterVolumeMl} мл воды при ${evt.waterTemperatureC}°C`}
                      {evt.type === 'sip_consumption' && `Выпито ${evt.consumedVolumeMl} мл`}
                      {evt.type === 'water_refill' && `Долито ${evt.addedWaterVolumeMl} мл свежей воды при ${evt.addedWaterTemperatureC}°C`}
                      {evt.type === 'session_end' && 'Фиксация итогового состояния листа'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
};

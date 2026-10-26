/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SimulationExecutionResult } from '../../engine/extraction/types.ts';
import { SectionCard } from '../../components/SectionCard.tsx';
import { BrewingSessionConfig } from '../../domain/brewing/types.ts';
import { BREWING_METHODS } from '../../domain/brewing/defaults.ts';
import {
  ArrowLeft,
  Beaker,
  AlertCircle,
  Info,
  Thermometer,
  Flame,
  Wind,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface SimulationResultsViewProps {
  result: SimulationExecutionResult;
  sessionConfig: BrewingSessionConfig;
  onBackToConfig: () => void;
}

export const SimulationResultsView: React.FC<SimulationResultsViewProps> = ({
  result,
  sessionConfig,
  onBackToConfig,
}) => {
  const method = BREWING_METHODS[result.methodId];
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Сбор точек для общей температурной кривой
  const allTimelinePoints: Array<{
    timeSeconds: number;
    liquidTempC: number;
    vesselTempC: number;
    label?: string;
  }> = [];

  let cumulativeTime = 0;

  if (result.gongfuSteps) {
    const pause = result.thermalSummary?.interInfusionPauseSeconds ?? 20;
    result.gongfuSteps.forEach((step, idx) => {
      if (step.thermalCurveSamplePoints && step.thermalCurveSamplePoints.length > 0) {
        step.thermalCurveSamplePoints.forEach((pt, ptIdx) => {
          allTimelinePoints.push({
            timeSeconds: cumulativeTime + pt.timeSeconds,
            liquidTempC: pt.liquidTemperatureC,
            vesselTempC: pt.vesselTemperatureC,
            label: ptIdx === 0 ? `Пролив #${step.stepNumber}` : undefined,
          });
        });
      }
      cumulativeTime += step.exposureTimeSeconds + pause;
    });
  } else if (result.liuGenPaoSteps) {
    result.liuGenPaoSteps.forEach((step) => {
      if (step.thermalCurveSamplePoints && step.thermalCurveSamplePoints.length > 0) {
        step.thermalCurveSamplePoints.forEach((pt, ptIdx) => {
          allTimelinePoints.push({
            timeSeconds: cumulativeTime + pt.timeSeconds,
            liquidTempC: pt.liquidTemperatureC,
            vesselTempC: pt.vesselTemperatureC,
            label: ptIdx === 0 ? `Шаг #${step.stepNumber}` : undefined,
          });
        });
      }
      cumulativeTime += step.exposureTimeSeconds;
    });
  } else if (result.lazyMugEvents) {
    result.lazyMugEvents.forEach((evt) => {
      if (evt.thermalCurveSamplePoints && evt.thermalCurveSamplePoints.length > 0) {
        evt.thermalCurveSamplePoints.forEach((pt, ptIdx) => {
          allTimelinePoints.push({
            timeSeconds: evt.timestampSeconds + pt.timeSeconds,
            liquidTempC: pt.liquidTemperatureC,
            vesselTempC: pt.vesselTemperatureC,
            label: ptIdx === 0 ? evt.eventType : undefined,
          });
        });
      }
    });
  }

  // Расчёт масштаба графика SVG
  const ambientT = result.thermalSummary?.ambientTemperatureC ?? 22.0;
  const maxTime = allTimelinePoints.length > 0
    ? Math.max(1, allTimelinePoints[allTimelinePoints.length - 1].timeSeconds)
    : 100;
  const minTempChart = Math.max(10, Math.floor((ambientT - 5) / 5) * 5);
  const maxTempChart = 100;
  const tempRange = maxTempChart - minTempChart;

  const chartWidth = 720;
  const chartHeight = 220;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  const getX = (t: number) => paddingLeft + (t / maxTime) * innerWidth;
  const getY = (temp: number) => paddingTop + (1 - (temp - minTempChart) / tempRange) * innerHeight;

  // Формирование SVG path
  let liquidPath = '';
  let vesselPath = '';

  allTimelinePoints.forEach((pt, i) => {
    const x = getX(pt.timeSeconds);
    const yL = getY(pt.liquidTempC);
    const yV = getY(pt.vesselTempC);
    if (i === 0) {
      liquidPath += `M ${x.toFixed(1)} ${yL.toFixed(1)}`;
      vesselPath += `M ${x.toFixed(1)} ${yV.toFixed(1)}`;
    } else {
      liquidPath += ` L ${x.toFixed(1)} ${yL.toFixed(1)}`;
      vesselPath += ` L ${x.toFixed(1)} ${yV.toFixed(1)}`;
    }
  });

  return (
    <div className="space-y-6">
      {/* Верхняя навигация и сводка сессии */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200">
        <div>
          <button
            onClick={onBackToConfig}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Вернуться к параметрам заваривания</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Протокол гидродинамического и теплового расчёта
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Образец: {result.teaSummary.name} · Метод: {method.name} · Посуда: {sessionConfig.vessel.name} · Навеска: {sessionConfig.leafMassGrams} г
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-mono text-stone-600">
          <span>СЕССИЯ:</span>
          <span className="text-stone-900 font-semibold">{result.sessionId}</span>
        </div>
      </div>

      {/* Честный дисклеймер статусов: Этап 2A (тепловой баланс готов) + Этап 3 (кинетика в разработке) */}
      <div className="p-4 bg-stone-50 border border-stone-300 rounded-lg text-xs leading-relaxed space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-stone-900">
            <Thermometer className="w-4 h-4 text-emerald-800" />
            <span>Статус расчётного ядра: Тепловая модель (Этап 2A) активна</span>
          </div>
          <span className="font-mono text-[11px] px-2 py-0.5 bg-stone-200/80 rounded text-stone-700">
            версия ядра: {result.engineVersion}
          </span>
        </div>
        <p className="text-stone-600">
          Температурная динамика рассчитана по <strong>двухузловой модели сосредоточенных теплоёмкостей</strong> (жидкость + стенки сосуда)
          численной схемой Рунге-Кутты 2-го порядка (метод Хойна). Профиль посуды основан на материале и геометрии
          со статусом <code>model_profile</code> (до проведения лабораторной калибровки).
        </p>
        <p className="text-stone-500 text-[11px] pt-1 border-t border-stone-200">
          <strong>Экстракционное ядро:</strong> концентрации веществ, TDS и проценты выхода сухого остатка строго
          сохраняют значение <code>null</code> (status: <code>pending_calibration</code>), так как физико-химическая диффузия
          реализуется на последующем Этапе 3.
        </p>
      </div>

      {/* Понятное объяснение различия температурных понятий */}
      <SectionCard
        title="Метрология температур в лабораторном протоколе"
        subtitle="Различие между температурой заливки, настоя, стенок и окружающей среды"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-stone-50/70 border border-stone-200/80 rounded-md space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-amber-900">
              <Flame className="w-3.5 h-3.5 text-amber-700" />
              <span>Температура заливки (T_pour)</span>
            </div>
            <p className="text-stone-600 leading-relaxed text-[11px]">
              Температура свежей горячей воды на момент вливания из чайника в заварочный сосуд.
            </p>
          </div>

          <div className="p-3 bg-stone-50/70 border border-stone-200/80 rounded-md space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-950">
              <Thermometer className="w-3.5 h-3.5 text-emerald-800" />
              <span>Температура настоя (T_liquid)</span>
            </div>
            <p className="text-stone-600 leading-relaxed text-[11px]">
              Фактическая средняя температура жидкости во время контакта с листом. Непрерывно падает за счёт теплоотдачи стенкам и зеркалу.
            </p>
          </div>

          <div className="p-3 bg-stone-50/70 border border-stone-200/80 rounded-md space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-stone-900">
              <Layers className="w-3.5 h-3.5 text-stone-600" />
              <span>Стенки посуды (T_vessel)</span>
            </div>
            <p className="text-stone-600 leading-relaxed text-[11px]">
              Температура стенок чаши/чайника. Нагревается от горячей воды и охлаждается в окружающий воздух.
            </p>
          </div>

          <div className="p-3 bg-stone-50/70 border border-stone-200/80 rounded-md space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-stone-800">
              <Wind className="w-3.5 h-3.5 text-stone-500" />
              <span>Воздух комнатный (T_ambient)</span>
            </div>
            <p className="text-stone-600 leading-relaxed text-[11px]">
              Температура воздуха ({ambientT} °C), определяющая предел естественного остывания системы.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* График температурной динамики во времени */}
      {allTimelinePoints.length > 1 && (
        <SectionCard
          title="Динамика температурной кривой охлаждения"
          subtitle="Расчёт изменения температуры жидкости и стенок посуды во времени по двухузловой модели"
          action={
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-emerald-800 font-medium">
                <span className="w-3 h-0.5 bg-emerald-800 inline-block"></span>
                Настой (T_liquid)
              </span>
              <span className="flex items-center gap-1.5 text-amber-800 font-medium">
                <span className="w-3 h-0.5 bg-amber-700 border-b border-dashed border-amber-700 inline-block"></span>
                Стенки посуды (T_vessel)
              </span>
              <span className="flex items-center gap-1.5 text-stone-400">
                <span className="w-3 h-0.5 bg-stone-300 inline-block"></span>
                Воздух ({ambientT} °C)
              </span>
            </div>
          }
        >
          <div className="w-full overflow-x-auto">
            <div className="min-w-[650px] p-2 bg-stone-50/50 rounded border border-stone-200/80">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto select-none">
                {/* Горизонтальные сетки температур (каждые 10 °C) */}
                {[30, 40, 50, 60, 70, 80, 90, 100].map((temp) => {
                  if (temp < minTempChart || temp > maxTempChart) return null;
                  const y = getY(temp);
                  return (
                    <g key={temp}>
                      <line
                        x1={paddingLeft}
                        y1={y}
                        x2={chartWidth - paddingRight}
                        y2={y}
                        stroke="#e7e5e4"
                        strokeDasharray={temp === 100 ? undefined : '2 2'}
                      />
                      <text
                        x={paddingLeft - 8}
                        y={y + 3}
                        fontSize="9"
                        textAnchor="end"
                        className="fill-stone-400 font-mono"
                      >
                        {temp}°C
                      </text>
                    </g>
                  );
                })}

                {/* Линия температуры окружающей среды */}
                <line
                  x1={paddingLeft}
                  y1={getY(ambientT)}
                  x2={chartWidth - paddingRight}
                  y2={getY(ambientT)}
                  stroke="#a8a29e"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />

                {/* Кривая стенок сосуда (amber) */}
                <path
                  d={vesselPath}
                  fill="none"
                  stroke="#b45309"
                  strokeWidth="1.75"
                  strokeDasharray="4 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Кривая жидкости (emerald) */}
                <path
                  d={liquidPath}
                  fill="none"
                  stroke="#065f46"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Ось X метки времени */}
                {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                  const t = Math.round(maxTime * ratio);
                  const x = getX(t);
                  return (
                    <g key={ratio}>
                      <line
                        x1={x}
                        y1={chartHeight - paddingBottom}
                        x2={x}
                        y2={chartHeight - paddingBottom + 4}
                        stroke="#78716c"
                      />
                      <text
                        x={x}
                        y={chartHeight - paddingBottom + 14}
                        fontSize="9"
                        textAnchor="middle"
                        className="fill-stone-500 font-mono"
                      >
                        {t >= 60 ? `${Math.floor(t / 60)}м ${t % 60 ? (t % 60) + 'с' : ''}` : `${t}с`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Таблица для Гунфу Ча с тепловыми показателями */}
      {result.gongfuSteps && (
        <SectionCard
          title="Пошаговая карта проливов Гунфу Ча (полный слив)"
          subtitle="Гидродинамический баланс и динамика температур настоя и посуды"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-medium font-mono uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Пролив</th>
                  <th className="py-2.5 px-3">Экспозиция</th>
                  <th className="py-2.5 px-3">Заливка / Слив</th>
                  <th className="py-2.5 px-3">T заливки (T_in)</th>
                  <th className="py-2.5 px-3">T настоя (старт → слив)</th>
                  <th className="py-2.5 px-3">T стенок сосуда</th>
                  <th className="py-2.5 px-3">Потеря ΔT</th>
                  <th className="py-2.5 px-3">TDS (мг/л)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-mono text-stone-800">
                {result.gongfuSteps.map((step) => {
                  const deltaT = Math.round((step.startLiquidTemperatureC - step.finalLiquidTemperatureC) * 10) / 10;
                  return (
                    <tr key={step.stepNumber} className="hover:bg-stone-50/50">
                      <td className="py-3 px-3 font-semibold text-stone-900">
                        #{step.stepNumber}
                      </td>
                      <td className="py-3 px-3 tabular-nums">
                        {step.exposureTimeSeconds} с
                      </td>
                      <td className="py-3 px-3 tabular-nums">
                        {step.pourVolumeMl} мл → <span className="text-emerald-900 font-medium">{step.drainedVolumeMl} мл</span>
                      </td>
                      <td className="py-3 px-3 tabular-nums text-amber-900">
                        {step.pourTemperatureC} °C
                      </td>
                      <td className="py-3 px-3 tabular-nums text-emerald-950 font-medium">
                        {Math.round(step.startLiquidTemperatureC * 10) / 10} → {Math.round(step.finalLiquidTemperatureC * 10) / 10} °C
                      </td>
                      <td className="py-3 px-3 tabular-nums text-stone-600">
                        {Math.round(step.startVesselTemperatureC * 10) / 10} → {Math.round(step.finalVesselTemperatureC * 10) / 10} °C
                      </td>
                      <td className="py-3 px-3 tabular-nums text-stone-500">
                        -{deltaT} °C
                      </td>
                      <td className="py-3 px-3 italic text-stone-400 font-sans">
                        Ожидает калибровки
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Таблица для Лю Гэнь Пао с расчётом смешения */}
      {result.liuGenPaoSteps && (
        <SectionCard
          title="Пошаговая карта Лю Гэнь Пао (сохранение корней настоя)"
          subtitle="Баланс энергии смешения доливаемой воды с сохранённым корнем и охлаждение смеси"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-medium font-mono uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Шаг</th>
                  <th className="py-2.5 px-3">Экспозиция</th>
                  <th className="py-2.5 px-3">Корень + Долив</th>
                  <th className="py-2.5 px-3">Полный объём</th>
                  <th className="py-2.5 px-3">Слив / Остаток</th>
                  <th className="py-2.5 px-3">T смеси (старт → слив)</th>
                  <th className="py-2.5 px-3">T стенок</th>
                  <th className="py-2.5 px-3">TDS (мг/л)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-mono text-stone-800">
                {result.liuGenPaoSteps.map((step) => (
                  <tr key={step.stepNumber} className="hover:bg-stone-50/50">
                    <td className="py-3 px-3 font-semibold text-stone-900">
                      #{step.stepNumber}
                    </td>
                    <td className="py-3 px-3 tabular-nums">
                      {step.exposureTimeSeconds} с
                    </td>
                    <td className="py-3 px-3 tabular-nums text-stone-600">
                      {step.previousRetainedLiquorMl} + <span className="text-blue-900 font-medium">+{step.addedWaterVolumeMl} мл</span>
                    </td>
                    <td className="py-3 px-3 tabular-nums font-semibold text-stone-900">
                      {step.totalLiquorBeforeDrainMl} мл
                    </td>
                    <td className="py-3 px-3 tabular-nums">
                      <span className="text-emerald-900 font-medium">{step.drainedVolumeMl} мл</span> / {step.retainedLiquorRemainingMl} мл
                    </td>
                    <td className="py-3 px-3 tabular-nums text-emerald-950 font-medium">
                      {Math.round(step.startLiquidTemperatureC * 10) / 10} → {Math.round(step.finalLiquidTemperatureC * 10) / 10} °C
                    </td>
                    <td className="py-3 px-3 tabular-nums text-stone-600">
                      {Math.round(step.startVesselTemperatureC * 10) / 10} → {Math.round(step.finalVesselTemperatureC * 10) / 10} °C
                    </td>
                    <td className="py-3 px-3 italic text-stone-400 font-sans">
                      Ожидает калибровки
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Карта событий для Кружки */}
      {result.lazyMugEvents && (
        <SectionCard
          title="Событийная карта открытого заваривания в кружке"
          subtitle="Непрерывный теплообмен и охлаждение в окружающий воздух между отпиваниями и доливами"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-medium font-mono uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Время от старта</th>
                  <th className="py-2.5 px-3">Событие</th>
                  <th className="py-2.5 px-3">Описание</th>
                  <th className="py-2.5 px-3">Объём в кружке</th>
                  <th className="py-2.5 px-3">T настоя (старт → финал)</th>
                  <th className="py-2.5 px-3">T стенок</th>
                  <th className="py-2.5 px-3">TDS (мг/л)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-mono text-stone-800">
                {result.lazyMugEvents.map((evt, idx) => (
                  <tr key={idx} className="hover:bg-stone-50/50">
                    <td className="py-3 px-3 font-semibold text-stone-900">
                      {Math.floor(evt.timestampSeconds / 60)}:{(evt.timestampSeconds % 60).toString().padStart(2, '0')} мин
                    </td>
                    <td className="py-3 px-3 font-sans text-stone-600">
                      {evt.eventType === 'initial_pour' && 'Заливка'}
                      {evt.eventType === 'sip_consumption' && 'Отпивание'}
                      {evt.eventType === 'water_refill' && 'Долив'}
                      {evt.eventType === 'session_end' && 'Финал'}
                    </td>
                    <td className="py-3 px-3 font-sans text-stone-700">
                      {evt.description}
                    </td>
                    <td className="py-3 px-3 tabular-nums font-semibold text-stone-900">
                      {evt.liquidVolumeInMugMl} мл
                    </td>
                    <td className="py-3 px-3 tabular-nums text-emerald-950 font-medium">
                      {Math.round(evt.startLiquidTemperatureC * 10) / 10} → {Math.round(evt.finalLiquidTemperatureC * 10) / 10} °C
                    </td>
                    <td className="py-3 px-3 tabular-nums text-stone-600">
                      {Math.round(evt.startVesselTemperatureC * 10) / 10} → {Math.round(evt.finalVesselTemperatureC * 10) / 10} °C
                    </td>
                    <td className="py-3 px-3 italic text-stone-400 font-sans">
                      Ожидает калибровки
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Список зафиксированных допущений и параметров посуды */}
      <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-md text-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-stone-900 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-stone-500" />
            <span>Параметры тепловой модели и допущения расчёта</span>
          </div>
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="text-stone-500 hover:text-stone-900 inline-flex items-center gap-1 text-[11px] font-mono cursor-pointer"
          >
            <span>{showTechnicalDetails ? 'Свернуть' : 'Подробнее'}</span>
            {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showTechnicalDetails && (
          <div className="pt-2 border-t border-stone-200/80 space-y-2 text-stone-600">
            {result.thermalSummary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 font-mono text-[11px] p-2.5 bg-white rounded border border-stone-200/60">
                <div>
                  <span className="text-stone-400 block">Посуда:</span>
                  <span className="text-stone-900 font-semibold">{result.thermalSummary.vesselProfile.name}</span>
                </div>
                <div>
                  <span className="text-stone-400 block">Теплоёмкость C_v:</span>
                  <span className="text-stone-900">
                    {Math.round(result.thermalSummary.vesselProfile.vesselMassGrams * 0.001 * result.thermalSummary.vesselProfile.materialSpecificHeatJPerKgK * 10) / 10} Дж/К
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block">Проводимости G (Вт/К):</span>
                  <span className="text-stone-900">
                    lv: {result.thermalSummary.vesselProfile.conductanceLiquidVesselWPerK} · va: {result.thermalSummary.vesselProfile.conductanceVesselAmbientWPerK} · la: {result.thermalSummary.vesselProfile.conductanceLiquidAmbientWPerK}
                  </span>
                </div>
              </div>
            )}

            <ul className="list-disc pl-5 space-y-1 text-stone-600">
              {result.assumptionsNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Описание последующих физико-химических расчетов */}
      <SectionCard
        title="План интеграции физико-химических формул"
        subtitle="Что будет рассчитываться ядром после подключения диффузионной модели второго порядка"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-stone-600">
          <div className="p-3 bg-stone-50/80 rounded border border-stone-200/60">
            <h3 className="font-semibold text-stone-900 mb-1 flex items-center gap-1.5">
              <Beaker className="w-3.5 h-3.5 text-emerald-800" />
              1. Закон диффузии Фика
            </h3>
            <p className="leading-relaxed">
              Моделирование переноса сухих веществ из глубин листа через пограничный слой на основе
              градиента концентрации и динамической площади гидратации матрицы.
            </p>
          </div>

          <div className="p-3 bg-stone-50/80 rounded border border-stone-200/60">
            <h3 className="font-semibold text-stone-900 mb-1 flex items-center gap-1.5">
              <Beaker className="w-3.5 h-3.5 text-emerald-800" />
              2. Уравнение Аррениуса
            </h3>
            <p className="leading-relaxed">
              Расчёт влияния температуры воды на константы скорости выхода кофеина, катехинов и аминокислот
              с учётом рассчитанного теплового профиля ({sessionConfig.vessel.name}).
            </p>
          </div>

          <div className="p-3 bg-stone-50/80 rounded border border-stone-200/60">
            <h3 className="font-semibold text-stone-900 mb-1 flex items-center gap-1.5">
              <Beaker className="w-3.5 h-3.5 text-emerald-800" />
              3. Сенсорные проекции
            </h3>
            <p className="leading-relaxed">
              Оценка баланса умами (теанин) и горечи/терпкости (катехины + кофеин) без искажения
              исходных физических параметров фиксированными эмпирическими коэффициентами.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

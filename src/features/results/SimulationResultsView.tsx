/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SimulationExecutionResult } from '../../engine/extraction/types.ts';
import { SectionCard } from '../../components/SectionCard.tsx';
import { BrewingSessionConfig } from '../../domain/brewing/types.ts';
import { BREWING_METHODS } from '../../domain/brewing/defaults.ts';
import { ArrowLeft, Beaker, AlertCircle } from 'lucide-react';

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
  const method = BREWING_METHODS[sessionConfig.methodId];
  const totalWaterMl = result.steps.reduce((acc, s) => acc + s.infusedVolumeMl, 0);
  const totalDrainedMl = result.steps.reduce((acc, s) => acc + s.drainedVolumeMl, 0);

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
            Протокол моделирования: {result.teaSummary.name}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Метод: {method.name} · Посуда: {sessionConfig.vessel.name} · Навеска: {sessionConfig.leafMassGrams} г
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-mono text-stone-600">
          <span>СЕССИЯ:</span>
          <span className="text-stone-900 font-semibold">{result.sessionId}</span>
        </div>
      </div>

      {/* Честный дисклеймер статуса Этапа 1 */}
      <div className="p-4 bg-amber-50/70 border border-amber-200/90 rounded-lg text-amber-900 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed space-y-1">
          <p className="font-semibold text-amber-950">
            Статус расчётного ядра: Ожидает калибровки физико-химических коэффициентов (Этап 3)
          </p>
          <p className="text-amber-800/90">
            {result.disclaimer} В соответствии с принципами Gongfu Cha Lab, приложение не генерирует
            фиктивные случайные проценты экстракции или вымышленные графики. Ниже представлен
            рассчитанный гидродинамический баланс объёмов жидкости и подготовленная структура данных для будущих измерений.
          </p>
        </div>
      </div>

      {/* Сводные показатели материального баланса (рассчитанные честно по массам и объемам) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border border-stone-200 rounded-md">
          <span className="text-xs text-stone-500 block mb-1">Суммарный долив воды</span>
          <div className="flex items-baseline">
            <span className="text-2xl font-mono tabular-nums font-semibold text-stone-900">
              {totalWaterMl}
            </span>
            <span className="text-xs font-mono text-stone-500 ml-1.5 uppercase">мл</span>
          </div>
        </div>

        <div className="p-3.5 bg-white border border-stone-200 rounded-md">
          <span className="text-xs text-stone-500 block mb-1">Суммарный выход настоя</span>
          <div className="flex items-baseline">
            <span className="text-2xl font-mono tabular-nums font-semibold text-stone-900">
              {totalDrainedMl}
            </span>
            <span className="text-xs font-mono text-stone-500 ml-1.5 uppercase">мл</span>
          </div>
        </div>

        <div className="p-3.5 bg-white border border-stone-200 rounded-md">
          <span className="text-xs text-stone-500 block mb-1">Соотношение сырья</span>
          <div className="flex items-baseline">
            <span className="text-2xl font-mono tabular-nums font-semibold text-stone-900">
              1:{(sessionConfig.vessel.volumeMl / sessionConfig.leafMassGrams).toFixed(1)}
            </span>
            <span className="text-xs font-mono text-stone-500 ml-1.5 uppercase">г:мл</span>
          </div>
        </div>

        <div className="p-3.5 bg-white border border-stone-200 rounded-md">
          <span className="text-xs text-stone-500 block mb-1">Проливов выполнено</span>
          <div className="flex items-baseline">
            <span className="text-2xl font-mono tabular-nums font-semibold text-stone-900">
              {result.steps.length}
            </span>
            <span className="text-xs font-mono text-stone-500 ml-1.5 uppercase">шагов</span>
          </div>
        </div>
      </div>

      {/* Пошаговая таблица проливов */}
      <SectionCard
        title="Пошаговая гидродинамическая карта проливов"
        subtitle="Фактический объём вливаемой жидкости, удержание в сосуде и температурный режим шагов"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-medium font-mono uppercase tracking-wider">
                <th className="py-2.5 px-3">Шаг</th>
                <th className="py-2.5 px-3">Экспозиция</th>
                <th className="py-2.5 px-3">Долив воды</th>
                <th className="py-2.5 px-3">Слитый настой</th>
                <th className="py-2.5 px-3">Остаток в сосуде</th>
                <th className="py-2.5 px-3">Температура</th>
                <th className="py-2.5 px-3">TDS (мг/л)</th>
                <th className="py-2.5 px-3">Выход сухих (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-mono text-stone-800">
              {result.steps.map((step) => (
                <tr key={step.stepNumber} className="hover:bg-stone-50/50 transition-colors">
                  <td className="py-3 px-3 font-semibold text-stone-900">
                    #{step.stepNumber}
                  </td>
                  <td className="py-3 px-3 tabular-nums">
                    {step.exposureTimeSeconds} с
                  </td>
                  <td className="py-3 px-3 tabular-nums">
                    {step.infusedVolumeMl} мл
                  </td>
                  <td className="py-3 px-3 tabular-nums text-emerald-900 font-medium">
                    {step.drainedVolumeMl} мл
                  </td>
                  <td className="py-3 px-3 tabular-nums text-stone-500">
                    {step.retainedVolumeMl > 0 ? `${step.retainedVolumeMl} мл` : '0 мл (дренаж)'}
                  </td>
                  <td className="py-3 px-3 tabular-nums">
                    {step.averageTemperatureC} °C
                  </td>
                  <td className="py-3 px-3 italic text-stone-400 font-sans">
                    {step.concentrationMgL !== null ? `${step.concentrationMgL} мг/л` : 'Ожидает Этапа 3'}
                  </td>
                  <td className="py-3 px-3 italic text-stone-400 font-sans">
                    {step.yieldPercent !== null ? `${step.yieldPercent} %` : 'Ожидает Этапа 3'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Описание дальнейших шагов интеграции */}
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
              с учётом теплоотдачи материала сосуда ({sessionConfig.vessel.name}).
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

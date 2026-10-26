/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SimulationExecutionResult } from '../../engine/extraction/types.ts';
import { SectionCard } from '../../components/SectionCard.tsx';
import { BrewingSessionConfig } from '../../domain/brewing/types.ts';
import { BREWING_METHODS } from '../../domain/brewing/defaults.ts';
import { ArrowLeft, Beaker, AlertCircle, Info } from 'lucide-react';

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
            Протокол гидродинамического расчёта: {result.teaSummary.name}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Метод: {method.name} · Ёмкость: {sessionConfig.vessel.name} · Навеска: {sessionConfig.leafMassGrams} г · Вода: {sessionConfig.waterProfile.name}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-mono text-stone-600">
          <span>СЕССИЯ:</span>
          <span className="text-stone-900 font-semibold">{result.sessionId}</span>
        </div>
      </div>

      {/* Честный дисклеймер статуса Этапа 1.1 */}
      <div className="p-4 bg-amber-50/70 border border-amber-200/90 rounded-lg text-amber-900 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed space-y-1">
          <p className="font-semibold text-amber-950">
            Статус расчётного ядра: Ожидает калибровки физико-химических коэффициентов (Этап 3)
          </p>
          <p className="text-amber-800/90">
            {result.disclaimer} В соответствии с принципами Gongfu Cha Lab, приложение не генерирует
            фиктивные случайные проценты экстракции или вымышленные графики. Ниже представлен
            предварительный гидродинамический баланс объёмов жидкости и подготовленная структура данных для будущих измерений.
          </p>
        </div>
      </div>

      {/* Список зафиксированных допущений */}
      {result.assumptionsNotes.length > 0 && (
        <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-md text-xs text-stone-600 space-y-1.5">
          <div className="font-semibold text-stone-900 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-stone-500" />
            <span>Зафиксированные модельные допущения текущего этапа:</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-stone-600">
            {result.assumptionsNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Таблица для Гунфу Ча */}
      {result.gongfuSteps && (
        <SectionCard
          title="Пошаговая карта проливов Гунфу Ча (полный слив)"
          subtitle="Фактический объём заливки, слив и температура воды по шагам"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-medium font-mono uppercase tracking-wider">
                  <th className="py-2.5 px-3">Пролив</th>
                  <th className="py-2.5 px-3">Экспозиция</th>
                  <th className="py-2.5 px-3">Залитая вода</th>
                  <th className="py-2.5 px-3">Слитый настой</th>
                  <th className="py-2.5 px-3">Температура</th>
                  <th className="py-2.5 px-3">TDS (мг/л)</th>
                  <th className="py-2.5 px-3">Выход сухих (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-mono text-stone-800">
                {result.gongfuSteps.map((step) => (
                  <tr key={step.stepNumber} className="hover:bg-stone-50/50">
                    <td className="py-3 px-3 font-semibold text-stone-900">
                      #{step.stepNumber}
                    </td>
                    <td className="py-3 px-3 tabular-nums">
                      {step.exposureTimeSeconds} с
                    </td>
                    <td className="py-3 px-3 tabular-nums">
                      {step.pourVolumeMl} мл
                    </td>
                    <td className="py-3 px-3 tabular-nums text-emerald-900 font-medium">
                      {step.drainedVolumeMl} мл
                    </td>
                    <td className="py-3 px-3 tabular-nums">
                      {step.temperatureC} °C
                    </td>
                    <td className="py-3 px-3 italic text-stone-400 font-sans">
                      Ожидает калибровки
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

      {/* Таблица для Лю Гэнь Пао */}
      {result.liuGenPaoSteps && (
        <SectionCard
          title="Пошаговая карта Лю Гэнь Пао (сохранение корней настоя)"
          subtitle="Расчёт остатка корня от ПОЛНОГО объёма в сосуде (предыдущий остаток + долив)"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-medium font-mono uppercase tracking-wider">
                  <th className="py-2.5 px-3">Шаг</th>
                  <th className="py-2.5 px-3">Экспозиция</th>
                  <th className="py-2.5 px-3">Остаток от прошл.</th>
                  <th className="py-2.5 px-3">Долитая вода</th>
                  <th className="py-2.5 px-3">Полный объём до слива</th>
                  <th className="py-2.5 px-3">Слитый настой</th>
                  <th className="py-2.5 px-3">Оставшийся корень</th>
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
                    <td className="py-3 px-3 tabular-nums text-stone-500">
                      {step.previousRetainedLiquorMl} мл
                    </td>
                    <td className="py-3 px-3 tabular-nums text-blue-900">
                      +{step.addedWaterVolumeMl} мл
                    </td>
                    <td className="py-3 px-3 tabular-nums font-semibold text-stone-900">
                      {step.totalLiquorBeforeDrainMl} мл
                    </td>
                    <td className="py-3 px-3 tabular-nums text-emerald-900 font-medium">
                      {step.drainedVolumeMl} мл
                    </td>
                    <td className="py-3 px-3 tabular-nums text-amber-900">
                      {step.retainedLiquorRemainingMl} мл
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
          subtitle="Дискретный сценарий изменений объёма жидкости при непрерывном контакте листьев с водой"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-medium font-mono uppercase tracking-wider">
                  <th className="py-2.5 px-3">Время от старта</th>
                  <th className="py-2.5 px-3">Тип события</th>
                  <th className="py-2.5 px-3">Описание события</th>
                  <th className="py-2.5 px-3">Объём жидкости в кружке</th>
                  <th className="py-2.5 px-3">Температура воды</th>
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
                    <td className="py-3 px-3 tabular-nums">
                      {evt.temperatureC} °C
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

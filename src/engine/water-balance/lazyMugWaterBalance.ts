/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LazyMugEventType,
  LazyMugSessionConfig,
  LazyMugTimelineEvent,
  LazyMugInitialPourEvent,
  LazyMugSipEvent,
  LazyMugRefillEvent,
} from '../../domain/brewing/types.ts';
import { TeaSample } from '../../domain/tea/types.ts';
import {
  DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML,
  convertMassToVolume,
  convertVolumeToMass,
} from './balance.ts';
import {
  HydrationKineticsStepResult,
  stepHydrationKinetics,
} from './hydrationKinetics.ts';
import { WaterBalanceValidationError } from './errors.ts';

/**
 * Статус расчёта водного баланса отдельного события шкалы времени Lazy Mug:
 * - 'calculated': событие и предшествующий интервал гидратации полностью рассчитаны;
 * - 'unknown_hydration_profile': гидратация на интервале не может быть рассчитана из-за отсутствия размерных параметров чая;
 * - 'blocked_by_unknown_prior_state': событие заблокировано, так как зависит от неизвестных объёмов/масс предшествующего состояния.
 */
export type LazyMugEventWaterBalanceStatus =
  | 'calculated'
  | 'unknown_hydration_profile'
  | 'blocked_by_unknown_prior_state';

/**
 * Итоговый статус расчёта водного баланса всей сессии Lazy Mug:
 * - 'calculated': вся сессия полностью рассчитана;
 * - 'unknown_hydration_profile': хотя бы на одном интервале отсутствовали размерные параметры гидратации.
 */
export type LazyMugSessionWaterBalanceStatus =
  | 'calculated'
  | 'unknown_hydration_profile';

/**
 * Опции расчёта водного баланса Lazy Mug.
 */
export interface LazyMugWaterBalanceOptions {
  /**
   * Принятая плотность жидкой воды, г/мл (по умолчанию 1.0 г/мл).
   */
  readonly assumedWaterDensityGPerMl?: number;
}

/**
 * Результат расчёта водного баланса отдельного события шкалы времени Lazy Mug.
 *
 * СОГЛАШЕНИЕ О СНИМКЕ СОСТОЯНИЯ:
 * Снимок представляет физическое состояние системы ПОСЛЕ завершения интервала гидратации
 * до временной метки события и ПОСЛЕ обработки самого события в момент timestampSeconds.
 * Для события 'initial_pour' гидратационный интервал отсутствует (интервал = 0 с, поглощение = 0 г).
 */
export interface LazyMugTimelineEventWaterBalanceResult {
  /** Порядковый индекс события в массиве timelineEvents (0-based) */
  readonly eventIndex: number;
  /** Тип события на шкале времени */
  readonly eventType: LazyMugEventType;
  /** Метка времени события от старта сессии, секунды */
  readonly timestampSeconds: number;
  /** Метрологический статус расчёта события */
  readonly status: LazyMugEventWaterBalanceStatus;
  /** Длительность предшествующего интервала контакта листьев с водой (0 с для initial_pour) */
  readonly intervalDurationSeconds: number;

  /** Детальный результат расчёта кинетики гидратации на предшествующем интервале (null для initial_pour или при блокировке) */
  readonly hydrationStepResult: HydrationKineticsStepResult | null;

  /** Масса свободной жидкости в кружке после обработки события, г (null при неизвестном состоянии) */
  readonly freeWaterMassGrams: number | null;
  /** Объёмный эквивалент свободной жидкости в кружке после обработки события, мл (null при неизвестном состоянии) */
  readonly freeWaterVolumeMl: number | null;
  /** Масса воды, поглощённой матрицей чайного листа после обработки события, г (null при неизвестном состоянии) */
  readonly absorbedWaterGrams: number | null;

  /** Объём добавленной на данном событии воды, мл (для initial_pour и water_refill) */
  readonly addedWaterVolumeMl?: number;
  /** Масса добавленной на данном событии воды, г (для initial_pour и water_refill) */
  readonly addedWaterMassGrams?: number;

  /** Объём выпитой на данном событии воды, мл (для sip_consumption) */
  readonly consumedWaterVolumeMl?: number;
  /** Масса выпитой на данном событии воды, г (для sip_consumption) */
  readonly consumedWaterMassGrams?: number;

  /** Накопленная суммарная масса выпитой воды на момент завершения события, г (null при неизвестном состоянии) */
  readonly cumulativeConsumedWaterMassGrams: number | null;
  /** Накопленный суммарный объём выпитой воды на момент завершения события, мл (null при неизвестном состоянии) */
  readonly cumulativeConsumedWaterVolumeMl: number | null;

  /** Невязка баланса массы на данном событии: |m_added_cum - (m_abs + m_free + m_consumed_cum)|, г (null при неизвестном состоянии) */
  readonly massConservationDeltaGrams: number | null;

  /** Текстовое пояснение причины блокировки или особого состояния */
  readonly reason?: string;
  /** Список диагностических сообщений */
  readonly diagnostics: string[];
}

/**
 * Итоговый результат расчёта водного баланса сессии Lazy Mug.
 */
export interface LazyMugWaterBalanceResult {
  /** Идентификатор сессии заваривания */
  readonly methodId: 'lazy_mug';
  /** Идентификатор чайного образца */
  readonly teaId: string;
  /** Итоговый статус расчёта сессии */
  readonly status: LazyMugSessionWaterBalanceStatus;

  /** Массив результатов расчёта по всем событиям временной шкалы в хронологическом порядке */
  readonly events: LazyMugTimelineEventWaterBalanceResult[];

  /** Суммарный объём всей добавленной в кружку воды (начальный залив + доливы), мл */
  readonly totalAddedWaterVolumeMl: number;
  /** Суммарная масса всей добавленной в кружку воды, г */
  readonly totalAddedWaterMassGrams: number;

  /** Суммарный объём выпитой пользователем жидкости, мл (null при неизвестном статусе) */
  readonly totalConsumedWaterVolumeMl: number | null;
  /** Суммарная масса выпитой пользователем жидкости, г (null при неизвестном статусе) */
  readonly totalConsumedWaterMassGrams: number | null;

  /** Финальная масса воды, поглощённой чайным листом к моменту session_end, г (null при неизвестном статусе) */
  readonly finalAbsorbedWaterGrams: number | null;
  /** Финальная масса оставшейся свободной жидкости в кружке к моменту session_end, г (null при неизвестном статусе) */
  readonly finalFreeWaterMassGrams: number | null;
  /** Финальный объём оставшейся свободной жидкости в кружке к моменту session_end, мл (null при неизвестном статусе) */
  readonly finalFreeWaterVolumeMl: number | null;

  /**
   * Невязка закона сохранения массы для всей сессии, г:
   * |m_added_total - (m_abs_final + m_free_final + m_consumed_total)|.
   * При status = 'calculated' строго равна ~0 в пределах машинной точности (null при неизвестном статусе).
   */
  readonly sessionMassConservationDeltaGrams: number | null;

  /** Сводный список диагностических замечаний сессии */
  readonly diagnostics: string[];
}

/**
 * Изолированный детерминированный расчёт водного баланса метода открытого заваривания в кружке — Lazy Mug.
 *
 * ФИЗИЧЕСКИЕ ИНВАРИАНТЫ И ОСОБЕННОСТИ МЕТОДА:
 * 1. Лист остаётся непрерывно погруженным в воду на протяжении всей сессии.
 * 2. Компартменты:
 *    - Поглощённая листом влага (absorbedWaterGrams);
 *    - Свободная жидкая фаза в кружке (freeWaterMassGrams / freeWaterVolumeMl);
 *    - Накопленная выпитая пользователем жидкость (cumulativeConsumedWaterMassGrams).
 * 3. Отпивание (sip_consumption) удаляет воду ТОЛЬКО из свободной жидкой фазы кружки.
 *    Оно не уменьшает и не может уменьшать влагу, уже поглощённую матрицей листа.
 * 4. В методе Lazy Mug нет слива настоя из сосуда и разделения на сито/гайвань:
 *    вода, находящаяся между листьями, остаётся внутри кружки и не выводится в отдельный компартмент.
 * 5. Временной порядок:
 *    В интервале между событиями t_{i-1} и t_i чайный лист непрерывно поглощает воду
 *    по кинетике первого порядка (stepHydrationKinetics).
 *    В момент t_i сначала учитывается гидратация за истёкший интервал, и лишь затем
 *    применяется воздействие текущего события (отпивание или долив).
 * 6. Распространение неизвестности (Unknown ≠ 0):
 *    При отсутствии размерных параметров гидратации статус становится unknown_hydration_profile,
 *    а все зависимые величины последующих событий получают статус blocked_by_unknown_prior_state
 *    со значениями null без вымышленных масс или скрытой подстановки нуля.
 * 7. Температурное допущение текущей версии:
 *    Константа гидратации hydrationRateConstantPerSecond принимается постоянной на протяжении
 *    сессии; температурная обратная связь Аррениуса для кинетики гидратации в текущем этапе
 *    не подключается. Температуры заливки и доливов строго валидируются в диапазоне [0, 100] °C.
 * 8. Закон сохранения массы:
 *    m_added = m_abs_final + m_free_final + m_consumed (невязка < 1e-12 г).
 */
export function simulateLazyMugWaterBalance(
  session: LazyMugSessionConfig,
  tea: TeaSample,
  options: LazyMugWaterBalanceOptions = {}
): LazyMugWaterBalanceResult {
  const density = options.assumedWaterDensityGPerMl ?? DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML;
  const sessionDiagnostics: string[] = [];

  // =========================================================================
  // 1. Валидация базовых объектов и параметров сессии
  // =========================================================================
  if (!session) {
    throw new WaterBalanceValidationError(
      'Конфигурация сессии Lazy Mug не передана.',
      'INVALID_SESSION',
      'session',
      session
    );
  }
  if (!tea) {
    throw new WaterBalanceValidationError(
      'Паспорт чайного образца не передан.',
      'INVALID_TEA',
      'tea',
      tea
    );
  }
  if (session.methodId !== 'lazy_mug') {
    throw new WaterBalanceValidationError(
      `Метод сессии должен быть 'lazy_mug', получено: '${session.methodId}'.`,
      'INVALID_METHOD',
      'session.methodId',
      session.methodId
    );
  }
  if (session.teaId !== tea.id) {
    throw new WaterBalanceValidationError(
      `Идентификатор чая в сессии ('${session.teaId}') не совпадает с переданным образцом чая ('${tea.id}').`,
      'MISMATCHED_TEA_ID',
      'session.teaId',
      session.teaId
    );
  }
  if (typeof session.leafMassGrams !== 'number' || !Number.isFinite(session.leafMassGrams) || session.leafMassGrams <= 0) {
    throw new WaterBalanceValidationError(
      `Масса сухого листа должна быть строго положительным числом (> 0 г): ${session.leafMassGrams} г.`,
      'INVALID_DRY_MASS',
      'session.leafMassGrams',
      session.leafMassGrams
    );
  }
  if (!session.vessel || typeof session.vessel.volumeMl !== 'number' || !Number.isFinite(session.vessel.volumeMl) || session.vessel.volumeMl <= 0) {
    throw new WaterBalanceValidationError(
      `Вместимость кружки должна быть строго положительным числом (> 0 мл): ${session.vessel?.volumeMl} мл.`,
      'INVALID_VESSEL_VOLUME',
      'session.vessel.volumeMl',
      session.vessel?.volumeMl
    );
  }
  if (typeof density !== 'number' || !Number.isFinite(density) || density <= 0) {
    throw new WaterBalanceValidationError(
      `Принятая плотность воды должна быть строго положительным числом (> 0 г/мл): ${density} г/мл.`,
      'INVALID_DENSITY',
      'assumedWaterDensityGPerMl',
      density
    );
  }
  if (
    typeof session.initialWaterVolumeMl !== 'number' ||
    !Number.isFinite(session.initialWaterVolumeMl) ||
    session.initialWaterVolumeMl <= 0
  ) {
    throw new WaterBalanceValidationError(
      `Объём первоначальной заливки в сессии должен быть строго положительным числом: ${session.initialWaterVolumeMl} мл.`,
      'INVALID_INITIAL_VOLUME',
      'session.initialWaterVolumeMl',
      session.initialWaterVolumeMl
    );
  }

  const vesselCapacityMl = session.vessel.volumeMl;
  if (session.initialWaterVolumeMl > vesselCapacityMl + 1e-9) {
    throw new WaterBalanceValidationError(
      `Объём первоначальной заливки (${session.initialWaterVolumeMl} мл) превышает вместимость кружки (${vesselCapacityMl} мл).`,
      'VESSEL_CAPACITY_EXCEEDED',
      'session.initialWaterVolumeMl',
      session.initialWaterVolumeMl
    );
  }

  // =========================================================================
  // 2. Валидация структуры временной шкалы и независимых параметров событий
  // =========================================================================
  const events = session.timelineEvents;
  if (!events || !Array.isArray(events) || events.length < 2) {
    throw new WaterBalanceValidationError(
      `Временная шкала Lazy Mug должна содержать как минимум 2 события (initial_pour и session_end), получено: ${events ? events.length : 0}.`,
      'INVALID_TIMELINE_LENGTH',
      'session.timelineEvents',
      events
    );
  }

  // Проверка первого события: строго initial_pour при t = 0
  const firstEvent = events[0];
  if (firstEvent.type !== 'initial_pour') {
    throw new WaterBalanceValidationError(
      `Первым событием шкалы Lazy Mug обязательно должен быть 'initial_pour', получено: '${firstEvent.type}'.`,
      'INVALID_INITIAL_EVENT',
      'session.timelineEvents[0].type',
      firstEvent.type
    );
  }
  if (typeof firstEvent.timestampSeconds !== 'number' || !Number.isFinite(firstEvent.timestampSeconds) || firstEvent.timestampSeconds !== 0) {
    throw new WaterBalanceValidationError(
      `Первое событие 'initial_pour' должно иметь временную метку строго 0 с, получено: ${firstEvent.timestampSeconds} с.`,
      'INVALID_INITIAL_TIMESTAMP',
      'session.timelineEvents[0].timestampSeconds',
      firstEvent.timestampSeconds
    );
  }

  // Проверка параметров initial_pour
  const initialPour = firstEvent as LazyMugInitialPourEvent;
  if (typeof initialPour.waterVolumeMl !== 'number' || !Number.isFinite(initialPour.waterVolumeMl) || initialPour.waterVolumeMl <= 0) {
    throw new WaterBalanceValidationError(
      `Объём первоначальной заливки в событии initial_pour должен быть строго положительным числом: ${initialPour.waterVolumeMl} мл.`,
      'INVALID_INITIAL_VOLUME',
      'session.timelineEvents[0].waterVolumeMl',
      initialPour.waterVolumeMl
    );
  }
  if (initialPour.waterVolumeMl > vesselCapacityMl + 1e-9) {
    throw new WaterBalanceValidationError(
      `Объём первоначальной заливки (${initialPour.waterVolumeMl} мл) превышает вместимость кружки (${vesselCapacityMl} мл).`,
      'VESSEL_CAPACITY_EXCEEDED',
      'session.timelineEvents[0].waterVolumeMl',
      initialPour.waterVolumeMl
    );
  }
  if (
    typeof initialPour.waterTemperatureC !== 'number' ||
    !Number.isFinite(initialPour.waterTemperatureC) ||
    initialPour.waterTemperatureC < 0 ||
    initialPour.waterTemperatureC > 100
  ) {
    throw new WaterBalanceValidationError(
      `Температура первоначальной заливки должна быть числом в диапазоне [0, 100] °C, получено: ${initialPour.waterTemperatureC} °C.`,
      'INVALID_WATER_TEMPERATURE',
      'session.timelineEvents[0].waterTemperatureC',
      initialPour.waterTemperatureC
    );
  }

  // Согласованность session.initialWaterVolumeMl и timelineEvents[0].waterVolumeMl
  if (Math.abs(session.initialWaterVolumeMl - initialPour.waterVolumeMl) > 1e-9) {
    throw new WaterBalanceValidationError(
      `Несогласованность данных: session.initialWaterVolumeMl (${session.initialWaterVolumeMl} мл) не совпадает с timelineEvents[0].waterVolumeMl (${initialPour.waterVolumeMl} мл).`,
      'INCONSISTENT_INITIAL_VOLUME',
      'session.initialWaterVolumeMl',
      {
        sessionInitialWaterVolumeMl: session.initialWaterVolumeMl,
        timelineInitialWaterVolumeMl: initialPour.waterVolumeMl,
      }
    );
  }

  // Проверка всей временной шкалы: уникальность событий, монотонность времени, независимые поля
  let initialPourCount = 0;
  let sessionEndCount = 0;

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];

    if (typeof evt.timestampSeconds !== 'number' || !Number.isFinite(evt.timestampSeconds) || evt.timestampSeconds < 0) {
      throw new WaterBalanceValidationError(
        `Метка времени события #${i} (${evt.type}) должна быть конечным неотрицательным числом: ${evt.timestampSeconds} с.`,
        'INVALID_TIMESTAMP',
        `session.timelineEvents[${i}].timestampSeconds`,
        evt.timestampSeconds
      );
    }

    if (i > 0) {
      const prevEvt = events[i - 1];
      if (evt.timestampSeconds <= prevEvt.timestampSeconds) {
        throw new WaterBalanceValidationError(
          `Нарушение хронологии шкалы: событие #${i} (${evt.type}, ${evt.timestampSeconds} с) должно следовать строго позже предыдущего события #${i - 1} (${prevEvt.type}, ${prevEvt.timestampSeconds} с). Метки времени должны строго возрастать (t_i > t_i-1).`,
          'TIMELINE_CHRONOLOGY_ERROR',
          `session.timelineEvents[${i}].timestampSeconds`,
          evt.timestampSeconds
        );
      }
    }

    if (evt.type === 'initial_pour') {
      initialPourCount++;
      if (initialPourCount > 1 || i > 0) {
        throw new WaterBalanceValidationError(
          `Обнаружено повторное событие 'initial_pour' на позиции #${i}. В сценарии кружки допустим только один начальный залив при t = 0 с. Для последующих добавлений воды используйте 'water_refill'.`,
          'DUPLICATE_INITIAL_POUR',
          `session.timelineEvents[${i}].type`,
          evt.type
        );
      }
    } else if (evt.type === 'session_end') {
      sessionEndCount++;
      if (sessionEndCount > 1 || i !== events.length - 1) {
        throw new WaterBalanceValidationError(
          `Событие 'session_end' на позиции #${i} должно быть строго единственным и последним событием шкалы. Никакие события не могут следовать после завершения сессии.`,
          'EVENT_AFTER_SESSION_END',
          `session.timelineEvents[${i}].type`,
          evt.type
        );
      }
    } else if (evt.type === 'sip_consumption') {
      const sip = evt as LazyMugSipEvent;
      if (typeof sip.consumedVolumeMl !== 'number' || !Number.isFinite(sip.consumedVolumeMl) || sip.consumedVolumeMl <= 0) {
        throw new WaterBalanceValidationError(
          `Объём отпивания на шаге #${i} должен быть строго положительным числом: ${sip.consumedVolumeMl} мл.`,
          'INVALID_SIP_VOLUME',
          `session.timelineEvents[${i}].consumedVolumeMl`,
          sip.consumedVolumeMl
        );
      }
    } else if (evt.type === 'water_refill') {
      const refill = evt as LazyMugRefillEvent;
      if (typeof refill.addedWaterVolumeMl !== 'number' || !Number.isFinite(refill.addedWaterVolumeMl) || refill.addedWaterVolumeMl <= 0) {
        throw new WaterBalanceValidationError(
          `Объём долива воды на шаге #${i} должен быть строго положительным числом: ${refill.addedWaterVolumeMl} мл.`,
          'INVALID_REFILL_VOLUME',
          `session.timelineEvents[${i}].addedWaterVolumeMl`,
          refill.addedWaterVolumeMl
        );
      }
      if (
        typeof refill.addedWaterTemperatureC !== 'number' ||
        !Number.isFinite(refill.addedWaterTemperatureC) ||
        refill.addedWaterTemperatureC < 0 ||
        refill.addedWaterTemperatureC > 100
      ) {
        throw new WaterBalanceValidationError(
          `Температура доливаемой воды на шаге #${i} должна быть числом в диапазоне [0, 100] °C: ${refill.addedWaterTemperatureC} °C.`,
          'INVALID_WATER_TEMPERATURE',
          `session.timelineEvents[${i}].addedWaterTemperatureC`,
          refill.addedWaterTemperatureC
        );
      }
      // Независимая проверка: свежий долив сам по себе не может превышать номинальную вместимость кружки
      if (refill.addedWaterVolumeMl > vesselCapacityMl + 1e-9) {
        throw new WaterBalanceValidationError(
          `Объём долива воды на шаге #${i} (${refill.addedWaterVolumeMl} мл) превышает номинальную вместимость кружки (${vesselCapacityMl} мл).`,
          'VESSEL_CAPACITY_EXCEEDED',
          `session.timelineEvents[${i}].addedWaterVolumeMl`,
          refill.addedWaterVolumeMl
        );
      }
    }
  }

  // Завершающим событием обязательно должно быть session_end
  if (sessionEndCount === 0 || events[events.length - 1].type !== 'session_end') {
    throw new WaterBalanceValidationError(
      `Завершающим событием шкалы Lazy Mug обязательно должно быть 'session_end', получено: '${events[events.length - 1].type}'.`,
      'INVALID_FINAL_EVENT',
      `session.timelineEvents[${events.length - 1}].type`,
      events[events.length - 1].type
    );
  }

  // =========================================================================
  // 3. Пошаговое моделирование кинетики гидратации и материального баланса
  // =========================================================================
  const eventResults: LazyMugTimelineEventWaterBalanceResult[] = [];

  // Начальное состояние при t = 0 (после initial_pour):
  let currentAbsorbedGrams = 0.0;
  const initialWaterVolumeMl = initialPour.waterVolumeMl;
  const initialWaterMassGrams = convertVolumeToMass(initialWaterVolumeMl, density);

  let currentFreeGrams = initialWaterMassGrams;
  let currentFreeVolumeMl = initialWaterVolumeMl;

  let cumulativeConsumedMassGrams = 0.0;
  let cumulativeConsumedVolumeMl = 0.0;

  let cumulativeAddedMassGrams = initialWaterMassGrams;
  let cumulativeAddedVolumeMl = initialWaterVolumeMl;

  let isBlocked = false;
  let blockReason = '';
  let sessionStatus: LazyMugSessionWaterBalanceStatus = 'calculated';

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    const eventDiagnostics: string[] = [];

    if (i === 0) {
      // Событие initial_pour (t = 0): гидратационного интервала нет
      const deltaGrams = Math.abs(cumulativeAddedMassGrams - (currentAbsorbedGrams + currentFreeGrams + cumulativeConsumedMassGrams));
      eventResults.push({
        eventIndex: 0,
        eventType: 'initial_pour',
        timestampSeconds: 0,
        status: 'calculated',
        intervalDurationSeconds: 0,
        hydrationStepResult: null,
        freeWaterMassGrams: currentFreeGrams,
        freeWaterVolumeMl: currentFreeVolumeMl,
        absorbedWaterGrams: 0.0,
        addedWaterVolumeMl: initialWaterVolumeMl,
        addedWaterMassGrams: initialWaterMassGrams,
        cumulativeConsumedWaterMassGrams: 0.0,
        cumulativeConsumedWaterVolumeMl: 0.0,
        massConservationDeltaGrams: deltaGrams,
        diagnostics: [],
      });
      continue;
    }

    const prevEvt = events[i - 1];
    const dt = evt.timestampSeconds - prevEvt.timestampSeconds;

    if (isBlocked) {
      // Предшествующее состояние неизвестно — блокируем зависимый расчёт физических величин
      eventDiagnostics.push(blockReason);

      let addedVol: number | undefined;
      let addedMass: number | undefined;
      let consumedVol: number | undefined;
      let consumedMass: number | undefined;

      if (evt.type === 'water_refill') {
        const refill = evt as LazyMugRefillEvent;
        addedVol = refill.addedWaterVolumeMl;
        addedMass = convertVolumeToMass(addedVol, density);
        cumulativeAddedVolumeMl += addedVol;
        cumulativeAddedMassGrams += addedMass;
      } else if (evt.type === 'sip_consumption') {
        const sip = evt as LazyMugSipEvent;
        consumedVol = sip.consumedVolumeMl;
        consumedMass = convertVolumeToMass(consumedVol, density);
      }

      eventResults.push({
        eventIndex: i,
        eventType: evt.type,
        timestampSeconds: evt.timestampSeconds,
        status: 'blocked_by_unknown_prior_state',
        intervalDurationSeconds: dt,
        hydrationStepResult: null,
        freeWaterMassGrams: null,
        freeWaterVolumeMl: null,
        absorbedWaterGrams: null,
        addedWaterVolumeMl: addedVol,
        addedWaterMassGrams: addedMass,
        consumedWaterVolumeMl: consumedVol,
        consumedWaterMassGrams: consumedMass,
        cumulativeConsumedWaterMassGrams: null,
        cumulativeConsumedWaterVolumeMl: null,
        massConservationDeltaGrams: null,
        reason: blockReason,
        diagnostics: eventDiagnostics,
      });
      continue;
    }

    // 1. Расчёт гидратации за интервал dt от предыдущего события до момента текущего события
    const hydrationResult = stepHydrationKinetics({
      dryLeafMassGrams: session.leafMassGrams,
      currentAbsorbedWaterGrams: currentAbsorbedGrams,
      availableFreeWaterGrams: currentFreeGrams,
      maxAbsorptionRatio: tea.waterAbsorptionRatio,
      hydrationRateConstant: tea.hydrationRateConstantPerSecond,
      durationSeconds: dt,
      assumedWaterDensityGPerMl: density,
    });

    if (hydrationResult.status === 'unknown_hydration_profile') {
      isBlocked = true;
      sessionStatus = 'unknown_hydration_profile';
      blockReason =
        hydrationResult.reason ||
        'Отсутствуют необходимые размерные параметры кинетики гидратации чайного листа.';
      eventDiagnostics.push(...hydrationResult.diagnostics, blockReason);

      let addedVol: number | undefined;
      let addedMass: number | undefined;
      let consumedVol: number | undefined;
      let consumedMass: number | undefined;

      if (evt.type === 'water_refill') {
        const refill = evt as LazyMugRefillEvent;
        addedVol = refill.addedWaterVolumeMl;
        addedMass = convertVolumeToMass(addedVol, density);
        cumulativeAddedVolumeMl += addedVol;
        cumulativeAddedMassGrams += addedMass;
      } else if (evt.type === 'sip_consumption') {
        const sip = evt as LazyMugSipEvent;
        consumedVol = sip.consumedVolumeMl;
        consumedMass = convertVolumeToMass(consumedVol, density);
      }

      eventResults.push({
        eventIndex: i,
        eventType: evt.type,
        timestampSeconds: evt.timestampSeconds,
        status: 'unknown_hydration_profile',
        intervalDurationSeconds: dt,
        hydrationStepResult: hydrationResult,
        freeWaterMassGrams: null,
        freeWaterVolumeMl: null,
        absorbedWaterGrams: null,
        addedWaterVolumeMl: addedVol,
        addedWaterMassGrams: addedMass,
        consumedWaterVolumeMl: consumedVol,
        consumedWaterMassGrams: consumedMass,
        cumulativeConsumedWaterMassGrams: null,
        cumulativeConsumedWaterVolumeMl: null,
        massConservationDeltaGrams: null,
        reason: blockReason,
        diagnostics: eventDiagnostics,
      });
      continue;
    }

    // Гидратация успешно рассчитана
    currentAbsorbedGrams = hydrationResult.newAbsorbedWaterGrams!;
    currentFreeGrams = hydrationResult.newFreeWaterGrams!;
    currentFreeVolumeMl = convertMassToVolume(currentFreeGrams, density);
    eventDiagnostics.push(...hydrationResult.diagnostics);

    // 2. Обработка текущего события, наступившего в момент timestampSeconds
    let addedVol: number | undefined;
    let addedMass: number | undefined;
    let consumedVol: number | undefined;
    let consumedMass: number | undefined;

    if (evt.type === 'sip_consumption') {
      const sip = evt as LazyMugSipEvent;
      consumedVol = sip.consumedVolumeMl;

      // Строгая проверка: запрашиваемый объём отпивания не может превышать фактически доступную свободную воду.
      // Превышение даже на величину менее 1e-9 мл строго отклоняется без скрытых допусков.
      if (consumedVol > currentFreeVolumeMl) {
        throw new WaterBalanceValidationError(
          `Объём отпивания (${consumedVol} мл) превышает фактически доступный объём свободной жидкости в кружке (${currentFreeVolumeMl.toFixed(4)} мл).`,
          'SIP_EXCEEDS_AVAILABLE_FREE_WATER',
          `session.timelineEvents[${i}].consumedVolumeMl`,
          consumedVol
        );
      }

      // Точная обработка отпивания:
      // При полном отпивании (запрошенный объём в точности равен доступному свободному объёму)
      // вся свободная жидкость переходит в компартмент выпитой воды (m_free = 0, V_free = 0)
      // без возникновения погрешностей неточного деления/умножения в арифметике IEEE 754.
      // При частичном отпивании выполняется прямое вычитание выпитой массы без маскировки через Math.max.
      if (consumedVol === currentFreeVolumeMl) {
        consumedMass = currentFreeGrams;
        currentFreeGrams = 0.0;
        currentFreeVolumeMl = 0.0;
      } else {
        consumedMass = convertVolumeToMass(consumedVol, density);
        currentFreeGrams = currentFreeGrams - consumedMass;
        currentFreeVolumeMl = convertMassToVolume(currentFreeGrams, density);
      }

      cumulativeConsumedMassGrams += consumedMass;
      cumulativeConsumedVolumeMl += consumedVol;
    } else if (evt.type === 'water_refill') {
      const refill = evt as LazyMugRefillEvent;
      addedVol = refill.addedWaterVolumeMl;
      addedMass = convertVolumeToMass(addedVol, density);

      // Проверка: суммарный свободный объём после долива не должен превышать номинальную вместимость кружки
      const totalVolumeAfterRefill = currentFreeVolumeMl + addedVol;
      if (totalVolumeAfterRefill > vesselCapacityMl + 1e-9) {
        throw new WaterBalanceValidationError(
          `Долив воды (${addedVol} мл) при текущем остатке свободной жидкости (${currentFreeVolumeMl.toFixed(2)} мл) превышает номинальную вместимость кружки (${vesselCapacityMl} мл). Суммарный объём составил бы ${totalVolumeAfterRefill.toFixed(2)} мл.`,
          'VESSEL_CAPACITY_EXCEEDED',
          `session.timelineEvents[${i}].addedWaterVolumeMl`,
          addedVol
        );
      }

      currentFreeGrams += addedMass;
      currentFreeVolumeMl = convertMassToVolume(currentFreeGrams, density);
      cumulativeAddedMassGrams += addedMass;
      cumulativeAddedVolumeMl += addedVol;
    } else if (evt.type === 'session_end') {
      // Фиксация финального состояния без изменения масс
    }

    // Проверка закона сохранения массы на уровне текущего события:
    // m_added_cumulative = m_abs + m_free + m_consumed_cumulative
    const totalAccounted = currentAbsorbedGrams + currentFreeGrams + cumulativeConsumedMassGrams;
    const deltaGrams = Math.abs(cumulativeAddedMassGrams - totalAccounted);

    eventResults.push({
      eventIndex: i,
      eventType: evt.type,
      timestampSeconds: evt.timestampSeconds,
      status: 'calculated',
      intervalDurationSeconds: dt,
      hydrationStepResult: hydrationResult,
      freeWaterMassGrams: currentFreeGrams,
      freeWaterVolumeMl: currentFreeVolumeMl,
      absorbedWaterGrams: currentAbsorbedGrams,
      addedWaterVolumeMl: addedVol,
      addedWaterMassGrams: addedMass,
      consumedWaterVolumeMl: consumedVol,
      consumedWaterMassGrams: consumedMass,
      cumulativeConsumedWaterMassGrams: cumulativeConsumedMassGrams,
      cumulativeConsumedWaterVolumeMl: cumulativeConsumedVolumeMl,
      massConservationDeltaGrams: deltaGrams,
      diagnostics: eventDiagnostics,
    });
  }

  // =========================================================================
  // 4. Формирование итогового материального баланса сессии
  // =========================================================================
  const isFullyCalculated = sessionStatus === 'calculated';

  let totalConsumedWaterVolumeMl: number | null = null;
  let totalConsumedWaterMassGrams: number | null = null;
  let finalAbsorbedWaterGrams: number | null = null;
  let finalFreeWaterMassGrams: number | null = null;
  let finalFreeWaterVolumeMl: number | null = null;
  let sessionMassConservationDeltaGrams: number | null = null;

  if (isFullyCalculated) {
    totalConsumedWaterVolumeMl = cumulativeConsumedVolumeMl;
    totalConsumedWaterMassGrams = cumulativeConsumedMassGrams;
    finalAbsorbedWaterGrams = currentAbsorbedGrams;
    finalFreeWaterMassGrams = currentFreeGrams;
    finalFreeWaterVolumeMl = currentFreeVolumeMl;

    const totalAccountedSession = currentAbsorbedGrams + currentFreeGrams + cumulativeConsumedMassGrams;
    sessionMassConservationDeltaGrams = Math.abs(cumulativeAddedMassGrams - totalAccountedSession);
  }

  return {
    methodId: 'lazy_mug',
    teaId: session.teaId,
    status: sessionStatus,
    events: eventResults,
    totalAddedWaterVolumeMl: cumulativeAddedVolumeMl,
    totalAddedWaterMassGrams: cumulativeAddedMassGrams,
    totalConsumedWaterVolumeMl,
    totalConsumedWaterMassGrams,
    finalAbsorbedWaterGrams,
    finalFreeWaterMassGrams,
    finalFreeWaterVolumeMl,
    sessionMassConservationDeltaGrams,
    diagnostics: sessionDiagnostics,
  };
}

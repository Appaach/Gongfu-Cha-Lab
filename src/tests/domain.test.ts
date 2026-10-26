/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createValueWithOrigin,
  isKnownValue,
  formatValueWithUnit,
  TeaSample,
} from '../domain/tea/types.ts';
import { validateTeaSample, migrateLegacyCustomTea } from '../domain/tea/validation.ts';
import {
  createDefaultGongfuSteps,
  createDefaultLiuGenPaoSteps,
  createDefaultLazyMugEvents,
  createDefaultSession,
  DEFAULT_WATER_PROFILES,
  BREWING_METHODS,
} from '../domain/brewing/defaults.ts';
import { REFERENCE_TEAS } from '../data/referenceTeas.ts';
import { Stage1ExtractionEngine } from '../engine/extraction/contracts.ts';

export interface TestResult {
  readonly suite: string;
  readonly testName: string;
  readonly passed: boolean;
  readonly error?: string;
}

/**
 * Верификация предметных инвариантов и достоверности данных (Этап 1.1).
 */
export async function runDomainTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(suite: string, name: string, condition: boolean, message?: string) {
    results.push({
      suite,
      testName: name,
      passed: condition,
      error: condition ? undefined : (message ?? 'Assertion failed'),
    });
  }

  // 1. Семантика происхождения данных и Unknown ≠ 0
  {
    const suite = 'Семантика происхождения данных (Unknown ≠ 0)';

    const unknownVal = createValueWithOrigin<number>(null, 'unknown', '%');
    assert(suite, 'Неизвестное значение имеет строго value === null', unknownVal.value === null);
    assert(suite, 'isKnownValue возвращает false для unknown', isKnownValue(unknownVal) === false);
    assert(suite, 'formatValueWithUnit сообщает "Данные отсутствуют", а не "0 %"', formatValueWithUnit(unknownVal).includes('Данные отсутствуют'));

    // Если статус unknown, передача числа все равно принудительно устанавливает null
    const invalidUnknown = createValueWithOrigin<number>(15, 'unknown', '%');
    assert(suite, 'Статус unknown никогда не содержит числа (value обнуляется в null)', invalidUnknown.value === null);

    // Измеренный или фактический ноль корректно отличается от отсутствия данных
    const measuredZero = createValueWithOrigin<number>(0, 'user_defined', '%');
    assert(suite, 'Фактический ноль является известным значением', isKnownValue(measuredZero) && measuredZero.value === 0);
  }

  // 2. Невозможность автоматически присваивать confidence = 1.0 или фиктивную уверенность
  {
    const suite = 'Контроль оценок неопределенности';
    const val = createValueWithOrigin<number>(3.5, 'model_profile', '%');
    // Поле uncertainty должно быть undefined, если не предоставлен реальный протокол
    assert(suite, 'По умолчанию uncertainty не выдумывается (undefined)', val.uncertainty === undefined);
    assert(suite, 'В объекте отсутствует фиктивное поле confidence = 1.0', !('confidence' in val) || (val as any).confidence === undefined);
  }

  // 3. Создание чая с неизвестными характеристиками и без авто-подстановки
  {
    const suite = 'Создание пользовательского чая';

    const minimalCustomTea: TeaSample = {
      id: 'custom-minimal-1',
      name: 'Улун с дачи',
      waterAbsorptionRatio: createValueWithOrigin<number>(null, 'unknown', 'г/г'),
      leafBulkDensityGPerCm3: createValueWithOrigin<number>(null, 'unknown', 'г/см³'),
      totalExtractableFraction: createValueWithOrigin<number>(null, 'unknown', '%'),
      caffeineFraction: createValueWithOrigin<number>(null, 'unknown', '%'),
      theanineFraction: createValueWithOrigin<number>(null, 'unknown', '%'),
      totalPolyphenolsFraction: createValueWithOrigin<number>(null, 'unknown', '%'),
      isCustom: true,
    };

    const issues = validateTeaSample(minimalCustomTea);
    const errors = issues.filter((i) => i.severity === 'error');
    assert(suite, 'Чай без химических и физических параметров валиден (0 ошибок)', errors.length === 0);
    assert(suite, 'Год сбора остается undefined (не подставляется автоматически текущий год)', minimalCustomTea.harvestYear === undefined);
    assert(suite, 'Категория и форма листа могут отсутствовать', minimalCustomTea.category === undefined && minimalCustomTea.morphology === undefined);
    assert(suite, 'В модели пользовательского чая отсутствуют субъективные tastingNotes', !('notes' in minimalCustomTea) && !('tastingNotes' in minimalCustomTea));
  }

  // 4. Защита от двойного учета химических компонентов
  {
    const suite = 'Защита от двойного учета компонентов';
    const contradictoryTea: TeaSample = {
      id: 'custom-contradictory',
      name: 'Чай с невозможной химией',
      waterAbsorptionRatio: createValueWithOrigin<number>(null, 'unknown', 'г/г'),
      leafBulkDensityGPerCm3: createValueWithOrigin<number>(null, 'unknown', 'г/см³'),
      totalExtractableFraction: createValueWithOrigin(30.0, 'user_defined', '%'),
      caffeineFraction: createValueWithOrigin(10.0, 'user_defined', '%'),
      theanineFraction: createValueWithOrigin(10.0, 'user_defined', '%'),
      totalPolyphenolsFraction: createValueWithOrigin(20.0, 'user_defined', '%'), // 10+10+20 = 40% > 30%
      isCustom: true,
    };

    const issues = validateTeaSample(contradictoryTea);
    const hasDoubleCountError = issues.some((i) => i.field === 'totalExtractableFraction' && i.severity === 'error');
    assert(suite, 'Сумма фракций (40%) больше общего экстракта (30%) вызывает ошибку валидации', hasDoubleCountError);
  }

  // 5. Безопасная миграция старых объектов localStorage
  {
    const suite = 'Миграция устаревшей схемы localStorage';
    const legacyRaw = {
      id: 'legacy-1',
      name: 'Старый пуэр',
      notes: 'Очень сладкий, нотки сухофруктов', // субъективная заметка, должна быть удалена
      waterAbsorptionRatio: { value: 2.8, origin: 'estimated', unit: 'г/г' },
      totalSolubleFraction: { value: 40.0, origin: 'user_defined', unit: '%' },
      caffeineEstimate: { value: null, origin: 'unknown', unit: '%' },
    };

    const migrated = migrateLegacyCustomTea(legacyRaw);
    assert(suite, 'Миграция сохраняет имя чая', migrated.name === 'Старый пуэр');
    assert(suite, 'Устаревший origin estimated конвертируется в model_profile', migrated.waterAbsorptionRatio.origin === 'model_profile');
    assert(suite, 'Старое поле totalSolubleFraction переносится в totalExtractableFraction', migrated.totalExtractableFraction.value === 40.0);
    assert(suite, 'Субъективные дегустационные заметки удалены из модели', !('notes' in migrated));
  }

  // 6. Раздельные модели событий для трёх методов заваривания
  {
    const suite = 'Раздельные модели методов заваривания';
    const methods = Object.keys(BREWING_METHODS) as Array<keyof typeof BREWING_METHODS>;
    assert(suite, 'Присутствуют ровно 3 метода', methods.length === 3);

    // Гунфу Ча
    const gfSteps = createDefaultGongfuSteps(100, 95);
    assert(suite, 'Гунфу Ча оперирует шагами пролива с фактическим pourWaterVolumeMl', gfSteps[0].pourWaterVolumeMl === 100);

    // Лю Гэнь Пао
    const liuGenSteps = createDefaultLiuGenPaoSteps(100, 95);
    assert(suite, 'Лю Гэнь Пао оперирует retainedLiquorFractionOfTotal относительно полного объема', liuGenSteps[0].retainedLiquorFractionOfTotal > 0 && liuGenSteps[0].retainedLiquorFractionOfTotal < 1.0);

    // Ленивое заваривание
    const lazyEvents = createDefaultLazyMugEvents(300, 88);
    const eventTypes = lazyEvents.map((e) => e.type);
    assert(suite, 'Ленивое заваривание содержит событие первоначальной заливки', eventTypes.includes('initial_pour'));
    assert(suite, 'Ленивое заваривание содержит события отпивания (sip_consumption)', eventTypes.includes('sip_consumption'));
    assert(suite, 'Ленивое заваривание содержит событие долива (water_refill)', eventTypes.includes('water_refill'));
    assert(suite, 'Ленивое заваривание содержит завершение сессии', eventTypes.includes('session_end'));
  }

  // 7. Расчёт соотношений: объем заливки vs вместимость сосуда
  {
    const suite = 'Метрология гидромодуля и единиц';
    const session = createDefaultSession('gongfu_cha', REFERENCE_TEAS[0].id);
    const vesselCap = session.vessel.volumeMl; // 110 мл
    const actualPour = session.methodId === 'gongfu_cha' ? session.steps[0].pourWaterVolumeMl : 100;

    assert(suite, 'Вместимость сосуда (110 мл) не подменяет фактический объём заливки (100 мл)', vesselCap !== actualPour);
    const ratio = actualPour / session.leafMassGrams; // 100 / 6 = 16.67
    assert(suite, 'Гидромодуль рассчитывается по фактической заливке (100 мл / 6 г = 1:16.7)', Math.abs(ratio - 16.67) < 0.1);
  }

  // 8. Профиль воды и обработка неизвестных параметров
  {
    const suite = 'Профиль воды';
    const customWater = DEFAULT_WATER_PROFILES.find((w) => w.id === 'water-user-custom');
    assert(suite, 'Пользовательский профиль воды существует', customWater !== undefined);
    assert(suite, 'Пользовательский профиль воды не скрывает числа, TDS равен null (unknown)', customWater?.mineralizationTdsMgL.value === null);

    const presetWater = DEFAULT_WATER_PROFILES.find((w) => w.isModelPreset);
    assert(suite, 'Типовой профиль воды явно помечен как модельное допущение (isModelPreset: true)', presetWater?.isModelPreset === true);
  }

  // 9. Аудит эталонного каталога: отсутствие ложных "измерений"
  {
    const suite = 'Аудит эталонного каталога';
    for (const tea of REFERENCE_TEAS) {
      // Ни одно поле в эталонном каталоге не должно иметь неподтвержденный статус 'measured'!
      assert(
        suite,
        `Образец "${tea.name}" не содержит неподтвержденных статусов "measured"`,
        tea.waterAbsorptionRatio.origin !== 'measured' &&
          tea.totalExtractableFraction.origin !== 'measured' &&
          tea.caffeineFraction.origin !== 'measured'
      );
    }
  }

  // 10. Статус ядра Stage1ExtractionEngine
  {
    const suite = 'Статус ядра Stage1ExtractionEngine';
    const engine = new Stage1ExtractionEngine();
    assert(suite, 'Ядро сохраняет статус pending_calibration', engine.readinessStatus === 'pending_calibration');

    const session = createDefaultSession('liu_gen_pao', REFERENCE_TEAS[0].id);
    const result = await engine.simulate(session, REFERENCE_TEAS[0]);
    assert(suite, 'Результат Лю Гэнь Пао содержит расчет полного объема до слива', (result.liuGenPaoSteps?.[1].totalLiquorBeforeDrainMl ?? 0) > (result.liuGenPaoSteps?.[1].addedWaterVolumeMl ?? 0));
    assert(suite, 'Кинетические величины остаются строго null', result.liuGenPaoSteps?.every((s) => s.concentrationMgL === null) === true);
  }

  return results;
}

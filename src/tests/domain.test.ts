/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createValueWithOrigin,
  isKnownValue,
  formatValueWithUnit,
  validateTeaSample,
} from '../domain/tea/index.ts';
import {
  createDefaultSteps,
  createDefaultSession,
  BREWING_METHODS,
} from '../domain/brewing/index.ts';
import { REFERENCE_TEAS } from '../data/referenceTeas.ts';
import { Stage1ExtractionEngine } from '../engine/extraction/contracts.ts';

export interface TestResult {
  readonly suite: string;
  readonly testName: string;
  readonly passed: boolean;
  readonly error?: string;
}

/**
 * Встроенный набор тестов для верификации архитектурных инвариантов.
 * Запускается как программно в среде разработки, так и может отображаться в интерфейсе
 * для подтверждения детерминированности и научной прозрачности.
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

  // Блок 1: Принцип "Неизвестное не равно нулю" (Unknown != 0)
  {
    const suite = 'Принцип Unknown != 0';
    const unknownVal = createValueWithOrigin<number>(null, 'unknown', '%');
    assert(suite, 'Неизвестное значение имеет null вместо 0', unknownVal.value === null);
    assert(suite, 'isKnownValue возвращает false для unknown', isKnownValue(unknownVal) === false);
    assert(suite, 'formatValueWithUnit явно сообщает об отсутствии данных', formatValueWithUnit(unknownVal).includes('Данные отсутствуют'));

    const measuredZero = createValueWithOrigin<number>(0, 'measured', '%');
    assert(suite, 'Измеренный ноль корректно распознается как известное значение 0', isKnownValue(measuredZero) && measuredZero.value === 0);
  }

  // Блок 2: Инварианты эталонного каталога
  {
    const suite = 'Эталонный каталог чаёв';
    assert(suite, 'Каталог содержит эталонные образцы', REFERENCE_TEAS.length >= 6);

    for (const tea of REFERENCE_TEAS) {
      const issues = validateTeaSample(tea);
      const errors = issues.filter(i => i.severity === 'error');
      assert(suite, `Чай ${tea.name} не имеет фатальных ошибок валидации`, errors.length === 0, errors.map(e => e.message).join('; '));
      assert(suite, `У образца ${tea.name} водопоглощение положительно`, tea.waterAbsorptionRatio.value !== null && tea.waterAbsorptionRatio.value > 0);
    }
  }

  // Блок 3: Конфигурация методов заваривания
  {
    const suite = 'Методы заваривания';
    const methods = Object.keys(BREWING_METHODS) as Array<keyof typeof BREWING_METHODS>;
    assert(suite, 'Присутствуют ровно 3 обязательных метода', methods.length === 3);
    assert(suite, 'Присутствует метод Гунфу Ча', methods.includes('gongfu_cha'));
    assert(suite, 'Присутствует метод Лю Гэнь Пао', methods.includes('liu_gen_pao'));
    assert(suite, 'Присутствует метод Открытого настаивания (в кружке)', methods.includes('lazy_mug'));

    const gfSteps = createDefaultSteps('gongfu_cha', 110, 95);
    assert(suite, 'Гунфу Ча генерирует последовательность коротких проливов', gfSteps.length >= 4 && gfSteps[0].infusionTimeSeconds <= 15);

    const liuGenSteps = createDefaultSteps('liu_gen_pao', 110, 95);
    assert(suite, 'Лю Гэнь Пао содержит параметр retainedLiquorPercent', liuGenSteps.every(s => (s.retainedLiquorPercent ?? 0) > 0));
  }

  // Блок 4: Контракт математического ядра Этапа 1
  {
    const suite = 'Ядро экстракции (Этап 1)';
    const engine = new Stage1ExtractionEngine();
    assert(suite, 'Ядро имеет статус pending_calibration', engine.readinessStatus === 'pending_calibration');

    const session = createDefaultSession('gongfu_cha', REFERENCE_TEAS[0].id);
    const result = await engine.simulate(session, REFERENCE_TEAS[0]);
    assert(suite, 'Результат симуляции содержит дисклеймер', result.disclaimer.length > 0);
    assert(suite, 'Результат сохраняет null для некалибрированных формул', result.steps.every(s => s.concentrationMgL === null));
  }

  return results;
}

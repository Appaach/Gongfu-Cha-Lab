/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { runDomainTestSuite } from './domain.test.ts';
import { runThermalTestSuite } from './thermal.test.ts';
import { runWaterBalanceTestSuite } from './waterBalance.test.ts';
import { runHydrationKineticsTestSuite } from './hydrationKinetics.test.ts';
import { runGongfuWaterBalanceTestSuite } from './gongfuWaterBalance.test.ts';
import { runLiuGenPaoWaterBalanceTestSuite } from './liuGenPaoWaterBalance.test.ts';
import { runLazyMugWaterBalanceTestSuite } from './lazyMugWaterBalance.test.ts';
import { runLeafWaterMixingTestSuite } from './leafWaterMixing.test.ts';

async function main() {
  console.log('--- Запуск верификации предметных инвариантов Gongfu Cha Lab ---');
  const domainResults = await runDomainTestSuite();
  console.log('--- Запуск верификации теплового ядра (Этап 2A) ---');
  const thermalResults = await runThermalTestSuite();
  console.log('--- Запуск верификации водного баланса (Этап 2B.1) ---');
  const waterBalanceResults = await runWaterBalanceTestSuite();
  console.log('--- Запуск верификации кинетики гидратации (Этап 2B.2) ---');
  const hydrationKineticsResults = await runHydrationKineticsTestSuite();
  console.log('--- Запуск верификации водного баланса Гунфу Ча (Этап 2B.3.1) ---');
  const gongfuWaterBalanceResults = await runGongfuWaterBalanceTestSuite();
  console.log('--- Запуск верификации водного баланса Лю Гэнь Пао (Этап 2B.3.2.1) ---');
  const liuGenPaoWaterBalanceResults = await runLiuGenPaoWaterBalanceTestSuite();
  console.log('--- Запуск верификации водного баланса Lazy Mug (Этап 2B.3.2.2) ---');
  const lazyMugWaterBalanceResults = await runLazyMugWaterBalanceTestSuite();
  console.log('--- Запуск верификации смешения чайного листа и воды (Этап 2B.3.3.1) ---');
  const leafWaterMixingResults = await runLeafWaterMixingTestSuite();

  const results = [
    ...domainResults,
    ...thermalResults,
    ...waterBalanceResults,
    ...hydrationKineticsResults,
    ...gongfuWaterBalanceResults,
    ...liuGenPaoWaterBalanceResults,
    ...lazyMugWaterBalanceResults,
    ...leafWaterMixingResults,
  ];
  let failures = 0;

  for (const r of results) {
    if (r.passed) {
      console.log(`[PASS] [${r.suite}] ${r.testName}`);
    } else {
      console.error(`[FAIL] [${r.suite}] ${r.testName}: ${r.error}`);
      failures++;
    }
  }

  console.log('----------------------------------------------------------------');
  console.log(`Всего тестов: ${results.length}. Успешно: ${results.length - failures}. Ошибок: ${failures}.`);

  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Непредвиденная ошибка при выполнении тестов:', err);
  process.exit(1);
});

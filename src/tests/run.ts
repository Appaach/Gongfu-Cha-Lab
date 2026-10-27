/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { runDomainTestSuite } from './domain.test.ts';
import { runThermalTestSuite } from './thermal.test.ts';
import { runWaterBalanceTestSuite } from './waterBalance.test.ts';

async function main() {
  console.log('--- Запуск верификации предметных инвариантов Gongfu Cha Lab ---');
  const domainResults = await runDomainTestSuite();
  console.log('--- Запуск верификации теплового ядра (Этап 2A) ---');
  const thermalResults = await runThermalTestSuite();
  console.log('--- Запуск верификации водного баланса (Этап 2B.1) ---');
  const waterBalanceResults = await runWaterBalanceTestSuite();

  const results = [...domainResults, ...thermalResults, ...waterBalanceResults];
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

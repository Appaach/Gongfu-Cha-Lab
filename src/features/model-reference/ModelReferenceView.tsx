/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SectionCard } from '../../components/SectionCard.tsx';
import { runDomainTestSuite, TestResult } from '../../tests/domain.test.ts';
import { CheckCircle2, XCircle, Beaker, Play, ShieldAlert, Cpu } from 'lucide-react';

export const ModelReferenceView: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const results = await runDomainTestSuite();
      setTestResults(results);
    } finally {
      setIsRunningTests(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Справочник научной модели и физических основ
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Теоретические уравнения экстракции, архитектурные инварианты и верификация детерминированности
          </p>
        </div>

        <button
          onClick={handleRunTests}
          disabled={isRunningTests}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-900 bg-emerald-100/70 hover:bg-emerald-200/80 rounded-md transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isRunningTests ? 'Проверка...' : 'Запустить верификацию модели'}</span>
        </button>
      </div>

      {/* Результаты живых тестов предметной логики (если запущены) */}
      {testResults && (
        <SectionCard
          title="Результаты верификации архитектурных инвариантов"
          subtitle="Автоматический прогон тестов предметной модели и контракта ядра экстракции"
        >
          <div className="space-y-2">
            <div className="flex items-center gap-4 text-xs font-mono pb-2 border-b border-stone-200">
              <span>ВСЕГО ПРОВЕРОК: {testResults.length}</span>
              <span className="text-emerald-800 font-semibold">
                УСПЕШНО: {testResults.filter((r) => r.passed).length}
              </span>
              {testResults.some((r) => !r.passed) && (
                <span className="text-rose-700 font-semibold">
                  ОШИБОК: {testResults.filter((r) => !r.passed).length}
                </span>
              )}
            </div>

            <div className="divide-y divide-stone-100 text-xs font-mono">
              {testResults.map((res, i) => (
                <div key={i} className="py-2 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {res.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="text-stone-500">[{res.suite}] </span>
                      <span className="text-stone-900">{res.testName}</span>
                      {res.error && (
                        <p className="text-rose-700 font-sans text-[11px] mt-0.5">
                          {res.error}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={res.passed ? 'text-emerald-800' : 'text-rose-700'}>
                    {res.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Фундаментальные уравнения */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard
          title="1. Диффузия Фика и массообмен"
          subtitle="Твердофазная нестационарная экстракция из пористой растительной матрицы"
        >
          <div className="space-y-3 text-xs text-stone-600 leading-relaxed">
            <div className="p-3 bg-stone-50 border border-stone-200/80 rounded font-mono text-center text-sm text-stone-900">
              ∂C(r, t) / ∂t = D_eff · ∇²C
            </div>
            <p>
              Перенос растворённых веществ (кофеина, аминокислот, полифенолов) из глубины клеток листа
              к его поверхности лимитируется эффективным коэффициентом диффузии <code className="font-mono text-stone-900">D_eff</code>.
            </p>
            <p>
              Поток вещества в чашу подчиняется уравнению массоотдачи через пограничный слой:
            </p>
            <div className="p-2.5 bg-stone-50 border border-stone-200/80 rounded font-mono text-center text-xs text-stone-800">
              J = k_L · A_eff(t) · (C_surf - C_bulk)
            </div>
            <p>
              Здесь <code className="font-mono text-stone-900">A_eff(t)</code> — динамическая площадь контакта,
              которая увеличивается по мере гидратации и раскручивания листа.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="2. Температурная зависимость Аррениуса"
          subtitle="Влияние теплового баланса на константы скорости выхода фракций"
        >
          <div className="space-y-3 text-xs text-stone-600 leading-relaxed">
            <div className="p-3 bg-stone-50 border border-stone-200/80 rounded font-mono text-center text-sm text-stone-900">
              k(T) = A · exp(-E_a / (R · T))
            </div>
            <p>
              Энергия активации диффузии <code className="font-mono text-stone-900">E_a</code> существенно различается
              между молекулами разного размера:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>L-теанин:</strong> малая молекула (~174 Да), низкая энергия активации. Выходит при 65–80°C.
              </li>
              <li>
                <strong>Кофеин:</strong> средняя подвижность (~194 Да), умеренная энергия активации.
              </li>
              <li>
                <strong>Эпигаллокатехин галлат (EGCG) и танины:</strong> крупные полифенольные комплексы. Скорость экстракции резко взлетает лишь при 90–100°C.
              </li>
            </ul>
          </div>
        </SectionCard>
      </div>

      {/* Архитектурные принципы лаборатории */}
      <SectionCard
        title="Архитектурные принципы и ограничения"
        subtitle="Гарантии научной добросовестности платформы"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-stone-50 rounded-lg border border-stone-200/80 space-y-1.5">
            <h3 className="font-semibold text-stone-950 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-emerald-800" />
              Unknown ≠ 0
            </h3>
            <p className="text-stone-600 leading-relaxed">
              Отсутствующее значение не заменяется нулём. Если анализ аминокислот для партии не проводился,
              модель не вправе утверждать, что в чае 0% теанина. Используется статус «Данные отсутствуют».
            </p>
          </div>

          <div className="p-4 bg-stone-50 rounded-lg border border-stone-200/80 space-y-1.5">
            <h3 className="font-semibold text-stone-950 flex items-center gap-1.5">
              <Beaker className="w-4 h-4 text-emerald-800" />
              Явные размерности
            </h3>
            <p className="text-stone-600 leading-relaxed">
              Все величины строго типизированы: масса сырья (г), объёмы (мл), температуры (°C),
              время экспозиции (с), минерализация (мг/л), концентрация (мг/л).
            </p>
          </div>

          <div className="p-4 bg-stone-50 rounded-lg border border-stone-200/80 space-y-1.5">
            <h3 className="font-semibold text-stone-950 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-emerald-800" />
              Изоляция ядра
            </h3>
            <p className="text-stone-600 leading-relaxed">
              Математическое ядро (<code className="font-mono">IExtractionEngine</code>) полностью отвязано от интерфейса.
              Любая калибровка физических уравнений не требует переписывания компонентов отображения.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Справочник физических единиц */}
      <SectionCard
        title="Справочник физических величин и размерностей"
        subtitle="Единый стандарт размерностей в Gongfu Cha Lab"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 font-mono uppercase tracking-wider">
                <th className="py-2.5 px-3">Параметр</th>
                <th className="py-2.5 px-3">Обозначение</th>
                <th className="py-2.5 px-3">Единица</th>
                <th className="py-2.5 px-3">Типичный диапазон</th>
                <th className="py-2.5 px-3">Физический смысл</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-mono text-stone-800">
              <tr>
                <td className="py-2 px-3 font-semibold text-stone-900 font-sans">Водопоглощение листа</td>
                <td className="py-2 px-3">R_abs</td>
                <td className="py-2 px-3">г/г</td>
                <td className="py-2 px-3">2.0 – 3.2</td>
                <td className="py-2 px-3 font-sans text-stone-600">Масса воды, связываемой 1 г сухого сырья</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-stone-900 font-sans">Экстрактивные вещества</td>
                <td className="py-2 px-3">TDS_max</td>
                <td className="py-2 px-3">%</td>
                <td className="py-2 px-3">30.0 – 45.0</td>
                <td className="py-2 px-3 font-sans text-stone-600">Предельная доля водорастворимого сухого остатка</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-stone-900 font-sans">Концентрация настоя</td>
                <td className="py-2 px-3">C_solids</td>
                <td className="py-2 px-3">мг/л</td>
                <td className="py-2 px-3">800 – 4500</td>
                <td className="py-2 px-3 font-sans text-stone-600">Плотность растворенных сухих веществ в чашке</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-stone-900 font-sans">Температура заваривания</td>
                <td className="py-2 px-3">T_water</td>
                <td className="py-2 px-3">°C</td>
                <td className="py-2 px-3">60.0 – 100.0</td>
                <td className="py-2 px-3 font-sans text-stone-600">Температура растворителя на момент вливания</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

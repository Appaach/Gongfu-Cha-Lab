/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SectionCard } from '../../components/SectionCard.tsx';
import { Settings as SettingsIcon, RotateCcw, Check } from 'lucide-react';

interface SettingsViewProps {
  onResetCustomTeas: () => void;
  customTeasCount: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onResetCustomTeas,
  customTeasCount,
}) => {
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleReset = () => {
    onResetCustomTeas();
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Настройки лаборатории
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Конфигурация единиц измерения, параметры окружения и системная информация платформы
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono text-stone-500 self-start sm:self-auto">
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>КОНФИГУРАЦИЯ СИСТЕМЫ</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Физические размерности */}
        <SectionCard
          title="Стандарты единиц измерения"
          subtitle="Метрологические соглашения лабораторного ядра"
        >
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded border border-stone-200/60">
              <span className="text-stone-700 font-medium">Шкала температуры</span>
              <span className="font-mono text-stone-900 font-semibold">Градусы Цельсия (°C)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded border border-stone-200/60">
              <span className="text-stone-700 font-medium">Масса чайного сырья</span>
              <span className="font-mono text-stone-900 font-semibold">Граммы (г)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded border border-stone-200/60">
              <span className="text-stone-700 font-medium">Объём растворителя (воды)</span>
              <span className="font-mono text-stone-900 font-semibold">Миллилитры (мл)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded border border-stone-200/60">
              <span className="text-stone-700 font-medium">Концентрация сухих веществ (TDS)</span>
              <span className="font-mono text-stone-900 font-semibold">Миллиграммы на литр (мг/л)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded border border-stone-200/60">
              <span className="text-stone-700 font-medium">Время экспозиции</span>
              <span className="font-mono text-stone-900 font-semibold">Секунды (с)</span>
            </div>
          </div>
        </SectionCard>

        {/* Системный статус платформы */}
        <SectionCard
          title="Системное состояние среды"
          subtitle="Спецификация модулей и текущий этап разработки"
        >
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <span className="text-stone-500">Версия приложения:</span>
              <span className="font-mono font-medium text-stone-900">0.1.0-alpha (Этап 1)</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <span className="text-stone-500">Математическое ядро:</span>
              <span className="font-mono font-medium text-stone-900">Stage1ExtractionEngine</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <span className="text-stone-500">Статус калибровки формул:</span>
              <span className="font-mono text-amber-800 font-medium">pending_calibration</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <span className="text-stone-500">Пользовательских сортов:</span>
              <span className="font-mono font-medium text-stone-900">{customTeasCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-500">Хранилище данных:</span>
              <span className="font-mono font-medium text-stone-900">Локальный браузер (localStorage)</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Управление локальными данными */}
      <SectionCard
        title="Локальные данные и сброс"
        subtitle="Очистка добавленных пользователем сортов чая"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-stone-600 max-w-lg leading-relaxed">
            При необходимости вы можете очистить локальный список созданных чаёв и вернуть
            лабораторию к исходному эталонному каталогу. Эта операция необратима.
          </p>

          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            {resetSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                <span className="text-emerald-800">Данные сброшены</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сбросить мои чаи ({customTeasCount})</span>
              </>
            )}
          </button>
        </div>
      </SectionCard>
    </div>
  );
};

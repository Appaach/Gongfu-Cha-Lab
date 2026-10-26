/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DataOriginType } from '../domain/tea/types.ts';

interface DataOriginBadgeProps {
  origin: DataOriginType | 'estimated'; // 'estimated' для обратной совместимости
  showDetails?: boolean;
}

/**
 * Чистое текстовое обозначение источника данных без громоздких «капсул-пилюль».
 * Поддерживает правило Zero-Pill Discipline.
 */
export const DataOriginBadge: React.FC<DataOriginBadgeProps> = ({ origin, showDetails = false }) => {
  switch (origin) {
    case 'measured':
      return (
        <span className="text-xs font-mono text-emerald-800 tracking-tight" title="Подтверждено первичным лабораторным измерением с поверенным протоколом">
          [Лаб. измерение]
          {showDetails && <span className="text-stone-500 ml-1 font-sans">· Протокол испытаний</span>}
        </span>
      );
    case 'literature':
      return (
        <span className="text-xs font-mono text-blue-800 tracking-tight" title="Значение из проверяемого литературного / академического источника">
          [Литература]
          {showDetails && <span className="text-stone-500 ml-1 font-sans">· Академ. справочник</span>}
        </span>
      );
    case 'model_profile':
    case 'estimated':
      return (
        <span className="text-xs font-mono text-stone-600 tracking-tight" title="Предварительный типовой профиль модели (демонстрационная оценка)">
          [Профиль модели]
          {showDetails && <span className="text-stone-500 ml-1 font-sans">· Допущение модели</span>}
        </span>
      );
    case 'user_defined':
      return (
        <span className="text-xs font-mono text-amber-800 tracking-tight" title="Значение явно введено пользователем">
          [Пользователь]
          {showDetails && <span className="text-stone-500 ml-1 font-sans">· Ручной ввод</span>}
        </span>
      );
    case 'unknown':
    default:
      return (
        <span className="text-xs font-mono text-stone-400 tracking-tight" title="Данные не определялись (Unknown ≠ 0)">
          [Нет данных]
          {showDetails && <span className="text-stone-400 ml-1 font-sans">· Unknown ≠ 0</span>}
        </span>
      );
  }
};

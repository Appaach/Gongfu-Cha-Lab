/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DataOriginType } from '../domain/tea/types.ts';

interface DataOriginBadgeProps {
  origin: DataOriginType;
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
        <span className="text-xs font-mono text-emerald-800 tracking-tight" title="Подтверждено инструментальным лабораторным анализом">
          [Измерено]
          {showDetails && <span className="text-stone-500 ml-1 font-sans">· Лаб. анализ</span>}
        </span>
      );
    case 'estimated':
      return (
        <span className="text-xs font-mono text-stone-600 tracking-tight" title="Оценка по академическим таблицам культивара">
          [Справочник]
          {showDetails && <span className="text-stone-500 ml-1 font-sans">· Академ. профиль</span>}
        </span>
      );
    case 'user_defined':
      return (
        <span className="text-xs font-mono text-amber-800 tracking-tight" title="Введено пользователем вручную">
          [Пользователь]
          {showDetails && <span className="text-stone-500 ml-1 font-sans">· Ручной ввод</span>}
        </span>
      );
    case 'unknown':
    default:
      return (
        <span className="text-xs font-mono text-stone-400 tracking-tight" title="Данные отсутствуют (модель не подставляет 0)">
          [Нет данных]
          {showDetails && <span className="text-stone-400 ml-1 font-sans">· Unknown ≠ 0</span>}
        </span>
      );
  }
};

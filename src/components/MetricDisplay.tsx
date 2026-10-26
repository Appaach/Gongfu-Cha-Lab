/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ValueWithOrigin, isKnownValue } from '../domain/tea/types.ts';
import { DataOriginBadge } from './DataOriginBadge.tsx';

interface MetricDisplayProps {
  label: string;
  metric: ValueWithOrigin<number>;
  digits?: number;
  description?: string;
}

export const MetricDisplay: React.FC<MetricDisplayProps> = ({
  label,
  metric,
  digits = 1,
  description,
}) => {
  const isKnown = isKnownValue(metric);

  return (
    <div className="p-3.5 bg-stone-50/60 border border-stone-200/80 rounded-md flex flex-col justify-between">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-xs text-stone-600 font-medium tracking-tight">
          {label}
        </span>
        <DataOriginBadge origin={metric.origin} />
      </div>

      <div className="flex items-baseline my-1">
        {isKnown ? (
          <>
            <span className="text-2xl font-mono tabular-nums font-semibold text-stone-900 tracking-tight">
              {metric.value.toFixed(digits)}
            </span>
            <span className="text-xs font-mono text-stone-500 ml-1.5 uppercase">
              {metric.unit}
            </span>
          </>
        ) : (
          <span className="text-sm font-mono text-stone-400 italic">
            Данные не определялись
          </span>
        )}
      </div>

      {(description || metric.sourceNotes) && (
        <p className="text-[11px] text-stone-500 mt-1 line-clamp-2 leading-relaxed">
          {metric.sourceNotes || description}
        </p>
      )}
    </div>
  );
};

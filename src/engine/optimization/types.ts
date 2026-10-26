/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrewingSessionConfig } from '../../domain/brewing/types.ts';
import { TeaSample } from '../../domain/tea/types.ts';

export type TasteTargetProfile = 'sweetness_focused' | 'body_and_richness' | 'energizing_caffeine' | 'balanced_gongfu';

export interface TasteObjective {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly targetYieldMinPercent: number; // Желаемый диапазон общего выхода (например 18-22%)
  readonly targetYieldMaxPercent: number;
  readonly sensoryWeightRatio: {
    readonly theanineWeight: number;    // Вес умами/сладости
    readonly caffeineWeight: number;    // Вес бодрящего эффекта
    readonly polyphenolWeight: number;  // Вес плотности/терпкости
  };
}

export interface IRecipeOptimizer {
  readonly name: string;
  readonly isImplemented: boolean;
  
  optimize(
    tea: TeaSample,
    objective: TasteObjective,
    constraints: Partial<BrewingSessionConfig>
  ): Promise<BrewingSessionConfig | null>;
}

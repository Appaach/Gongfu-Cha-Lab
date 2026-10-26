/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrewingMethodId } from '../../domain/brewing/types.ts';

export interface MethodDynamicsModel {
  readonly methodId: BrewingMethodId;
  readonly calculatesRetainedLiquor: boolean;
  readonly hasContinuousLeafImmersion: boolean;
  readonly description: string;
}

export const METHOD_DYNAMICS_SPECS: Record<BrewingMethodId, MethodDynamicsModel> = {
  gongfu_cha: {
    methodId: 'gongfu_cha',
    calculatesRetainedLiquor: false,
    hasContinuousLeafImmersion: false,
    description: 'Полный дренаж: лист осушается после каждого пролива, удерживая лишь влагу капиллярного набухания матрицы.',
  },
  liu_gen_pao: {
    methodId: 'liu_gen_pao',
    calculatesRetainedLiquor: true,
    hasContinuousLeafImmersion: true,
    description: 'Сохранение корней настоя: фракция раствора остаётся в контакте с листом, разбавляясь последующим доливом.',
  },
  lazy_mug: {
    methodId: 'lazy_mug',
    calculatesRetainedLiquor: true,
    hasContinuousLeafImmersion: true,
    description: 'Открытое настаивание: лист непрерывно находится в растворителе, градиент концентрации выравнивается по объёму кружки.',
  },
};

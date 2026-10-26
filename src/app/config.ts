/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AppConfig {
  readonly appName: string;
  readonly version: string;
  readonly defaultLanguage: 'ru';
  readonly repositoryUrl?: string;
  readonly documentationPath: string;
}

export const APP_CONFIG: AppConfig = {
  appName: 'Gongfu Cha Lab',
  version: '0.1.0-alpha',
  defaultLanguage: 'ru',
  documentationPath: '/docs',
};

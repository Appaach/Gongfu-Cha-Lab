/**
 * Centralized registry for LocalStorage keys and versions.
 */
export const STORAGE_KEYS = {
  SETTINGS: 'gongfu_cha_lab_app_settings_v2',
  SETTINGS_LEGACY_V1: 'gongfu_cha_lab_app_settings_v1',
  FAVORITES_V3: 'gongfu_tea_favorite_entries_v3',
  FAVORITES_LEGACY_V2: 'gongfu_tea_favorite_ids_v2',
  JOURNAL: 'gongfu_cha_journal_entries_v1',
  SAVED_BLENDS: 'gongfu_saved_blends_v1',
} as const;

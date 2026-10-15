import { AppSettings } from '../types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  advancedMode: false,
  showBrewingMethod: false,
  showGoalAndMethod: false,
  useDynamicTemperatures: false,
  showChemicalComposition: false,
  showExtractionChart: false,
};

const STORAGE_KEY = 'gongfu_cha_lab_app_settings_v2';
const LEGACY_STORAGE_KEY = 'gongfu_cha_lab_app_settings_v1';

export function loadAppSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_APP_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APP_SETTINGS };
    const parsed = JSON.parse(raw);

    const showBrewingMethod = Boolean(
      parsed.showBrewingMethod !== undefined
        ? parsed.showBrewingMethod
        : parsed.showBrewingMethodSelector !== undefined
        ? parsed.showBrewingMethodSelector
        : parsed.hideBrewingMethodSelector !== undefined
        ? !parsed.hideBrewingMethodSelector
        : false
    );

    return {
      advancedMode: Boolean(parsed.advancedMode),
      showBrewingMethod,
      showGoalAndMethod: Boolean(parsed.showGoalAndMethod),
      useDynamicTemperatures: Boolean(parsed.useDynamicTemperatures),
      showChemicalComposition: Boolean(parsed.showChemicalComposition),
      showExtractionChart: Boolean(parsed.showExtractionChart),
    };
  } catch (err) {
    console.error('Failed to parse app settings from localStorage:', err);
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function saveAppSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save app settings to localStorage:', err);
  }
}

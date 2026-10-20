import { AppSettings } from '../types';
import { STORAGE_KEYS } from '../config/storageKeys';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  advancedMode: false,
  showBrewingMethod: false,
  showGoalAndMethod: false,
  useDynamicTemperatures: false,
  showChemicalComposition: false,
  showExtractionChart: false,
  customTeasExportFilename: 'my_teas.json',
};

export function loadAppSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_APP_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS) || localStorage.getItem(STORAGE_KEYS.SETTINGS_LEGACY_V1);
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
      customTeasExportFilename: typeof parsed.customTeasExportFilename === 'string' && parsed.customTeasExportFilename.trim()
        ? parsed.customTeasExportFilename.trim()
        : 'my_teas.json',
    };
  } catch (err) {
    console.error('Failed to parse app settings from localStorage:', err);
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function saveAppSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save app settings to localStorage:', err);
  }
}

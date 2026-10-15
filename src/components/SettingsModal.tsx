import React from 'react';
import { X, Sliders, Flame, Sparkles, Thermometer, FlaskConical, TrendingUp, RotateCcw } from 'lucide-react';
import { AppSettings } from '../types';
import { DEFAULT_APP_SETTINGS } from '../utils/appSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  const handleToggle = (key: keyof AppSettings) => {
    onUpdateSettings({
      ...settings,
      [key]: !settings[key],
    });
  };

  const handleToggleAdvancedMode = () => {
    onUpdateSettings({
      ...settings,
      advancedMode: !settings.advancedMode,
    });
  };

  const handleResetDefaults = () => {
    onUpdateSettings({ ...DEFAULT_APP_SETTINGS });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl border border-stone-200 shadow-2xl p-6 text-stone-900 flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-900">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-serif text-stone-900">
                Настройки лаборатории
              </h3>
              <p className="text-xs text-stone-500">
                Управление окнами интерфейса и термическими режимами
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            title="Закрыть настройки"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Master Advanced Mode Card (Light theme, no PRO labels) */}
        <div className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors flex items-start justify-between gap-4 mb-3.5">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-sm text-stone-900">
              <Sparkles className="w-4 h-4 text-amber-700" />
              <span>Расширенный режим</span>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              Физико-химические параметры: кинетические фазы диффузии листа, суммарный выход экстракта (ISO 9768), кофеин и L-теанин, гидромодуль и свойства воды.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.advancedMode}
            onClick={handleToggleAdvancedMode}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-800 ${
              settings.advancedMode ? 'bg-amber-800' : 'bg-stone-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                settings.advancedMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Settings list in the EXACT ORDER of the main workspace */}
        <div className="space-y-3.5">
          {/* 1. Выбор метода заваривания */}
          <div className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-sm text-stone-900">
                <Flame className="w-4 h-4 text-amber-700" />
                <span>Выбор метода заваривания</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Гунфу Ча, Оставление корня (Лю Гэнь), «Ленивый» метод в стакане.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.showBrewingMethod}
              onClick={() => handleToggle('showBrewingMethod')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-800 ${
                settings.showBrewingMethod ? 'bg-amber-800' : 'bg-stone-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  settings.showBrewingMethod ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 2. Метод пролива и цель вкуса */}
          <div className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-sm text-stone-900">
                <Sparkles className="w-4 h-4 text-amber-700" />
                <span>Метод пролива и цель вкуса</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Целевой вкусовой профиль (Баланс, Умами, Метод без горечи и др.).
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.showGoalAndMethod}
              onClick={() => handleToggle('showGoalAndMethod')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-800 ${
                settings.showGoalAndMethod ? 'bg-amber-800' : 'bg-stone-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  settings.showGoalAndMethod ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 3. Динамическая температура воды */}
          <div className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-sm text-stone-900">
                <Thermometer className="w-4 h-4 text-amber-700" />
                <span>Динамическая температура воды</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Автоматический расчёт и настройка температуры для каждого отдельного пролива.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.useDynamicTemperatures}
              onClick={() => handleToggle('useDynamicTemperatures')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-800 ${
                settings.useDynamicTemperatures ? 'bg-amber-800' : 'bg-stone-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  settings.useDynamicTemperatures ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 4. Фракционный состав пиалы */}
          <div className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-sm text-stone-900">
                <FlaskConical className="w-4 h-4 text-amber-700" />
                <span>Фракционный состав пиалы</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                TDS, выход экстракта и биохимический состав (теанин, кофеин, катехины).
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.showChemicalComposition}
              onClick={() => handleToggle('showChemicalComposition')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-800 ${
                settings.showChemicalComposition ? 'bg-amber-800' : 'bg-stone-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  settings.showChemicalComposition ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 5. График динамики экстракции */}
          <div className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-sm text-stone-900">
                <TrendingUp className="w-4 h-4 text-amber-700" />
                <span>График динамики экстракции</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Кинетические кривые диффузии и концентраций по всем проливам.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.showExtractionChart}
              onClick={() => handleToggle('showExtractionChart')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-800 ${
                settings.showExtractionChart ? 'bg-amber-800' : 'bg-stone-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  settings.showExtractionChart ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer info & Reset */}
        <div className="mt-6 pt-4 border-t border-stone-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
            title="Сбросить все настройки"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сброс настроек</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};

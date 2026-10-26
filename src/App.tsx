/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { TopBar, NavTabId } from './components/TopBar.tsx';
import { REFERENCE_TEAS } from './data/referenceTeas.ts';
import { TeaSample } from './domain/tea/types.ts';
import { migrateLegacyCustomTea } from './domain/tea/validation.ts';
import { BrewingSimulatorView } from './features/brewing/BrewingSimulatorView.tsx';
import { TeaCatalogView } from './features/catalog/TeaCatalogView.tsx';
import { CustomTeasView } from './features/custom-teas/CustomTeasView.tsx';
import { ModelReferenceView } from './features/model-reference/ModelReferenceView.tsx';
import { SettingsView } from './features/settings/SettingsView.tsx';

const CUSTOM_TEAS_STORAGE_KEY = 'gongfu_cha_lab_custom_teas';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('simulator');
  const [selectedTeaId, setSelectedTeaId] = useState<string>(REFERENCE_TEAS[0].id);

  // Пользовательские чаи из локального хранилища с безопасной миграцией схемы
  const [customTeas, setCustomTeas] = useState<TeaSample[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_TEAS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => migrateLegacyCustomTea(item));
        }
      }
    } catch {
      // Игнорируем ошибки парсинга при первом запуске
    }
    return [];
  });

  // Сохранение пользовательских чаёв
  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_TEAS_STORAGE_KEY, JSON.stringify(customTeas));
    } catch {
      // Ошибка записи в localStorage
    }
  }, [customTeas]);

  // Объединённый список чаёв (эталонные + пользовательские)
  const allTeas = useMemo(() => {
    return [...REFERENCE_TEAS, ...customTeas];
  }, [customTeas]);

  // Добавление пользовательского чая
  const handleAddCustomTea = (newTea: TeaSample) => {
    setCustomTeas((prev) => [newTea, ...prev]);
    setSelectedTeaId(newTea.id);
    setActiveTab('simulator');
  };

  // Удаление пользовательского чая
  const handleDeleteCustomTea = (teaId: string) => {
    setCustomTeas((prev) => prev.filter((t) => t.id !== teaId));
    if (selectedTeaId === teaId) {
      setSelectedTeaId(REFERENCE_TEAS[0].id);
    }
  };

  // Сброс пользовательских чаёв
  const handleResetCustomTeas = () => {
    setCustomTeas([]);
    setSelectedTeaId(REFERENCE_TEAS[0].id);
    try {
      localStorage.removeItem(CUSTOM_TEAS_STORAGE_KEY);
    } catch {
      // no-op
    }
  };

  // Переход к завариванию выбранного чая
  const handleSelectTeaForBrewing = (teaId: string) => {
    setSelectedTeaId(teaId);
    setActiveTab('simulator');
  };

  // Действие по кнопке в шапке (Zone 3)
  const handleTopBarPrimaryAction = () => {
    if (activeTab !== 'simulator') {
      setActiveTab('simulator');
    } else {
      // В симуляторе плавно скроллим к кнопке запуска или выполняем фокус
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#1E2922]">
      {/* Шапка приложения (Строгий 3-зонный Top Bar Contract) */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onPrimaryAction={handleTopBarPrimaryAction}
        primaryActionLabel={activeTab === 'simulator' ? 'В начало симулятора' : 'Открыть симулятор'}
      />

      {/* Основная рабочая область лаборатории */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'simulator' && (
          <BrewingSimulatorView
            teas={allTeas}
            selectedTeaId={selectedTeaId}
            onSelectTeaId={setSelectedTeaId}
            onNavigateToCatalog={() => setActiveTab('catalog')}
          />
        )}

        {activeTab === 'catalog' && (
          <TeaCatalogView
            teas={allTeas}
            selectedTeaId={selectedTeaId}
            onSelectTeaForBrewing={handleSelectTeaForBrewing}
          />
        )}

        {activeTab === 'custom-teas' && (
          <CustomTeasView
            customTeas={customTeas}
            onAddCustomTea={handleAddCustomTea}
            onDeleteCustomTea={handleDeleteCustomTea}
            onSelectForBrewing={handleSelectTeaForBrewing}
          />
        )}

        {activeTab === 'model-reference' && <ModelReferenceView />}

        {activeTab === 'settings' && (
          <SettingsView
            customTeasCount={customTeas.length}
            onResetCustomTeas={handleResetCustomTeas}
          />
        )}
      </main>

      {/* Спокойный лабораторный подвал */}
      <footer className="border-t border-stone-200 bg-[#FAF9F5] py-6 text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-800">Gongfu Cha Lab</span>
            <span aria-hidden="true">·</span>
            <span>Версия 0.1.0-alpha</span>
            <span aria-hidden="true">·</span>
            <span className="text-stone-400">Этап 1: Архитектурный фундамент</span>
          </div>

          <div className="flex items-center gap-4 text-stone-600">
            <button
              onClick={() => setActiveTab('model-reference')}
              className="hover:text-stone-900 transition-colors cursor-pointer"
            >
              Физико-химическая модель
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className="hover:text-stone-900 transition-colors cursor-pointer"
            >
              Справочник сортов
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className="hover:text-stone-900 transition-colors cursor-pointer"
            >
              Настройки
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

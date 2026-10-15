import React from 'react';
import { Beaker, BookOpen, Scale, Bookmark, Settings } from 'lucide-react';

export type ActiveTab = 'simulator' | 'compare' | 'journal' | 'research';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, onOpenSettings }) => {
  const tabs = [
    { id: 'simulator', label: 'Симулятор', icon: Beaker },
    { id: 'compare', label: 'Сравнение', icon: Scale },
    { id: 'journal', label: 'Дневник', icon: Bookmark },
    { id: 'research', label: 'Научная база', icon: BookOpen },
  ];

  return (
    <header className="border-b border-stone-200 bg-stone-50 relative z-20 w-full shadow-2xs pt-[env(safe-area-inset-top,0px)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 sm:py-3 gap-2.5 sm:gap-3">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center gap-1.5">
                <span className="font-serif font-bold text-stone-900 tracking-tight text-sm sm:text-base lg:text-lg">
                  Gongfu Cha Lab
                </span>
              </div>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="sm:hidden p-1.5 rounded-lg border border-stone-200 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer active:scale-95"
                  title="Настройки лаборатории"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Настройки</span>
                </button>
              )}
            </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {/* Unified 2x2 Table Navigation Window */}
            <nav 
              aria-label="Разделы приложения"
              className="grid grid-cols-2 sm:flex sm:flex-row gap-1 rounded-xl bg-stone-100 p-1 border border-stone-200 print:hidden shrink-0 shadow-2xs flex-1 sm:flex-none"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    type="button"
                    onClick={() => setActiveTab(tab.id as ActiveTab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 select-none ${
                      isActive
                        ? 'bg-amber-800 text-white shadow-xs font-bold'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/70'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-all cursor-pointer shrink-0 shadow-2xs hover:text-stone-900 active:scale-95"
                title="Настройки лаборатории"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Настройки</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

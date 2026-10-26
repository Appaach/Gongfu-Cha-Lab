/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Menu, X, Play } from 'lucide-react';

export type NavTabId = 'simulator' | 'catalog' | 'custom-teas' | 'model-reference' | 'settings';

interface TopBarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  onPrimaryAction: () => void;
  primaryActionLabel?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onPrimaryAction,
  primaryActionLabel = 'Запустить расчёт',
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ id: NavTabId; label: string }> = [
    { id: 'simulator', label: 'Симулятор' },
    { id: 'catalog', label: 'Каталог чаёв' },
    { id: 'custom-teas', label: 'Мои чаи' },
    { id: 'model-reference', label: 'Научная модель' },
    { id: 'settings', label: 'Настройки' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#FAF9F5]/95 backdrop-blur-sm border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Зона 1: Однострочный текстовый бренд */}
          <button
            onClick={() => onSelectTab('simulator')}
            className="text-left cursor-pointer group whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 rounded"
          >
            <span className="text-lg font-bold tracking-tight text-stone-900 group-hover:text-emerald-900 transition-colors">
              Gongfu Cha Lab
            </span>
          </button>

          {/* Зона 2: Навигационные ссылки (десктоп) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-600">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors relative py-1 text-sm ${
                    isActive
                      ? 'text-emerald-900 font-semibold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-800 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Зона 3: Одно целевое действие + мобильный переключатель */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onPrimaryAction}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#224233] hover:bg-[#1A3327] active:bg-[#14281E] rounded-md shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{primaryActionLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-stone-600 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 rounded-md"
              aria-label="Открыть меню навигации"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Мобильная навигация */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-stone-200 space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`block w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-stone-100 text-emerald-900 font-semibold'
                      : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { X, Download, FileText } from 'lucide-react';

export interface FilenamePromptModalProps {
  isOpen: boolean;
  defaultFilename: string;
  title?: string;
  description?: string;
  onConfirm: (filename: string) => void;
  onClose: () => void;
}

export const FilenamePromptModal: React.FC<FilenamePromptModalProps> = ({
  isOpen,
  defaultFilename,
  title = 'Имя файла для экспорта',
  description = 'Укажите желаемое имя файла для сохранения на вашем устройстве',
  onConfirm,
  onClose,
}) => {
  const [filename, setFilename] = useState(defaultFilename);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFilename(defaultFilename);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const dotIdx = defaultFilename.lastIndexOf('.');
          if (dotIdx > 0) {
            inputRef.current.setSelectionRange(0, dotIdx);
          } else {
            inputRef.current.select();
          }
        }
      }, 50);
    }
  }, [isOpen, defaultFilename]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let clean = filename.trim();
    if (!clean) {
      clean = defaultFilename;
    }
    // If defaultFilename had an extension, ensure clean has it
    const defaultExtMatch = defaultFilename.match(/\.[0-9a-z]+$/i);
    if (defaultExtMatch && !clean.toLowerCase().endsWith(defaultExtMatch[0].toLowerCase())) {
      clean += defaultExtMatch[0];
    }
    onConfirm(clean);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-3xl border border-stone-200 shadow-2xl p-6 text-stone-900 flex flex-col space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-900">
              <Download className="w-5 h-5 text-amber-800" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 leading-tight">
                {title}
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-700" />
              <span>Название файла:</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-stone-300 font-mono text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-800 focus:border-amber-800 bg-stone-50/50"
              placeholder={defaultFilename}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-800 hover:bg-amber-900 text-white shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

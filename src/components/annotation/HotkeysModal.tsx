'use client';

import React from 'react';
import { X, Keyboard, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HotkeysModal: React.FC<HotkeysModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const hotkeysList = [
    { key: 'K (или кнопка Play)', desc: 'Воспроизведение / Пауза полного видео от маятника' },
    { key: 'Space', desc: 'Зацикленный Loop активного интервала жеста' },
    { key: '[ (или Х)', desc: 'Приклеить левую границу (начало) интервала к маятнику' },
    { key: '] (или Ъ)', desc: 'Приклеить правую границу (конец) интервала к маятнику' },
    { key: 'A / D', desc: 'Шаг на -1 / +1 кадр (микроподгонка границы)' },
    { key: 'Shift + A / D', desc: 'Шаг на -10 / +10 кадров (быстрая перемотка)' },
    { key: '1', desc: 'Присвоить активному интервалу класс "Normal" (Обычное)', highlight: 'normal' },
    { key: '2', desc: 'Присвоить активному интервалу класс "Shoplifting" (Кража)', highlight: 'shoplifting' },
    { key: 'Клик по треку', desc: 'Добавить / удалить ID трека в интервале Shoplifting', highlight: 'shoplifting' },
    { key: 'Delete / Backspace', desc: 'Удалить активный интервал' },
    { key: 'W (или Ctrl + →)', desc: 'Сохранить и перейти к следующему видео' },
    { key: 'Q (или Ctrl + ←)', desc: 'Перейти к предыдущему видео' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-slate-100 font-bold text-sm">
            <Keyboard className="w-4 h-4 text-blue-400" />
            <span>Горячие клавиши (Hotkeys)</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-400">
            Для максимальной скорости разметки датасета все ключевые действия доступны без мыши:
          </p>

          <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden text-xs">
            {hotkeysList.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3">
                <div className="flex items-center space-x-2 text-slate-300">
                  {item.highlight === 'normal' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                  {item.highlight === 'shoplifting' && <ShieldAlert className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                  <span>{item.desc}</span>
                </div>
                <kbd className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] font-mono text-blue-300 font-bold shadow-sm whitespace-nowrap ml-3">
                  {item.key}
                </kbd>
              </div>
            ))}
          </div>

          <div className="pt-2 text-[11px] text-slate-500 italic">
            Совет: Двойной клик по таймлайну создает новый интервал дефолтной длины (3.0 сек).
          </div>
        </div>

        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
};

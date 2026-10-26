'use client';

import React from 'react';
import { Video, Cpu, Tag, HelpCircle, HardDrive } from 'lucide-react';

interface HeaderProps {
  activeTab: 'preprocessing' | 'annotation';
  onTabChange: (tab: 'preprocessing' | 'annotation') => void;
  onOpenHotkeysModal: () => void;
  activeVideoName?: string;
  datasetFolder?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onOpenHotkeysModal,
  activeVideoName,
  datasetFolder,
}) => {
  return (
    <header className="h-14 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 flex items-center justify-between select-none z-30 sticky top-0">
      {/* Brand & Title */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
          <Video className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm tracking-wide text-slate-100">VideoMAE Studio</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
              CCTV 16-Frame
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-lg">
        <button
          onClick={() => onTabChange('preprocessing')}
          className={`flex items-center space-x-2 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'preprocessing'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Вкладка 1: Предобработка</span>
        </button>

        <button
          onClick={() => onTabChange('annotation')}
          className={`flex items-center space-x-2 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'annotation'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Вкладка 2: Студия разметки</span>
        </button>
      </div>

      {/* Right side info & hotkeys button */}
      <div className="flex items-center space-x-3">
        {datasetFolder && (
          <div className="hidden lg:flex items-center space-x-1.5 text-xs text-slate-400 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            <span className="max-w-[200px] truncate" title={datasetFolder}>
              {datasetFolder}
            </span>
          </div>
        )}

        {activeVideoName && (
          <div className="hidden md:flex items-center text-xs font-mono px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-blue-400">
            {activeVideoName}
          </div>
        )}

        <button
          onClick={onOpenHotkeysModal}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs transition"
          title="Горячие клавиши (Hotkeys)"
        >
          <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">Хоткеи</span>
        </button>
      </div>
    </header>
  );
};

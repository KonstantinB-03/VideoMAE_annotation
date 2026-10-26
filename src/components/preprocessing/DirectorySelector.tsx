'use client';

import React from 'react';
import { Folder, FolderInput, FolderOutput, AlertCircle } from 'lucide-react';

interface DirectorySelectorProps {
  inputFolder: string;
  outputFolder: string;
  onInputChange: (val: string) => void;
  onOutputChange: (val: string) => void;
  disabled?: boolean;
}

export const DirectorySelector: React.FC<DirectorySelectorProps> = ({
  inputFolder,
  outputFolder,
  onInputChange,
  onOutputChange,
  disabled = false,
}) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
        <Folder className="w-4 h-4 text-blue-400" />
        <h2 className="text-sm font-semibold text-slate-100">Выбор директорий (I/O Paths)</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Input folder */}
        <div className="space-y-1.5">
          <label className="flex items-center space-x-1.5 text-xs font-medium text-slate-300">
            <FolderInput className="w-3.5 h-3.5 text-blue-400" />
            <span>Папка с исходными видео (Input Folder)</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={inputFolder}
              onChange={(e) => onInputChange(e.target.value)}
              disabled={disabled}
              placeholder="D:\CCTV_raw_records"
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none transition disabled:opacity-50"
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Поддерживаются форматы: .mp4, .avi, .mkv, .mov, .ts, .webm
          </p>
        </div>

        {/* Output folder */}
        <div className="space-y-1.5">
          <label className="flex items-center space-x-1.5 text-xs font-medium text-slate-300">
            <FolderOutput className="w-3.5 h-3.5 text-emerald-400" />
            <span>Выходная папка датасета (Output Folder)</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={outputFolder}
              onChange={(e) => onOutputChange(e.target.value)}
              disabled={disabled}
              placeholder="D:\ShopGuard_Dataset\frames"
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none transition disabled:opacity-50"
            />
          </div>
          <p className="text-[11px] text-amber-500/90 flex items-center space-x-1">
            <AlertCircle className="w-3 h-3 inline-block flex-shrink-0" />
            <span>Строго вне папки public! Кадры сохраняются в подпапки по именам видео.</span>
          </p>
        </div>
      </div>
    </div>
  );
};

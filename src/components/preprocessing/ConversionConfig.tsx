'use client';

import React from 'react';
import { Sliders, Image as ImageIcon, Sparkles, RefreshCw } from 'lucide-react';

interface ConversionConfigProps {
  maxRes: string;
  format: 'jpeg' | 'webp';
  overwrite: boolean;
  onMaxResChange: (val: string) => void;
  onFormatChange: (val: 'jpeg' | 'webp') => void;
  onOverwriteChange: (val: boolean) => void;
  disabled?: boolean;
}

export const ConversionConfig: React.FC<ConversionConfigProps> = ({
  maxRes,
  format,
  overwrite,
  onMaxResChange,
  onFormatChange,
  onOverwriteChange,
  disabled = false,
}) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
        <Sliders className="w-4 h-4 text-blue-400" />
        <h2 className="text-sm font-semibold text-slate-100">Параметры конвертации (Conversion Cap & Format)</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Max resolution cap */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 block">
            Max Resolution Cap
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: '720', label: '720p', desc: 'max 1280px' },
              { id: '1080', label: '1080p', desc: 'max 1920px' },
              { id: 'original', label: 'Original', desc: 'без ресайза' },
            ].map((preset) => {
              const active = maxRes === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onMaxResChange(preset.id)}
                  className={`flex flex-col items-center justify-center py-2 px-2.5 rounded-lg border text-xs transition ${
                    active
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-semibold shadow-sm shadow-blue-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  } disabled:opacity-50`}
                >
                  <span>{preset.label}</span>
                  <span className="text-[10px] text-slate-500 font-normal">{preset.desc}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            Даунскейлит кадры выше лимита с сохранением пропорций (aspect ratio).
          </p>
        </div>

        {/* Frame format */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 block">
            Формат кадров
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'jpeg' as const, label: 'JPEG', quality: 'Качество 90' },
              { id: 'webp' as const, label: 'WebP', quality: 'Качество 85' },
            ].map((fmt) => {
              const active = format === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onFormatChange(fmt.id)}
                  className={`flex flex-col items-center justify-center py-2 px-3 rounded-lg border text-xs transition ${
                    active
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-semibold shadow-sm shadow-emerald-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  } disabled:opacity-50`}
                >
                  <span className="flex items-center space-x-1">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{fmt.label}</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">{fmt.quality}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            WebP обеспечивает меньший размер, JPEG быстрее декодируется в браузере.
          </p>
        </div>

        {/* Overwrite option */}
        <div className="space-y-2 flex flex-col justify-between">
          <label className="text-xs font-medium text-slate-300 block">
            Политика извлечения
          </label>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <label className="flex items-start space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => onOverwriteChange(e.target.checked)}
                disabled={disabled}
                className="mt-0.5 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0"
              />
              <div className="text-xs">
                <span className="font-medium text-slate-200 flex items-center space-x-1">
                  <RefreshCw className="w-3 h-3 text-slate-400" />
                  <span>Перезаписывать существующие кадры</span>
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Если выключено, ранее извлеченные файлы пропускаются для ускорения.
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

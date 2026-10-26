'use client';

import React, { useState } from 'react';
import { IntervalAnnotation, LabelType, DetectionTrack } from '@/types';
import { formatSeconds, formatMilliseconds } from '@/lib/formatters';
import { ShieldAlert, CheckCircle2, Trash2, Repeat, Layers, Crosshair, Plus, X } from 'lucide-react';

interface AnnotationInspectorProps {
  annotations: IntervalAnnotation[];
  activeAnnotationId: string | null;
  currentFrameIndex: number;
  isLooping: boolean;
  onSelectAnnotation: (id: string | null) => void;
  onSetLabel: (id: string, label: LabelType) => void;
  onDeleteAnnotation: (id: string) => void;
  onToggleLoop: () => void;
  onSeek: (frameIndex: number) => void;
  onSnapStartToPlayhead?: (id: string) => void;
  onSnapEndToPlayhead?: (id: string) => void;
  currentFrameTracks?: DetectionTrack[];
  onAddTrackId?: (trackId: number) => void;
  onRemoveTrackId?: (trackId: number) => void;
  onToggleTrackId?: (trackId: number) => void;
  hasTracksData?: boolean;
}

export const AnnotationInspector: React.FC<AnnotationInspectorProps> = ({
  annotations,
  activeAnnotationId,
  currentFrameIndex,
  isLooping,
  onSelectAnnotation,
  onSetLabel,
  onDeleteAnnotation,
  onToggleLoop,
  onSeek,
  onSnapStartToPlayhead,
  onSnapEndToPlayhead,
  currentFrameTracks = [],
  onAddTrackId,
  onRemoveTrackId,
  onToggleTrackId,
  hasTracksData = false,
}) => {
  const activeAnn = annotations.find((a) => a.id === activeAnnotationId) || null;
  const [manualTrackInput, setManualTrackInput] = useState('');

  const handleManualAddTrack = () => {
    if (!manualTrackInput.trim() || !onAddTrackId) return;

    // Support comma or whitespace separated values e.g. "1, 2, 5" or "1 3"
    const parts = manualTrackInput.split(/[\s,]+/).filter(Boolean);
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 0) {
        onAddTrackId(num);
      }
    }
    setManualTrackInput('');
  };

  return (
    <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full select-none flex-shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-semibold text-slate-200">Интервалы разметки</h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
          {annotations.length} жестов
        </span>
      </div>

      {/* Active Interval Controls Card */}
      {activeAnn ? (
        <div className="p-3 border-b border-slate-800 space-y-3 bg-slate-950/60 overflow-y-auto max-h-[55%]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Выбранный интервал</span>
            <span className="text-xs font-mono font-bold text-blue-400">
              {formatSeconds(activeAnn.duration_sec)}
            </span>
          </div>

          {/* Classification Action Buttons (Hotkeys 1 and 2) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSetLabel(activeAnn.id, 'normal')}
              className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg border text-xs font-semibold transition ${
                activeAnn.label === 'normal'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-emerald-500 hover:text-emerald-400'
              }`}
              title="Горячая клавиша: 1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Normal [1]</span>
            </button>

            <button
              onClick={() => onSetLabel(activeAnn.id, 'shoplifting')}
              className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg border text-xs font-semibold transition ${
                activeAnn.label === 'shoplifting'
                  ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-500/20'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-red-500 hover:text-red-400'
              }`}
              title="Горячая клавиша: 2"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Shoplifting [2]</span>
            </button>
          </div>

          {/* Shoplifting Track IDs Editor */}
          {activeAnn.label === 'shoplifting' && (
            <div className="bg-slate-900 border border-red-900/60 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-xs font-semibold text-red-300">
                  <Crosshair className="w-3.5 h-3.5 text-red-400" />
                  <span>ID треков преступников</span>
                </div>
                <span className="text-[10px] font-mono text-red-400 bg-red-950 px-1.5 py-0.5 rounded border border-red-800 font-bold">
                  {(activeAnn.track_ids || []).length} треков
                </span>
              </div>

              {/* Assigned Track Badges */}
              <div className="flex flex-wrap gap-1.5 min-h-[26px] items-center">
                {activeAnn.track_ids && activeAnn.track_ids.length > 0 ? (
                  activeAnn.track_ids.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-red-950 text-red-200 border border-red-500/70 text-xs font-mono font-bold shadow-sm"
                    >
                      <span>Трек #{id}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveTrackId && onRemoveTrackId(id)}
                        className="text-red-400 hover:text-white ml-0.5 hover:bg-red-800 rounded p-0.5 transition"
                        title={`Удалить трек #${id} из интервала`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-400 italic">
                    Треки не выбраны. Кликните по треку на видео или введите ID:
                  </span>
                )}
              </div>

              {/* Manual Input Field */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleManualAddTrack();
                }}
                className="flex items-center space-x-1.5 pt-1"
              >
                <input
                  type="text"
                  value={manualTrackInput}
                  onChange={(e) => setManualTrackInput(e.target.value)}
                  placeholder="ID трека (напр. 1 или 1, 3)"
                  className="flex-1 bg-slate-950 border border-slate-700 focus:border-red-500 rounded px-2 py-1 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none transition"
                />
                <button
                  type="submit"
                  disabled={!manualTrackInput.trim()}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white rounded text-xs font-semibold flex items-center space-x-1 transition shadow-sm"
                >
                  <Plus className="w-3 h-3" />
                  <span>Добавить</span>
                </button>
              </form>

              {/* Quick-add buttons from current frame detections */}
              {currentFrameTracks.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                    <span>На кадре {currentFrameIndex + 1} ({currentFrameTracks.length} трека):</span>
                    <span className="text-slate-500">быстрый клик</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {currentFrameTracks.map((t) => {
                      const isAssigned = (activeAnn.track_ids || []).includes(t.track_id);
                      return (
                        <button
                          key={t.track_id}
                          type="button"
                          onClick={() => {
                            if (onToggleTrackId) {
                              onToggleTrackId(t.track_id);
                            } else if (isAssigned) {
                              onRemoveTrackId?.(t.track_id);
                            } else {
                              onAddTrackId?.(t.track_id);
                            }
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition flex items-center space-x-1 border ${
                            isAssigned
                              ? 'bg-red-600 text-white border-red-500 shadow-sm'
                              : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-slate-700'
                          }`}
                          title={isAssigned ? 'Удалить трек из кражи' : 'Добавить трек в кражу'}
                        >
                          <span>{isAssigned ? '✓' : '+'} #{t.track_id}</span>
                          {t.confidence ? (
                            <span className="opacity-70 text-[9px]">({Math.round(t.confidence * 100)}%)</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loop Range Button (Hotkey: Space) */}
          <button
            onClick={onToggleLoop}
            className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg border text-xs font-medium transition ${
              isLooping
                ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/30'
                : 'bg-slate-900 text-slate-200 border-slate-800 hover:bg-slate-800'
            }`}
            title="Горячая клавиша: Пробел (Space)"
          >
            <Repeat className={`w-3.5 h-3.5 ${isLooping ? 'animate-spin' : ''}`} />
            <span>{isLooping ? 'Остановить Loop [Space]' : 'Зациклить жест [Space]'}</span>
          </button>

          {/* Snap To Playhead Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSnapStartToPlayhead && onSnapStartToPlayhead(activeAnn.id)}
              className="flex items-center justify-center space-x-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-blue-300 border border-slate-700 hover:border-blue-500 rounded text-[11px] font-mono transition"
              title="Примагнитить начало интервала к текущему кадру маятника (Клавиша [)"
            >
              <span>[ Начало к кадру {currentFrameIndex + 1}</span>
            </button>

            <button
              onClick={() => onSnapEndToPlayhead && onSnapEndToPlayhead(activeAnn.id)}
              className="flex items-center justify-center space-x-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-blue-300 border border-slate-700 hover:border-blue-500 rounded text-[11px] font-mono transition"
              title="Примагнитить конец интервала к текущему кадру маятника (Клавиша ])"
            >
              <span>Конец к кадру {currentFrameIndex + 1} ]</span>
            </button>
          </div>

          {/* Details breakdown */}
          <div className="bg-slate-900 rounded p-2.5 space-y-1.5 text-[11px] font-mono text-slate-300 border border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-500">Кадры:</span>
              <span>{activeAnn.start_frame} → {activeAnn.end_frame} ({activeAnn.end_frame - activeAnn.start_frame + 1} кадров)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Таймкод:</span>
              <span>{formatMilliseconds(activeAnn.start_ms)} → {formatMilliseconds(activeAnn.end_ms)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Длительность:</span>
              <span className={activeAnn.duration_sec >= 2.0 && activeAnn.duration_sec <= 5.0 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {formatSeconds(activeAnn.duration_sec)} (норма 2.0-5.0с)
              </span>
            </div>
          </div>

          {/* Delete Button */}
          <button
            onClick={() => onDeleteAnnotation(activeAnn.id)}
            className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded text-xs text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/60 transition"
            title="Горячая клавиша: Delete / Backspace"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Удалить интервал [Del]</span>
          </button>
        </div>
      ) : (
        <div className="p-4 text-center text-xs text-slate-500 italic border-b border-slate-800">
          Кликните по таймлайну или плашке для выбора жеста
        </div>
      )}

      {/* Interval list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {annotations.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-600">
            Нет интервалов на этом видео. Нажмите «+ Создать плашку» или дважды кликните по таймлайну.
          </div>
        ) : (
          annotations.map((ann, idx) => {
            const isSelected = ann.id === activeAnnotationId;
            return (
              <div
                key={ann.id}
                onClick={() => {
                  onSelectAnnotation(ann.id);
                  onSeek(ann.start_frame);
                }}
                className={`p-2.5 rounded-lg cursor-pointer border transition text-xs ${
                  isSelected
                    ? 'bg-slate-800/90 border-blue-500/80 shadow-md'
                    : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-slate-500 font-bold">#{idx + 1}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        ann.label === 'shoplifting'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                          : ann.label === 'normal'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {ann.label}
                    </span>
                    {ann.label === 'shoplifting' && ann.track_ids && ann.track_ids.length > 0 && (
                      <span className="text-[10px] font-mono text-red-300 bg-red-950/80 border border-red-600/50 px-1 rounded font-bold">
                        ID:{ann.track_ids.join(',')}
                      </span>
                    )}
                  </div>

                  <span className="font-mono font-semibold text-slate-300">
                    {formatSeconds(ann.duration_sec)}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-1 text-[11px] font-mono text-slate-500">
                  <span>{ann.start_frame} → {ann.end_frame}</span>
                  <span>{formatMilliseconds(ann.start_ms)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

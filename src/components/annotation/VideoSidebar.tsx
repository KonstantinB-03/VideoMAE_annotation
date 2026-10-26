'use client';

import React, { useState } from 'react';
import { VideoItem } from '@/types';
import { Folder, Film, CheckCircle2, ChevronLeft, ChevronRight, Search, RefreshCw, AlertCircle } from 'lucide-react';

interface VideoSidebarProps {
  datasetFolder: string;
  videos: VideoItem[];
  activeVideoId: string | null;
  onSelectVideo: (videoId: string) => void;
  onDatasetFolderChange: (folder: string) => void;
  onRefreshDataset: (overrideFolder?: string) => void;
  onPrevVideo: () => void;
  onNextVideo: () => void;
  isLoading: boolean;
}

export const VideoSidebar: React.FC<VideoSidebarProps> = ({
  datasetFolder,
  videos,
  activeVideoId,
  onSelectVideo,
  onDatasetFolderChange,
  onRefreshDataset,
  onPrevVideo,
  onNextVideo,
  isLoading,
}) => {
  const [inputPath, setInputPath] = useState(datasetFolder);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'annotated' | 'pending'>('all');

  // Sync if prop changes externally
  React.useEffect(() => {
    setInputPath(datasetFolder);
  }, [datasetFolder]);

  const handleApplyPath = () => {
    const trimmed = inputPath.trim();
    if (trimmed) {
      onDatasetFolderChange(trimmed);
      onRefreshDataset(trimmed);
    }
  };

  const filteredVideos = videos.filter((v) => {
    const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filterMode === 'annotated') return v.isAnnotated;
    if (filterMode === 'pending') return !v.isAnnotated;
    return true;
  });

  const currentIndex = videos.findIndex((v) => v.id === activeVideoId);
  const totalAnnotated = videos.filter((v) => v.isAnnotated).length;

  return (
    <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col h-full select-none flex-shrink-0">
      {/* Folder Picker Header */}
      <div className="p-3 border-b border-slate-800 space-y-2">
        <label className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <span className="flex items-center space-x-1.5">
            <Folder className="w-3.5 h-3.5 text-blue-400" />
            <span>Папка датасета</span>
          </span>
          <button
            onClick={handleApplyPath}
            disabled={isLoading}
            className="flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 transition disabled:opacity-50"
            title="Перезагрузить датасет из указанной папки"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </label>

        <div className="flex items-center space-x-1.5">
          <input
            type="text"
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApplyPath()}
            placeholder="D:\ShopGuard_Dataset\frames"
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none transition"
          />
        </div>

        {/* Global Progress Tag */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
          <span>Прогресс датасета:</span>
          <span className="font-mono text-slate-200 font-semibold">
            {totalAnnotated} / {videos.length} видео
          </span>
        </div>
      </div>

      {/* Navigation Buttons (Q / W) */}
      <div className="p-2 border-b border-slate-800 bg-slate-950/60 flex items-center space-x-2">
        <button
          onClick={onPrevVideo}
          disabled={currentIndex <= 0}
          className="flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-xs text-slate-200 font-medium transition"
          title="Предыдущее видео (Q)"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Пред. (Q)</span>
        </button>

        <button
          onClick={onNextVideo}
          disabled={currentIndex < 0 || currentIndex >= videos.length - 1}
          className="flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 rounded bg-blue-600/80 hover:bg-blue-600 disabled:opacity-40 disabled:hover:bg-blue-600/80 text-xs text-white font-medium transition"
          title="Следующее видео (W)"
        >
          <span>След. (W)</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search & Filters */}
      <div className="p-2 border-b border-slate-800 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени видео..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
          />
        </div>

        <div className="flex rounded p-0.5 bg-slate-950 border border-slate-800 text-[11px]">
          {(['all', 'pending', 'annotated'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`flex-1 py-1 text-center rounded transition ${
                filterMode === mode
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode === 'all' ? 'Все' : mode === 'pending' ? 'Без меток' : 'Размечено'}
            </button>
          ))}
        </div>
      </div>

      {/* Video List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-1">
        {filteredVideos.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 space-y-2">
            <Film className="w-6 h-6 mx-auto opacity-40" />
            <p>Видео не найдены</p>
          </div>
        ) : (
          filteredVideos.map((video) => {
            const isSelected = video.id === activeVideoId;
            return (
              <div
                key={video.id}
                onClick={() => onSelectVideo(video.id)}
                className={`p-2.5 rounded-lg cursor-pointer transition ${
                  isSelected
                    ? 'bg-blue-600/20 border border-blue-500/50 shadow-sm'
                    : 'hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="font-mono text-xs font-semibold text-slate-200 truncate pr-2 max-w-[160px]" title={video.name}>
                    {video.name}
                  </div>
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    {video.hasTracks && (
                      <span className="text-[9px] font-mono font-bold text-cyan-300 bg-cyan-950/90 border border-cyan-700/70 px-1 py-0.5 rounded" title="Видео содержит файл с треками детекций">
                        AI Треки
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      {video.total_frames} к.
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-slate-500 font-mono">
                    {(video.duration_ms / 1000).toFixed(1)} сек @ {video.fps} FPS
                  </span>

                  {video.isAnnotated ? (
                    <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{video.annotationCount} инт.</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">
                      Не размечено
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

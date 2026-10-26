'use client';

import React, { useState, useRef } from 'react';
import { DirectorySelector } from './DirectorySelector';
import { ConversionConfig } from './ConversionConfig';
import { TerminalLog } from './TerminalLog';
import { Play, Square, ArrowRight, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';
import { ExtractionWorkerProgress } from '@/types';

interface PreprocessingTabProps {
  inputFolder: string;
  outputFolder: string;
  onInputFolderChange: (val: string) => void;
  onOutputFolderChange: (val: string) => void;
  onGoToAnnotation: () => void;
}

export const PreprocessingTab: React.FC<PreprocessingTabProps> = ({
  inputFolder,
  outputFolder,
  onInputFolderChange,
  onOutputFolderChange,
  onGoToAnnotation,
}) => {
  const [maxRes, setMaxRes] = useState<string>('720');
  const [format, setFormat] = useState<'jpeg' | 'webp'>('jpeg');
  const [overwrite, setOverwrite] = useState<boolean>(false);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState<ExtractionWorkerProgress | null>(null);
  const [batchStats, setBatchStats] = useState<{
    totalVideos: number;
    currentVideoIndex: number;
    currentVideoName: string;
    completedVideos: number;
  }>({
    totalVideos: 0,
    currentVideoIndex: 0,
    currentVideoName: '',
    completedVideos: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = (line: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${line}`]);
  };

  const handleStartExtraction = async () => {
    if (!inputFolder.trim() || !outputFolder.trim()) {
      alert('Пожалуйста, укажите папку с исходными видео и выходную папку.');
      return;
    }

    setIsRunning(true);
    setProgress(null);
    setBatchStats({
      totalVideos: 0,
      currentVideoIndex: 0,
      currentVideoName: '',
      completedVideos: 0,
    });
    addLog(`Запуск распаковки кадров: ${inputFolder} -> ${outputFolder}`);
    addLog(`Параметры: MaxRes=${maxRes}, Format=${format.toUpperCase()}, Overwrite=${overwrite}`);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputFolder,
          outputFolder,
          maxRes,
          format,
          overwrite,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported by browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const lines = event.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const rawData = line.slice(6).trim();
              if (!rawData) continue;
              try {
                const msg: ExtractionWorkerProgress = JSON.parse(rawData);

                if (msg.status === 'batch_started') {
                  setBatchStats((s) => ({
                    ...s,
                    totalVideos: msg.total_videos || 0,
                  }));
                  addLog(`Найдено видеофайлов: ${msg.total_videos}. Начало пакетной обработки.`);
                } else if (msg.status === 'video_started') {
                  setBatchStats((s) => ({
                    ...s,
                    currentVideoIndex: msg.video_index || s.currentVideoIndex,
                    currentVideoName: msg.video || '',
                  }));
                  addLog(`[${msg.video_index}/${msg.total_videos}] Открытие ${msg.video}...`);
                } else if (msg.status === 'video_info') {
                  addLog(
                    `${msg.video}: ${msg.total_frames} кадров, ${msg.fps} FPS, размер: ${msg.original_res?.join('x')} -> ${msg.target_res?.join('x')}`
                  );
                } else if (msg.status === 'progress') {
                  setProgress(msg);
                } else if (msg.status === 'video_completed') {
                  setBatchStats((s) => ({
                    ...s,
                    completedVideos: s.completedVideos + 1,
                  }));
                  addLog(`Готово: ${msg.video} (${msg.total_frames} кадров успешно извлечено).`);
                } else if (msg.status === 'batch_completed') {
                  addLog(`Пакетная обработка завершена! Успешно: ${msg.successful}, ошибок: ${msg.failed}.`);
                } else if (msg.status === 'error' || msg.status === 'fatal_error') {
                  addLog(`ОШИБКА: ${msg.message || msg.error}`);
                } else if (msg.message) {
                  addLog(msg.message);
                }
              } catch {
                addLog(rawData);
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        addLog('Процесс остановлен пользователем.');
      } else {
        addLog(`Сбой выполнения: ${err.message}`);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopExtraction = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    try {
      await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
    } catch {
      // ignore
    }
    setIsRunning(false);
    addLog('Запрос на отмену отправлен воркеру.');
  };

  const batchPercent =
    batchStats.totalVideos > 0
      ? Math.round((batchStats.completedVideos / batchStats.totalVideos) * 100)
      : 0;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Introduction Card */}
      <div className="bg-gradient-to-r from-blue-900/20 via-slate-900 to-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <span>Пакетная предобработка CCTV видеопотока</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Автономный декодер на базе <strong className="text-blue-400 font-semibold">Decord</strong> устраняет артефакты VFR и битые таймкоды CCTV, сохраняя физические PTS миллисекунды кадров в формате <code className="text-blue-300">frame_000142_ms00005680.jpg</code>.
          </p>
        </div>

        <button
          onClick={onGoToAnnotation}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition flex-shrink-0"
        >
          <span>Перейти к разметке</span>
          <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
        </button>
      </div>

      {/* Directory Selectors */}
      <DirectorySelector
        inputFolder={inputFolder}
        outputFolder={outputFolder}
        onInputChange={onInputFolderChange}
        onOutputChange={onOutputFolderChange}
        disabled={isRunning}
      />

      {/* Conversion Options */}
      <ConversionConfig
        maxRes={maxRes}
        format={format}
        overwrite={overwrite}
        onMaxResChange={setMaxRes}
        onFormatChange={setFormat}
        onOverwriteChange={setOverwrite}
        disabled={isRunning}
      />

      {/* Controls & Progress Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            {!isRunning ? (
              <button
                type="button"
                onClick={handleStartExtraction}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-500/20 transition active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Запустить обработку</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopExtraction}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs shadow-md shadow-red-500/20 transition active:scale-[0.98]"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>Остановить</span>
              </button>
            )}

            {isRunning && (
              <div className="flex items-center space-x-2 text-xs text-blue-400 animate-pulse font-medium">
                <Activity className="w-4 h-4 animate-spin" />
                <span>Воркер работает...</span>
              </div>
            )}
          </div>

          {/* Quick Counter */}
          <div className="text-xs text-slate-400 font-mono">
            {batchStats.totalVideos > 0 ? (
              <span>
                Видео <span className="text-white font-semibold">{batchStats.completedVideos}</span> из{' '}
                <span className="text-white font-semibold">{batchStats.totalVideos}</span>
              </span>
            ) : (
              <span>Готов к запуску</span>
            )}
          </div>
        </div>

        {/* Progress Bars */}
        <div className="space-y-4 pt-2 border-t border-slate-800/80">
          {/* Current Video Progress */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300">
                Текущее видео:{' '}
                <strong className="text-blue-400 font-medium">
                  {batchStats.currentVideoName || (progress?.video ? progress.video : '—')}
                </strong>
              </span>
              <span className="text-slate-400">
                {progress ? `${progress.current_frame || 0} / ${progress.total_frames || 0} кадров (${progress.percent || 0}%)` : '0%'}
              </span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-200"
                style={{ width: `${progress?.percent || 0}%` }}
              />
            </div>
          </div>

          {/* Overall Batch Progress */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300">
                Общий прогресс датасета:{' '}
                <span className="text-slate-400">
                  ({batchStats.completedVideos} из {batchStats.totalVideos || 0} завершено)
                </span>
              </span>
              <span className="text-slate-400">{batchPercent}%</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${batchPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Terminal logs */}
      <TerminalLog logs={logs} onClear={() => setLogs([])} />
    </div>
  );
};

'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FrameInfo, IntervalAnnotation, DetectionTrack, LabelType } from '@/types';
import { formatMilliseconds, formatSeconds } from '@/lib/formatters';
import { FrameCacheManager } from '@/lib/frameCache';
import { Repeat, ShieldAlert, CheckCircle2, Crosshair } from 'lucide-react';

interface CanvasViewportProps {
  videoId?: string;
  videoName: string;
  totalFrames: number;
  currentFrameIndex: number;
  currentFrame?: FrameInfo;
  frameCache: FrameCacheManager;
  activeAnnotation?: IntervalAnnotation | null;
  isLooping: boolean;
  onToggleLoop: () => void;
  tracks?: DetectionTrack[];
  showTracks?: boolean;
  activeTrackIds?: number[];
  onToggleTrack?: (trackId: number) => void;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  videoId,
  videoName,
  totalFrames,
  currentFrameIndex,
  currentFrame,
  frameCache,
  activeAnnotation,
  isLooping,
  onToggleLoop,
  tracks = [],
  showTracks = true,
  activeTrackIds = [],
  onToggleTrack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoadingFrame, setIsLoadingFrame] = useState(false);
  const [hoveredTrackId, setHoveredTrackId] = useState<number | null>(null);

  // Keep reference to currently rendered HTMLImageElement to allow immediate redraws on hover/selection
  const currentImgRef = useRef<HTMLImageElement | null>(null);

  // Draw bounding boxes and tags on top of frame
  const drawTracks = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      trackList: DetectionTrack[],
      selectedIds: number[],
      hoveredId: number | null
    ) => {
      for (const t of trackList) {
        const [x1, y1, x2, y2] = t.bbox;
        const boxW = x2 - x1;
        const boxH = y2 - y1;
        const isSelected = selectedIds.includes(t.track_id);
        const isHovered = hoveredId === t.track_id;

        ctx.save();

        // Box stroke & fill
        if (isSelected) {
          ctx.strokeStyle = '#ef4444'; // Red for shoplifting
          ctx.lineWidth = isHovered ? 4 : 3;
          ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        } else if (isHovered) {
          ctx.strokeStyle = '#f59e0b'; // Amber on hover
          ctx.lineWidth = 3;
          ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        } else {
          ctx.strokeStyle = '#06b6d4'; // Cyan default
          ctx.lineWidth = 2;
          ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
        }

        ctx.fillRect(x1, y1, boxW, boxH);
        ctx.strokeRect(x1, y1, boxW, boxH);

        // Label text & badge
        const tagText = isSelected
          ? `★ ID: ${t.track_id} [Кража]`
          : `ID: ${t.track_id}${t.confidence ? ` (${Math.round(t.confidence * 100)}%)` : ''}`;

        ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        const textMetrics = ctx.measureText(tagText);
        const badgeW = textMetrics.width + 12;
        const badgeH = 22;

        const badgeX = Math.max(0, x1);
        const badgeY = y1 >= badgeH + 4 ? y1 - badgeH - 2 : y1 + 2;

        // Badge background
        if (isSelected) {
          ctx.fillStyle = '#ef4444';
        } else if (isHovered) {
          ctx.fillStyle = '#f59e0b';
        } else {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        }

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        } else {
          ctx.rect(badgeX, badgeY, badgeW, badgeH);
        }
        ctx.fill();

        if (!isSelected && !isHovered) {
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Badge text
        ctx.fillStyle = isSelected ? '#ffffff' : isHovered ? '#0f172a' : '#38bdf8';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, badgeX + 6, badgeY + badgeH / 2);

        ctx.restore();
      }
    },
    []
  );

  // Redraw canvas with image and optional tracks
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = currentImgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (showTracks && tracks.length > 0) {
      drawTracks(ctx, tracks, activeTrackIds, hoveredTrackId);
    }
  }, [showTracks, tracks, activeTrackIds, hoveredTrackId, drawTracks]);

  // Render current frame to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame) return;

    let isSubscribed = true;

    const handleLoadedImage = (img: HTMLImageElement) => {
      if (!isSubscribed) return;
      currentImgRef.current = img;
      redraw();
      setIsLoadingFrame(false);
    };

    const cached = frameCache.get(currentFrameIndex);
    const matchesCurrent =
      cached &&
      cached.complete &&
      cached.naturalWidth > 0 &&
      (cached.src.endsWith(currentFrame.filename) || cached.src === currentFrame.url);

    if (matchesCurrent) {
      handleLoadedImage(cached!);
    } else {
      setIsLoadingFrame(true);
      frameCache
        .load(currentFrameIndex, currentFrame.url)
        .then((img) => {
          if (img) handleLoadedImage(img);
        })
        .catch(() => {
          if (isSubscribed) setIsLoadingFrame(false);
        });
    }

    return () => {
      isSubscribed = false;
    };
  }, [currentFrameIndex, currentFrame, frameCache, videoName, videoId, redraw]);

  // Redraw when tracks, selection, or hover state changes without reloading image
  useEffect(() => {
    if (currentImgRef.current) {
      redraw();
    }
  }, [redraw]);

  // Mouse Move over canvas: calculate bounding box hit
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !tracks || tracks.length === 0 || !showTracks) {
        if (hoveredTrackId !== null) setHoveredTrackId(null);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      const hit = tracks.find((t) => {
        const [x1, y1, x2, y2] = t.bbox;
        const minY = y1 >= 24 ? y1 - 24 : y1;
        return mouseX >= x1 - 6 && mouseX <= x2 + 6 && mouseY >= minY && mouseY <= y2 + 6;
      });

      const nextId = hit ? hit.track_id : null;
      if (nextId !== hoveredTrackId) {
        setHoveredTrackId(nextId);
      }
    },
    [tracks, showTracks, hoveredTrackId]
  );

  // Mouse Leave canvas: reset hover state
  const handleMouseLeave = useCallback(() => {
    if (hoveredTrackId !== null) {
      setHoveredTrackId(null);
    }
  }, [hoveredTrackId]);

  // Click on canvas: toggle track in current active interval
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !tracks || tracks.length === 0 || !showTracks || !onToggleTrack) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      const hit = tracks.find((t) => {
        const [x1, y1, x2, y2] = t.bbox;
        const minY = y1 >= 24 ? y1 - 24 : y1;
        return mouseX >= x1 - 6 && mouseX <= x2 + 6 && mouseY >= minY && mouseY <= y2 + 6;
      });

      if (hit) {
        onToggleTrack(hit.track_id);
      }
    },
    [tracks, showTracks, onToggleTrack]
  );

  const timecodeFormatted = currentFrame ? formatMilliseconds(currentFrame.ms) : '00:00.000';

  return (
    <div
      ref={containerRef}
      className="relative flex-1 bg-black rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center min-h-[380px] max-h-[600px] select-none"
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className={`max-h-full max-w-full object-contain ${
          hoveredTrackId !== null ? 'cursor-pointer' : 'cursor-default'
        }`}
      />

      {/* Loading subtle indicator */}
      {isLoadingFrame && (
        <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-mono text-slate-400 border border-slate-700">
          Загрузка кадра...
        </div>
      )}

      {/* Top Left Overlay: Video Title & Timecode */}
      <div className="absolute top-3 left-3 flex flex-col space-y-1.5 pointer-events-none">
        <div className="flex items-center space-x-2">
          <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800/90 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-200 shadow-md">
            <span className="text-blue-400 font-semibold">{videoName}</span>
          </div>
          <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800/90 px-3 py-1.5 rounded-lg text-xs font-mono text-emerald-400 font-bold shadow-md">
            PTS: {timecodeFormatted}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800/90 px-2.5 py-1 rounded text-[11px] font-mono text-slate-300">
            Кадр: <span className="text-white font-bold">{currentFrameIndex + 1}</span> / {totalFrames}
          </div>
          {currentFrame && (
            <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800/90 px-2.5 py-1 rounded text-[11px] font-mono text-slate-400">
              {currentFrame.filename}
            </div>
          )}
          {tracks.length > 0 && showTracks && (
            <div className="bg-cyan-950/80 backdrop-blur-md border border-cyan-700/80 px-2.5 py-1 rounded text-[11px] font-mono text-cyan-300 flex items-center space-x-1">
              <Crosshair className="w-3 h-3 text-cyan-400" />
              <span>Треков: {tracks.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Top Right Overlay: Active Interval Status */}
      {activeAnnotation && (
        <div className="absolute top-3 right-3 flex items-center space-x-2 pointer-events-none">
          <div
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md border shadow-lg ${
              activeAnnotation.label === 'shoplifting'
                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                : activeAnnotation.label === 'normal'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800/80 text-slate-300 border-slate-700'
            }`}
          >
            {activeAnnotation.label === 'shoplifting' ? (
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            ) : activeAnnotation.label === 'normal' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : null}
            <span className="uppercase tracking-wider">
              {activeAnnotation.label === 'shoplifting'
                ? 'Shoplifting (Кража)'
                : activeAnnotation.label === 'normal'
                ? 'Normal (Обычное)'
                : 'Не назначен'}
            </span>
            <span className="opacity-75 font-mono">({formatSeconds(activeAnnotation.duration_sec)})</span>
            {activeAnnotation.label === 'shoplifting' && activeAnnotation.track_ids && activeAnnotation.track_ids.length > 0 && (
              <span className="bg-red-950 border border-red-500/60 text-red-200 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                ID: {activeAnnotation.track_ids.join(', ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Hover Tooltip over canvas */}
      {hoveredTrackId !== null && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-amber-500/80 text-amber-200 px-3.5 py-1.5 rounded-full text-xs font-mono shadow-2xl pointer-events-none flex items-center space-x-2 animate-in fade-in zoom-in-95">
          <span className="font-bold text-amber-400">Трек #{hoveredTrackId}</span>
          <span className="text-slate-500">·</span>
          <span className="text-[11px] text-white">
            {activeAnnotation?.label === 'shoplifting'
              ? activeTrackIds.includes(hoveredTrackId)
                ? 'Нажмите для удаления из кражи'
                : 'Нажмите для добавления в интервал кражи'
              : 'Выберите интервал кражи (Shoplifting) для привязки'}
          </span>
        </div>
      )}

      {/* Bottom Center / Overlay: Loop Status Pill */}
      {isLooping && (
        <div className="absolute bottom-4 bg-blue-600/90 text-white border border-blue-400/50 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center space-x-1.5 shadow-lg shadow-blue-500/30 animate-pulse">
          <Repeat className="w-3.5 h-3.5" />
          <span>Looping Range Active (Проигрывание жеста)</span>
        </div>
      )}
    </div>
  );
};

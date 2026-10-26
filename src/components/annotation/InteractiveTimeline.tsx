'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { FrameInfo, IntervalAnnotation, LabelType } from '@/types';
import { formatSeconds, generateAnnotationId } from '@/lib/formatters';

interface InteractiveTimelineProps {
  totalFrames: number;
  frames: FrameInfo[];
  currentFrameIndex: number;
  annotations: IntervalAnnotation[];
  activeAnnotationId: string | null;
  onSeek: (frameIndex: number) => void;
  onSelectAnnotation: (id: string | null) => void;
  onUpdateAnnotation: (ann: IntervalAnnotation) => void;
  onAddAnnotation: (ann: IntervalAnnotation) => void;
}

type DragMode = 'scrub' | 'move' | 'resize-left' | 'resize-right' | null;

export const InteractiveTimeline: React.FC<InteractiveTimelineProps> = ({
  totalFrames,
  frames,
  currentFrameIndex,
  annotations,
  activeAnnotationId,
  onSeek,
  onSelectAnnotation,
  onUpdateAnnotation,
  onAddAnnotation,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    mode: DragMode;
    annId: string | null;
    startMouseX: number;
    initialStartFrame: number;
    initialEndFrame: number;
  } | null>(null);

  // Helper to find frame closest to a target timestamp in ms
  const findClosestFrameByMs = useCallback(
    (targetMs: number): number => {
      if (frames.length === 0) return 0;
      let low = 0;
      let high = frames.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (frames[mid].ms === targetMs) return mid;
        if (frames[mid].ms < targetMs) low = mid + 1;
        else high = mid - 1;
      }
      if (low >= frames.length) return frames.length - 1;
      if (high < 0) return 0;
      return Math.abs(frames[low].ms - targetMs) < Math.abs(frames[high].ms - targetMs) ? low : high;
    },
    [frames]
  );

  // Get frame index from mouse clientX
  const getFrameFromClientX = useCallback(
    (clientX: number): number => {
      if (!trackRef.current || totalFrames <= 1) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const ratio = relX / rect.width;
      const target = Math.round(ratio * (totalFrames - 1));
      return Math.max(0, Math.min(totalFrames - 1, target));
    },
    [totalFrames]
  );

  // Create default 3.0s interval starting at clicked frame (or playhead)
  const createIntervalAtFrame = useCallback(
    (clickedFrame: number) => {
      if (frames.length === 0) return;

      let startFrame = clickedFrame;
      const startMs = frames[startFrame]?.ms || 0;
      const targetEndMs = startMs + 3000; // 3.0s optimum default

      let endFrame = findClosestFrameByMs(targetEndMs);

      // If near the end of video, shift start backward so full 3.0s gesture fits
      if (endFrame >= frames.length - 1 && (frames[endFrame]?.ms || 0) - startMs < 2500) {
        endFrame = frames.length - 1;
        const endMs = frames[endFrame]?.ms || 0;
        startFrame = Math.max(0, findClosestFrameByMs(endMs - 3000));
      }

      // Clamp if at edge
      if (endFrame <= startFrame) {
        endFrame = Math.min(frames.length - 1, startFrame + 1);
      }

      const finalStartMs = frames[startFrame]?.ms || 0;
      const finalEndMs = frames[endFrame]?.ms || 0;
      const finalDuration = Math.round(((finalEndMs - finalStartMs) / 1000) * 100) / 100;

      const newAnn: IntervalAnnotation = {
        id: generateAnnotationId(),
        label: 'unassigned',
        start_frame: startFrame,
        end_frame: endFrame,
        start_ms: finalStartMs,
        end_ms: finalEndMs,
        duration_sec: finalDuration,
        start_frame_file: frames[startFrame]?.filename || `frame_${startFrame}.jpg`,
        end_frame_file: frames[endFrame]?.filename || `frame_${endFrame}.jpg`,
        track_ids: [],
      };

      onAddAnnotation(newAnn);
      onSelectAnnotation(newAnn.id);
    },
    [frames, findClosestFrameByMs, onAddAnnotation, onSelectAnnotation]
  );

  // Global mouse handlers for drag operations with Magnetic Snapping
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackRef.current || !dragState) return;
      const currentTargetFrame = getFrameFromClientX(e.clientX);

      if (dragState.mode === 'scrub') {
        onSeek(currentTargetFrame);
        return;
      }

      const targetAnn = annotations.find((a) => a.id === dragState.annId);
      if (!targetAnn) return;

      const rect = trackRef.current.getBoundingClientRect();
      const deltaPixels = e.clientX - dragState.startMouseX;
      const framesPerPixel = (totalFrames - 1) / rect.width;
      const deltaFrames = Math.round(deltaPixels * framesPerPixel);

      // Magnetic snap threshold: ~1.8% of timeline or minimum 4 frames
      const SNAP_THRESHOLD = Math.max(4, Math.round(totalFrames * 0.018));

      if (dragState.mode === 'move') {
        // Drag entire block
        const span = dragState.initialEndFrame - dragState.initialStartFrame;
        let newStart = dragState.initialStartFrame + deltaFrames;
        let newEnd = newStart + span;

        // Magnetic snap: start or end to current playhead
        if (Math.abs(newStart - currentFrameIndex) <= SNAP_THRESHOLD) {
          newStart = currentFrameIndex;
          newEnd = newStart + span;
        } else if (Math.abs(newEnd - currentFrameIndex) <= SNAP_THRESHOLD) {
          newEnd = currentFrameIndex;
          newStart = newEnd - span;
        }

        if (newStart < 0) {
          newStart = 0;
          newEnd = span;
        }
        if (newEnd >= totalFrames) {
          newEnd = totalFrames - 1;
          newStart = newEnd - span;
        }

        const startMs = frames[newStart]?.ms || 0;
        const endMs = frames[newEnd]?.ms || 0;
        const dur = Math.round(((endMs - startMs) / 1000) * 100) / 100;

        onUpdateAnnotation({
          ...targetAnn,
          start_frame: newStart,
          end_frame: newEnd,
          start_ms: startMs,
          end_ms: endMs,
          duration_sec: dur,
          start_frame_file: frames[newStart]?.filename || '',
          end_frame_file: frames[newEnd]?.filename || '',
        });
      } else if (dragState.mode === 'resize-left') {
        // Move left boundary with duration 2.0s - 5.0s constraint
        let newStart = Math.min(dragState.initialEndFrame - 1, Math.max(0, dragState.initialStartFrame + deltaFrames));

        // Magnetic snap left edge to current playhead
        if (Math.abs(newStart - currentFrameIndex) <= SNAP_THRESHOLD) {
          const testStart = currentFrameIndex;
          if (testStart < dragState.initialEndFrame) {
            const endMs = frames[dragState.initialEndFrame]?.ms || 0;
            const candidateStartMs = frames[testStart]?.ms || 0;
            const testDur = (endMs - candidateStartMs) / 1000;
            if (testDur >= 2.0 && testDur <= 5.0) {
              newStart = testStart;
            }
          }
        }

        const endMs = frames[dragState.initialEndFrame]?.ms || 0;
        const candidateStartMs = frames[newStart]?.ms || 0;
        const candidateDur = (endMs - candidateStartMs) / 1000;

        // Enforce 2.0s - 5.0s constraint
        if (candidateDur >= 2.0 && candidateDur <= 5.0) {
          onUpdateAnnotation({
            ...targetAnn,
            start_frame: newStart,
            start_ms: candidateStartMs,
            duration_sec: Math.round(candidateDur * 100) / 100,
            start_frame_file: frames[newStart]?.filename || '',
          });
        }
      } else if (dragState.mode === 'resize-right') {
        // Move right boundary with duration 2.0s - 5.0s constraint
        let newEnd = Math.max(dragState.initialStartFrame + 1, Math.min(totalFrames - 1, dragState.initialEndFrame + deltaFrames));

        // Magnetic snap right edge to current playhead
        if (Math.abs(newEnd - currentFrameIndex) <= SNAP_THRESHOLD) {
          const testEnd = currentFrameIndex;
          if (testEnd > dragState.initialStartFrame) {
            const startMs = frames[dragState.initialStartFrame]?.ms || 0;
            const candidateEndMs = frames[testEnd]?.ms || 0;
            const testDur = (candidateEndMs - startMs) / 1000;
            if (testDur >= 2.0 && testDur <= 5.0) {
              newEnd = testEnd;
            }
          }
        }

        const startMs = frames[dragState.initialStartFrame]?.ms || 0;
        const candidateEndMs = frames[newEnd]?.ms || 0;
        const candidateDur = (candidateEndMs - startMs) / 1000;

        // Enforce 2.0s - 5.0s constraint
        if (candidateDur >= 2.0 && candidateDur <= 5.0) {
          onUpdateAnnotation({
            ...targetAnn,
            end_frame: newEnd,
            end_ms: candidateEndMs,
            duration_sec: Math.round(candidateDur * 100) / 100,
            end_frame_file: frames[newEnd]?.filename || '',
          });
        }
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, totalFrames, frames, annotations, currentFrameIndex, getFrameFromClientX, onSeek, onUpdateAnnotation]);

  // Track click handler
  const handleTrackMouseDown = (e: React.MouseEvent) => {
    // Only handle direct clicks on track background
    if ((e.target as HTMLElement).closest('.range-block')) return;

    const targetFrame = getFrameFromClientX(e.clientX);
    onSeek(targetFrame);

    // If double click or Shift+Click, create interval at playhead
    if (e.detail === 2 || e.shiftKey) {
      createIntervalAtFrame(targetFrame);
    } else {
      // Unselect annotation on track click
      onSelectAnnotation(null);
      setDragState({
        mode: 'scrub',
        annId: null,
        startMouseX: e.clientX,
        initialStartFrame: targetFrame,
        initialEndFrame: targetFrame,
      });
    }
  };

  const playheadPercent = totalFrames > 1 ? (currentFrameIndex / (totalFrames - 1)) * 100 : 0;

  // Generate tick marks
  const tickCount = 10;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const frameIdx = Math.round((i / tickCount) * (totalFrames - 1));
    const ms = frames[frameIdx]?.ms || 0;
    const sec = (ms / 1000).toFixed(1);
    const pct = (i / tickCount) * 100;
    return { pct, frameIdx, sec };
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 select-none">
      {/* Timeline Controls & Info Bar */}
      <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800/40">
        <div className="flex items-center space-x-3">
          <span className="font-semibold text-slate-300">Интерактивный таймлайн</span>
          <span className="text-[11px] text-slate-500 font-mono">
            Длина жеста: <strong className="text-blue-400">2.0с – 5.0с</strong> (дефолт 3.0с)
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => createIntervalAtFrame(currentFrameIndex)}
            className="px-2.5 py-1 bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 rounded text-xs transition"
          >
            + Создать плашку от маятника (3.0с)
          </button>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            (или двойной клик по шкале)
          </span>
        </div>
      </div>

      {/* Timeline Interactive Area with elevated bead gutter */}
      <div className="relative pt-7 select-none">
        {/* Main Timeline Bar */}
        <div
          ref={trackRef}
          onMouseDown={handleTrackMouseDown}
          className="relative h-16 bg-slate-950 rounded-lg border border-slate-800 cursor-pointer shadow-inner group"
        >
          {/* Inner content clipped strictly to track bounds (grid lines & interval blocks) */}
          <div className="absolute inset-0 overflow-hidden rounded-lg">
            {/* Subtle grid lines */}
            <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20 px-1">
              {ticks.map((t, idx) => (
                <div key={idx} className="h-full border-r border-slate-700 relative" style={{ left: `${t.pct}%` }}>
                  <span className="text-[9px] font-mono text-slate-400 absolute top-1 -left-2">
                    {t.sec}s
                  </span>
                </div>
              ))}
            </div>

            {/* Range Blocks (Интервальные плашки) */}
            {annotations.map((ann) => {
              const isActive = ann.id === activeAnnotationId;
              const leftPct = totalFrames > 1 ? (ann.start_frame / (totalFrames - 1)) * 100 : 0;
              const rightPct = totalFrames > 1 ? (ann.end_frame / (totalFrames - 1)) * 100 : 0;
              const widthPct = Math.max(0.5, rightPct - leftPct);

              const isNormal = ann.label === 'normal';
              const isShoplifting = ann.label === 'shoplifting';

              return (
                <div
                  key={ann.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                    // Middle drag
                    setDragState({
                      mode: 'move',
                      annId: ann.id,
                      startMouseX: e.clientX,
                      initialStartFrame: ann.start_frame,
                      initialEndFrame: ann.end_frame,
                    });
                  }}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                  }}
                  className={`range-block absolute top-1.5 bottom-1.5 rounded border-2 z-10 cursor-grab active:cursor-grabbing flex items-center justify-between px-1 ${
                    isShoplifting
                      ? 'shoplifting'
                      : isNormal
                      ? 'normal'
                      : 'unassigned'
                  } ${isActive ? 'active ring-2 ring-blue-400' : ''}`}
                >
                  {/* Left Elastic Resize Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onSelectAnnotation(ann.id);
                      setDragState({
                        mode: 'resize-left',
                        annId: ann.id,
                        startMouseX: e.clientX,
                        initialStartFrame: ann.start_frame,
                        initialEndFrame: ann.end_frame,
                      });
                    }}
                    className="w-2.5 h-full -ml-1 cursor-ew-resize hover:bg-white/40 rounded-l flex items-center justify-center group/handle"
                    title="Тянуть для изменения начала интервала (2-5 сек)"
                  >
                    <div className="w-0.5 h-4 bg-white/60 group-hover/handle:bg-white rounded" />
                  </div>

                  {/* Center Content: Label & Duration */}
                  <div className="pointer-events-none truncate text-center flex-1 px-1 flex items-center justify-center space-x-1">
                    <span className="text-[10px] font-bold tracking-tight text-white drop-shadow">
                      {isShoplifting ? 'SHOPLIFT' : isNormal ? 'NORMAL' : 'UNASSIGNED'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-200 opacity-90 drop-shadow">
                      {formatSeconds(ann.duration_sec)}
                    </span>
                    {isShoplifting && ann.track_ids && ann.track_ids.length > 0 && (
                      <span className="bg-black/60 text-red-300 border border-red-500/60 rounded px-1 text-[9px] font-mono font-bold">
                        ID:{ann.track_ids.join(',')}
                      </span>
                    )}
                  </div>

                  {/* Right Elastic Resize Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onSelectAnnotation(ann.id);
                      setDragState({
                        mode: 'resize-right',
                        annId: ann.id,
                        startMouseX: e.clientX,
                        initialStartFrame: ann.start_frame,
                        initialEndFrame: ann.end_frame,
                      });
                    }}
                    className="w-2.5 h-full -mr-1 cursor-ew-resize hover:bg-white/40 rounded-r flex items-center justify-center group/handle"
                    title="Тянуть для изменения конца интервала (2-5 сек)"
                  >
                    <div className="w-0.5 h-4 bg-white/60 group-hover/handle:bg-white rounded" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Playhead (Курсор воспроизведения) */}
          <div
            style={{ left: `${playheadPercent}%` }}
            className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 z-30 pointer-events-none"
          >
            {/* Red Needle Line: extends from top edge of track to bottom edge */}
            <div className="absolute inset-0 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />

            {/* Playhead Bead (Бусинка): sits strictly ABOVE the black track */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setDragState({
                  mode: 'scrub',
                  annId: null,
                  startMouseX: e.clientX,
                  initialStartFrame: currentFrameIndex,
                  initialEndFrame: currentFrameIndex,
                });
              }}
              className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 w-5 h-5 bg-red-600 hover:bg-red-500 active:scale-125 rounded-full shadow-lg border-2 border-white flex items-center justify-center cursor-ew-resize pointer-events-auto transition-transform"
              title="Маятник (потяните для перемещения)"
            >
              {/* Red connector stem extending to needle */}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0.5 h-1 bg-red-500 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

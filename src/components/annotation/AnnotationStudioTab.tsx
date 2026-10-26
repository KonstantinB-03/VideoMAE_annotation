'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { VideoItem, IntervalAnnotation, LabelType, AnnotationsDatabase, VideoTracksMap, DetectionTrack } from '@/types';
import { FrameCacheManager } from '@/lib/frameCache';
import { VideoSidebar } from './VideoSidebar';
import { CanvasViewport } from './CanvasViewport';
import { InteractiveTimeline } from './InteractiveTimeline';
import { AnnotationInspector } from './AnnotationInspector';
import { HotkeysModal } from './HotkeysModal';
import { Play, Pause, Repeat, SkipBack, SkipForward, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Eye, EyeOff, Crosshair } from 'lucide-react';
import { formatMilliseconds, formatSeconds } from '@/lib/formatters';

interface AnnotationStudioTabProps {
  datasetFolder: string;
  onDatasetFolderChange: (folder: string) => void;
  isHotkeysModalOpen: boolean;
  onCloseHotkeysModal: () => void;
}

export const AnnotationStudioTab: React.FC<AnnotationStudioTabProps> = ({
  datasetFolder,
  onDatasetFolderChange,
  isHotkeysModalOpen,
  onCloseHotkeysModal,
}) => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [annotationsDb, setAnnotationsDb] = useState<AnnotationsDatabase>({
    version: '1.0',
    updated_at: new Date().toISOString(),
    videos: {},
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Detection tracks states & cache
  const videoTracksCacheRef = useRef<Record<string, VideoTracksMap>>({});
  const [currentTracksMap, setCurrentTracksMap] = useState<VideoTracksMap | null>(null);
  const [isLoadingTracks, setIsLoadingTracks] = useState<boolean>(false);
  const [showTracksOverlay, setShowTracksOverlay] = useState<boolean>(true);
  const [trackFeedback, setTrackFeedback] = useState<{ text: string; type: 'success' | 'warn' } | null>(null);

  // Playback States
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  // Single FrameCacheManager instance
  const frameCache = useMemo(() => new FrameCacheManager(120), []);

  // Track previous video ID to prevent clearing cache/frames when updating annotations
  const prevVideoIdRef = useRef<string | null>(null);

  // Active video object
  const activeVideo = useMemo(
    () => videos.find((v) => v.id === activeVideoId) || null,
    [videos, activeVideoId]
  );

  // Annotations for active video
  const activeVideoAnnotations = useMemo(() => {
    if (!activeVideoId) return [];
    return annotationsDb.videos[activeVideoId]?.annotations || [];
  }, [annotationsDb, activeVideoId]);

  // Active annotation object
  const activeAnnotation = useMemo(() => {
    return activeVideoAnnotations.find((a) => a.id === activeAnnotationId) || null;
  }, [activeVideoAnnotations, activeAnnotationId]);

  // Fetch dataset scan
  const loadDataset = useCallback(
    async (folderPath?: string) => {
      const targetPath = (folderPath || datasetFolder || '').trim();
      if (!targetPath) return;

      setIsLoading(true);
      try {
        const res = await fetch(`/api/fs/dataset?path=${encodeURIComponent(targetPath)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const loadedVideos: VideoItem[] = data.videos || [];
        setVideos(loadedVideos);

        if (data.annotations && data.annotations.videos) {
          const normalizedVideos: Record<string, any> = {};
          for (const [vId, rec] of Object.entries(data.annotations.videos as Record<string, any>)) {
            normalizedVideos[vId] = {
              ...rec,
              annotations: (rec.annotations || []).map((a: IntervalAnnotation) => ({
                ...a,
                track_ids: a.track_ids || [],
              })),
            };
          }
          setAnnotationsDb({
            ...data.annotations,
            videos: normalizedVideos,
          });
        } else if (data.annotations) {
          setAnnotationsDb(data.annotations);
        }

        // Check if active video still exists in loaded videos, otherwise switch to first
        if (loadedVideos.length > 0) {
          setActiveVideoId((currId) => {
            const exists = loadedVideos.some((v) => v.id === currId);
            return exists && currId ? currId : loadedVideos[0].id;
          });
        } else {
          setActiveVideoId(null);
        }
      } catch (e: any) {
        console.error('Failed to load dataset:', e);
      } finally {
        setIsLoading(false);
      }
    },
    [datasetFolder]
  );

  useEffect(() => {
    if (datasetFolder) {
      loadDataset(datasetFolder);
    }
  }, [datasetFolder, loadDataset]);

  // Synchronous and complete video selection handler
  const handleSelectVideo = useCallback(
    (id: string) => {
      const vid = videos.find((v) => v.id === id);
      if (vid) {
        frameCache.clear();
        frameCache.setFrames(vid.frames.map((f) => f.url));
        frameCache.preloadWindow(0, 30, 0);
      }
      prevVideoIdRef.current = id;
      setActiveVideoId(id);
      setCurrentFrameIndex(0);
      setIsPlaying(false);
      setIsLooping(false);

      const videoAnns = annotationsDb.videos[id]?.annotations || [];
      setActiveAnnotationId(videoAnns.length > 0 ? videoAnns[0].id : null);
    },
    [videos, frameCache, annotationsDb]
  );

  // Handle genuine video switching and memory management (safety fallback)
  useEffect(() => {
    if (!activeVideo) return;

    // Only run if active video ID genuinely changed
    if (prevVideoIdRef.current === activeVideo.id) {
      return;
    }
    prevVideoIdRef.current = activeVideo.id;

    // Strict browser memory management: purge previous video frames
    frameCache.clear();

    const urls = activeVideo.frames.map((f) => f.url);
    frameCache.setFrames(urls);

    setCurrentFrameIndex(0);
    setIsPlaying(false);
    setIsLooping(false);

    // Default select first annotation if exists
    const videoAnns = annotationsDb.videos[activeVideo.id]?.annotations || [];
    setActiveAnnotationId(videoAnns.length > 0 ? videoAnns[0].id : null);

    // Preload first window of frames
    frameCache.preloadWindow(0, 30, 0);
  }, [activeVideo, frameCache, annotationsDb]);

  // Preload around current frame whenever playhead moves
  useEffect(() => {
    if (activeVideo && activeVideo.frames.length > 0) {
      frameCache.preloadWindow(currentFrameIndex, 25, 10);
    }
  }, [currentFrameIndex, activeVideo, frameCache]);

  // Load detection tracks data for active video
  useEffect(() => {
    if (!activeVideoId || !datasetFolder) {
      setCurrentTracksMap(null);
      return;
    }

    if (videoTracksCacheRef.current[activeVideoId]) {
      setCurrentTracksMap(videoTracksCacheRef.current[activeVideoId]);
      return;
    }

    let isSubscribed = true;
    setIsLoadingTracks(true);

    fetch(`/api/tracks?datasetPath=${encodeURIComponent(datasetFolder)}&videoId=${encodeURIComponent(activeVideoId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isSubscribed) return;
        if (data.hasTracks && data.tracks) {
          videoTracksCacheRef.current[activeVideoId] = data.tracks;
          setCurrentTracksMap(data.tracks);
        } else {
          setCurrentTracksMap(null);
        }
      })
      .catch((err) => {
        console.warn('Could not load tracks for video:', err);
        if (isSubscribed) setCurrentTracksMap(null);
      })
      .finally(() => {
        if (isSubscribed) setIsLoadingTracks(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [activeVideoId, datasetFolder]);

  // Save annotations to annotations.json
  const saveAnnotations = useCallback(
    async (updatedDb: AnnotationsDatabase) => {
      if (!datasetFolder) return;
      setIsSaving(true);
      try {
        // Guarantee track_ids is present on all annotations in output json
        const sanitizedVideos: Record<string, any> = {};
        for (const [vId, rec] of Object.entries(updatedDb.videos)) {
          sanitizedVideos[vId] = {
            ...rec,
            annotations: (rec.annotations || []).map((a) => ({
              ...a,
              track_ids: a.track_ids || [],
            })),
          };
        }

        const sanitizedDb: AnnotationsDatabase = {
          ...updatedDb,
          videos: sanitizedVideos,
        };

        const res = await fetch('/api/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            datasetPath: datasetFolder,
            annotations: sanitizedDb,
          }),
        });
        if (!res.ok) throw new Error('Save failed');
        setSaveStatus('Сохранено');
        setTimeout(() => setSaveStatus(null), 2500);

        // Update video items annotation counts without resetting video references
        setVideos((prev) =>
          prev.map((v) => {
            const count = sanitizedDb.videos[v.id]?.annotations.length || 0;
            return {
              ...v,
              annotationCount: count,
              isAnnotated: count > 0,
            };
          })
        );
      } catch (err) {
        console.error('Failed to save annotations:', err);
        setSaveStatus('Ошибка сохранения');
      } finally {
        setIsSaving(false);
      }
    },
    [datasetFolder]
  );

  // Update annotation in DB
  const handleUpdateAnnotation = useCallback(
    (updatedAnn: IntervalAnnotation) => {
      if (!activeVideoId) return;

      setAnnotationsDb((prev) => {
        const currentVideoRecord = prev.videos[activeVideoId] || {
          total_frames: activeVideo?.total_frames || 0,
          annotations: [],
        };

        const updatedList = currentVideoRecord.annotations.map((a) =>
          a.id === updatedAnn.id ? updatedAnn : a
        );

        const newDb: AnnotationsDatabase = {
          ...prev,
          videos: {
            ...prev.videos,
            [activeVideoId]: {
              ...currentVideoRecord,
              annotations: updatedList,
            },
          },
        };

        saveAnnotations(newDb);
        return newDb;
      });
    },
    [activeVideoId, activeVideo, saveAnnotations]
  );

  // Add new annotation
  const handleAddAnnotation = useCallback(
    (newAnn: IntervalAnnotation) => {
      if (!activeVideoId) return;

      setAnnotationsDb((prev) => {
        const currentVideoRecord = prev.videos[activeVideoId] || {
          total_frames: activeVideo?.total_frames || 0,
          annotations: [],
        };

        const newDb: AnnotationsDatabase = {
          ...prev,
          videos: {
            ...prev.videos,
            [activeVideoId]: {
              ...currentVideoRecord,
              annotations: [...currentVideoRecord.annotations, newAnn],
            },
          },
        };

        saveAnnotations(newDb);
        return newDb;
      });
    },
    [activeVideoId, activeVideo, saveAnnotations]
  );

  // Snap start of active annotation to current playhead
  const handleSnapStartToPlayhead = useCallback(
    (id: string) => {
      if (!activeVideo) return;
      const ann = activeVideoAnnotations.find((a) => a.id === id);
      if (!ann) return;

      const frames = activeVideo.frames;
      let newStart = currentFrameIndex;
      const endFrame = ann.end_frame;

      // Validate ordering and duration
      if (newStart >= endFrame) {
        newStart = Math.max(0, endFrame - 1);
      }

      const startMs = frames[newStart]?.ms || 0;
      const endMs = frames[endFrame]?.ms || 0;
      let dur = (endMs - startMs) / 1000;

      // If duration out of [2.0, 5.0], adjust end frame
      let finalEndFrame = endFrame;
      if (dur < 2.0) {
        // Expand end
        const targetMs = startMs + 3000;
        finalEndFrame = Math.min(frames.length - 1, frames.findIndex((f) => f.ms >= targetMs));
        if (finalEndFrame < 0) finalEndFrame = frames.length - 1;
      } else if (dur > 5.0) {
        const targetMs = startMs + 5000;
        finalEndFrame = Math.min(frames.length - 1, frames.findIndex((f) => f.ms >= targetMs));
        if (finalEndFrame < 0) finalEndFrame = frames.length - 1;
      }

      const finalEndMs = frames[finalEndFrame]?.ms || 0;
      const finalDur = Math.round(((finalEndMs - startMs) / 1000) * 100) / 100;

      handleUpdateAnnotation({
        ...ann,
        start_frame: newStart,
        end_frame: finalEndFrame,
        start_ms: startMs,
        end_ms: finalEndMs,
        duration_sec: finalDur,
        start_frame_file: frames[newStart]?.filename || '',
        end_frame_file: frames[finalEndFrame]?.filename || '',
      });
    },
    [activeVideo, activeVideoAnnotations, currentFrameIndex, handleUpdateAnnotation]
  );

  // Snap end of active annotation to current playhead
  const handleSnapEndToPlayhead = useCallback(
    (id: string) => {
      if (!activeVideo) return;
      const ann = activeVideoAnnotations.find((a) => a.id === id);
      if (!ann) return;

      const frames = activeVideo.frames;
      let newEnd = currentFrameIndex;
      const startFrame = ann.start_frame;

      if (newEnd <= startFrame) {
        newEnd = Math.min(frames.length - 1, startFrame + 1);
      }

      const startMs = frames[startFrame]?.ms || 0;
      const endMs = frames[newEnd]?.ms || 0;
      let dur = (endMs - startMs) / 1000;

      let finalStartFrame = startFrame;
      if (dur < 2.0) {
        const targetMs = endMs - 3000;
        finalStartFrame = Math.max(0, frames.findIndex((f) => f.ms >= targetMs));
      } else if (dur > 5.0) {
        const targetMs = endMs - 5000;
        finalStartFrame = Math.max(0, frames.findIndex((f) => f.ms >= targetMs));
      }

      const finalStartMs = frames[finalStartFrame]?.ms || 0;
      const finalDur = Math.round(((endMs - finalStartMs) / 1000) * 100) / 100;

      handleUpdateAnnotation({
        ...ann,
        start_frame: finalStartFrame,
        end_frame: newEnd,
        start_ms: finalStartMs,
        end_ms: endMs,
        duration_sec: finalDur,
        start_frame_file: frames[finalStartFrame]?.filename || '',
        end_frame_file: frames[newEnd]?.filename || '',
      });
    },
    [activeVideo, activeVideoAnnotations, currentFrameIndex, handleUpdateAnnotation]
  );

  // Set label for annotation
  const handleSetLabel = useCallback(
    (id: string, label: LabelType) => {
      const ann = activeVideoAnnotations.find((a) => a.id === id);
      if (!ann) return;
      handleUpdateAnnotation({ ...ann, label });
    },
    [activeVideoAnnotations, handleUpdateAnnotation]
  );

  // Delete annotation
  const handleDeleteAnnotation = useCallback(
    (id: string) => {
      if (!activeVideoId) return;

      setAnnotationsDb((prev) => {
        const currentVideoRecord = prev.videos[activeVideoId] || {
          total_frames: activeVideo?.total_frames || 0,
          annotations: [],
        };

        const filtered = currentVideoRecord.annotations.filter((a) => a.id !== id);

        const newDb: AnnotationsDatabase = {
          ...prev,
          videos: {
            ...prev.videos,
            [activeVideoId]: {
              ...currentVideoRecord,
              annotations: filtered,
            },
          },
        };

        saveAnnotations(newDb);
        return newDb;
      });

      if (activeAnnotationId === id) {
        setActiveAnnotationId(null);
        setIsLooping(false);
      }
    },
    [activeVideoId, activeVideo, activeAnnotationId, saveAnnotations]
  );

  // Toggle track ID for active shoplifting interval
  const handleToggleTrackId = useCallback(
    (trackId: number) => {
      if (!activeAnnotation) {
        setTrackFeedback({
          text: 'Сначала выберите интервал Shoplifting для привязки трека',
          type: 'warn',
        });
        setTimeout(() => setTrackFeedback(null), 3000);
        return;
      }

      if (activeAnnotation.label !== 'shoplifting') {
        setTrackFeedback({
          text: 'Треки привязываются только к интервалам Shoplifting (Кража)',
          type: 'warn',
        });
        setTimeout(() => setTrackFeedback(null), 3000);
        return;
      }

      const currentIds = activeAnnotation.track_ids || [];
      const isAssigned = currentIds.includes(trackId);
      const newIds = isAssigned
        ? currentIds.filter((id) => id !== trackId)
        : [...currentIds, trackId].sort((a, b) => a - b);

      handleUpdateAnnotation({
        ...activeAnnotation,
        track_ids: newIds,
      });

      setTrackFeedback({
        text: isAssigned
          ? `Трек #${trackId} удален из интервала`
          : `Трек #${trackId} привязан к краже`,
        type: 'success',
      });
      setTimeout(() => setTrackFeedback(null), 2500);
    },
    [activeAnnotation, handleUpdateAnnotation]
  );

  // Explicitly add track ID
  const handleAddTrackId = useCallback(
    (trackId: number) => {
      if (!activeAnnotation || activeAnnotation.label !== 'shoplifting') {
        setTrackFeedback({
          text: 'Выберите интервал Shoplifting для привязки трека',
          type: 'warn',
        });
        setTimeout(() => setTrackFeedback(null), 3000);
        return;
      }

      const currentIds = activeAnnotation.track_ids || [];
      if (!currentIds.includes(trackId)) {
        const newIds = [...currentIds, trackId].sort((a, b) => a - b);
        handleUpdateAnnotation({
          ...activeAnnotation,
          track_ids: newIds,
        });
        setTrackFeedback({
          text: `Трек #${trackId} привязан к краже`,
          type: 'success',
        });
        setTimeout(() => setTrackFeedback(null), 2500);
      }
    },
    [activeAnnotation, handleUpdateAnnotation]
  );

  // Explicitly remove track ID
  const handleRemoveTrackId = useCallback(
    (trackId: number) => {
      if (!activeAnnotation || activeAnnotation.label !== 'shoplifting') return;
      const currentIds = activeAnnotation.track_ids || [];
      const newIds = currentIds.filter((id) => id !== trackId);
      handleUpdateAnnotation({
        ...activeAnnotation,
        track_ids: newIds,
      });
      setTrackFeedback({
        text: `Трек #${trackId} удален`,
        type: 'success',
      });
      setTimeout(() => setTrackFeedback(null), 2500);
    },
    [activeAnnotation, handleUpdateAnnotation]
  );

  // Switch video handlers
  const handlePrevVideo = useCallback(() => {
    const idx = videos.findIndex((v) => v.id === activeVideoId);
    if (idx > 0) {
      handleSelectVideo(videos[idx - 1].id);
    }
  }, [videos, activeVideoId, handleSelectVideo]);

  const handleNextVideo = useCallback(() => {
    const idx = videos.findIndex((v) => v.id === activeVideoId);
    if (idx >= 0 && idx < videos.length - 1) {
      handleSelectVideo(videos[idx + 1].id);
    }
  }, [videos, activeVideoId, handleSelectVideo]);

  // Playback reference anchor to maintain synchronization across seeks and speed changes
  const playbackAnchorRef = useRef<{
    startWallTime: number;
    startMs: number;
    startIdx: number;
  }>({ startWallTime: 0, startMs: 0, startIdx: 0 });

  // Unified Seek handler: immediately updates playhead AND resets playback anchor
  const handleSeek = useCallback(
    (newIndex: number) => {
      if (!activeVideo || activeVideo.frames.length === 0) return;

      const total = activeVideo.frames.length;
      const clamped = Math.max(0, Math.min(total - 1, newIndex));
      const frameMs = activeVideo.frames[clamped]?.ms || 0;

      setCurrentFrameIndex(clamped);

      // Immediately reset the playback anchor so running RAF ticks continue smoothly from here
      playbackAnchorRef.current = {
        startWallTime: performance.now(),
        startMs: frameMs,
        startIdx: clamped,
      };

      // If in loop mode but seeked outside the loop interval, seamlessly switch to regular playback
      if (isLooping && activeAnnotation) {
        if (clamped < activeAnnotation.start_frame || clamped > activeAnnotation.end_frame) {
          setIsLooping(false);
          setIsPlaying(true);
        }
      }
    },
    [activeVideo, isLooping, activeAnnotation]
  );

  // Toggle Regular Playback
  const handleTogglePlay = useCallback(() => {
    if (!activeVideo || activeVideo.frames.length === 0) return;

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    // Stop loop if active and start regular play
    setIsLooping(false);

    let nextIdx = currentFrameIndex;
    // If at the very end, rewind to start
    if (currentFrameIndex >= activeVideo.total_frames - 1) {
      nextIdx = 0;
      setCurrentFrameIndex(0);
    }

    playbackAnchorRef.current = {
      startWallTime: performance.now(),
      startMs: activeVideo.frames[nextIdx]?.ms || 0,
      startIdx: nextIdx,
    };

    setIsPlaying(true);
  }, [isPlaying, activeVideo, currentFrameIndex]);

  // Toggle Loop mode
  const handleToggleLoop = useCallback(() => {
    if (isLooping) {
      setIsLooping(false);
      return;
    }

    setIsPlaying(false);

    let targetAnn = activeAnnotation;
    if (!targetAnn) {
      if (activeVideoAnnotations.length > 0) {
        targetAnn = activeVideoAnnotations[0];
        setActiveAnnotationId(targetAnn.id);
      } else {
        return;
      }
    }

    const startFrame = targetAnn.start_frame;
    setCurrentFrameIndex(startFrame);
    if (activeVideo && activeVideo.frames[startFrame]) {
      playbackAnchorRef.current = {
        startWallTime: performance.now(),
        startMs: activeVideo.frames[startFrame].ms,
        startIdx: startFrame,
      };
    }
    setIsLooping(true);
  }, [isLooping, activeAnnotation, activeVideoAnnotations, activeVideo]);

  // High-precision physical millisecond playback runner (solves false 60fps & handles real timecodes)
  useEffect(() => {
    if (!isPlaying && !isLooping) return;
    if (!activeVideo || activeVideo.frames.length === 0) return;

    const frames = activeVideo.frames;
    const total = frames.length;

    // Ensure anchor matches current frame
    if (playbackAnchorRef.current.startIdx !== currentFrameIndex) {
      playbackAnchorRef.current = {
        startWallTime: performance.now(),
        startMs: frames[currentFrameIndex]?.ms || 0,
        startIdx: currentFrameIndex,
      };
    }

    let animId: number;

    const tick = (now: number) => {
      const anchor = playbackAnchorRef.current;
      const elapsedWallMs = (now - anchor.startWallTime) * playbackSpeed;

      if (isLooping && activeAnnotation) {
        const loopStartFrame = activeAnnotation.start_frame;
        const loopEndFrame = activeAnnotation.end_frame;
        const loopStartMs = frames[loopStartFrame]?.ms || 0;
        const loopEndMs = frames[loopEndFrame]?.ms || 1;
        const loopDurationMs = Math.max(10, loopEndMs - loopStartMs);

        const currentMsInLoop = Math.max(0, anchor.startMs - loopStartMs);
        const offsetInLoop = (currentMsInLoop + elapsedWallMs) % loopDurationMs;
        const targetMs = loopStartMs + offsetInLoop;

        // Binary search for targetMs in interval
        let low = loopStartFrame;
        let high = loopEndFrame;
        let foundIdx = loopStartFrame;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          if (frames[mid].ms <= targetMs) {
            foundIdx = mid;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        setCurrentFrameIndex(foundIdx);
        animId = requestAnimationFrame(tick);
      } else if (isPlaying) {
        const targetMs = anchor.startMs + elapsedWallMs;
        const lastMs = frames[total - 1]?.ms || 0;

        if (targetMs >= lastMs) {
          // Reached end of video
          setCurrentFrameIndex(total - 1);
          setIsPlaying(false);
          return;
        }

        // Binary search for targetMs across all frames
        let low = 0;
        let high = total - 1;
        let foundIdx = anchor.startIdx;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          if (frames[mid].ms <= targetMs) {
            foundIdx = mid;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        setCurrentFrameIndex(foundIdx);
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, isLooping, activeAnnotation, activeVideo, playbackSpeed]);

  // Global hotkeys listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') return;

      const key = e.key;

      // Space: Toggle Play/Pause or Loop
      if (key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (activeAnnotation) {
          handleToggleLoop();
        } else {
          handleTogglePlay();
        }
        return;
      }

      // K: Toggle standard Play/Pause
      if (key === 'k' || key === 'K' || key === 'л' || key === 'Л') {
        e.preventDefault();
        handleTogglePlay();
        return;
      }

      // L: Toggle Loop
      if (key === 'l' || key === 'L' || key === 'д' || key === 'Д') {
        e.preventDefault();
        handleToggleLoop();
        return;
      }

      // [: Snap Start to playhead
      if (key === '[' || key === '{' || key === 'х' || key === 'Х') {
        e.preventDefault();
        if (activeAnnotationId) {
          handleSnapStartToPlayhead(activeAnnotationId);
        }
        return;
      }

      // ]: Snap End to playhead
      if (key === ']' || key === '}' || key === 'ъ' || key === 'Ъ') {
        e.preventDefault();
        if (activeAnnotationId) {
          handleSnapEndToPlayhead(activeAnnotationId);
        }
        return;
      }

      // Step -1 / +1 or -10 / +10
      if (key === 'a' || key === 'A' || key === 'ф' || key === 'Ф') {
        e.preventDefault();
        const step = e.shiftKey ? -10 : -1;
        handleSeek(currentFrameIndex + step);
        return;
      }
      if (key === 'd' || key === 'D' || key === 'в' || key === 'В') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        handleSeek(currentFrameIndex + step);
        return;
      }

      // 1: Normal
      if (key === '1') {
        e.preventDefault();
        if (activeAnnotationId) {
          handleSetLabel(activeAnnotationId, 'normal');
        }
        return;
      }

      // 2: Shoplifting
      if (key === '2') {
        e.preventDefault();
        if (activeAnnotationId) {
          handleSetLabel(activeAnnotationId, 'shoplifting');
        }
        return;
      }

      // Delete / Backspace: delete active annotation
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        if (activeAnnotationId) {
          handleDeleteAnnotation(activeAnnotationId);
        }
        return;
      }

      // W / Ctrl + Right: Next video
      if ((key === 'w' || key === 'W' || key === 'ц' || key === 'Ц') && !e.ctrlKey) {
        e.preventDefault();
        handleNextVideo();
        return;
      }
      if (e.ctrlKey && key === 'ArrowRight') {
        e.preventDefault();
        handleNextVideo();
        return;
      }

      // Q / Ctrl + Left: Prev video
      if ((key === 'q' || key === 'Q' || key === 'й' || key === 'Й') && !e.ctrlKey) {
        e.preventDefault();
        handlePrevVideo();
        return;
      }
      if (e.ctrlKey && key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevVideo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activeVideo,
    activeAnnotation,
    activeAnnotationId,
    handleTogglePlay,
    handleToggleLoop,
    handleSnapStartToPlayhead,
    handleSnapEndToPlayhead,
    handleSetLabel,
    handleDeleteAnnotation,
    handleNextVideo,
    handlePrevVideo,
  ]);

  const currentFrameObj = activeVideo?.frames[currentFrameIndex];
  const currentFrameTracks = useMemo(() => {
    if (!currentTracksMap || !currentFrameObj) return [];
    return currentTracksMap[currentFrameObj.filename] || [];
  }, [currentTracksMap, currentFrameObj]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar: Video List */}
      <VideoSidebar
        datasetFolder={datasetFolder}
        videos={videos}
        activeVideoId={activeVideoId}
        onSelectVideo={handleSelectVideo}
        onDatasetFolderChange={onDatasetFolderChange}
        onRefreshDataset={(overridePath) => loadDataset(overridePath || datasetFolder)}
        onPrevVideo={handlePrevVideo}
        onNextVideo={handleNextVideo}
        isLoading={isLoading}
      />

      {/* Main Viewport & Timeline Center Area */}
      <main className="flex-1 flex flex-col p-4 space-y-3 overflow-y-auto">
        {/* Status Pill Bar */}
        <div className="flex items-center justify-between text-xs px-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-200">
              {activeVideo ? activeVideo.name : 'Видео не выбрано'}
            </span>
            {activeVideo && (
              <span className="text-[11px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                {activeVideo.total_frames} кадров · ~{(activeVideo.duration_ms / 1000).toFixed(1)}с @ {activeVideo.fps} FPS
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {trackFeedback && (
              <span
                className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border animate-in fade-in zoom-in-95 ${
                  trackFeedback.type === 'success'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-amber-950 text-amber-300 border-amber-700'
                }`}
              >
                <span>{trackFeedback.text}</span>
              </span>
            )}
            {isSaving && (
              <span className="text-blue-400 font-mono text-[11px] animate-pulse">
                Сохранение...
              </span>
            )}
            {saveStatus && (
              <span className="inline-flex items-center space-x-1 text-emerald-400 font-mono text-[11px]">
                <CheckCircle className="w-3 h-3" />
                <span>{saveStatus}</span>
              </span>
            )}
          </div>
        </div>

        {/* Viewport */}
        {activeVideo && activeVideo.frames.length > 0 ? (
          <div className="flex flex-col space-y-2">
            <CanvasViewport
              key={activeVideo.id}
              videoId={activeVideo.id}
              videoName={activeVideo.name}
              totalFrames={activeVideo.total_frames}
              currentFrameIndex={currentFrameIndex}
              currentFrame={currentFrameObj}
              frameCache={frameCache}
              activeAnnotation={activeAnnotation}
              isLooping={isLooping}
              onToggleLoop={handleToggleLoop}
              tracks={currentFrameTracks}
              showTracks={showTracksOverlay}
              activeTrackIds={activeAnnotation?.label === 'shoplifting' ? (activeAnnotation.track_ids || []) : []}
              onToggleTrack={handleToggleTrackId}
            />

            {/* Playback Control Toolbar (New Feature requested by user) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-3 select-none">
              {/* Play / Step Controls */}
              <div className="flex items-center space-x-2">
                {/* Play / Pause Video Button */}
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition ${
                    isPlaying
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                  title="Воспроизвести полное видео от маятника до конца (Клавиша K)"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-white" />
                      <span>Пауза</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Воспроизведение</span>
                    </>
                  )}
                </button>

                {/* Loop Range Button */}
                {activeAnnotation && (
                  <button
                    type="button"
                    onClick={handleToggleLoop}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                      isLooping
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title="Зациклить воспроизведение только выбранного жеста (Пробел)"
                  >
                    <Repeat className={`w-3.5 h-3.5 ${isLooping ? 'animate-spin' : ''}`} />
                    <span>{isLooping ? 'Остановить Loop' : 'Loop интервала'}</span>
                  </button>
                )}

                {/* AI Tracks Visibility Toggle */}
                {currentTracksMap && (
                  <button
                    type="button"
                    onClick={() => setShowTracksOverlay((prev) => !prev)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                      showTracksOverlay
                        ? 'bg-cyan-950/80 text-cyan-300 border-cyan-600/80 hover:bg-cyan-900/80 shadow-sm'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
                    }`}
                    title="Показать или скрыть рамки обнаруженных треков на видео"
                  >
                    {showTracksOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>Треки AI</span>
                    {currentFrameTracks.length > 0 && (
                      <span className="text-[10px] bg-cyan-900 text-cyan-200 px-1.5 py-0.2 rounded font-mono font-bold">
                        {currentFrameTracks.length}
                      </span>
                    )}
                  </button>
                )}

                {/* Frame Step Buttons */}
                <div className="flex items-center space-x-1 border-l border-slate-800 pl-2">
                  <button
                    type="button"
                    onClick={() => handleSeek(currentFrameIndex - 10)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition"
                    title="-10 кадров (Shift + A)"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSeek(currentFrameIndex - 1)}
                    className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition"
                    title="-1 кадр (A)"
                  >
                    -1к
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSeek(currentFrameIndex + 1)}
                    className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition"
                    title="+1 кадр (D)"
                  >
                    +1к
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSeek(currentFrameIndex + 10)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition"
                    title="+10 кадров (Shift + D)"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Speed Selector */}
              <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
                <span className="text-[11px] text-slate-500 px-2">Скорость:</span>
                {[0.5, 1.0, 1.5, 2.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      if (activeVideo && activeVideo.frames.length > 0) {
                        playbackAnchorRef.current = {
                          startWallTime: performance.now(),
                          startMs: activeVideo.frames[currentFrameIndex]?.ms || 0,
                          startIdx: currentFrameIndex,
                        };
                      }
                      setPlaybackSpeed(s);
                    }}
                    className={`px-2 py-1 rounded text-[11px] font-mono transition ${
                      playbackSpeed === s
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              {/* Status pill */}
              <div className="text-xs font-mono text-slate-400">
                PTS:{' '}
                <strong className="text-emerald-400">
                  {currentFrameObj ? formatMilliseconds(currentFrameObj.ms) : '00:00.000'}
                </strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-black/40 border border-slate-800 rounded-xl flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
            <AlertCircle className="w-10 h-10 text-slate-600" />
            <div>
              <p className="font-medium text-slate-400">Нет доступных кадров для отображения</p>
              <p className="text-xs text-slate-600 mt-1 max-w-md">
                Укажите папку с подготовленными кадрами в сайдбаре слева или выполните распаковку во вкладке «Предобработка».
              </p>
            </div>
          </div>
        )}

        {/* Interactive Timeline */}
        {activeVideo && activeVideo.frames.length > 0 && (
          <InteractiveTimeline
            totalFrames={activeVideo.total_frames}
            frames={activeVideo.frames}
            currentFrameIndex={currentFrameIndex}
            annotations={activeVideoAnnotations}
            activeAnnotationId={activeAnnotationId}
            onSeek={handleSeek}
            onSelectAnnotation={(id) => setActiveAnnotationId(id)}
            onUpdateAnnotation={handleUpdateAnnotation}
            onAddAnnotation={handleAddAnnotation}
          />
        )}
      </main>

      {/* Inspector Sidebar: Class selection, magnetic snap & intervals */}
      <AnnotationInspector
        annotations={activeVideoAnnotations}
        activeAnnotationId={activeAnnotationId}
        currentFrameIndex={currentFrameIndex}
        isLooping={isLooping}
        onSelectAnnotation={(id) => setActiveAnnotationId(id)}
        onSetLabel={handleSetLabel}
        onDeleteAnnotation={handleDeleteAnnotation}
        onToggleLoop={handleToggleLoop}
        onSeek={handleSeek}
        onSnapStartToPlayhead={handleSnapStartToPlayhead}
        onSnapEndToPlayhead={handleSnapEndToPlayhead}
        currentFrameTracks={currentFrameTracks}
        onAddTrackId={handleAddTrackId}
        onRemoveTrackId={handleRemoveTrackId}
        onToggleTrackId={handleToggleTrackId}
        hasTracksData={Boolean(currentTracksMap)}
      />

      {/* Hotkeys Help Modal */}
      <HotkeysModal isOpen={isHotkeysModalOpen} onClose={onCloseHotkeysModal} />
    </div>
  );
};

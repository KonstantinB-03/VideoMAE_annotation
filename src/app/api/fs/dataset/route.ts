import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { VideoItem, FrameInfo, AnnotationsDatabase, VideoMeta } from '@/types';
import { parseFrameFilename } from '@/lib/formatters';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const datasetPath = searchParams.get('path');

    if (!datasetPath) {
      return new Response(JSON.stringify({ error: 'Missing path query parameter.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resolvedPath = path.resolve(datasetPath);
    if (!fs.existsSync(resolvedPath)) {
      return new Response(JSON.stringify({ error: `Directory not found: ${resolvedPath}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return new Response(JSON.stringify({ error: `Path is not a directory: ${resolvedPath}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Read annotations.json if present
    const annotationsFile = path.join(resolvedPath, 'annotations.json');
    let annotationsDb: AnnotationsDatabase = {
      version: '1.0',
      updated_at: new Date().toISOString(),
      videos: {},
    };

    if (fs.existsSync(annotationsFile)) {
      try {
        const raw = fs.readFileSync(annotationsFile, 'utf-8');
        annotationsDb = JSON.parse(raw);
      } catch (err) {
        console.warn('Could not read existing annotations.json:', err);
      }
    }

    // Scan directories
    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const videoDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));

    const videos: VideoItem[] = [];

    for (const dir of videoDirs) {
      const videoDirPath = path.join(resolvedPath, dir.name);
      const files = fs.readdirSync(videoDirPath);

      // Map: index -> { frame, mtime } to deduplicate in case old files exist
      const frameMap = new Map<number, { frame: FrameInfo; mtime: number }>();

      for (const file of files) {
        const parsed = parseFrameFilename(file);
        if (parsed) {
          const filePath = path.join(videoDirPath, file);
          let mtime = 0;
          try {
            mtime = fs.statSync(filePath).mtimeMs;
          } catch {}

          const existing = frameMap.get(parsed.index);
          // Keep newest file if duplicate index exists
          if (!existing || mtime > existing.mtime) {
            frameMap.set(parsed.index, {
              mtime,
              frame: {
                index: parsed.index,
                ms: parsed.ms,
                filename: file,
                url: `/api/frame?videoPath=${encodeURIComponent(videoDirPath)}&frameFile=${encodeURIComponent(file)}`,
              },
            });
          }
        }
      }

      if (frameMap.size === 0) continue;

      const frames: FrameInfo[] = Array.from(frameMap.values()).map((item) => item.frame);

      // Sort frames strictly by index
      frames.sort((a, b) => a.index - b.index);

      // Check for detection tracks json (e.g. detection_data.json)
      const hasTracks = files.some(
        (f) =>
          (f === 'detection_data.json' || f === 'tracks.json' || f === 'detections.json' || f === 'track_data.json') ||
          (f.endsWith('.json') && f !== 'video_meta.json' && !f.startsWith('annotations'))
      );

      // Check for video_meta.json
      let meta: VideoMeta | undefined;
      const metaPath = path.join(videoDirPath, 'video_meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch {
          // ignore error
        }
      }

      const totalFrames = frames.length;
      const firstMs = frames[0]?.ms || 0;
      const lastMs = frames[totalFrames - 1]?.ms || 0;
      const durationMs = meta?.duration_ms || (lastMs - firstMs);
      const fps = meta?.avg_fps || (durationMs > 0 ? (totalFrames / (durationMs / 1000)) : 25);

      const videoAnnotations = annotationsDb.videos[dir.name]?.annotations || [];
      const annotationCount = videoAnnotations.length;

      videos.push({
        id: dir.name,
        name: dir.name,
        total_frames: totalFrames,
        duration_ms: durationMs,
        fps: Math.round(fps * 100) / 100,
        frames,
        annotationCount,
        isAnnotated: annotationCount > 0,
        meta,
        hasTracks,
      });
    }

    // Sort videos by name alphabetically
    videos.sort((a, b) => a.name.localeCompare(b.name));

    return new Response(
      JSON.stringify({
        datasetPath: resolvedPath,
        videos,
        annotations: annotationsDb,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

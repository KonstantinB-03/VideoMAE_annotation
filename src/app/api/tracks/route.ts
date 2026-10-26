import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { VideoTracksMap, DetectionTrack } from '@/types';

function findDetectionFile(videoDirPath: string): string | null {
  const commonNames = [
    'detection_data.json',
    'tracks.json',
    'detections.json',
    'track_data.json',
  ];

  for (const name of commonNames) {
    const candidate = path.join(videoDirPath, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback: search for any .json file in videoDirPath that is not metadata/annotations
  try {
    const files = fs.readdirSync(videoDirPath);
    for (const file of files) {
      if (
        file.endsWith('.json') &&
        file !== 'video_meta.json' &&
        !file.startsWith('annotations')
      ) {
        const full = path.join(videoDirPath, file);
        if (fs.statSync(full).isFile()) {
          return full;
        }
      }
    }
  } catch {}

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const videoPath = searchParams.get('videoPath');
    const datasetPath = searchParams.get('datasetPath');
    const videoId = searchParams.get('videoId');

    let resolvedVideoDir: string | null = null;

    if (videoPath) {
      resolvedVideoDir = path.resolve(videoPath);
    } else if (datasetPath && videoId) {
      resolvedVideoDir = path.resolve(datasetPath, videoId);
    }

    if (!resolvedVideoDir || !fs.existsSync(resolvedVideoDir)) {
      return new Response(
        JSON.stringify({ hasTracks: false, tracks: {}, error: 'Video folder not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const detectionFilePath = findDetectionFile(resolvedVideoDir);

    if (!detectionFilePath) {
      return new Response(
        JSON.stringify({ hasTracks: false, tracks: {} }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, max-age=60',
          },
        }
      );
    }

    const raw = fs.readFileSync(detectionFilePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, DetectionTrack[]>;

    return new Response(
      JSON.stringify({
        hasTracks: true,
        tracksFile: path.basename(detectionFilePath),
        tracks: parsed,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=120',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ hasTracks: false, tracks: {}, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

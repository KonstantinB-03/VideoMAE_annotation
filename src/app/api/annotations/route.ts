import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { AnnotationsDatabase } from '@/types';

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

    const annotationsFile = path.resolve(datasetPath, 'annotations.json');

    if (!fs.existsSync(annotationsFile)) {
      const defaultDb: AnnotationsDatabase = {
        version: '1.0',
        updated_at: new Date().toISOString(),
        videos: {},
      };
      return new Response(JSON.stringify(defaultDb), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const raw = fs.readFileSync(annotationsFile, 'utf-8');
    const db: AnnotationsDatabase = JSON.parse(raw);

    return new Response(JSON.stringify(db), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { datasetPath, annotations } = body as {
      datasetPath: string;
      annotations: AnnotationsDatabase;
    };

    if (!datasetPath || !annotations) {
      return new Response(JSON.stringify({ error: 'Missing datasetPath or annotations data.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resolvedDir = path.resolve(datasetPath);
    if (!fs.existsSync(resolvedDir)) {
      return new Response(JSON.stringify({ error: `Directory not found: ${resolvedDir}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const annotationsFile = path.join(resolvedDir, 'annotations.json');
    const tmpFile = path.join(resolvedDir, `annotations_${Date.now()}.tmp`);

    // Ensure timestamp is current
    annotations.updated_at = new Date().toISOString();
    if (!annotations.version) {
      annotations.version = '1.0';
    }

    // Write to tmp and rename atomically
    const jsonStr = JSON.stringify(annotations, null, 2);
    fs.writeFileSync(tmpFile, jsonStr, 'utf-8');
    fs.renameSync(tmpFile, annotationsFile);

    return new Response(
      JSON.stringify({
        success: true,
        updated_at: annotations.updated_at,
        file: annotationsFile,
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

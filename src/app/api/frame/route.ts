import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const videoPath = searchParams.get('videoPath'); // e.g. "D:/dataset/cctv_entrance_01" or relative to dataset
    const frameFile = searchParams.get('frameFile'); // e.g. "frame_000120_ms00004000.jpg"

    if (!videoPath || !frameFile) {
      return new Response('Missing videoPath or frameFile parameter', { status: 400 });
    }

    // Security check: prohibit path traversal in frameFile
    const sanitizedFrameFile = path.basename(frameFile);
    if (sanitizedFrameFile !== frameFile) {
      return new Response('Invalid frame filename', { status: 400 });
    }

    const fullPath = path.resolve(videoPath, sanitizedFrameFile);

    // Verify existence
    if (!fs.existsSync(fullPath)) {
      return new Response(`Frame not found: ${sanitizedFrameFile}`, { status: 404 });
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      return new Response('Target is not a file', { status: 400 });
    }

    // Determine MIME type
    const ext = path.extname(sanitizedFrameFile).toLowerCase();
    let contentType = 'image/jpeg';
    if (ext === '.webp') {
      contentType = 'image/webp';
    } else if (ext === '.png') {
      contentType = 'image/png';
    }

    // Stream file with node stream -> web stream
    const nodeStream = fs.createReadStream(fullPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    return new Response(`Error reading frame: ${error.message}`, { status: 500 });
  }
}

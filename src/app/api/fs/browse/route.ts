import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetPath = searchParams.get('dir');

    // If no path specified, list common root paths (Windows drives or cwd)
    if (!targetPath) {
      const drives: string[] = [];
      if (process.platform === 'win32') {
        const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ';
        for (const letter of letters) {
          const root = `${letter}:\\`;
          try {
            if (fs.existsSync(root)) {
              drives.push(root);
            }
          } catch {
            // Ignore unmounted drives
          }
        }
      }
      return new Response(
        JSON.stringify({
          current: process.cwd(),
          parent: null,
          drives,
          directories: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
      return new Response(JSON.stringify({ error: `Directory not found: ${resolved}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return new Response(JSON.stringify({ error: 'Not a directory' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const directories = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('$') && !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        path: path.join(resolved, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(resolved);

    return new Response(
      JSON.stringify({
        current: resolved,
        parent: parent !== resolved ? parent : null,
        directories,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

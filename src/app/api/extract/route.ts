import { NextRequest } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

// Store reference to active extraction process for cancellation
let activeProcess: ChildProcess | null = null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, inputFolder, outputFolder, maxRes = '720', format = 'jpeg', quality, overwrite = false } = body;

    // Handle cancel action
    if (action === 'cancel') {
      if (activeProcess && !activeProcess.killed) {
        activeProcess.kill('SIGTERM');
        activeProcess = null;
        return new Response(JSON.stringify({ status: 'cancelled', message: 'Extraction process cancelled.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ status: 'idle', message: 'No active extraction to cancel.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!inputFolder || !outputFolder) {
      return new Response(JSON.stringify({ error: 'Пожалуйста, укажите обе папки: с исходными видео и папку для сохранения датасета.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if input path exists
    const resolvedInput = path.resolve(inputFolder.trim());
    if (!fs.existsSync(resolvedInput)) {
      return new Response(
        JSON.stringify({
          error: `Входная папка не существует: "${resolvedInput}". Пожалуйста, проверьте путь к папке с видео.`,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Resolve script path
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'extract_frames.py');
    if (!fs.existsSync(scriptPath)) {
      return new Response(JSON.stringify({ error: `Worker script not found at: ${scriptPath}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build python CLI arguments
    const args = [
      scriptPath,
      '--input', inputFolder.trim(),
      '--output_dir', outputFolder.trim(),
      '--max_res', String(maxRes),
      '--format', format,
    ];

    if (quality) {
      args.push('--quality', String(quality));
    }
    if (overwrite) {
      args.push('--overwrite');
    }

    // Kill any existing run
    if (activeProcess && !activeProcess.killed) {
      activeProcess.kill('SIGTERM');
    }

    // Resolve Python interpreter: check local .venv / venv first, then PYTHON_PATH env, then system python
    const venvPaths = [
      process.env.PYTHON_PATH,
      path.resolve(process.cwd(), '.venv', 'Scripts', 'python.exe'),
      path.resolve(process.cwd(), 'venv', 'Scripts', 'python.exe'),
      path.resolve(process.cwd(), '.venv', 'bin', 'python'),
      path.resolve(process.cwd(), 'venv', 'bin', 'python'),
    ].filter(Boolean) as string[];

    let pythonCmd = 'python';
    let isVenvFound = false;
    for (const p of venvPaths) {
      if (fs.existsSync(p)) {
        pythonCmd = p;
        isVenvFound = true;
        break;
      }
    }

    // Create ReadableStream for SSE
    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (data: any) => {
          try {
            const payload = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(new TextEncoder().encode(payload));
          } catch {
            // Controller might be closed
          }
        };

        const proc = spawn(pythonCmd, args, {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8',
          },
          shell: false,
        });

        activeProcess = proc;

        sendEvent({
          status: 'started',
          command: `${pythonCmd} ${args.join(' ')}`,
          message: isVenvFound
            ? `Воркер запущен с использованием локального виртуального окружения: ${pythonCmd}`
            : `Внимание: Локальный .venv не найден, запуск через системный "${pythonCmd}". Если библиотек нет, выполните setup.bat.`,
        });

        let lineBuffer = '';

        proc.stdout.on('data', (chunk: Buffer) => {
          lineBuffer += chunk.toString('utf-8');
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const jsonMsg = JSON.parse(trimmed);
              sendEvent(jsonMsg);
            } catch {
              // Non-json stdout fallback
              sendEvent({ status: 'log', raw: trimmed, message: trimmed });
            }
          }
        });

        proc.stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8');
          sendEvent({ status: 'stderr', text, message: text });
        });

        proc.on('error', (err) => {
          sendEvent({ status: 'fatal_error', message: `Ошибка запуска воркера: ${err.message}` });
          activeProcess = null;
          controller.close();
        });

        proc.on('close', (code) => {
          if (lineBuffer.trim()) {
            try {
              sendEvent(JSON.parse(lineBuffer.trim()));
            } catch {
              sendEvent({ status: 'log', raw: lineBuffer.trim(), message: lineBuffer.trim() });
            }
          }
          sendEvent({
            status: 'exit',
            code,
            message:
              code === 0
                ? 'Обработка успешно завершена.'
                : `Воркер завершился с кодом ошибки ${code}. Проверьте сообщения выше и зависимости в .venv.`,
          });
          activeProcess = null;
          controller.close();
        });
      },
      cancel() {
        if (activeProcess && !activeProcess.killed) {
          activeProcess.kill('SIGTERM');
          activeProcess = null;
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

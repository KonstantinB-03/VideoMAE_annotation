'use client';

import React, { useRef, useEffect } from 'react';
import { Terminal, Trash2, Copy, Check } from 'lucide-react';

interface TerminalLogProps {
  logs: string[];
  onClear: () => void;
}

export const TerminalLog: React.FC<TerminalLogProps> = ({ logs, onClear }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner flex flex-col h-72">
      {/* Terminal Title Bar */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <Terminal className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-mono font-medium text-slate-300">Логи фонового Python-воркера</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
            Decord IPC
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
            title="Скопировать логи"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Скопировано' : 'Копировать'}</span>
          </button>
          <button
            onClick={onClear}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
            title="Очистить терминал"
          >
            <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-400" />
            <span>Очистить</span>
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div
        ref={containerRef}
        className="p-4 overflow-y-auto font-mono text-xs text-slate-300 space-y-1 select-text flex-1"
      >
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">Ожидание запуска обработки видео...</div>
        ) : (
          logs.map((log, idx) => {
            const isError = log.includes('error') || log.includes('Error') || log.includes('fatal');
            const isSuccess = log.includes('completed') || log.includes('Completed') || log.includes('finished');
            const isProgress = log.includes('%') || log.includes('Processing');

            let colorClass = 'text-slate-300';
            if (isError) colorClass = 'text-red-400';
            else if (isSuccess) colorClass = 'text-emerald-400';
            else if (isProgress) colorClass = 'text-blue-300';

            return (
              <div key={idx} className={`leading-relaxed whitespace-pre-wrap break-all ${colorClass}`}>
                <span className="text-slate-600 select-none mr-2">›</span>
                {log}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

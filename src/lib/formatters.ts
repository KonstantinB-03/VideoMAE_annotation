/**
 * Format milliseconds into MM:SS.mmm format for CCTV timecode display
 */
export function formatMilliseconds(ms: number): string {
  if (isNaN(ms) || ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');

  return `${mm}:${ss}.${mmm}`;
}

/**
 * Format duration in seconds with 2 decimal places: e.g. "3.00s"
 */
export function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec < 0) sec = 0;
  return `${sec.toFixed(2)}s`;
}

/**
 * Parse frame filename: frame_000142_ms00005680.jpg -> { index: 142, ms: 5680 }
 */
export function parseFrameFilename(filename: string): { index: number; ms: number } | null {
  const match = filename.match(/^frame_(\d{6})_ms(\d{8})\.(jpg|jpeg|webp)$/i);
  if (!match) return null;
  return {
    index: parseInt(match[1], 10),
    ms: parseInt(match[2], 10),
  };
}

/**
 * Generate a unique ID for annotations
 */
export function generateAnnotationId(): string {
  const hex = Math.random().toString(16).substring(2, 10);
  return `ann_${hex}`;
}

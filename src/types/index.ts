export type LabelType = 'normal' | 'shoplifting' | 'unassigned';

export interface DetectionTrack {
  track_id: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  confidence?: number;
}

export type VideoTracksMap = Record<string, DetectionTrack[]>;

export interface IntervalAnnotation {
  id: string;
  label: LabelType;
  start_frame: number;
  end_frame: number;
  start_ms: number;
  end_ms: number;
  duration_sec: number;
  start_frame_file: string;
  end_frame_file: string;
  track_ids?: number[];
}

export interface VideoAnnotationRecord {
  total_frames: number;
  annotations: IntervalAnnotation[];
}

export interface AnnotationsDatabase {
  version: string;
  updated_at: string;
  videos: Record<string, VideoAnnotationRecord>;
}

export interface FrameInfo {
  index: number;
  ms: number;
  filename: string;
  url: string;
}

export interface VideoMeta {
  video_name: string;
  source_file?: string;
  total_frames: number;
  avg_fps?: number;
  original_resolution?: [number, number];
  extracted_resolution?: [number, number];
  format?: string;
  duration_ms?: number;
  created_at?: string;
}

export interface VideoItem {
  id: string; // folder name / video name
  name: string;
  total_frames: number;
  duration_ms: number;
  fps: number;
  frames: FrameInfo[];
  annotationCount: number;
  isAnnotated: boolean;
  meta?: VideoMeta;
  hasTracks?: boolean;
}

export interface ExtractionWorkerProgress {
  status: 'progress' | 'video_started' | 'video_info' | 'video_completed' | 'batch_started' | 'batch_completed' | 'error' | 'fatal_error';
  video?: string;
  video_index?: number;
  total_videos?: number;
  current_frame?: number;
  total_frames?: number;
  percent?: number;
  fps?: number;
  original_res?: [number, number];
  target_res?: [number, number];
  format?: string;
  message?: string;
  error?: string;
  successful?: number;
  failed?: number;
  output_dir?: string;
  max_cap?: number | null;
}

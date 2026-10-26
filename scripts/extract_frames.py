#!/usr/bin/env python3
"""
scripts/extract_frames.py

High-performance video frame extraction worker using Decord.
Handles Variable Frame Rate (VFR) and corrupted timestamps typical of CCTV cameras.
Extracts frames, calculates precise milliseconds (PTS), downscales if needed,
and outputs real-time JSON progress lines to stdout.
"""

import argparse
import gc
import json
import os
import sys
import time
from pathlib import Path

# Ensure UTF-8 output and line buffering for real-time IPC
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", line_buffering=True)

try:
    import numpy as np
    from decord import VideoReader, cpu
    from PIL import Image
except ImportError as err:
    sys.stderr.write(f"Missing required Python dependencies: {err}\n")
    sys.stderr.write("Please run: pip install -r scripts/requirements.txt\n")
    sys.exit(1)

SUPPORTED_EXTENSIONS = {".mp4", ".avi", ".mkv", ".mov", ".flv", ".wmv", ".webm", ".ts", ".m4v"}


def emit_json(data: dict):
    """Write single-line JSON to stdout and flush immediately."""
    sys.stdout.write(json.dumps(data, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def compute_target_dimensions(width: int, height: int, max_cap: int | None):
    """
    Downscale proportionally if the larger side exceeds max_cap.
    Returns (new_width, new_height).
    """
    if not max_cap or max_cap <= 0:
        return width, height

    max_side = max(width, height)
    if max_side <= max_cap:
        return width, height

    scale = max_cap / float(max_side)
    new_w = max(1, int(round(width * scale)))
    new_h = max(1, int(round(height * scale)))
    # Ensure even dimensions (common standard)
    if new_w % 2 != 0:
        new_w += 1
    if new_h % 2 != 0:
        new_h += 1
    return new_w, new_h


def extract_cctv_frame_timestamps(video_path: Path, total_frames: int, vr) -> tuple[list[float], float]:
    """
    Extract exact physical timestamps for CCTV video files.
    Solves the problem of CCTV DVRs writing false metadata (e.g. 60 FPS in AVI headers
    while actual video contains 20 FPS with 0-byte drop frames, or corrupted PTS).
    Returns (clean_pts_in_seconds, real_fps).
    """
    import struct
    ext = video_path.suffix.lower()

    # 1. Check for AVI container with idx1 index table (standard for CCTV DVRs)
    if ext == ".avi":
        try:
            with open(video_path, "rb") as fp:
                header = fp.read(4096)
                idx_avih = header.find(b"avih")
                if idx_avih != -1:
                    size = struct.unpack("<I", header[idx_avih + 4 : idx_avih + 8])[0]
                    avih = header[idx_avih + 8 : idx_avih + 8 + size]
                    us_per_frame, max_bps, pad, flags, total_avi_frames = struct.unpack("<IIIII", avih[:20])

                    fp.seek(0, os.SEEK_END)
                    fsize = fp.tell()
                    tail_read = min(fsize, max(256 * 1024, total_avi_frames * 16 + 4096))
                    fp.seek(fsize - tail_read)
                    tail = fp.read()
                    idx_idx1 = tail.find(b"idx1")
                    if idx_idx1 != -1:
                        idx_size = struct.unpack("<I", tail[idx_idx1 + 4 : idx_idx1 + 8])[0]
                        raw = tail[idx_idx1 + 8 : idx_idx1 + 8 + idx_size]
                        num_entries = len(raw) // 16
                        pts_seconds = []
                        for i in range(num_entries):
                            fourcc, flags, offset, length = struct.unpack("<4sIII", raw[i * 16 : (i + 1) * 16])
                            if length > 0:
                                sec = (i * us_per_frame) / 1000000.0
                                pts_seconds.append(sec)

                        if len(pts_seconds) == total_frames or abs(len(pts_seconds) - total_frames) <= 3:
                            while len(pts_seconds) < total_frames:
                                pts_seconds.append(pts_seconds[-1] + (us_per_frame / 1000000.0))
                            clean_pts = pts_seconds[:total_frames]
                            duration = clean_pts[-1] if len(clean_pts) > 0 else 1.0
                            real_fps = float(total_frames) / duration if duration > 0 else 25.0
                            return clean_pts, real_fps
        except Exception as e:
            sys.stderr.write(f"Note: AVI idx1 parse skipped: {e}\n")

    # 2. Check for MP4/MOV container mvhd box for container duration
    if ext in (".mp4", ".mov", ".m4v"):
        try:
            with open(video_path, "rb") as fp:
                head = fp.read(64 * 1024)
                mvhd_idx = head.find(b"mvhd")
                if mvhd_idx != -1:
                    mvhd = head[mvhd_idx + 4 : mvhd_idx + 4 + 32]
                    version = mvhd[0]
                    if version == 0:
                        timescale, duration = struct.unpack(">II", mvhd[12:20])
                    else:
                        timescale, duration = struct.unpack(">IQ", mvhd[20:32])
                    if timescale > 0 and duration > 0:
                        container_sec = float(duration) / float(timescale)
                        real_fps = float(total_frames) / container_sec
                        clean_pts = [float(i) / real_fps for i in range(total_frames)]
                        return clean_pts, real_fps
        except Exception:
            pass

    # 3. Try Decord get_frame_timestamp
    try:
        raw_ts = vr.get_frame_timestamp(range(total_frames))
        if hasattr(raw_ts, "shape") and len(raw_ts.shape) >= 2:
            pts = raw_ts[:, 0]
        elif hasattr(raw_ts, "shape") and len(raw_ts.shape) == 1:
            pts = raw_ts
        else:
            pts = np.array([row[0] for row in raw_ts], dtype=np.float64)

        if len(pts) == total_frames and np.all(pts >= 0) and np.all(pts < 1e6) and not np.all(np.isnan(pts)):
            if pts[-1] > 0 and pts[-1] > pts[0]:
                duration = float(pts[-1])
                real_fps = float(total_frames) / duration
                return [float(p) for p in pts], real_fps
    except Exception:
        pass

    # 4. Fallback: check avg_fps
    avg_fps = float(vr.get_avg_fps()) if vr.get_avg_fps() > 0 else 25.0
    clean_pts = [float(i) / avg_fps for i in range(total_frames)]
    return clean_pts, avg_fps


def process_single_video(
    video_path: Path,
    output_base_dir: Path,
    max_cap: int | None,
    image_format: str,
    quality: int,
    video_index: int,
    total_videos: int,
    overwrite: bool = False,
):
    video_name = video_path.stem
    video_filename = video_path.name
    target_folder = output_base_dir / video_name

    emit_json({
        "status": "video_started",
        "video": video_filename,
        "video_index": video_index,
        "total_videos": total_videos,
        "current_frame": 0,
        "total_frames": 0,
        "percent": 0.0,
        "message": f"Opening video {video_filename} with Decord..."
    })

    target_folder.mkdir(parents=True, exist_ok=True)

    vr = None
    try:
        vr = VideoReader(str(video_path), ctx=cpu(0))
        total_frames = len(vr)
        if total_frames <= 0:
            raise ValueError(f"Video {video_filename} contains 0 frames.")

        clean_pts, avg_fps = extract_cctv_frame_timestamps(video_path, total_frames, vr)

        # Inspect first frame for original dimensions
        sample_frame = vr[0].asnumpy()
        orig_h, orig_w = sample_frame.shape[:2]
        target_w, target_h = compute_target_dimensions(orig_w, orig_h, max_cap)
        needs_resize = (target_w != orig_w) or (target_h != orig_h)

        ext = ".webp" if image_format.lower() == "webp" else ".jpg"
        pil_format = "WEBP" if image_format.lower() == "webp" else "JPEG"

        emit_json({
            "status": "video_info",
            "video": video_filename,
            "video_index": video_index,
            "total_videos": total_videos,
            "current_frame": 0,
            "total_frames": total_frames,
            "percent": 0.0,
            "fps": round(avg_fps, 2),
            "original_res": [orig_w, orig_h],
            "target_res": [target_w, target_h],
            "format": pil_format,
            "message": f"Processing {total_frames} frames ({orig_w}x{orig_h} -> {target_w}x{target_h})..."
        })

        # Save metadata file
        meta_file = target_folder / "video_meta.json"
        video_meta = {
            "video_name": video_name,
            "source_file": video_filename,
            "total_frames": total_frames,
            "avg_fps": round(avg_fps, 2),
            "original_resolution": [orig_w, orig_h],
            "extracted_resolution": [target_w, target_h],
            "format": pil_format.lower(),
            "duration_ms": int(clean_pts[-1] * 1000) if clean_pts else 0,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(video_meta, f, indent=2)

        last_progress_emit = time.time()
        last_progress_frame = 0

        for idx in range(total_frames):
            ms = int(clean_pts[idx] * 1000)
            filename = f"frame_{idx:06d}_ms{ms:08d}{ext}"
            frame_filepath = target_folder / filename

            # Remove any stale frame files with different timestamps for this index
            for stale in target_folder.glob(f"frame_{idx:06d}_ms*"):
                if stale.name != filename:
                    try:
                        stale.unlink()
                    except Exception:
                        pass

            if not overwrite and frame_filepath.exists() and frame_filepath.stat().st_size > 0:
                pass  # Skip if already exists
            else:
                frame_arr = vr[idx].asnumpy()
                img = Image.fromarray(frame_arr)
                if needs_resize:
                    img = img.resize((target_w, target_h), Image.Resampling.BILINEAR)

                save_kwargs = {"quality": quality}
                if pil_format == "WEBP":
                    save_kwargs["method"] = 4  # Balanced speed/compression
                img.save(frame_filepath, format=pil_format, **save_kwargs)

            # Emit progress update periodically or at milestones
            curr = idx + 1
            now = time.time()
            if curr == 1 or curr == total_frames or (now - last_progress_emit >= 0.25) or (curr - last_progress_frame >= 25):
                percent = round((curr / total_frames) * 100.0, 1)
                emit_json({
                    "status": "progress",
                    "video": video_filename,
                    "video_index": video_index,
                    "total_videos": total_videos,
                    "current_frame": curr,
                    "total_frames": total_frames,
                    "percent": percent,
                })
                last_progress_emit = now
                last_progress_frame = curr

        emit_json({
            "status": "video_completed",
            "video": video_filename,
            "video_index": video_index,
            "total_videos": total_videos,
            "current_frame": total_frames,
            "total_frames": total_frames,
            "percent": 100.0,
            "message": f"Completed {video_filename} ({total_frames} frames)."
        })
        return True

    except Exception as e:
        emit_json({
            "status": "error",
            "video": video_filename,
            "video_index": video_index,
            "total_videos": total_videos,
            "current_frame": 0,
            "total_frames": 0,
            "percent": 0.0,
            "error": str(e),
            "message": f"Error processing {video_filename}: {e}"
        })
        import traceback
        traceback.print_exc(file=sys.stderr)
        return False

    finally:
        if vr is not None:
            del vr
        gc.collect()


def main():
    parser = argparse.ArgumentParser(description="Extract frames from CCTV videos using Decord.")
    parser.add_argument("--input", "-i", required=True, help="Input video file or folder with videos")
    parser.add_argument("--output_dir", "-o", required=True, help="Output folder for extracted frames dataset")
    parser.add_argument("--max_res", default="720", help="Max resolution cap: '720', '1080', 'original' or integer")
    parser.add_argument("--format", "-f", default="jpeg", choices=["jpeg", "jpg", "webp"], help="Image format")
    parser.add_argument("--quality", "-q", type=int, default=None, help="Image quality (default 90 for JPEG, 85 for WebP)")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing frames")

    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()

    if not input_path.exists():
        emit_json({"status": "fatal_error", "message": f"Input path does not exist: {input_path}"})
        sys.exit(1)

    # Determine max cap integer
    max_cap = None
    if str(args.max_res).lower() == "720" or str(args.max_res).lower() == "720p":
        max_cap = 1280
    elif str(args.max_res).lower() == "1080" or str(args.max_res).lower() == "1080p":
        max_cap = 1920
    elif str(args.max_res).lower() in ("original", "none", "0"):
        max_cap = None
    else:
        try:
            max_cap = int(args.max_res)
        except ValueError:
            max_cap = None

    # Format & quality
    img_fmt = "webp" if args.format.lower() == "webp" else "jpeg"
    if args.quality is not None:
        quality = args.quality
    else:
        quality = 85 if img_fmt == "webp" else 90

    # Collect video files
    video_files = []
    if input_path.is_file():
        video_files.append(input_path)
    elif input_path.is_dir():
        for root, _, files in os.walk(input_path):
            for file in files:
                fpath = Path(root) / file
                if fpath.suffix.lower() in SUPPORTED_EXTENSIONS:
                    video_files.append(fpath)
        video_files.sort(key=lambda p: p.name.lower())

    if not video_files:
        emit_json({
            "status": "fatal_error",
            "message": f"No supported video files found in {input_path}. Supported formats: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        })
        sys.exit(1)

    total_videos = len(video_files)
    emit_json({
        "status": "batch_started",
        "total_videos": total_videos,
        "output_dir": str(output_dir),
        "max_cap": max_cap,
        "format": img_fmt,
        "quality": quality,
        "message": f"Found {total_videos} video(s) to process."
    })

    successful = 0
    for idx, video_path in enumerate(video_files, start=1):
        ok = process_single_video(
            video_path=video_path,
            output_base_dir=output_dir,
            max_cap=max_cap,
            image_format=img_fmt,
            quality=quality,
            video_index=idx,
            total_videos=total_videos,
            overwrite=args.overwrite,
        )
        if ok:
            successful += 1

    emit_json({
        "status": "batch_completed",
        "total_videos": total_videos,
        "successful": successful,
        "failed": total_videos - successful,
        "message": f"Finished batch processing: {successful}/{total_videos} videos succeeded."
    })


if __name__ == "__main__":
    main()

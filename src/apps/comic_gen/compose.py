"""Composition enhancements.

1. Whisper subtitle chain: episode audio track concat → whisper-cli
   (with Silero VAD) → SRT → optional LLM correction → ASS burn-in.
2. Opening title / ending text overlays via ffmpeg drawtext.
3. Poster cover: embed a composed cover image as mp4 attached_pic.

All heavy lifting is ffmpeg/whisper-cli subprocess work; no new Python
dependencies are required.
"""
import os
import re
import glob
import platform
import subprocess
from typing import List, Optional, Tuple

from ...utils import get_logger
from ...utils.system_check import get_ffmpeg_path

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Binary / model discovery
# ---------------------------------------------------------------------------

def _bin_dir() -> str:
    """Directory containing bundled binaries (bin/ffmpeg.exe convention)."""
    if getattr(__import__("sys"), "frozen", False):
        import sys
        return os.path.join(os.path.dirname(sys.executable), "bin")
    return os.path.join(os.getcwd(), "bin")


def get_ffprobe_path() -> Optional[str]:
    """Find ffprobe next to the resolved ffmpeg, or on PATH."""
    ffmpeg = get_ffmpeg_path()
    if ffmpeg:
        sibling = os.path.join(os.path.dirname(ffmpeg), "ffprobe.exe" if platform.system() == "Windows" else "ffprobe")
        if os.path.isfile(sibling):
            return sibling
    import shutil
    return shutil.which("ffprobe")


def find_whisper_cli() -> Optional[str]:
    """Locate whisper-cli.exe: bin/whisper/, then PATH."""
    name = "whisper-cli.exe" if platform.system() == "Windows" else "whisper-cli"
    local = os.path.join(_bin_dir(), "whisper", name)
    if os.path.isfile(local):
        return local
    import shutil
    return shutil.which(name)


def find_whisper_model() -> Optional[str]:
    """Find a ggml whisper model under bin/whisper/models/ (prefer mid-size)."""
    model_dir = os.path.join(_bin_dir(), "whisper", "models")
    if not os.path.isdir(model_dir):
        return None
    priority = ["large-v3-t", "large-v3", "medium", "small", "base", "tiny"]
    for key in priority:
        hits = sorted(glob.glob(os.path.join(model_dir, f"ggml-{key}*.bin")))
        if hits:
            return hits[0]
    # Any ggml bin that is not a VAD model
    for hit in sorted(glob.glob(os.path.join(model_dir, "*.bin"))):
        if "vad" not in os.path.basename(hit).lower():
            return hit
    return None


def find_vad_model() -> Optional[str]:
    """Find the Silero VAD ggml model under bin/whisper/models/."""
    model_dir = os.path.join(_bin_dir(), "whisper", "models")
    if not os.path.isdir(model_dir):
        return None
    for hit in sorted(glob.glob(os.path.join(model_dir, "*silero*vad*.bin")), reverse=True):
        return hit
    for hit in sorted(glob.glob(os.path.join(model_dir, "*vad*.bin")), reverse=True):
        return hit
    return None


def subtitle_tool_status() -> dict:
    """Aggregate availability report for the settings/subtitle UI."""
    return {
        "whisper_cli": find_whisper_cli(),
        "whisper_model": find_whisper_model(),
        "vad_model": find_vad_model(),
    }


# ---------------------------------------------------------------------------
# ffmpeg / ffprobe helpers
# ---------------------------------------------------------------------------

def _run(cmd: List[str], timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, timeout=timeout)


def probe_duration(media_path: str) -> float:
    """Return media duration in seconds via ffprobe (fallback: ffmpeg)."""
    ffprobe = get_ffprobe_path()
    if ffprobe:
        try:
            r = _run([ffprobe, "-v", "error", "-show_entries", "format=duration",
                      "-of", "default=noprint_wrappers=1:nokey=1", media_path], timeout=30)
            if r.returncode == 0:
                return float(r.stdout.decode().strip())
        except (ValueError, subprocess.SubprocessError):
            pass
    # Fallback: parse ffmpeg stderr "Duration: 00:00:12.34"
    ffmpeg = get_ffmpeg_path()
    if ffmpeg:
        try:
            r = _run([ffmpeg, "-i", media_path], timeout=30)
            m = re.search(rb"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", r.stderr)
            if m:
                h, mi, s = m.groups()
                return int(h) * 3600 + int(mi) * 60 + float(s)
        except subprocess.SubprocessError:
            pass
    return 0.0


def probe_dimensions(media_path: str) -> Tuple[int, int]:
    """Return (width, height) of a video via ffprobe."""
    ffprobe = get_ffprobe_path()
    if ffprobe:
        try:
            r = _run([ffprobe, "-v", "error", "-select_streams", "v:0",
                      "-show_entries", "stream=width,height",
                      "-of", "default=noprint_wrappers=1:nokey=1", media_path], timeout=30)
            if r.returncode == 0:
                lines = [ln.strip() for ln in r.stdout.decode().splitlines() if ln.strip()]
                if len(lines) >= 2:
                    return int(float(lines[0])), int(float(lines[1]))
        except (ValueError, subprocess.SubprocessError):
            pass
    return 1920, 1080


def _has_audio_stream(media_path: str) -> bool:
    ffprobe = get_ffprobe_path()
    if not ffprobe:
        return True  # assume present; ffmpeg will fail later if not
    try:
        r = _run([ffprobe, "-v", "error", "-select_streams", "a",
                  "-show_entries", "stream=codec_type", media_path], timeout=30)
        return r.returncode == 0 and b"audio" in r.stdout
    except subprocess.SubprocessError:
        return True


_FONT_CANDIDATES = [
    "C:/Windows/Fonts/msyhbd.ttc",   # 微软雅黑 Bold
    "C:/Windows/Fonts/msyh.ttc",     # 微软雅黑
    "C:/Windows/Fonts/simhei.ttf",   # 黑体
    "C:/Windows/Fonts/simsun.ttc",   # 宋体
    "C:/Windows/Fonts/arial.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def find_font() -> str:
    for path in _FONT_CANDIDATES:
        if os.path.isfile(path):
            return path
    return "Arial"


def _escape_drawtext(text: str) -> str:
    """Escape a string for use inside an ffmpeg drawtext text= value."""
    text = text.replace("\\", "\\\\")
    text = text.replace(":", "\\:")
    text = text.replace("'", "\\'")
    text = text.replace("%", "\\%")
    text = text.replace("\n", " ")
    return text


def _escape_filter_path(path: str) -> str:
    """Escape a Windows path for use inside a filtergraph argument."""
    path = path.replace("\\", "/")
    path = path.replace(":", "\\:")
    path = path.replace("'", "\\'")
    return path


# ---------------------------------------------------------------------------
# Episode audio track (for whisper)
# ---------------------------------------------------------------------------

def collect_merge_video_paths(script) -> List[str]:
    """Mirror merge_videos selection logic: dubbed > selected > default completed.

    Returns absolute paths for files that exist locally (remote/OSS entries skipped).
    """
    from .pipeline import _safe_resolve_path

    paths: List[str] = []
    for frame in script.frames:
        candidates: List[str] = []
        if frame.dubbed_video_url:
            candidates.append(frame.dubbed_video_url)
        if frame.selected_video_id:
            video = next((v for v in script.video_tasks if v.id == frame.selected_video_id), None)
            if video and video.video_url:
                candidates.append(video.video_url)
        if not candidates:
            default_video = next(
                (v for v in script.video_tasks if v.frame_id == frame.id and v.status == "completed"),
                None,
            )
            if default_video and default_video.video_url:
                candidates.append(default_video.video_url)
        for rel in candidates:
            if rel and not rel.startswith("http") and not is_remote_key(rel):
                abs_path = _safe_resolve_path("output", rel)
                if os.path.exists(abs_path):
                    paths.append(abs_path)
                    break
        else:
            paths.append("")  # placeholder keeps timing aligned via frame.duration
    return paths


def is_remote_key(rel: str) -> bool:
    """True when the stored URL is an OSS object key (remote asset)."""
    try:
        from ...utils.oss_utils import is_object_key
        return is_object_key(rel)
    except Exception:
        return False


def build_episode_audio(script, workdir: str) -> Optional[str]:
    """Concat per-frame audio into a single 16kHz mono wav for whisper.

    Frames without a local audio source contribute silence for
    frame.duration (or the probed video duration when available), keeping
    the subtitle timeline aligned with the merged video.
    """
    ffmpeg = get_ffmpeg_path()
    if not ffmpeg:
        raise RuntimeError("FFmpeg not found; cannot build episode audio track.")

    os.makedirs(workdir, exist_ok=True)
    seg_paths: List[str] = []

    video_paths = collect_merge_video_paths(script)
    for idx, frame in enumerate(script.frames):
        seg_path = os.path.join(workdir, f"seg_{idx:04d}.wav")
        src = video_paths[idx] if idx < len(video_paths) else ""
        ok = False
        if src and os.path.exists(src):
            if _has_audio_stream(src):
                r = _run([
                    ffmpeg, "-y", "-i", src,
                    "-vn", "-ac", "1", "-ar", "16000",
                    "-acodec", "pcm_s16le", seg_path,
                ], timeout=300)
                ok = r.returncode == 0 and os.path.exists(seg_path)
            if not ok:
                dur = probe_duration(src) or float(frame.duration or 5.0)
                r = _run([
                    ffmpeg, "-y", "-f", "lavfi",
                    "-i", "anullsrc=r=16000:cl=mono", "-t", f"{dur:.3f}",
                    "-acodec", "pcm_s16le", seg_path,
                ], timeout=120)
                ok = r.returncode == 0
        else:
            dur = float(frame.duration or 5.0)
            r = _run([
                ffmpeg, "-y", "-f", "lavfi",
                "-i", "anullsrc=r=16000:cl=mono", "-t", f"{dur:.3f}",
                "-acodec", "pcm_s16le", seg_path,
            ], timeout=120)
            ok = r.returncode == 0
        if ok:
            seg_paths.append(seg_path)
        else:
            logger.warning(f"[SUBTITLES] segment {idx} failed; timeline may drift")

    if not seg_paths:
        return None

    list_path = os.path.join(workdir, "episode_audio_list.txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for p in seg_paths:
            f.write(f"file '{p}'\n")

    out_wav = os.path.join(workdir, "episode_audio.wav")
    r = _run([
        ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_path,
        "-acodec", "pcm_s16le", out_wav,
    ], timeout=600)
    if r.returncode != 0 or not os.path.exists(out_wav):
        logger.error(f"[SUBTITLES] audio concat failed: {r.stderr[-400:] if r.stderr else ''}")
        return None
    return out_wav


# ---------------------------------------------------------------------------
# whisper-cli invocation
# ---------------------------------------------------------------------------

def run_whisper(audio_wav: str, language: str = "zh", workdir: str = None) -> str:
    """Run whisper-cli with Silero VAD and return SRT text.

    Raises RuntimeError with a user-friendly message when the binary or
    models are missing, or when transcription fails.
    """
    cli = find_whisper_cli()
    model = find_whisper_model()
    if not cli:
        raise RuntimeError(
            "未找到 whisper-cli。请将 whisper-cli.exe 放到 bin/whisper/ 目录下"
            "（下载地址：https://github.com/ggml-org/whisper/releases）。"
        )
    if not model:
        raise RuntimeError(
            "未找到 whisper 模型。请将 ggml-*.bin 模型放到 bin/whisper/models/ 目录下"
            "（推荐 ggml-medium.bin 或 ggml-small.bin）。"
        )
    vad = find_vad_model()

    workdir = workdir or os.path.dirname(audio_wav) or "."
    prefix = os.path.join(workdir, "episode")
    cmd = [
        cli,
        "-m", model,
        "-l", language or "zh",
        "-osrt",
        "-of", prefix,
        "-np",
        "-t", str(max(2, (os.cpu_count() or 4) - 2)),
    ]
    if vad:
        cmd += ["--vad-model", vad]
    cmd += [audio_wav]

    logger.info(f"[SUBTITLES] running whisper: {' '.join(cmd[:6])} ...")
    r = _run(cmd, timeout=3600)
    srt_path = prefix + ".srt"
    if not os.path.exists(srt_path):
        stderr_tail = r.stderr[-500:].decode(errors="replace") if r.stderr else ""
        raise RuntimeError(f"whisper 识别失败：{stderr_tail or 'no output produced'}")
    with open(srt_path, "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# SRT → ASS conversion
# ---------------------------------------------------------------------------

_SRT_TIME_RE = re.compile(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)")


def _hex_to_ass(color_hex: str) -> str:
    """'#RRGGBB' → ASS '&H00BBGGRR'."""
    color_hex = (color_hex or "#FFFFFF").lstrip("#")
    if len(color_hex) != 6:
        color_hex = "FFFFFF"
    r, g, b = color_hex[0:2], color_hex[2:4], color_hex[4:6]
    try:
        return f"&H00{b}{g}{r}".upper()
    except ValueError:
        return "&H00FFFFFF"


def _srt_ts_to_ass(hours: str, minutes: str, seconds: str, millis: str) -> str:
    return f"{int(hours)}:{int(minutes):02d}:{int(seconds):02d}.{int(millis) // 10:02d}"


def srt_to_ass(srt_text: str, out_path: str, font_size: int = 16,
               font_color: str = "#FFFFFF", outline_color: str = "#000000",
               margin_v: int = 40, play_res_y: int = 1080,
               play_res_x: Optional[int] = None) -> str:
    """Convert SRT text to a styled ASS file.

    play_res_y is fixed at 1080 so font sizes are resolution-independent;
    play_res_x derives from the actual video aspect ratio (caller passes it
    after probing, or leave None for 16:9).
    """
    if play_res_x is None:
        play_res_x = round(play_res_y * 16 / 9)
    header = f"""[Script Info]
; Generated by LumenX compose module
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,{font_size},{_hex_to_ass(font_color)},&H000000FF,{_hex_to_ass(outline_color)},&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: List[str] = []
    blocks = re.split(r"\n\s*\n", srt_text.strip())
    for block in blocks:
        lines = [ln for ln in block.strip().splitlines() if ln.strip()]
        if not lines:
            continue
        time_line_idx = next((i for i, ln in enumerate(lines) if "-->" in ln), -1)
        if time_line_idx < 0:
            continue
        m = _SRT_TIME_RE.search(lines[time_line_idx])
        if not m:
            continue
        h1, m1, s1, ms1, h2, m2, s2, ms2 = m.groups()
        text_lines = lines[time_line_idx + 1:]
        if not text_lines:
            continue
        text = "\\N".join(re.sub(r"<[^>]+>", "", ln).strip() for ln in text_lines)
        text = text.replace("{", "(").replace("}", ")")
        events.append(
            f"Dialogue: 0,{_srt_ts_to_ass(h1, m1, s1, ms1)},{_srt_ts_to_ass(h2, m2, s2, ms2)},Default,,0,0,0,,{text}"
        )
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(header + "\n".join(events) + "\n")
    return out_path


# ---------------------------------------------------------------------------
# Merge-time passes
# ---------------------------------------------------------------------------

def apply_title_ending(video_path: str, title_settings, ffmpeg_path: str) -> Optional[str]:
    """Overlay opening title + ending text via drawtext.

    Opening fades in/out over title_duration seconds at the video start;
    ending text fades in over ending_duration seconds at the tail.
    Returns the new video path, or None when nothing to apply.
    """
    ts = title_settings
    filters: List[str] = []
    font_file = _escape_filter_path(find_font())

    if ts.title_text and ts.title_text.strip():
        dur = max(0.5, float(ts.title_duration or 3.0))
        color = (ts.title_color or "#FFD700").lstrip("#")
        size = max(12, int(ts.title_font_size or 72))
        alpha = (
            f"if(lt(t,0.6),0,if(lt(t,1.4),(t-0.6)/0.8,"
            f"if(lt(t,{dur - 0.6:.2f}),1,max(0,({dur:.2f}-t)/0.6))))"
        )
        filters.append(
            f"drawtext=fontfile='{font_file}':text='{_escape_drawtext(ts.title_text.strip())}'"
            f":fontsize={size}:fontcolor=0x{color}:x=(w-text_w)/2:y=(h-text_h)/2"
            f":alpha='{alpha}':enable='lte(t,{dur:.2f})'"
        )

    if ts.ending_text and ts.ending_text.strip():
        total = probe_duration(video_path)
        if total > 0:
            dur = max(0.5, float(ts.ending_duration or 3.0))
            start = max(0.0, total - dur)
            size = max(12, int(ts.ending_font_size or 48))
            alpha = f"if(lt(t,{start:.2f}),0,if(lt(t,{start + 0.8:.2f}),(t-{start:.2f})/0.8,1))"
            filters.append(
                f"drawtext=fontfile='{font_file}':text='{_escape_drawtext(ts.ending_text.strip())}'"
                f":fontsize={size}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2"
                f":alpha='{alpha}':enable='gte(t,{start:.2f})'"
            )

    if not filters:
        return None

    out_path = video_path.replace(".mp4", "_titled.mp4")
    cmd = [
        ffmpeg_path, "-y", "-i", video_path,
        "-vf", ",".join(filters),
        "-c:v", "libx264", "-crf", "20", "-preset", "fast",
        "-c:a", "copy",
        "-movflags", "+faststart",
        out_path,
    ]
    logger.info("[MERGE/TITLE] applying title/ending drawtext overlay")
    r = _run(cmd, timeout=900)
    if r.returncode != 0 or not os.path.exists(out_path):
        logger.warning(f"[MERGE/TITLE] failed: {r.stderr[-400:] if r.stderr else ''}")
        return None
    os.replace(out_path, video_path)  # in-place: keep merged filename stable
    return video_path


def burn_subtitles(video_path: str, ass_path: str, ffmpeg_path: str) -> Optional[str]:
    """Hard-burn an ASS subtitle file into the video (re-encode)."""
    if not os.path.exists(ass_path):
        return None
    out_path = video_path.replace(".mp4", "_subbed.mp4")
    cmd = [
        ffmpeg_path, "-y", "-i", video_path,
        "-vf", f"ass='{_escape_filter_path(ass_path)}'",
        "-c:v", "libx264", "-crf", "20", "-preset", "fast",
        "-c:a", "copy",
        "-movflags", "+faststart",
        out_path,
    ]
    logger.info(f"[MERGE/SUB] burning subtitles: {os.path.basename(ass_path)}")
    r = _run(cmd, timeout=1800)
    if r.returncode != 0 or not os.path.exists(out_path):
        logger.warning(f"[MERGE/SUB] failed: {r.stderr[-400:] if r.stderr else ''}")
        return None
    tmp = video_path + ".tmp.mp4"
    os.replace(out_path, tmp)
    os.replace(tmp, video_path)
    return video_path


def embed_cover(video_path: str, cover_path: str, ffmpeg_path: str) -> Optional[str]:
    """Embed the cover image as an mp4 attached_pic (shows as thumbnail)."""
    if not os.path.exists(cover_path):
        return None
    out_path = video_path.replace(".mp4", "_cov.mp4")
    cmd = [
        ffmpeg_path, "-y",
        "-i", video_path, "-i", cover_path,
        "-map", "0", "-map", "1",
        "-c", "copy",
        "-disposition:v:1", "attached_pic",
        "-movflags", "+faststart",
        out_path,
    ]
    logger.info(f"[MERGE/COVER] embedding cover: {os.path.basename(cover_path)}")
    r = _run(cmd, timeout=300)
    if r.returncode != 0 or not os.path.exists(out_path):
        logger.warning(f"[MERGE/COVER] failed: {r.stderr[-400:] if r.stderr else ''}")
        return None
    tmp = video_path + ".tmp.mp4"
    os.replace(out_path, tmp)
    os.replace(tmp, video_path)
    return video_path


# ---------------------------------------------------------------------------
# Cover text layers (drawtext-based composition, no Pillow dependency)
# ---------------------------------------------------------------------------

def compose_cover(poster_path: str, text_layers: List, out_path: str,
                  width: int = None, height: int = None) -> Optional[str]:
    """Render text layers over the poster image via ffmpeg drawtext."""
    ffmpeg = get_ffmpeg_path()
    if not ffmpeg or not os.path.exists(poster_path):
        return None
    if width is None or height is None:
        width, height = probe_dimensions(poster_path)

    filters: List[str] = []
    font_file = _escape_filter_path(find_font())
    for layer in text_layers or []:
        text = (layer.text or "").strip()
        if not text:
            continue
        color = (layer.color or "#FFFFFF").lstrip("#")
        stroke = (layer.stroke_color or "#000000").lstrip("#")
        size = max(12, int(layer.font_size or 64))
        stroke_w = max(0, int(layer.stroke_width or 4))
        align = (layer.align or "center").lower()
        if align == "left":
            x_expr = f"{max(0, int(layer.x * width))}"
        elif align == "right":
            x_expr = f"{max(0, int(layer.x * width))}-text_w"
        else:
            x_expr = f"{max(0, int(layer.x * width))}-text_w/2"
        y_expr = f"max(0, {max(0, int(layer.y * height))}-text_h/2)"
        filters.append(
            f"drawtext=fontfile='{font_file}':text='{_escape_drawtext(text)}'"
            f":fontsize={size}:fontcolor=0x{color}"
            f":borderw={stroke_w}:bordercolor=0x{stroke}"
            f":x='{x_expr}':y='{y_expr}'"
        )

    cmd = [ffmpeg, "-y", "-i", poster_path]
    if filters:
        cmd += ["-vf", ",".join(filters)]
    cmd += ["-frames:v", "1", out_path]
    r = _run(cmd, timeout=120)
    if r.returncode != 0 or not os.path.exists(out_path):
        logger.warning(f"[COVER] compose failed: {r.stderr[-400:] if r.stderr else ''}")
        return None
    return out_path

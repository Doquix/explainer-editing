"""Technical checks on a rendered segment. Passing is NOT editorial approval.

Checks: resolution, fps, audio present, picture/audio duration vs EDL,
whole file decode, black frames, integrated loudness, placeholder count,
alignment method. Writes out/verification.json and exits 1 on a failure.

Usage: python verify.py <job_dir> <video.mp4>
"""
import json
import pathlib
import re
import subprocess
import sys


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def main():
    job, video = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    edl = json.loads((job / 'edl.json').read_text(encoding='utf-8'))
    timing = json.loads((job / 'timing.json').read_text(encoding='utf-8'))
    probe = json.loads(sh(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)]).stdout)
    v = next(s for s in probe['streams'] if s['codec_type'] == 'video')
    a = [s for s in probe['streams'] if s['codec_type'] == 'audio']
    expected = edl['durationInFrames'] / edl['fps']
    duration = float(probe['format']['duration'])
    num, den = (int(x) for x in v['r_frame_rate'].split('/'))

    decode = sh(['ffmpeg', '-v', 'error', '-i', str(video), '-f', 'null', '-'])
    black = sh(['ffmpeg', '-hide_banner', '-i', str(video), '-vf', 'blackdetect=d=0.2:pix_th=0.10', '-an', '-f', 'null', '-'])
    black_spans = re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', black.stderr)
    loud = sh(['ffmpeg', '-hide_banner', '-i', str(video), '-af', 'ebur128', '-vn', '-f', 'null', '-'])
    lufs = re.findall(r'I:\s+(-?[\d.]+) LUFS', loud.stderr)

    media = []
    for b in edl['beats']:
        vis = b['visual']
        media += [vis['media']] if vis['type'] == 'source' else [vis['left'], vis['right']] if vis['type'] == 'compare' else []
    placeholders = sum(1 for m in media if not m.get('src'))

    checks = {
        'resolution_1920x1080': (v['width'], v['height']) == (edl['width'], edl['height']),
        'fps_matches': abs(num / den - edl['fps']) < 0.01,
        'audio_present': bool(a),
        'duration_matches_edl': abs(duration - expected) < 0.1,
        'decodes_cleanly': decode.returncode == 0 and not decode.stderr.strip(),
        'no_black_frames': not black_spans,
        'loudness_near_-14_lufs': bool(lufs) and abs(float(lufs[-1]) + 14) <= 1.0,
    }
    report = {
        'video': video.name, 'duration_s': round(duration, 3), 'expected_s': round(expected, 3),
        'integrated_lufs': float(lufs[-1]) if lufs else None, 'black_spans': black_spans,
        'beats': len(edl['beats']), 'placeholders': placeholders,
        'alignment': timing.get('method'), 'captions': edl['style']['captions'],
        'music': bool(edl.get('music')), 'sfx_cues': len(edl.get('sfx', [])),
        'checks': checks,
        'status': 'technical_pass' if all(checks.values()) else 'technical_fail',
        'editorial_status': 'DRAFT: placeholders present' if placeholders else 'awaiting Luke review',
        'note': 'Technical checks only. A passing render is not aesthetic approval; human listening review still required.',
    }
    (video.parent / 'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
    sys.exit(0 if all(checks.values()) else 1)


if __name__ == '__main__':
    main()

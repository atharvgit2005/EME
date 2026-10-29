#!/usr/bin/env python3
"""
Curved Kinetic Typography Rasterizer
Editing Mechanics Engine (EME) - Phase 34.4

Deterministically renders glyphs along defined curves (circular arc) with
timeline-driven kinetic animations (reveal, startOffset sweep, fade in/out).
Outputs transparent RGBA PNG overlays.
"""

import sys
import json
import math
import os
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    import json
    import sys
    print(json.dumps({
        'success': False,
        'error': 'ERR_DEPENDENCY_MISSING: Python Pillow (PIL) is required for curved typography rasterization.',
        'details': 'Install with: pip install pillow'
    }))
    sys.exit(1)

def resolve_font(font_family, font_size, font_path=None):
    if font_path:
        return ImageFont.truetype(font_path, font_size)
    # 1. Configured font path override via environment variable
    custom_font = os.environ.get('EME_FONT_PATH')
    if custom_font and os.path.exists(custom_font):
        try:
            return ImageFont.truetype(custom_font, font_size)
        except Exception:
            pass

    font_candidates = [
        # User-specified family across platforms
        f"/System/Library/Fonts/{font_family}.ttc",
        f"/System/Library/Fonts/Supplemental/{font_family}.ttf",
        f"/Library/Fonts/{font_family}.ttf",
        f"/usr/share/fonts/truetype/{font_family}.ttf",
        f"C:\\Windows\\Fonts\\{font_family}.ttf",
        # macOS standard system fonts
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        # Linux standard system fonts
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        # Windows standard system fonts
        "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\segoeui.ttf"
    ]
    for p in font_candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, font_size)
            except Exception:
                continue
    return ImageFont.load_default()

def render_frame(config, frame_index, total_frames, out_path):
    canvas_w = int(config.get('canvas', {}).get('width', 1080))
    canvas_h = int(config.get('canvas', {}).get('height', 1920))
    full_text = config.get('text', '')
    curve = config.get('curve', {})
    styling = config.get('styling', {})
    animation = config.get('animation', {})
    is_control_flat = config.get('control_flat', False)

    # Progress in [0.0, 1.0]
    progress = 0.0 if total_frames <= 1 else (frame_index / float(total_frames - 1))

    # Animation evaluation
    anim_type = animation.get('type', 'none')
    
    # 1. Opacity / Fade
    opacity = float(styling.get('opacity', 1.0))
    if anim_type in ['fade_in_out', 'fade_and_sweep', 'curve_reveal']:
        fade_ratio = float(animation.get('fade_ratio', 0.2))
        if progress < fade_ratio and fade_ratio > 0:
            opacity *= (progress / fade_ratio)
        elif progress > (1.0 - fade_ratio) and fade_ratio > 0:
            opacity *= ((1.0 - progress) / fade_ratio)
    alpha = int(255 * max(0.0, min(1.0, opacity)))

    # 2. Text Reveal
    active_text = full_text
    if anim_type == 'curve_reveal':
        chars_to_show = int(math.ceil(len(full_text) * max(0.05, progress)))
        active_text = full_text[:chars_to_show]

    # 3. Angle / Offset Sweep
    start_deg = float(curve.get('startAngleDeg', 144.0))
    end_deg = float(curve.get('endAngleDeg', 36.0))
    if anim_type in ['curve_sweep', 'fade_and_sweep']:
        sweep_shift_deg = float(animation.get('sweep_shift_deg', 40.0))
        # Smooth motion across progress
        shift = sweep_shift_deg * (progress - 0.5)
        start_deg += shift
        end_deg += shift

    font_size = int(styling.get('fontSize', 64))
    font = resolve_font(styling.get('fontFamily', 'Helvetica'), font_size, styling.get('fontPath'))
    color = styling.get('color', [255, 255, 0])
    if isinstance(color, str):
        # Parse hex
        hex_str = color.lstrip('#')
        if len(hex_str) == 6:
            color = [int(hex_str[i:i+2], 16) for i in (0, 2, 4)]
        else:
            color = [255, 255, 255]

    im = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    n = len(active_text)
    
    min_x, max_x = canvas_w, 0
    min_y, max_y = canvas_h, 0
    glyph_records = []

    if n > 0 and alpha > 0:
        if is_control_flat:
            # Control flat rendering: text centered at (cx, cy)
            cx = float(curve.get('centerX', canvas_w / 2.0))
            cy = float(curve.get('centerY', canvas_h / 2.0))
            # Measure full string width
            full_bbox = font.getbbox(active_text)
            total_w = full_bbox[2] - full_bbox[0]
            start_x = cx - total_w / 2.0
            cur_x = start_x
            
            for i, char in enumerate(active_text):
                c_bbox = font.getbbox(char)
                cw = max(1, c_bbox[2] - c_bbox[0])
                ch = max(1, c_bbox[3] - c_bbox[1])
                char_im = Image.new('RGBA', (cw + 20, ch + 20), (0, 0, 0, 0))
                char_draw = ImageDraw.Draw(char_im)
                char_draw.text((10, 10), char, font=font, fill=(color[0], color[1], color[2], alpha))
                
                gx = cur_x + cw / 2.0
                gy = cy
                im.alpha_composite(char_im, (int(gx - (cw+20)/2), int(gy - (ch+20)/2)))
                
                min_x = min(min_x, int(gx - cw/2))
                max_x = max(max_x, int(gx + cw/2))
                min_y = min(min_y, int(gy - ch/2))
                max_y = max(max_y, int(gy + ch/2))
                glyph_records.append({'char': char, 'x': gx, 'y': gy, 'rot_deg': 0.0})
                cur_x += cw + int(styling.get('letterSpacing', 2))
        else:
            # Curved rendering along arc
            cx = float(curve.get('centerX', canvas_w / 2.0))
            cy = float(curve.get('centerY', canvas_h / 2.0))
            r = float(curve.get('radius', 400.0))
            start_rad = math.radians(start_deg)
            end_rad = math.radians(end_deg)

            for i, char in enumerate(active_text):
                t = i / max(1, len(full_text) - 1)  # preserve index against full string for stable arc position
                angle = start_rad + (end_rad - start_rad) * t
                gx = cx + r * math.cos(angle)
                gy = cy - r * math.sin(angle)
                rot_deg = math.degrees(angle) - 90.0

                c_bbox = font.getbbox(char)
                cw = max(1, c_bbox[2] - c_bbox[0] + 10)
                ch = max(1, c_bbox[3] - c_bbox[1] + 10)
                char_im = Image.new('RGBA', (cw + 20, ch + 20), (0, 0, 0, 0))
                char_draw = ImageDraw.Draw(char_im)
                char_draw.text((10, 10), char, font=font, fill=(color[0], color[1], color[2], alpha))

                rotated = char_im.rotate(rot_deg, expand=True, resample=Image.Resampling.BILINEAR)
                rw, rh = rotated.size
                paste_x = int(gx - rw / 2.0)
                paste_y = int(gy - rh / 2.0)
                im.alpha_composite(rotated, (paste_x, paste_y))

                min_x = min(min_x, paste_x)
                max_x = max(max_x, paste_x + rw)
                min_y = min(min_y, paste_y)
                max_y = max(max_y, paste_y + rh)
                glyph_records.append({'char': char, 'x': gx, 'y': gy, 'rot_deg': rot_deg})

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    im.save(out_path)
    alpha_bounds = im.getchannel('A').getbbox()
    
    return {
        'frame_index': frame_index,
        'outputPath': out_path,
        'bounds': {
            'minX': min_x if min_x <= max_x else 0,
            'maxX': max_x if min_x <= max_x else 0,
            'minY': min_y if min_y <= max_y else 0,
            'maxY': max_y if min_y <= max_y else 0,
            'width': max(0, max_x - min_x),
            'height': max(0, max_y - min_y)
        },
        'alpha_bounds': list(alpha_bounds) if alpha_bounds else None,
        'glyphs': glyph_records
    }

def main():
    if len(sys.argv) > 1 and sys.argv[1] != '-':
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)

    mode = data.get('mode', 'single')
    if mode == 'single':
        out_path = data.get('outputPath', '/tmp/curved_frame.png')
        res = render_frame(data, 0, 1, out_path)
        print(json.dumps({'success': True, 'frame': res}))
    elif mode == 'sequence':
        total_frames = int(data.get('totalFrames', 30))
        out_pattern = data.get('outputPattern', '/tmp/curved_seq_%04d.png')
        frames = []
        for fi in range(total_frames):
            frame_path = out_pattern % fi
            res = render_frame(data, fi, total_frames, frame_path)
            frames.append(res)
        print(json.dumps({'success': True, 'totalFrames': total_frames, 'frames': frames}))

if __name__ == '__main__':
    main()

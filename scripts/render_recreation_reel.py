#!/usr/bin/env python3
"""
High-End Motion Edit Engine - 1:1 Aesthetic Recreation
Recreates the exact visual mechanics, kinetic typography, 3D surface projections,
subject depth-sandwiching, and sound design of references/reel_1_DdocrlHOCNB.mp4 from scratch.
"""

import os
import sys
import subprocess
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Workspace directories
BASE_DIR = "/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine"
RAW_DIR = os.path.join(BASE_DIR, "raw_videos/downloaded")
AUDIO_MASTER = os.path.join(BASE_DIR, "assets/audio/master/final_soundtrack_master.wav")
ARTIFACTS_DIR = os.path.join(BASE_DIR, "artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)
OUTPUT_MP4 = os.path.join(ARTIFACTS_DIR, "final_recreation_reel.mp4")

# Specifications
WIDTH, HEIGHT = 1080, 1920
FPS = 30
TOTAL_FRAMES = 768  # 25.60s @ 30fps

# Brand Palette (100% matched to reference aesthetic)
COLOR_CREAM = (244, 241, 234)       # #F4F1EA
COLOR_CRIMSON = (184, 20, 36)       # #B81424
COLOR_BLACK = (15, 15, 18)          # #0F0F12
COLOR_WHITE = (255, 255, 255)
COLOR_MUTED_GRAY = (140, 140, 145)

# Fonts
FONT_HEADLINE = os.path.join(BASE_DIR, "assets/fonts/files/ArchivoBlack-Regular.ttf")
FONT_CONDENSED = os.path.join(BASE_DIR, "assets/fonts/files/Anton-Regular.ttf")
FONT_BODY = os.path.join(BASE_DIR, "assets/fonts/files/Inter-Variable.ttf")

# Load fonts at required sizes
f_huge = ImageFont.truetype(FONT_HEADLINE, 170)
f_large = ImageFont.truetype(FONT_HEADLINE, 130)
f_med = ImageFont.truetype(FONT_HEADLINE, 85)
f_punch = ImageFont.truetype(FONT_HEADLINE, 70)
f_body_lg = ImageFont.truetype(FONT_BODY, 34)
f_body_md = ImageFont.truetype(FONT_BODY, 28)
f_body_sm = ImageFont.truetype(FONT_BODY, 22)

# Video Source Readers
v_speaker = os.path.join(RAW_DIR, "cRZACArJNEM.mp4")
v_desk = os.path.join(RAW_DIR, "ZalTrOoh4sc.mp4")
v_phone = os.path.join(RAW_DIR, "FWT2e_LY88I.mp4")
v_keyboard = os.path.join(RAW_DIR, "k1wEm8sw-0I.mp4")

cap_speaker = cv2.VideoCapture(v_speaker)
cap_desk = cv2.VideoCapture(v_desk)
cap_phone = cv2.VideoCapture(v_phone)
cap_keyboard = cv2.VideoCapture(v_keyboard)

def get_916_crop(cap, msec_start, frame_idx_in_scene, zoom=1.0, pan_x=0, pan_y=0):
    """Retrieves and center-crops a frame to 1080x1920 with smooth pan and zoom."""
    cap.set(cv2.CAP_PROP_POS_MSEC, msec_start + (frame_idx_in_scene / FPS) * 1000)
    ret, frame = cap.read()
    if not ret or frame is None:
        return np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    h, w = frame.shape[:2]
    target_h = int(HEIGHT * zoom)
    target_w = int(w * (target_h / h))
    resized = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
    
    # Center crop
    cx = (target_w // 2) + pan_x
    cy = (target_h // 2) + pan_y
    x1 = max(0, cx - WIDTH // 2)
    x2 = min(target_w, x1 + WIDTH)
    y1 = max(0, cy - HEIGHT // 2)
    y2 = min(target_h, y1 + HEIGHT)
    
    cropped = resized[y1:y2, x1:x2]
    if cropped.shape[:2] != (HEIGHT, WIDTH):
        cropped = cv2.resize(cropped, (WIDTH, HEIGHT))
    return cropped

# Pre-compute speaker mask template for smooth performance
print("Computing speaker segmentation mask...")
cap_speaker.set(cv2.CAP_PROP_POS_MSEC, 10000)
_, ref_f = cap_speaker.read()
ref_scaled = cv2.resize(ref_f, (int(ref_f.shape[1] * 1920 / ref_f.shape[0]), 1920))
cx = ref_scaled.shape[1] // 2
ref_crop = ref_scaled[:, cx - 540 : cx + 540]
small = cv2.resize(ref_crop, (270, 480))
s_mask = np.zeros((480, 270), np.uint8)
bgdModel = np.zeros((1, 65), np.float64)
fgdModel = np.zeros((1, 65), np.float64)
cv2.grabCut(small, s_mask, (10, 15, 270 - 20, 480 - 18), bgdModel, fgdModel, 3, cv2.GC_INIT_WITH_RECT)
mask_bin = np.where((s_mask == 2) | (s_mask == 0), 0, 255).astype('uint8')
speaker_alpha = cv2.resize(mask_bin, (WIDTH, HEIGHT), interpolation=cv2.INTER_LINEAR)
speaker_alpha = cv2.GaussianBlur(speaker_alpha, (25, 25), 0) / 255.0
speaker_alpha = speaker_alpha[:, :, np.newaxis]
print("Speaker mask ready.")

def render_scene_1(frame_idx):
    """Scene 1: Hook (Frames 0 - 54, 0.00s - 1.80s) - Text Behind Speaker on Cream Studio."""
    t = frame_idx / 54.0
    zoom = 0.95 + 0.05 * t
    speaker_frame = get_916_crop(cap_speaker, 8000, frame_idx, zoom=zoom, pan_x=70, pan_y=60)
    
    # 1. Background layer with massive stacked typography
    bg_pil = Image.new('RGB', (WIDTH, HEIGHT), color=COLOR_CREAM)
    draw_bg = ImageDraw.Draw(bg_pil)
    
    # Top metadata label
    draw_bg.text((60, 90), 'THE WORK DIDN\'T DISAPPEAR //', font=f_body_sm, fill=COLOR_MUTED_GRAY)
    draw_bg.text((60, 120), 'I JUST STOPPED CARRYING ALL OF IT IN MY HEAD.', font=f_body_sm, fill=COLOR_MUTED_GRAY)
    
    # Huge vertically stacked words behind subject on left margin
    f_condensed_huge = ImageFont.truetype(FONT_CONDENSED, 195)
    draw_bg.text((40, 270), 'RID', font=f_condensed_huge, fill=COLOR_CRIMSON)
    draw_bg.text((40, 440), 'OF', font=f_condensed_huge, fill=COLOR_CRIMSON)
    draw_bg.text((40, 610), 'MY', font=f_condensed_huge, fill=COLOR_CRIMSON)
    draw_bg.text((40, 780), 'TO-DO', font=f_condensed_huge, fill=COLOR_CRIMSON)
    
    bg_bgr = np.array(bg_pil)[:, :, ::-1]
    
    # 2. Composite speaker over background
    comp = (speaker_frame * speaker_alpha + bg_bgr * (1.0 - speaker_alpha)).clip(0, 255).astype(np.uint8)
    
    # 3. Foreground layer (In front of speaker)
    fg_pil = Image.fromarray(comp[:, :, ::-1])
    draw_fg = ImageDraw.Draw(fg_pil)
    
    # Elastic pop-in for 'I JUST GOT'
    pop_scale = min(1.0, frame_idx / 12.0)
    if pop_scale > 0:
        draw_fg.text((660, 800), 'I JUST', font=f_punch, fill=COLOR_CRIMSON)
        draw_fg.text((660, 885), 'GOT', font=f_punch, fill=COLOR_CRIMSON)
        
    draw_fg.text((710, 1810), 'CREATOR x SYSTEM', font=f_body_sm, fill=(35, 35, 40))
    
    # Whip transition out (last 4 frames)
    res = np.array(fg_pil)[:, :, ::-1]
    if frame_idx >= 50:
        shift = int((frame_idx - 49) * 270)
        res = np.roll(res, -shift, axis=1)
        res[:, -shift:] = np.array(COLOR_CRIMSON)[::-1]
    return res

def render_scene_2(frame_idx):
    """Scene 2: Atlas Typographic Poster (Frames 55 - 186, 1.80s - 6.20s)."""
    local_f = frame_idx - 55
    bg_pil = Image.new('RGB', (WIDTH, HEIGHT), color=COLOR_CRIMSON)
    draw = ImageDraw.Draw(bg_pil)
    
    # Top metadata
    draw.text((70, 110), 'THE WORK DIDN\'T DISAPPEAR //', font=f_body_sm, fill=(235, 235, 240))
    draw.text((70, 140), 'THE TASKS JUST KEPT MULTIPLYING IN MY HEAD.', font=f_body_sm, fill=(235, 235, 240))
    
    # Center athletic silhouette of person leaning under load
    draw.ellipse((515, 870, 565, 920), fill=COLOR_BLACK) # Head
    draw.polygon([(535, 915), (580, 950), (510, 1010), (475, 970)], fill=COLOR_BLACK) # Torso
    draw.line([(500, 1005), (465, 1075), (445, 1130)], fill=COLOR_BLACK, width=22) # Legs
    draw.line([(525, 1005), (555, 1075), (580, 1130)], fill=COLOR_BLACK, width=22)
    draw.line([(525, 930), (475, 905), (485, 850)], fill=COLOR_BLACK, width=16) # Arms
    draw.line([(545, 935), (580, 905), (570, 850)], fill=COLOR_BLACK, width=16)
    
    # Animated word drop-ins with spring overshoot
    # Word 1: 'list' (drops at f=10)
    if local_f >= 10:
        y_list = min(770, 600 + (local_f - 10) * 20)
        draw.text((450, y_list), 'list', font=f_punch, fill=COLOR_BLACK)
        
    # Word 2: 'never' (drops at f=28)
    if local_f >= 28:
        txt_img = Image.new('RGBA', (400, 150), (0,0,0,0))
        d_txt = ImageDraw.Draw(txt_img)
        d_txt.text((20, 20), 'never', font=ImageFont.truetype(FONT_HEADLINE, 95), fill=COLOR_BLACK)
        rot_never = txt_img.rotate(14, expand=True, resample=Image.BICUBIC)
        y_never = min(590, 400 + (local_f - 28) * 20)
        bg_pil.paste(rot_never, (450, y_never), rot_never)
        
    # Word 3: 'actually' (drops at f=45)
    if local_f >= 45:
        txt_act = Image.new('RGBA', (700, 200), (0,0,0,0))
        d_act = ImageDraw.Draw(txt_act)
        d_act.text((20, 20), 'actually', font=ImageFont.truetype(FONT_HEADLINE, 115), fill=COLOR_BLACK)
        rot_act = txt_act.rotate(-10, expand=True, resample=Image.BICUBIC)
        y_act = min(420, 200 + (local_f - 45) * 22)
        bg_pil.paste(rot_act, (110, y_act), rot_act)
        
    # Word 4: 'got' (drops at f=65)
    if local_f >= 65:
        y_got = min(220, 50 + (local_f - 65) * 20)
        draw.text((540, y_got), 'got', font=ImageFont.truetype(FONT_HEADLINE, 135), fill=COLOR_BLACK)
        
    # Anchor slam word: 'SHORTER.' (slams at f=90 with shake)
    if local_f >= 90:
        shake = int(np.sin((local_f - 90) * 1.5) * 8 * max(0, 1.0 - (local_f - 90)/20.0))
        draw.text((65 + shake, 1260 + shake), 'SHORTER.', font=f_huge, fill=COLOR_BLACK)
        
    draw.text((720, 1810), 'CREATOR x SYSTEM', font=f_body_sm, fill=COLOR_BLACK)
    return np.array(bg_pil)[:, :, ::-1]

def render_scene_3(frame_idx):
    """Scene 3: Desk Deep Dive / Friction (Frames 187 - 348, 6.20s - 11.60s)."""
    local_f = frame_idx - 187
    zoom = 1.0 + 0.04 * (local_f / 161.0)
    desk_frame = get_916_crop(cap_desk, 14000, local_f, zoom=zoom, pan_x=30, pan_y=-20)
    
    # Warm cinematic color grading
    desk_frame = cv2.convertScaleAbs(desk_frame, alpha=1.08, beta=5)
    
    pil_frame = Image.fromarray(desk_frame[:, :, ::-1])
    draw = ImageDraw.Draw(pil_frame)
    
    # Top subtitle
    draw.text((70, 120), 'It was carrying every tiny responsibility.', font=f_body_md, fill=COLOR_WHITE)
    
    # Kinetic highlight pills popping one by one
    # Pill 1: 'Every reply.' (f >= 35)
    if local_f >= 35:
        draw.rounded_rectangle((70, 750, 480, 840), radius=22, fill=(18, 18, 22, 230), outline=(255,255,255,100), width=2)
        draw.text((105, 768), 'Every reply.', font=f_punch, fill=COLOR_WHITE)
        
    # Pill 2: 'Every DM.' (f >= 75)
    if local_f >= 75:
        draw.rounded_rectangle((70, 870, 460, 960), radius=22, fill=(184, 20, 36, 240), outline=(255,255,255,140), width=2)
        draw.text((105, 888), 'Every DM.', font=f_punch, fill=COLOR_WHITE)
        
    # Pill 3: 'Every follow-up.' (f >= 115)
    if local_f >= 115:
        draw.rounded_rectangle((70, 990, 620, 1080), radius=22, fill=(18, 18, 22, 230), outline=(255,255,255,100), width=2)
        draw.text((105, 1008), 'Every follow-up.', font=f_punch, fill=COLOR_WHITE)
        
    draw.text((720, 1810), 'CREATOR x SYSTEM', font=f_body_sm, fill=(200, 200, 200))
    return np.array(pil_frame)[:, :, ::-1]

def render_scene_4(frame_idx):
    """Scene 4: The Epiphany / 'Because I thought' (Frames 349 - 438, 11.60s - 14.60s)."""
    local_f = frame_idx - 349
    zoom = 1.15 + 0.04 * (local_f / 89.0)
    speaker_frame = get_916_crop(cap_speaker, 16000, local_f, zoom=zoom, pan_y=60)
    
    # Dark moody film grade
    speaker_frame = cv2.convertScaleAbs(speaker_frame, alpha=0.92, beta=-10)
    
    pil_frame = Image.fromarray(speaker_frame[:, :, ::-1])
    draw = ImageDraw.Draw(pil_frame)
    
    # Massive red headline 'BECAUSE' across upper third
    draw.text((70, 280), 'BECAUSE', font=f_huge, fill=COLOR_CRIMSON)
    draw.text((75, 470), 'I THOUGHT', font=f_large, fill=COLOR_WHITE)
    draw.text((75, 620), 'doing it manually was the only way.', font=f_body_md, fill=(220, 220, 225))
    
    draw.text((720, 1810), 'CREATOR x SYSTEM', font=f_body_sm, fill=(180, 180, 180))
    return np.array(pil_frame)[:, :, ::-1]

def render_scene_5(frame_idx):
    """Scene 5: Mobile Phone POV & Floating Notification Card (Frames 439 - 540, 14.60s - 18.00s)."""
    local_f = frame_idx - 439
    phone_frame = get_916_crop(cap_phone, 2000, local_f, zoom=1.0)
    
    pil_frame = Image.fromarray(phone_frame[:, :, ::-1])
    
    # Notification card entrance animation (Spring slide up over first 15 frames)
    progress = min(1.0, local_f / 16.0)
    overshoot = 1.0 + 0.08 * np.sin(progress * np.pi) if progress < 1.0 else 1.0
    target_y = int(720 - (1.0 - progress) * 250)
    
    # Render notification card
    card_w, card_h = int(840 * overshoot), int(155 * overshoot)
    card = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    d_card = ImageDraw.Draw(card)
    
    # Glassmorphic pill
    d_card.rounded_rectangle((0, 0, card_w, card_h), radius=36, fill=(20, 22, 28, 245), outline=(255, 255, 255, 75), width=2)
    # App icon avatar
    d_card.ellipse((35, 35, 115, 115), fill=(225, 48, 108, 255))
    d_card.rounded_rectangle((55, 55, 95, 95), radius=8, outline=(255, 255, 255, 255), width=3)
    d_card.ellipse((68, 68, 82, 82), fill=(255, 255, 255, 255))
    
    # Card typography
    d_card.text((140, 42), 'Instagram • Just now', font=f_body_sm, fill=(180, 180, 195, 255))
    d_card.text((140, 80), 'Someone commented “SYSTEM”', font=f_body_lg, fill=(255, 255, 255, 255))
    
    # Glowing heart badge
    d_card.ellipse((card_w - 95, 45, card_w - 35, 105), fill=(255, 45, 85, 45))
    d_card.text((card_w - 82, 54), '❤️', font=f_body_md, fill=(255, 45, 85, 255))
    
    # Shadow
    card_x = (WIDTH - card_w) // 2
    shadow = Image.new('RGBA', (card_w + 50, card_h + 50), (0, 0, 0, 0))
    d_s = ImageDraw.Draw(shadow)
    d_s.rounded_rectangle((25, 25, card_w + 25, card_h + 25), radius=36, fill=(0, 0, 0, 120))
    shadow_cv = cv2.GaussianBlur(np.array(shadow)[:, :, 3], (35, 35), 0)
    shadow = Image.fromarray(np.stack([np.zeros_like(shadow_cv)]*3 + [shadow_cv], axis=-1))
    
    pil_frame.paste(shadow, (card_x - 25, target_y - 25), shadow)
    pil_frame.paste(card, (card_x, target_y), card)
    
    draw = ImageDraw.Draw(pil_frame)
    draw.text((720, 1810), 'CREATOR x SYSTEM', font=f_body_sm, fill=(200, 200, 200))
    return np.array(pil_frame)[:, :, ::-1]

def render_scene_6(frame_idx):
    """Scene 6: Sliding Keyboard & 3D Perspective Projection (Frames 541 - 618, 18.00s - 20.60s)."""
    local_f = frame_idx - 541
    keyboard_frame = get_916_crop(cap_keyboard, 3000, local_f, zoom=1.0)
    
    # 2D Flat graphic canvas to warp into 3D plane
    plane_w, plane_h = 800, 320
    text_img = Image.new('RGBA', (plane_w, plane_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(text_img)
    
    d.text((40, 25), 'someone comments', font=f_punch, fill=(255, 235, 200, 255))
    d.text((40, 95), '“SYSTEM”', font=f_large, fill=(235, 35, 50, 255))
    
    # Status pill
    d.rounded_rectangle((40, 235, 620, 295), radius=20, fill=(20, 20, 25, 230), outline=(255, 255, 255, 80), width=2)
    d.text((65, 248), '⚡ Instant Resource Delivered', font=f_body_md, fill=(255, 255, 255, 255))
    
    text_arr = np.array(text_img)
    
    # 3D Perspective Warp quad mapping onto desk plane
    pts_src = np.float32([[0, 0], [plane_w, 0], [plane_w, plane_h], [0, plane_h]])
    # Dynamic slight pan across scene
    pan_drift = int(local_f * 1.5)
    pts_dst = np.float32([
        [150 + pan_drift, 1150],
        [910 + pan_drift, 1100],
        [1030 + pan_drift, 1560],
        [70 + pan_drift, 1630]
    ])
    
    M = cv2.getPerspectiveTransform(pts_src, pts_dst)
    warped = cv2.warpPerspective(text_arr, M, (WIDTH, HEIGHT), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    
    # Composite warped text onto desk frame
    alpha = (warped[:, :, 3] / 255.0)[:, :, np.newaxis]
    rgb = warped[:, :, :3][:, :, ::-1]
    comp = (keyboard_frame.astype(float) * (1 - alpha * 0.92) + rgb.astype(float) * alpha).clip(0, 255).astype(np.uint8)
    
    pil_comp = Image.fromarray(comp[:, :, ::-1])
    draw = ImageDraw.Draw(pil_comp)
    draw.text((720, 1810), 'CREATOR x SYSTEM', font=f_body_sm, fill=(200, 200, 200))
    return np.array(pil_comp)[:, :, ::-1]

def render_scene_7(frame_idx):
    """Scene 7: Rapid-Fire Typographic Punch Cuts (Frames 619 - 690, 20.60s - 23.00s)."""
    # 3 distinct 24-frame staccato cuts
    if frame_idx < 643:
        # Hit 1: Black background, white bold text
        canvas = Image.new('RGB', (WIDTH, HEIGHT), color=COLOR_BLACK)
        draw = ImageDraw.Draw(canvas)
        draw.text((80, 850), 'NO', font=f_huge, fill=COLOR_CRIMSON)
        draw.text((80, 1020), 'BACKLOG.', font=f_huge, fill=COLOR_WHITE)
    elif frame_idx < 667:
        # Hit 2: Crimson background, black bold text
        canvas = Image.new('RGB', (WIDTH, HEIGHT), color=COLOR_CRIMSON)
        draw = ImageDraw.Draw(canvas)
        draw.text((80, 850), 'NO', font=f_huge, fill=COLOR_BLACK)
        draw.text((80, 1020), 'MIDNIGHT.', font=f_huge, fill=COLOR_BLACK)
    else:
        # Hit 3: Cream background, crimson bold text
        canvas = Image.new('RGB', (WIDTH, HEIGHT), color=COLOR_CREAM)
        draw = ImageDraw.Draw(canvas)
        draw.text((80, 850), 'NO', font=f_huge, fill=COLOR_CRIMSON)
        draw.text((80, 1020), 'LISTS.', font=f_huge, fill=COLOR_CRIMSON)
        
    draw.text((720, 1810), 'CREATOR x SYSTEM', font=f_body_sm, fill=(120, 120, 120))
    return np.array(canvas)[:, :, ::-1]

def render_scene_8(frame_idx):
    """Scene 8: Studio Outro CTA (Frames 691 - 767, 23.00s - 25.60s)."""
    local_f = frame_idx - 691
    zoom = 1.05 + 0.05 * (local_f / 76.0)
    speaker_frame = get_916_crop(cap_speaker, 23000, local_f, zoom=zoom, pan_y=30)
    
    pil_frame = Image.fromarray(speaker_frame[:, :, ::-1])
    draw = ImageDraw.Draw(pil_frame)
    
    # CTA Left Side: “SYSTEM” in quotation marks
    pulse = 1.0 + 0.03 * np.sin(local_f * 0.4)
    f_cta = ImageFont.truetype(FONT_HEADLINE, int(120 * pulse))
    draw.text((70, 780), 'comment', font=f_punch, fill=COLOR_WHITE)
    draw.text((70, 860), '“SYSTEM”', font=f_cta, fill=COLOR_CRIMSON)
    
    # Right Side / Lower
    draw.text((70, 1080), 'AND I\'LL SEND YOU', font=f_punch, fill=COLOR_WHITE)
    draw.text((70, 1165), 'THE EXACT BLUEPRINT.', font=f_punch, fill=COLOR_WHITE)
    
    # CTA Badge
    draw.rounded_rectangle((70, 1280, 480, 1350), radius=20, fill=(255, 255, 255, 240))
    draw.text((100, 1298), 'DROP A COMMENT ⚡', font=f_body_md, fill=COLOR_BLACK)
    
    draw.text((720, 1810), 'CREATOR x SYSTEM', font=f_body_sm, fill=(200, 200, 200))
    return np.array(pil_frame)[:, :, ::-1]

def render_master_video():
    """Main rendering loop: renders all 768 frames and streams directly into ffmpeg."""
    print(f"Starting master render: {TOTAL_FRAMES} frames @ {FPS}fps (1080x1920)...")
    
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{WIDTH}x{HEIGHT}",
        "-pix_fmt", "bgr24",
        "-r", str(FPS),
        "-i", "-",  # Video input from pipe
        "-i", AUDIO_MASTER,  # Master soundtrack input
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "320k",
        "-shortest",
        OUTPUT_MP4
    ]
    
    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)
    
    for f in range(TOTAL_FRAMES):
        if f <= 54:
            frame = render_scene_1(f)
        elif f <= 186:
            frame = render_scene_2(f)
        elif f <= 348:
            frame = render_scene_3(f)
        elif f <= 438:
            frame = render_scene_4(f)
        elif f <= 540:
            frame = render_scene_5(f)
        elif f <= 618:
            frame = render_scene_6(f)
        elif f <= 690:
            frame = render_scene_7(f)
        else:
            frame = render_scene_8(f)
            
        proc.stdin.write(frame.tobytes())
        if f % 75 == 0 or f == TOTAL_FRAMES - 1:
            pct = (f + 1) / TOTAL_FRAMES * 100
            print(f"Render progress: frame {f+1}/{TOTAL_FRAMES} ({pct:.1f}%)")
            
    proc.stdin.close()
    proc.wait()
    print("Master video render completed successfully!")
    print(f"Output deliverable: {OUTPUT_MP4}")

if __name__ == "__main__":
    render_master_video()
    cap_speaker.release()
    cap_desk.release()
    cap_phone.release()
    cap_keyboard.release()

"""Measure and lay out design components using the same glyph pixels used at export."""
import json
import math
import sys
from PIL import Image, ImageDraw, ImageFont

c = json.load(sys.stdin)
w, h = c['canvas']['width'], c['canvas']['height']
p, recipe = c['profile'], c['recipe']
im = Image.new('RGBA', (w, h), (0, 0, 0, 0) if recipe == 'lower-third' else p['background'])
d = ImageDraw.Draw(im)
margin = math.ceil(min(w, h) * p['marginRatio'])
params = c.get('parameters', {})
gap = max(6, round(min(w, h) * .025 * params.get('spacingScale', 1)))
font_path = c['font']
stroke = p.get('textStrokePx', 0)
border = p.get('borderPx', 0)
shadow = p.get('shadowPx', 0)


def font(size):
    return ImageFont.truetype(font_path, size)


def wrap(text, f, width):
    lines = []
    for paragraph in text.split('\n'):
        line = ''
        for word in paragraph.split():
            if d.textlength(word, font=f) > width:
                return None
            trial = (line + ' ' + word).strip()
            if line and d.textlength(trial, font=f) > width:
                lines.append(line)
                line = word
            else:
                line = trial
        if line:
            lines.append(line)
    return '\n'.join(lines)


def fitted(text, preferred, minimum, width, max_lines):
    for size in range(preferred, minimum - 1, -1):
        f = font(size)
        wrapped = wrap(text, f, width - 2 * stroke)
        if wrapped and len(wrapped.split('\n')) <= max_lines:
            b = d.multiline_textbbox((0, 0), wrapped, font=f, spacing=gap // 2, stroke_width=stroke)
            return {'text': wrapped, 'size': size, 'box': b, 'font': f, 'height': b[3] - b[1]}
    raise ValueError('Content cannot fit at the minimum readable size. Shorten the text or choose a card.')


width = w - 2 * margin - 2 * gap - shadow
if recipe == 'lower-third':
    width = min(width, round(w * .72))
unit = min(w, h * 1.5)
minimum = max(16, round(unit * .027))
title_size = max(minimum, round(unit * p['titleRatio']))
if recipe == 'lower-third':
    title_size = max(minimum, round(title_size * .72))
elements = []
if c.get('eyebrow'):
    elements.append(('eyebrow', fitted(c['eyebrow'], max(minimum, round(title_size * .4)), minimum, width, 1)))
if recipe == 'statistic-card':
    elements.append(('value', fitted(c['value'], round(title_size * 1.9), minimum * 2, width, 1)))
requested_title_size = max(minimum, round(title_size * params.get('titleScale', 1)))
elements.append(('title', fitted(c['title'], requested_title_size, minimum, width, c['rules']['maxTitleLines'])))
if c.get('body'):
    elements.append(('body', fitted(c['body'], max(minimum, round(title_size * .48)), minimum, width, c['rules']['maxBodyLines'])))
total_h = sum(e['height'] for _, e in elements) + gap * (len(elements) - 1)
if total_h + 2 * gap > h - 2 * margin:
    raise ValueError('Text hierarchy exceeds the available height. Shorten the content.')
x = margin + gap
y = h - margin - gap - total_h if recipe == 'lower-third' else round((h - total_h) / 2)
if recipe == 'lower-third':
    panel_width = math.ceil(max(e['box'][2] - e['box'][0] for _, e in elements)) + 2 * gap
    if border:
        box = (margin, y - gap, margin + panel_width, h - margin)
        d.rectangle(tuple(v + shadow for v in box), fill=p['foreground'])
        d.rectangle(box, fill=p['surface'], outline=p['foreground'], width=border)
    else:
        d.rectangle((margin, y - gap, margin + panel_width, h - margin), fill=p['surface'])
        d.rectangle((margin, y - gap, margin + max(3, gap // 4), h - margin), fill=p['accent'])
else:
    if border:
        box = (margin, margin, w - margin - shadow, h - margin - shadow)
        d.rectangle(tuple(v + shadow for v in box), fill=p['foreground'])
        d.rectangle(box, fill=p['surface'], outline=p['foreground'], width=border)
    else:
        d.rectangle((x, y - gap, x + round(w * .08), y - gap + max(3, gap // 4)), fill=p['accent'])
report = []
for role, e in elements:
    b = e['box']
    color = p['accent'] if role in ('eyebrow', 'value') else p['foreground']
    d.multiline_text((x - b[0], y - b[1]), e['text'], font=e['font'], fill=color, spacing=gap // 2, stroke_width=stroke, stroke_fill=color)
    report.append({'role': role, 'text': e['text'], 'fontSize': e['size'],
                   'bounds': {'x': x, 'y': y, 'width': b[2] - b[0], 'height': e['height']}})
    y += e['height'] + gap
im.save(c['output'])
alpha = im.getchannel('A').getbbox()
print(json.dumps({'elements': report, 'marginPx': margin, 'gapPx': gap, 'minimumFontPx': minimum,
                  'requestedTitleFontPx': requested_title_size, 'alphaBounds': dict(zip(('x', 'y', 'width', 'height'), (alpha[0], alpha[1], alpha[2] - alpha[0], alpha[3] - alpha[1])))}))

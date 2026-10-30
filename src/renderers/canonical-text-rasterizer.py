"""Plain canonical text overlay. Reuses the existing Pillow typography dependency."""
import json, sys
from PIL import Image, ImageDraw, ImageFont
c = json.load(sys.stdin)
im = Image.new('RGBA', (c['width'], c['height']), (0, 0, 0, 0))
f = ImageFont.truetype(c['font'], c['size'])
d = ImageDraw.Draw(im)
b = d.multiline_textbbox((0, 0), c['text'], font=f, align=c['align'])
x = {'left': 0, 'center': (c['width'] - (b[2]-b[0]))/2, 'right': c['width']-(b[2]-b[0])}[c['align']]
y = (c['height']-(b[3]-b[1]))/2-b[1]
if c.get('backing'):
    p = c['backing']['padding']
    panel = (x+b[0]-p, y+b[1]-p, x+b[2]+p, y+b[3]+p)
    if panel[0] < 0 or panel[1] < 0 or panel[2] >= c['width'] or panel[3] >= c['height']:
        raise ValueError('Title and backing exceed the canvas. Use smaller or multiline text.')
    d.rectangle(panel, fill=c['backing']['color'])
d.multiline_text((x, y), c['text'], font=f, fill=c['color'], align=c['align'])
im.save(c['output'])
print(json.dumps({'alpha_bounds': im.getchannel('A').getbbox()}))

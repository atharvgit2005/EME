"""Bounded silent motion proxy. Same compiled channels, composited over a source still."""
import json,sys,math
from PIL import Image
c=json.load(sys.stdin)
glyph=Image.open(c['glyph']).convert('RGBA')
w,h=glyph.size
width=min(480,w); scale=width/w; size=(width,round(h*scale))
glyph=glyph.resize(size,Image.Resampling.LANCZOS)
background=Image.open(c['background']).convert('RGBA').resize(size) if c.get('background') else Image.new('RGBA',size,c['color'])
def channel(keys,tick):
    if tick<=keys[0]['offsetTick']: return keys[0]['value']
    for a,b in zip(keys,keys[1:]):
        if tick<b['offsetTick']:
            return a['value']+(b['value']-a['value'])*(tick-a['offsetTick'])/(b['offsetTick']-a['offsetTick'])
    return keys[-1]['value']
duration=c['durationTicks']/120000
preview_seconds=min(duration,10)
frames=[]
for i in range(max(2,math.ceil(preview_seconds*12))):
    t=i/12
    if duration>10 and t>=preview_seconds-1: t=duration-(preview_seconds-t)
    tick=min(c['durationTicks']-1,round(t*120000))
    overlay=glyph.copy()
    alpha=channel(c['opacity'],tick)
    overlay.putalpha(overlay.getchannel('A').point(lambda v:round(v*alpha)))
    frame=background.copy()
    frame.alpha_composite(overlay,(0,round(channel(c['y'],tick)*scale)))
    frames.append(frame.convert('RGB'))
frames[0].save(c['output'],format='WEBP',save_all=True,append_images=frames[1:],duration=83,loop=0,quality=80)
print(json.dumps({'fps':12,'width':size[0],'height':size[1],'holdShortened':duration>10,'kind':'silent_motion_proxy_over_still'}))

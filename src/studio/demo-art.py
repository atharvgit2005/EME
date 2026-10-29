import sys, os, math
from PIL import Image, ImageDraw, ImageFont
folder=sys.argv[1]
paths=['/System/Library/Fonts/Supplemental/Arial Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
font=next((p for p in paths if os.path.exists(p)),None)
if not font: raise RuntimeError('Install a system Arial or DejaVu Sans font for the demo')
for index,(title,sub,bg,fg) in enumerate([('MAKE YOUR\nNEXT MOVE.','01 / A LITTLE MOMENTUM','#eb5b2b','#151515'),('LESS FRICTION.\nMORE FLOW.','02 / FIND YOUR RHYTHM','#dedbcf','#191919'),('GOOD IDEAS\nDESERVE MOTION.','03 / BUILT WITH EME','#181818','#ece9df')]):
 im=Image.new('RGB',(960,540),bg);d=ImageDraw.Draw(im)
 for r in range(110,350,22): d.ellipse((850-r,300-r,850+r,300+r),outline=fg,width=2)
 d.text((48,40),'M / E',font=ImageFont.truetype(font,27),fill=fg)
 d.text((48,112),title,font=ImageFont.truetype(font,65 if index<2 else 57),fill=fg,spacing=0)
 d.text((50,470),sub,font=ImageFont.truetype(font,15),fill=fg)
 d.line((48,442,910,442),fill=fg,width=1)
 im.save(os.path.join(folder,f'scene-{index}.png'))

#!/usr/bin/env python3
import argparse, json, hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W,H=640,800
HALF=W//2
ANATOMY_BOX=(360,0,640,180)
LABEL_Y=610
TEXT=(188,174,145)
LINE=(173,155,118)

def cover_center(im,w,h):
    im=im.convert('RGB')
    scale=max(w/im.width,h/im.height)
    nw=max(w,round(im.width*scale)); nh=max(h,round(im.height*scale))
    im=im.resize((nw,nh),Image.Resampling.LANCZOS)
    x=(nw-w)//2; y=(nh-h)//2
    return im.crop((x,y,x+w,y+h))

def panel(im):
    # Phase generation is native 320x800, exactly one fixed-template half.
    im=im.convert('RGB')
    if im.size==(HALF,H): return im
    return im.resize((HALF,H),Image.Resampling.LANCZOS)

def feather_paste(dst, patch, xy, feather=18):
    patch=patch.convert('RGB')
    mask=Image.new('L',patch.size,255)
    d=ImageDraw.Draw(mask)
    for i in range(feather):
        a=int(255*(i+1)/feather)
        d.rectangle((i,i,patch.width-1-i,patch.height-1-i),outline=a)
    mask=mask.filter(ImageFilter.GaussianBlur(feather/2))
    dst.paste(patch,xy,mask)

def font(size):
    for p in [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'
    ]:
        if Path(p).exists(): return ImageFont.truetype(p,size)
    return ImageFont.load_default()

def label(draw,text,cx):
    f=font(11)
    box=draw.textbbox((0,0),text,font=f)
    tw=box[2]-box[0]
    x=cx-tw//2
    draw.text((x,LABEL_Y),text,font=f,fill=TEXT)
    ly=LABEL_Y+18
    draw.line((cx-11,ly,cx+11,ly),fill=LINE,width=1)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--start',required=True)
    ap.add_argument('--final',required=True)
    ap.add_argument('--anatomy-source',required=True)
    ap.add_argument('--out',required=True)
    ap.add_argument('--meta',required=True)
    ap.add_argument('--exercise-id',required=True)
    args=ap.parse_args()

    left=panel(Image.open(args.start))
    right=panel(Image.open(args.final))
    canvas=Image.new('RGB',(W,H),(18,18,18))
    canvas.paste(left,(0,0)); canvas.paste(right,(HALF,0))
    draw=ImageDraw.Draw(canvas)
    draw.line((HALF-1,0,HALF-1,H),fill=(70,67,61),width=1)

    anatomy=Image.open(args.anatomy_source).convert('RGB').crop(ANATOMY_BOX)
    feather_paste(canvas,anatomy,(ANATOMY_BOX[0],ANATOMY_BOX[1]),14)
    draw=ImageDraw.Draw(canvas)
    label(draw,'Inicio',HALF//2)
    label(draw,'Final',HALF+HALF//2)

    out=Path(args.out); out.parent.mkdir(parents=True,exist_ok=True)
    canvas.save(out,'WEBP',quality=90,method=6)
    data=out.read_bytes()
    meta={
      'schema':'iberfit.exercise.fixed-template-candidate.v1',
      'template':'iberfit-published-640x800-v1',
      'exercise_id':args.exercise_id,
      'width':W,'height':H,'mime':'image/webp',
      'layout':{'left':'Inicio','right':'Final','split_x':HALF,'anatomy_box':ANATOMY_BOX,'label_y':LABEL_Y},
      'branding':{'ai_generated_branding':False,'official_isotype_in_image':False,'app_overlay_asset':'/public/isotipo-iberfit.png'},
      'sha256':hashlib.sha256(data).hexdigest(),
      'publishable':False
    }
    Path(args.meta).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(meta,ensure_ascii=False))

if __name__=='__main__': main()

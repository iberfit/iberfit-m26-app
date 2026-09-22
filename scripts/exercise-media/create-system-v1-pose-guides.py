#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw
import argparse, json

W,H=1024,1600
BG=(13,18,16)
BODY=(224,227,225)
JOINT=(83,148,104)
EQUIP=(150,153,150)
BENCH=(74,78,76)
GROUND=(47,55,51)
TARGETS=('IBF-DOMINADA-PRONADA','IBF-BUENOS-DIAS-CON-BARRA','IBF-APERTURAS-CON-MANCUERNAS')

def limb(draw,a,b,width=30):
    draw.line((a,b),fill=BODY,width=width)
    radius=max(8,width//3)
    for x,y in (a,b): draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=JOINT)

def head(draw,center,radius=48):
    x,y=center
    draw.ellipse((x-radius,y-radius,x+radius,y+radius),outline=BODY,width=18)

def dumbbell(draw,center,scale=1.0):
    x,y=center
    bar=int(55*scale); plate=int(24*scale); half=int(42*scale)
    draw.line((x-half,y,x+half,y),fill=EQUIP,width=max(8,int(14*scale)))
    draw.rectangle((x-half-plate,y-bar//2,x-half+4,y+bar//2),fill=EQUIP)
    draw.rectangle((x+half-4,y-bar//2,x+half+plate,y+bar//2),fill=EQUIP)

def guide(exercise_id,phase):
    image=Image.new('RGB',(W,H),BG)
    draw=ImageDraw.Draw(image)
    draw.line((80,1480,944,1480),fill=GROUND,width=5)
    if exercise_id=='IBF-DOMINADA-PRONADA':
        draw.line((110,170,914,170),fill=EQUIP,width=26)
        if phase=='start':
            head(draw,(512,420))
            limb(draw,(512,475),(512,900),36)
            limb(draw,(455,520),(350,360)); limb(draw,(350,360),(300,170))
            limb(draw,(569,520),(674,360)); limb(draw,(674,360),(724,170))
            limb(draw,(512,900),(470,1160)); limb(draw,(470,1160),(455,1415))
            limb(draw,(512,900),(554,1160)); limb(draw,(554,1160),(569,1415))
        else:
            head(draw,(512,230))
            limb(draw,(512,290),(512,760),36)
            limb(draw,(455,340),(345,420)); limb(draw,(345,420),(300,170))
            limb(draw,(569,340),(679,420)); limb(draw,(679,420),(724,170))
            limb(draw,(512,760),(470,1030)); limb(draw,(470,1030),(455,1320))
            limb(draw,(512,760),(554,1030)); limb(draw,(554,1030),(569,1320))
    elif exercise_id=='IBF-BUENOS-DIAS-CON-BARRA':
        if phase=='start':
            head(draw,(520,360))
            limb(draw,(510,420),(510,900),40)
            limb(draw,(470,490),(345,515)); limb(draw,(550,490),(675,515))
            draw.line((265,465,755,465),fill=EQUIP,width=28)
            limb(draw,(510,900),(450,1170)); limb(draw,(450,1170),(430,1440))
            limb(draw,(510,900),(575,1170)); limb(draw,(575,1170),(595,1440))
        else:
            head(draw,(705,530))
            limb(draw,(660,585),(430,900),40)
            limb(draw,(600,610),(480,520)); limb(draw,(700,650),(585,555))
            draw.line((470,500,850,620),fill=EQUIP,width=28)
            limb(draw,(430,900),(365,1160)); limb(draw,(365,1160),(335,1435))
            limb(draw,(430,900),(540,1140)); limb(draw,(540,1140),(600,1435))
    elif exercise_id=='IBF-APERTURAS-CON-MANCUERNAS':
        draw.rounded_rectangle((205,910,820,990),radius=22,fill=BENCH)
        head(draw,(512,600))
        limb(draw,(512,650),(512,930),40)
        limb(draw,(512,930),(420,1180)); limb(draw,(420,1180),(380,1445))
        limb(draw,(512,930),(605,1180)); limb(draw,(605,1180),(645,1445))
        if phase=='start':
            limb(draw,(445,690),(430,530)); limb(draw,(430,530),(475,380))
            limb(draw,(579,690),(594,530)); limb(draw,(594,530),(549,380))
            dumbbell(draw,(475,360),1.1); dumbbell(draw,(549,360),1.1)
        else:
            limb(draw,(445,690),(300,730)); limb(draw,(300,730),(125,760))
            limb(draw,(579,690),(724,730)); limb(draw,(724,730),(899,760))
            dumbbell(draw,(105,760),1.1); dumbbell(draw,(919,760),1.1)
    else:
        raise ValueError(f'PILOT_TARGET_NOT_ALLOWED:{exercise_id}')
    return image

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out-dir',required=True)
    args=parser.parse_args()
    out=Path(args.out_dir);out.mkdir(parents=True,exist_ok=True)
    for exercise_id in TARGETS:
        for phase in ('start','final'):
            guide(exercise_id,phase).save(out/f'{exercise_id}-{phase}.png','PNG')
    manifest={'schema':'iberfit.exercise.media.system-v1.pose-guides.v1','width':W,'height':H,'targets':list(TARGETS),'phases':['start','final']}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'ok':True,'count':len(TARGETS)*2,'width':W,'height':H}))

if __name__=='__main__': main()

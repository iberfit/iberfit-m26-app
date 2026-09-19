#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw
import argparse, json

W,H=320,800
BG=(14,16,16)
BODY=(220,224,222)
JOINT=(91,184,118)
EQUIP=(145,148,145)
BENCH=(82,85,83)

def limb(d,a,b,w=12):
    d.line((a,b),fill=BODY,width=w)
    for p in (a,b): d.ellipse((p[0]-5,p[1]-5,p[0]+5,p[1]+5),fill=JOINT)

def head(d,c,r=18):
    d.ellipse((c[0]-r,c[1]-r,c[0]+r,c[1]+r),outline=BODY,width=7)

def dumbbell(d,c):
    x,y=c
    d.line((x-16,y,x+16,y),fill=EQUIP,width=6)
    d.rectangle((x-23,y-13,x-14,y+13),fill=EQUIP)
    d.rectangle((x+14,y-13,x+23,y+13),fill=EQUIP)

def standing_front(d,pts):
    head(d,pts['head'])
    limb(d,pts['neck'],pts['hip'],14)
    limb(d,pts['ls'],pts['le']); limb(d,pts['le'],pts['lh'])
    limb(d,pts['rs'],pts['re']); limb(d,pts['re'],pts['rh'])
    limb(d,pts['hip'],pts['lk']); limb(d,pts['lk'],pts['lf'])
    limb(d,pts['hip'],pts['rk']); limb(d,pts['rk'],pts['rf'])
    limb(d,pts['ls'],pts['rs'],10)

def guide(id,phase):
    im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im)
    d.line((25,740,295,740),fill=(55,58,56),width=2)
    if id=='IBF-DOMINADA-PRONADA':
        d.line((38,105,282,105),fill=EQUIP,width=9)
        if phase=='start':
            p={'head':(160,215),'neck':(160,245),'hip':(160,475),'ls':(130,260),'rs':(190,260),'le':(105,185),'re':(215,185),'lh':(92,105),'rh':(228,105),'lk':(145,590),'rk':(175,590),'lf':(142,705),'rf':(178,705)}
        else:
            p={'head':(160,92),'neck':(160,135),'hip':(160,390),'ls':(128,165),'rs':(192,165),'le':(100,220),'re':(220,220),'lh':(92,105),'rh':(228,105),'lk':(145,520),'rk':(175,520),'lf':(142,655),'rf':(178,655)}
        standing_front(d,p)
    elif id=='IBF-BUENOS-DIAS-CON-BARRA':
        # side-ish profile; bar fixed across shoulders
        if phase=='start':
            head(d,(160,180)); limb(d,(160,215),(160,430),16)
            limb(d,(145,245),(105,260)); limb(d,(175,245),(215,260))
            limb(d,(160,430),(140,565)); limb(d,(140,565),(135,705))
            limb(d,(160,430),(185,565)); limb(d,(185,565),(190,705))
            d.line((80,235,240,235),fill=EQUIP,width=10)
        else:
            head(d,(225,310)); limb(d,(210,335),(145,455),16)
            limb(d,(195,350),(150,330)); limb(d,(225,365),(180,345))
            limb(d,(145,455),(118,570)); limb(d,(118,570),(105,705))
            limb(d,(145,455),(175,565)); limb(d,(175,565),(190,705))
            d.line((135,320,270,355),fill=EQUIP,width=10)
    elif id=='IBF-PAJAROS-CON-MANCUERNAS':
        # hinged torso in both phases
        head(d,(205,260)); limb(d,(190,290),(145,455),16)
        limb(d,(145,455),(120,575)); limb(d,(120,575),(110,710))
        limb(d,(145,455),(175,575)); limb(d,(175,575),(190,710))
        if phase=='start':
            limb(d,(180,325),(160,425)); limb(d,(160,425),(150,525))
            limb(d,(205,335),(215,430)); limb(d,(215,430),(225,525))
            dumbbell(d,(150,530)); dumbbell(d,(225,530))
        else:
            limb(d,(180,325),(95,340)); limb(d,(95,340),(45,350))
            limb(d,(205,335),(250,345)); limb(d,(250,345),(292,350))
            dumbbell(d,(42,350)); dumbbell(d,(292,350))
    elif id=='IBF-APERTURAS-CON-MANCUERNAS':
        d.rectangle((65,505,255,535),fill=BENCH)
        # frontal-from-feet perspective, supine
        head(d,(160,300)); limb(d,(160,330),(160,500),16)
        limb(d,(160,500),(125,610)); limb(d,(125,610),(105,720))
        limb(d,(160,500),(195,610)); limb(d,(195,610),(215,720))
        if phase=='start':
            limb(d,(130,350),(120,300)); limb(d,(120,300),(140,245))
            limb(d,(190,350),(200,300)); limb(d,(200,300),(180,245))
            dumbbell(d,(140,240)); dumbbell(d,(180,240))
        else:
            limb(d,(130,350),(82,365)); limb(d,(82,365),(35,380))
            limb(d,(190,350),(238,365)); limb(d,(238,365),(285,380))
            dumbbell(d,(32,380)); dumbbell(d,(288,380))
    elif id=='IBF-PULLOVER-CON-MANCUERNA':
        d.rectangle((55,520,265,550),fill=BENCH)
        # side view: head to left, knees/feet down
        head(d,(92,385)); limb(d,(115,405),(210,455),16)
        limb(d,(210,455),(235,575)); limb(d,(235,575),(250,710))
        limb(d,(205,455),(190,580)); limb(d,(190,580),(180,710))
        if phase=='start':
            limb(d,(135,420),(150,330)); limb(d,(150,330),(160,255))
            limb(d,(150,425),(165,335)); limb(d,(165,335),(160,255))
            dumbbell(d,(160,245))
        else:
            limb(d,(135,420),(105,335)); limb(d,(105,335),(68,275))
            limb(d,(150,425),(118,340)); limb(d,(118,340),(68,275))
            dumbbell(d,(62,265))
    else:
        raise ValueError(id)
    return im

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--out-dir',required=True)
    args=ap.parse_args()
    ids=['IBF-APERTURAS-CON-MANCUERNAS','IBF-DOMINADA-PRONADA','IBF-BUENOS-DIAS-CON-BARRA','IBF-PAJAROS-CON-MANCUERNAS','IBF-PULLOVER-CON-MANCUERNA']
    out=Path(args.out_dir);out.mkdir(parents=True,exist_ok=True)
    for id in ids:
        for phase in ('start','final'):
            p=out/f'{id}-{phase}.png'
            guide(id,phase).save(p,'PNG')
    (out/'manifest.json').write_text(json.dumps({'schema':'iberfit.exercise.pose-guides.batch03.v1','width':W,'height':H,'ids':ids},indent=2)+'\n')
    print(json.dumps({'ok':True,'count':len(ids)*2,'width':W,'height':H}))

if __name__=='__main__':main()

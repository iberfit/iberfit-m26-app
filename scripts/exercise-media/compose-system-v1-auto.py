#!/usr/bin/env python3
import argparse, hashlib, json, math, unicodedata
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps

MASTER_W,MASTER_H=1280,1600
PANEL_W=640
DELIVERY_W,DELIVERY_H=640,800
OFFICIAL_ISOTIPO_SHA256='d4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa'
IDENTITY_MASTER_SHA256='b74f8de6b50e484fa11b5d6c928b681d4b63451ad5909d81630123603e44e0bb'
ANATOMY_W,ANATOMY_H=180,250
ANATOMY_X,ANATOMY_Y=36,42
BODY=(179,184,180,235);OUTLINE=(91,101,95,220);PRIMARY=(35,101,73,245);SECONDARY=(178,149,88,225);NEUTRAL=(216,208,194,205)
GENERIC={'movilidad','global','musculo objetivo'}

def norm(v):
    s=unicodedata.normalize('NFKD',str(v or '')).encode('ascii','ignore').decode('ascii').lower()
    return ' '.join(s.replace('_',' ').replace('-',' ').split())
ALIASES={'gluteo':'gluteos','gluteo mayor':'gluteos','gluteo medio':'gluteos','cuadriceps':'cuadriceps','biceps':'biceps','triceps':'triceps','deltoide':'deltoides','deltoide anterior':'deltoides anterior','deltoide posterior':'deltoides posterior','erector espinal':'erectores espinales','espinales':'erectores espinales','dorsal':'dorsal ancho','dorsales':'dorsal ancho','pectorales':'pectoral'}
def canon(v): return ALIASES.get(norm(v),norm(v))

FRONT={
 'pectoral':[('ellipse',(42,38,58,57)),('ellipse',(58,38,74,57))],
 'deltoides':[('ellipse',(33,36,47,52)),('ellipse',(69,36,83,52))],
 'deltoides anterior':[('ellipse',(35,38,45,51)),('ellipse',(71,38,81,51))],
 'biceps':[('ellipse',(25,55,38,79)),('ellipse',(78,55,91,79))],
 'triceps':[('ellipse',(24,58,35,80)),('ellipse',(81,58,92,80))],
 'core':[('poly',[(48,57),(68,57),(70,94),(46,94)])],
 'oblicuos':[('poly',[(43,60),(51,62),(50,92),(43,95)]),('poly',[(65,62),(73,60),(73,95),(66,92)])],
 'cuadriceps':[('ellipse',(40,103,54,136)),('ellipse',(62,103,76,136))],
 'aductores':[('ellipse',(51,104,59,135)),('ellipse',(57,104,65,135))],
 'serrato':[('poly',[(41,51),(48,54),(46,70),(40,66)]),('poly',[(68,54),(75,51),(76,66),(70,70)])],
}
BACK={
 'dorsal ancho':[('poly',[(39,47),(50,42),(55,85),(47,97),(37,75)]),('poly',[(66,42),(77,47),(79,75),(69,97),(61,85)])],
 'romboides':[('poly',[(49,43),(58,47),(54,66),(45,60)]),('poly',[(58,47),(67,43),(71,60),(62,66)])],
 'deltoides':[('ellipse',(33,36,47,52)),('ellipse',(69,36,83,52))],
 'deltoides posterior':[('ellipse',(33,37,46,52)),('ellipse',(70,37,83,52))],
 'triceps':[('ellipse',(24,55,36,80)),('ellipse',(80,55,92,80))],
 'erectores espinales':[('poly',[(52,55),(58,54),(57,101),(50,101)]),('poly',[(58,54),(64,55),(66,101),(59,101)])],
 'gluteos':[('ellipse',(43,92,58,112)),('ellipse',(58,92,73,112))],
 'isquiotibiales':[('ellipse',(41,109,54,138)),('ellipse',(62,109,75,138))],
}

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def mark(draw,shape,color):
    kind,args=shape
    if kind=='ellipse': draw.ellipse(args,fill=color)
    else: draw.polygon(args,fill=color)
def base_figure():
    im=Image.new('RGBA',(116,164),(0,0,0,0));d=ImageDraw.Draw(im,'RGBA')
    d.ellipse((45,4,71,30),fill=NEUTRAL,outline=OUTLINE,width=1);d.polygon([(42,34),(74,34),(82,72),(72,105),(44,105),(34,72)],fill=BODY,outline=OUTLINE)
    d.line((39,42,24,79,19,113),fill=BODY,width=10,joint='curve');d.line((77,42,92,79,97,113),fill=BODY,width=10,joint='curve');d.line((50,99,44,132,40,160),fill=BODY,width=12,joint='curve');d.line((66,99,72,132,76,160),fill=BODY,width=12,joint='curve')
    return im
def render_view(mapping,primary,secondary,size):
    fig=base_figure();d=ImageDraw.Draw(fig,'RGBA')
    for m in secondary:
        for s in mapping.get(canon(m),[]): mark(d,s,SECONDARY)
    for m in primary:
        for s in mapping.get(canon(m),[]): mark(d,s,PRIMARY)
    return fig.resize(size,Image.Resampling.LANCZOS)
def anatomy(primary,secondary):
    p=[canon(x) for x in primary];s=[canon(x) for x in secondary]
    front_score=sum(1 for x in p if x in FRONT);back_score=sum(1 for x in p if x in BACK)
    if front_score+back_score==0: raise ValueError('ANATOMY_PRIMARY_UNMAPPED')
    views=[]
    if front_score: views.append(('front',FRONT))
    if back_score: views.append(('back',BACK))
    inset=Image.new('RGBA',(ANATOMY_W,ANATOMY_H),(0,0,0,0));halo=Image.new('L',inset.size,0);hd=ImageDraw.Draw(halo);hd.ellipse((8,4,ANATOMY_W-8,ANATOMY_H-4),fill=105);halo=halo.filter(ImageFilter.GaussianBlur(18));inset.alpha_composite(Image.composite(Image.new('RGBA',inset.size,(5,13,9,112)),Image.new('RGBA',inset.size,(0,0,0,0)),halo))
    if len(views)==1:
        fig=render_view(views[0][1],p,s,(154,218));inset.alpha_composite(fig,(13,16));used=[views[0][0]]
    else:
        fig1=render_view(FRONT,p,s,(78,111));fig2=render_view(BACK,p,s,(78,111));inset.alpha_composite(fig1,(7,65));inset.alpha_composite(fig2,(95,65));used=['front','back']
    return inset,used

def fit_panel(path):
    src=Image.open(path).convert('RGB');sw,sh=src.size;target_ratio=PANEL_W/MASTER_H;source_ratio=sw/sh
    if source_ratio>target_ratio:
        crop_h=sh;crop_w=round(sh*target_ratio);left=(sw-crop_w)/2;top=0
    else:
        crop_w=sw;crop_h=round(sw/target_ratio);left=0;top=(sh-crop_h)/2
    fitted=ImageOps.fit(src,(PANEL_W,MASTER_H),method=Image.Resampling.LANCZOS,centering=(0.5,0.5))
    return fitted,{'sw':sw,'sh':sh,'crop_left':left,'crop_top':top,'crop_w':crop_w,'crop_h':crop_h}
def transform_anchor(loc,geom):
    sx=float(loc['x'])*geom['sw'];sy=float(loc['y'])*geom['sh'];x=(sx-geom['crop_left'])*PANEL_W/geom['crop_w'];y=(sy-geom['crop_top'])*MASTER_H/geom['crop_h'];return x,y

def logo_asset(path):
    actual=sha(path)
    if actual!=OFFICIAL_ISOTIPO_SHA256: raise ValueError('OFFICIAL_ISOTIPO_SHA_MISMATCH')
    return Image.open(path).convert('RGBA')
def scaled_rotated(logo,width,rotation,opacity=1.0):
    ratio=width/logo.width;im=logo.resize((width,max(1,round(logo.height*ratio))),Image.Resampling.LANCZOS)
    if opacity<1: im.putalpha(im.getchannel('A').point(lambda v:int(v*opacity)))
    if abs(rotation)>0.1: im=im.rotate(-rotation,Image.Resampling.BICUBIC,expand=True)
    return im
def paste_center(canvas,im,x,y): canvas.alpha_composite(im,(round(x-im.width/2),round(y-im.height/2)))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--claim',required=True);ap.add_argument('--plan',required=True);ap.add_argument('--start',required=True);ap.add_argument('--final',required=True);ap.add_argument('--start-anchor',required=True);ap.add_argument('--final-anchor',required=True);ap.add_argument('--official-isotipo',required=True);ap.add_argument('--master-out',required=True);ap.add_argument('--delivery-out',required=True);ap.add_argument('--meta-out',required=True);args=ap.parse_args()
    claim=json.loads(Path(args.claim).read_text());plan=json.loads(Path(args.plan).read_text());exercise=claim['claim']['exercise'];eid=exercise['id']
    if plan.get('exercise_id')!=eid: raise ValueError('PLAN_ID_MISMATCH')
    primary=[canon(x) for x in plan.get('anatomy_primary',[])];secondary=[canon(x) for x in plan.get('anatomy_secondary',[])]
    if not primary: raise ValueError('ANATOMY_PRIMARY_EMPTY')
    left,lgeom=fit_panel(args.start);right,rgeom=fit_panel(args.final);master=Image.new('RGB',(MASTER_W,MASTER_H),(10,17,13));master.paste(left,(0,0));master.paste(right,(PANEL_W,0));ImageDraw.Draw(master).line((PANEL_W-1,0,PANEL_W-1,MASTER_H),fill=(56,65,59),width=2);rgba=master.convert('RGBA')
    inset,views=anatomy(primary,secondary);rgba.alpha_composite(inset,(ANATOMY_X,ANATOMY_Y))
    logo=logo_asset(args.official_isotipo);anchors={}
    for phase,locfile,geom,offset in [('start',args.start_anchor,lgeom,0),('final',args.final_anchor,rgeom,PANEL_W)]:
        loc=json.loads(Path(locfile).read_text());x,y=transform_anchor(loc,geom);x+=offset;mark=scaled_rotated(logo,34,float(loc.get('rotation_deg',0)),1.0);paste_center(rgba,mark,x,y);anchors[phase]={'center':[round(x,2),round(y,2)],'width':34,'rotation_deg':float(loc.get('rotation_deg',0)),'locator_confidence':float(loc.get('confidence',0))}
    wall=None
    if plan.get('wall_watermark') is True:
        mark=scaled_rotated(logo,230,0,0.085);x,y=1115,125;paste_center(rgba,mark,x,y);wall={'center':[x,y],'width':230,'opacity':0.085}
    master=rgba.convert('RGB');master_out=Path(args.master_out);delivery_out=Path(args.delivery_out);meta_out=Path(args.meta_out)
    for p in (master_out,delivery_out,meta_out): p.parent.mkdir(parents=True,exist_ok=True)
    master.save(master_out,'WEBP',quality=94,method=6);master.resize((DELIVERY_W,DELIVERY_H),Image.Resampling.LANCZOS).save(delivery_out,'WEBP',quality=91,method=6)
    meta={'schema':'iberfit.exercise.media.auto.candidate.v1','exercise_id':eid,'visual_system':'iberfit.exercise.media.system.v1','identity_master_sha256':IDENTITY_MASTER_SHA256,'master':{'path':str(master_out),'width':MASTER_W,'height':MASTER_H,'sha256':sha(master_out)},'delivery':{'path':str(delivery_out),'width':DELIVERY_W,'height':DELIVERY_H,'sha256':sha(delivery_out)},'layout':{'start':'left','final':'right','embedded_text':False,'phase_labels_in_pixels':False},'anatomy':{'corner':'upper-left','width':ANATOMY_W,'width_percent':round(ANATOMY_W/MASTER_W*100,3),'primary':primary,'secondary':secondary,'views':views,'inferred':bool(plan.get('anatomy_inferred')),'style':'analytical-anatomical-plate'},'branding':{'official_isotipo_sha256':OFFICIAL_ISOTIPO_SHA256,'generated_branding':False,'shirt':anchors,'wall_watermark':wall},'planner_confidence':float(plan.get('planner_confidence',0)),'human_approval_required':False,'automatic_dual_gate_required':True,'publishable':False}
    meta_out.write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');print(json.dumps(meta,ensure_ascii=False))
if __name__=='__main__': main()

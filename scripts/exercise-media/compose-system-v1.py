#!/usr/bin/env python3
import argparse, hashlib, json, unicodedata
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps

MASTER_W,MASTER_H=1280,1600
PANEL_W=MASTER_W//2
DELIVERY_W,DELIVERY_H=640,800
OFFICIAL_ISOTIPO_SHA256='d4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa'
ANATOMY_WIDTH=180
ANATOMY_HEIGHT=250
ANATOMY_X=36
ANATOMY_Y_DEFAULT=42
BODY=(177,181,178,238)
BODY_DARK=(95,104,99,220)
PRIMARY=(37,101,73,245)
SECONDARY=(177,149,88,235)
NEUTRAL=(213,205,190,205)

TARGET_SETTINGS={
 'IBF-DOMINADA-PRONADA':{
   'anatomy_view':'back','anatomy_y':220,'wall_watermark':False,
   'shirt':{'start':(340,505,34),'final':(PANEL_W+340,350,34)}},
 'IBF-BUENOS-DIAS-CON-BARRA':{
   'anatomy_view':'back','anatomy_y':42,'wall_watermark':True,
   'shirt':{'start':(345,420,34),'final':(PANEL_W+430,510,34)}},
 'IBF-APERTURAS-CON-MANCUERNAS':{
   'anatomy_view':'front','anatomy_y':42,'wall_watermark':True,
   'shirt':{'start':(340,655,34),'final':(PANEL_W+340,655,34)}},
}

ALIASES={
 'pecho':'pectoral','pectorales':'pectoral','pectoral mayor':'pectoral',
 'dorsales':'dorsal ancho','dorsal':'dorsal ancho','latissimus dorsi':'dorsal ancho',
 'hombros':'deltoides','hombro':'deltoides','deltoide':'deltoides',
 'deltoide posterior':'deltoides posterior',
 'erector espinal':'erectores espinales','espinales':'erectores espinales',
 'isquios':'isquiotibiales','femorales':'isquiotibiales',
 'gluteo':'gluteos','gluteo mayor':'gluteos','gluteo medio':'gluteos',
 'biceps braquial':'biceps','triceps braquial':'triceps',
}
FRONT={
 'pectoral':[('ellipse',(42,38,58,57)),('ellipse',(58,38,74,57))],
 'deltoides':[('ellipse',(33,36,47,52)),('ellipse',(69,36,83,52))],
 'deltoides anterior':[('ellipse',(35,38,45,51)),('ellipse',(71,38,81,51))],
 'biceps':[('ellipse',(25,55,38,79)),('ellipse',(78,55,91,79))],
 'triceps':[('ellipse',(24,58,35,80)),('ellipse',(81,58,92,80))],
 'core':[('poly',[(49,58),(67,58),(69,92),(47,92)])],
 'recto abdominal':[('poly',[(51,59),(65,59),(67,90),(49,90)])],
 'oblicuos':[('poly',[(44,60),(51,62),(50,91),(44,93)]),('poly',[(65,62),(72,60),(72,93),(66,91)])],
 'cuadriceps':[('ellipse',(41,103,54,135)),('ellipse',(62,103,75,135))],
 'aductores':[('ellipse',(51,104,59,134)),('ellipse',(57,104,65,134))],
 'gemelos':[('ellipse',(34,134,48,161)),('ellipse',(68,134,82,161))],
 'pantorrillas':[('ellipse',(34,134,48,161)),('ellipse',(68,134,82,161))],
}
BACK={
 'dorsal ancho':[('poly',[(39,47),(50,42),(55,84),(47,96),(37,75)]),('poly',[(66,42),(77,47),(79,75),(69,96),(61,84)])],
 'romboides':[('poly',[(49,43),(58,47),(54,65),(45,60)]),('poly',[(58,47),(67,43),(71,60),(62,65)])],
 'trapecio':[('poly',[(50,34),(66,34),(72,49),(58,57),(44,49)])],
 'deltoides posterior':[('ellipse',(33,37,46,52)),('ellipse',(70,37,83,52))],
 'deltoides':[('ellipse',(33,36,47,52)),('ellipse',(69,36,83,52))],
 'triceps':[('ellipse',(24,55,36,80)),('ellipse',(80,55,92,80))],
 'erectores espinales':[('poly',[(52,55),(58,54),(57,100),(50,100)]),('poly',[(58,54),(64,55),(66,100),(59,100)])],
 'gluteos':[('ellipse',(43,92,58,111)),('ellipse',(58,92,73,111))],
 'isquiotibiales':[('ellipse',(41,108,54,137)),('ellipse',(62,108,75,137))],
 'gemelos':[('ellipse',(34,134,48,161)),('ellipse',(68,134,82,161))],
 'pantorrillas':[('ellipse',(34,134,48,161)),('ellipse',(68,134,82,161))],
}

def normalize(value):
    value=unicodedata.normalize('NFKD',str(value or '')).encode('ascii','ignore').decode('ascii').lower()
    return ' '.join(value.replace('_',' ').replace('-',' ').split())

def canonical(name): return ALIASES.get(normalize(name),normalize(name))

def catalog_rows(raw):
    if isinstance(raw,list): return raw
    if isinstance(raw,dict):
        for key in ('exercises','data'):
            if isinstance(raw.get(key),list): return raw[key]
    raise ValueError('CATALOG_INVALID')

def read_muscles(catalog_path,exercise_id):
    raw=json.loads(Path(catalog_path).read_text(encoding='utf-8'))
    exercise=next((row for row in catalog_rows(raw) if str(row.get('id',''))==exercise_id),None)
    if not exercise: raise ValueError('EXERCISE_NOT_FOUND:'+exercise_id)
    primary=[canonical(x) for x in exercise.get('primary_muscles',[]) if str(x).strip()]
    secondary=[canonical(x) for x in exercise.get('secondary_muscles',[]) if str(x).strip()]
    return primary,secondary

def fit_panel(source):
    image=Image.open(source).convert('RGB')
    if image.width<PANEL_W or image.height<MASTER_H:
        raise ValueError(f'PHASE_SOURCE_TOO_SMALL:{source}:{image.width}x{image.height}')
    return ImageOps.fit(image,(PANEL_W,MASTER_H),method=Image.Resampling.LANCZOS,centering=(0.5,0.5))

def mannequin_base():
    image=Image.new('RGBA',(116,164),(0,0,0,0));draw=ImageDraw.Draw(image,'RGBA')
    draw.ellipse((45,4,71,30),fill=NEUTRAL,outline=BODY_DARK,width=1)
    draw.polygon([(42,34),(74,34),(82,72),(72,105),(44,105),(34,72)],fill=BODY,outline=BODY_DARK)
    draw.line((39,42,24,79,19,113),fill=BODY,width=10,joint='curve')
    draw.line((77,42,92,79,97,113),fill=BODY,width=10,joint='curve')
    draw.line((50,99,44,132,40,160),fill=BODY,width=12,joint='curve')
    draw.line((66,99,72,132,76,160),fill=BODY,width=12,joint='curve')
    return image

def mark(draw,shape,color):
    kind,args=shape
    if kind=='ellipse': draw.ellipse(args,fill=color)
    elif kind=='poly': draw.polygon(args,fill=color)

def highlight(image,muscles,mapping,color):
    draw=ImageDraw.Draw(image,'RGBA')
    for muscle in muscles:
        for shape in mapping.get(canonical(muscle),[]): mark(draw,shape,color)

def anatomy_inset(primary,secondary,view):
    mapping=FRONT if view=='front' else BACK
    figure=mannequin_base()
    highlight(figure,secondary,mapping,SECONDARY)
    highlight(figure,primary,mapping,PRIMARY)
    figure=figure.resize((154,218),Image.Resampling.LANCZOS)
    inset=Image.new('RGBA',(ANATOMY_WIDTH,ANATOMY_HEIGHT),(0,0,0,0))
    halo=Image.new('L',(ANATOMY_WIDTH,ANATOMY_HEIGHT),0)
    halo_draw=ImageDraw.Draw(halo)
    halo_draw.ellipse((10,6,ANATOMY_WIDTH-10,ANATOMY_HEIGHT-6),fill=100)
    halo=halo.filter(ImageFilter.GaussianBlur(18))
    dark=Image.new('RGBA',(ANATOMY_WIDTH,ANATOMY_HEIGHT),(7,15,11,115))
    inset.alpha_composite(Image.composite(dark,Image.new('RGBA',inset.size,(0,0,0,0)),halo))
    inset.alpha_composite(figure,((ANATOMY_WIDTH-154)//2,16))
    return inset

def sha256_file(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def load_official_isotipo(path):
    actual=sha256_file(path)
    if actual!=OFFICIAL_ISOTIPO_SHA256: raise ValueError(f'OFFICIAL_ISOTIPO_SHA_MISMATCH:{actual}')
    return Image.open(path).convert('RGBA')

def scaled_logo(logo,width,opacity=1.0):
    copy=logo.copy()
    ratio=width/copy.width
    copy=copy.resize((width,max(1,round(copy.height*ratio))),Image.Resampling.LANCZOS)
    if opacity<1:
        alpha=copy.getchannel('A').point(lambda value:int(value*opacity))
        copy.putalpha(alpha)
    return copy

def place_logo(canvas,logo,x,y,width,opacity=1.0):
    mark=scaled_logo(logo,width,opacity)
    canvas.alpha_composite(mark,(int(x-mark.width/2),int(y-mark.height/2)))
    return {'center':[x,y],'width':mark.width,'height':mark.height,'opacity':opacity}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--catalog',required=True)
    parser.add_argument('--exercise-id',required=True)
    parser.add_argument('--start',required=True)
    parser.add_argument('--final',required=True)
    parser.add_argument('--official-isotipo',required=True)
    parser.add_argument('--master-out',required=True)
    parser.add_argument('--delivery-out',required=True)
    parser.add_argument('--meta-out',required=True)
    args=parser.parse_args()
    settings=TARGET_SETTINGS.get(args.exercise_id)
    if not settings: raise ValueError('PILOT_TARGET_NOT_ALLOWED:'+args.exercise_id)
    primary,secondary=read_muscles(args.catalog,args.exercise_id)
    left=fit_panel(args.start);right=fit_panel(args.final)
    master=Image.new('RGB',(MASTER_W,MASTER_H),(12,18,15));master.paste(left,(0,0));master.paste(right,(PANEL_W,0))
    draw=ImageDraw.Draw(master);draw.line((PANEL_W-1,0,PANEL_W-1,MASTER_H),fill=(58,65,61),width=2)
    master_rgba=master.convert('RGBA')
    inset=anatomy_inset(primary,secondary,settings['anatomy_view'])
    anatomy_y=settings.get('anatomy_y',ANATOMY_Y_DEFAULT)
    master_rgba.alpha_composite(inset,(ANATOMY_X,anatomy_y))
    logo=load_official_isotipo(args.official_isotipo)
    placements={'shirt':{},'wall':None}
    for phase in ('start','final'):
        x,y,width=settings['shirt'][phase]
        placements['shirt'][phase]=place_logo(master_rgba,logo,x,y,width,1.0)
    if settings.get('wall_watermark'):
        placements['wall']=place_logo(master_rgba,logo,1110,115,230,0.09)
    master=master_rgba.convert('RGB')
    master_out=Path(args.master_out);delivery_out=Path(args.delivery_out);meta_out=Path(args.meta_out)
    for path in (master_out,delivery_out,meta_out): path.parent.mkdir(parents=True,exist_ok=True)
    master.save(master_out,'WEBP',quality=94,method=6)
    delivery=master.resize((DELIVERY_W,DELIVERY_H),Image.Resampling.LANCZOS)
    delivery.save(delivery_out,'WEBP',quality=91,method=6)
    anatomy_width_percent=ANATOMY_WIDTH/MASTER_W*100
    metadata={
      'schema':'iberfit.exercise.media.system-v1.pilot-candidate.v1',
      'exercise_id':args.exercise_id,
      'visual_system':'iberfit.exercise.media.system.v1',
      'master':{'path':str(master_out),'width':MASTER_W,'height':MASTER_H,'mime':'image/webp','sha256':sha256_file(master_out)},
      'delivery':{'path':str(delivery_out),'width':DELIVERY_W,'height':DELIVERY_H,'mime':'image/webp','sha256':sha256_file(delivery_out)},
      'layout':{'left':'start','right':'final','phase_labels_in_pixels':False,'embedded_text':False,'divider_x':PANEL_W},
      'anatomy':{'present':True,'corner':'upper-left','x':ANATOMY_X,'y':anatomy_y,'width':ANATOMY_WIDTH,'height':ANATOMY_HEIGHT,'width_percent':round(anatomy_width_percent,3),'view':settings['anatomy_view'],'primary':primary,'secondary':secondary,'style':'analytical-anatomical-plate'},
      'branding':{'official_isotipo_path':args.official_isotipo,'official_isotipo_sha256':OFFICIAL_ISOTIPO_SHA256,'generated_branding':False,'shirt':placements['shirt'],'wall_watermark':placements['wall']},
      'human_approval_required':True,
      'publishable':False,
    }
    meta_out.write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(metadata,ensure_ascii=False))

if __name__=='__main__': main()

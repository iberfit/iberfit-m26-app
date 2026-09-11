#!/usr/bin/env python3
import argparse, json, hashlib, unicodedata
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W,H=640,800
HALF=W//2
ANATOMY_BOX=(360,8,632,178)
LABEL_Y=610
TEXT=(188,174,145)
LINE=(173,155,118)
BODY=(176,178,176)
BODY_DARK=(112,115,113)
PRIMARY=(94,196,113)
SECONDARY=(113,157,120)

def panel(im):
    im=im.convert('RGB')
    if im.size==(HALF,H): return im
    return im.resize((HALF,H),Image.Resampling.LANCZOS)

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
    draw.text((cx-tw//2,LABEL_Y),text,font=f,fill=TEXT)
    ly=LABEL_Y+18
    draw.line((cx-11,ly,cx+11,ly),fill=LINE,width=1)

def norm(value):
    s=unicodedata.normalize('NFKD',str(value or '')).encode('ascii','ignore').decode('ascii').lower()
    return ' '.join(s.replace('_',' ').replace('-',' ').split())

def catalog_records(raw):
    if isinstance(raw,list): return raw
    if isinstance(raw,dict):
        for k in ('exercises','data'):
            if isinstance(raw.get(k),list): return raw[k]
    raise ValueError('CATALOG_INVALID')

def read_muscles(catalog_path,exercise_id):
    raw=json.loads(Path(catalog_path).read_text(encoding='utf-8'))
    ex=next((x for x in catalog_records(raw) if str(x.get('id',''))==exercise_id),None)
    if not ex: raise ValueError('EXERCISE_NOT_FOUND:'+exercise_id)
    primary=[norm(x) for x in ex.get('primary_muscles',[]) if str(x).strip()]
    secondary=[norm(x) for x in ex.get('secondary_muscles',[]) if str(x).strip()]
    return primary,secondary

def rgba_layer(size):
    return Image.new('RGBA',size,(0,0,0,0))

def limb(d,a,b,width,fill):
    d.line((a,b),fill=fill,width=width)

def mannequin_base(front=True):
    im=rgba_layer((116,164)); d=ImageDraw.Draw(im,'RGBA')
    # soft shadow
    d.ellipse((43,5,73,35),fill=(0,0,0,100))
    d.ellipse((45,4,71,30),fill=BODY+(255,))
    # torso
    if front:
        d.polygon([(42,34),(74,34),(82,72),(72,104),(44,104),(34,72)],fill=BODY+(255,),outline=BODY_DARK+(220,))
    else:
        d.polygon([(42,34),(74,34),(82,72),(72,105),(44,105),(34,72)],fill=BODY+(255,),outline=BODY_DARK+(220,))
    # arms
    limb(d,(39,42),(24,79),14,BODY+(255,)); limb(d,(24,79),(19,113),11,BODY+(255,))
    limb(d,(77,42),(92,79),14,BODY+(255,)); limb(d,(92,79),(97,113),11,BODY+(255,))
    # legs
    limb(d,(50,99),(44,132),16,BODY+(255,)); limb(d,(44,132),(40,159),12,BODY+(255,))
    limb(d,(66,99),(72,132),16,BODY+(255,)); limb(d,(72,132),(76,159),12,BODY+(255,))
    return im

def mark(draw,shape,color):
    kind,args=shape
    if kind=='ellipse': draw.ellipse(args,fill=color)
    elif kind=='poly': draw.polygon(args,fill=color)
    elif kind=='line': draw.line(args[:-1],fill=color,width=args[-1])

FRONT={
 'pectoral':[('ellipse',(43,39,58,55)),('ellipse',(58,39,73,55))],
 'deltoides':[('ellipse',(34,36,46,50)),('ellipse',(70,36,82,50))],
 'deltoides anterior':[('ellipse',(35,37,44,49)),('ellipse',(72,37,81,49))],
 'biceps':[('ellipse',(26,55,38,76)),('ellipse',(78,55,90,76))],
 'triceps':[('ellipse',(24,57,34,78)),('ellipse',(82,57,92,78))],
 'core':[('poly',[(50,57),(66,57),(69,88),(47,88)])],
 'recto abdominal':[('poly',[(51,59),(65,59),(67,89),(49,89)])],
 'oblicuos':[('poly',[(44,59),(51,61),(50,89),(44,91)]),('poly',[(65,61),(72,59),(72,91),(66,89)])],
 'cuadriceps':[('ellipse',(42,102,54,133)),('ellipse',(62,102,74,133))],
 'aductores':[('ellipse',(52,103,59,132)),('ellipse',(57,103,64,132))],
 'gemelos':[('ellipse',(35,132,47,157)),('ellipse',(69,132,81,157))],
 'pantorrillas':[('ellipse',(35,132,47,157)),('ellipse',(69,132,81,157))],
}
BACK={
 'dorsal ancho':[('poly',[(40,47),(50,43),(55,82),(47,94),(38,74)]),('poly',[(66,43),(76,47),(78,74),(69,94),(61,82)])],
 'romboides':[('poly',[(50,43),(58,47),(54,64),(46,59)]),('poly',[(58,47),(66,43),(70,59),(62,64)])],
 'trapecio':[('poly',[(51,34),(65,34),(71,48),(58,56),(45,48)])],
 'deltoides posterior':[('ellipse',(34,37,45,50)),('ellipse',(71,37,82,50))],
 'deltoides':[('ellipse',(34,36,46,50)),('ellipse',(70,36,82,50))],
 'triceps':[('ellipse',(25,54,36,78)),('ellipse',(80,54,91,78))],
 'erectores espinales':[('poly',[(53,54),(58,53),(57,98),(51,98)]),('poly',[(58,53),(63,54),(65,98),(59,98)])],
 'gluteos':[('ellipse',(44,91,58,109)),('ellipse',(58,91,72,109))],
 'isquiotibiales':[('ellipse',(42,107,54,134)),('ellipse',(62,107,74,134))],
 'gemelos':[('ellipse',(35,132,47,157)),('ellipse',(69,132,81,157))],
 'pantorrillas':[('ellipse',(35,132,47,157)),('ellipse',(69,132,81,157))],
}

ALIASES={
 'pecho':'pectoral','pectorales':'pectoral','pectoral mayor':'pectoral',
 'deltoide':'deltoides','hombros':'deltoides','hombro':'deltoides',
 'abdominales':'core','abdomen':'core','zona media':'core',
 'gluteo':'gluteos','gluteo mayor':'gluteos','gluteo medio':'gluteos',
 'isquios':'isquiotibiales','femorales':'isquiotibiales',
 'erector espinal':'erectores espinales','espinales':'erectores espinales',
 'dorsales':'dorsal ancho','dorsal':'dorsal ancho',
 'biceps braquial':'biceps','triceps braquial':'triceps',
 'deltoide posterior':'deltoides posterior',
}

def canonical(name):
    n=ALIASES.get(norm(name),norm(name))
    return n

def draw_highlights(im,muscles,color):
    d=ImageDraw.Draw(im,'RGBA')
    for m in muscles:
        m=canonical(m)
        for shape in FRONT.get(m,[]): mark(d,shape,color+(235,))
        for shape in BACK.get(m,[]): pass

def draw_back_highlights(im,muscles,color):
    d=ImageDraw.Draw(im,'RGBA')
    for m in muscles:
        m=canonical(m)
        for shape in BACK.get(m,[]): mark(d,shape,color+(235,))

def anatomy_inset(primary,secondary):
    inset=rgba_layer((ANATOMY_BOX[2]-ANATOMY_BOX[0],ANATOMY_BOX[3]-ANATOMY_BOX[1]))
    # subtle vignette only, not a panel
    vignette=Image.new('L',inset.size,0)
    vd=ImageDraw.Draw(vignette)
    vd.ellipse((18,-15,inset.width-8,inset.height+26),fill=150)
    vignette=vignette.filter(ImageFilter.GaussianBlur(24))
    dark=Image.new('RGBA',inset.size,(0,0,0,105))
    inset.alpha_composite(Image.composite(dark,rgba_layer(inset.size),vignette))

    front=mannequin_base(True); back=mannequin_base(False)
    draw_highlights(front,secondary,SECONDARY); draw_highlights(front,primary,PRIMARY)
    draw_back_highlights(back,secondary,SECONDARY); draw_back_highlights(back,primary,PRIMARY)
    # clear two-view anatomy: front + back
    inset.alpha_composite(front,(18,3))
    inset.alpha_composite(back,(138,3))
    return inset

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--start',required=True)
    ap.add_argument('--final',required=True)
    ap.add_argument('--catalog',required=True)
    ap.add_argument('--out',required=True)
    ap.add_argument('--meta',required=True)
    ap.add_argument('--exercise-id',required=True)
    args=ap.parse_args()

    primary,secondary=read_muscles(args.catalog,args.exercise_id)
    left=panel(Image.open(args.start))
    right=panel(Image.open(args.final))
    canvas=Image.new('RGB',(W,H),(18,18,18))
    canvas.paste(left,(0,0)); canvas.paste(right,(HALF,0))
    draw=ImageDraw.Draw(canvas)
    draw.line((HALF-1,0,HALF-1,H),fill=(70,67,61),width=1)

    inset=anatomy_inset(primary,secondary)
    canvas_rgba=canvas.convert('RGBA')
    canvas_rgba.alpha_composite(inset,(ANATOMY_BOX[0],ANATOMY_BOX[1]))
    canvas=canvas_rgba.convert('RGB')
    draw=ImageDraw.Draw(canvas)
    label(draw,'Inicio',HALF//2)
    label(draw,'Final',HALF+HALF//2)

    out=Path(args.out); out.parent.mkdir(parents=True,exist_ok=True)
    canvas.save(out,'WEBP',quality=90,method=6)
    data=out.read_bytes()
    meta={
      'schema':'iberfit.exercise.fixed-template-candidate.v2',
      'template':'iberfit-published-640x800-v1',
      'exercise_id':args.exercise_id,
      'width':W,'height':H,'mime':'image/webp',
      'layout':{'left':'Inicio','right':'Final','split_x':HALF,'anatomy_box':ANATOMY_BOX,'label_y':LABEL_Y},
      'muscles':{'primary':primary,'secondary':secondary,'source':'canonical_catalog','renderer':'deterministic-front-back-v1'},
      'branding':{
        'ai_generated_branding':False,
        'official_isotype_in_image':False,
        'app_overlay_asset':'/public/isotipo-iberfit.png',
        'official_isotype_sha256':'d4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa'
      },
      'sha256':hashlib.sha256(data).hexdigest(),
      'publishable':False
    }
    Path(args.meta).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(meta,ensure_ascii=False))

if __name__=='__main__': main()

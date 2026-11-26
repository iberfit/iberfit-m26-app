"""Build report-only, static TrueType instances from the first-party web fonts."""
import hashlib
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT=Path("public/m26/fonts")
for stem, family in [("inter","inter-latin-wght-normal.woff2"),("serif","source-serif-4-latin-wght-normal.woff2")]:
    for weight,name in [(400,"regular"),(700,"bold")]:
        path=ROOT/f"report-{stem}-{name}.ttf"
        source=TTFont(ROOT/family,recalcTimestamp=False)
        font=instantiateVariableFont(source,{"wght":weight},inplace=False,updateFontNames=True)
        font.flavor=None
        font.recalcTimestamp=False
        font.save(path)
        data=path.read_bytes()
        assert data[:4]==b"\x00\x01\x00\x00" and "fvar" not in font
        sha=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\x00"+data).hexdigest()
        print("GX_FONT_META",path.name,len(data),sha)

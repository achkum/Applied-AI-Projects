# Reproducible native static instances from the pinned official Google Fonts commit.
import json,hashlib,urllib.request,urllib.parse
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
import fontTools
root=Path(__file__).resolve().parent
manifest=root/'billing-month-fonts.json'
commit=json.loads(manifest.read_text())['googleFontsCommit'] if manifest.exists() else json.load(urllib.request.urlopen('https://api.github.com/repos/google/fonts/commits/main'))['sha']
fonts=[]
for folder,filename,family,weights,axes in [('geist','Geist[wght].ttf','Geist',[400,500,600],{}),('bricolagegrotesque','BricolageGrotesque[opsz,wdth,wght].ttf','BricolageGrotesque',[600,700,800],{'opsz':24,'wdth':100})]:
 base=f'https://raw.githubusercontent.com/google/fonts/{commit}/ofl/{folder}/'
 variable=urllib.request.urlopen(base+urllib.parse.quote(filename)).read()
 source=root/(family+'-source-variable.ttf');source.write_bytes(variable)
 licence=urllib.request.urlopen(base+'OFL.txt').read();(root/(family+'-OFL.txt')).write_bytes(licence)
 for weight in weights:
  coords={**axes,'wght':weight};original=TTFont(source,recalcTimestamp=False);instance=instantiateVariableFont(original,coords,inplace=False,updateFontNames=True)
  style={400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',800:'ExtraBold'}[weight]
  post=family+'-'+style
  for record in instance['name'].names:
   if record.nameID in (1,2,4,6,16,17):
    value={1:family,2:style,4:family+' '+style,6:post,16:family,17:style}[record.nameID];instance['name'].setName(value,record.nameID,record.platformID,record.platEncID,record.langID)
  instance.recalcTimestamp=False
  for record in instance['name'].names:
   if record.nameID==13:instance['name'].setName(licence.decode('utf8'),13,record.platformID,record.platEncID,record.langID)
  instance['OS/2'].usWeightClass=weight
  instance['OS/2'].fsSelection &= ~((1<<5)|(1<<6))
  instance['OS/2'].fsSelection |= (1<<5) if weight>=700 else ((1<<6) if weight==400 else 0)
  instance['head'].macStyle = (instance['head'].macStyle & ~1) | (1 if weight>=700 else 0)
  out=root/(post+'.ttf');instance.save(out)
  assert 'fvar' not in instance and instance['OS/2'].usWeightClass==weight
  fonts.append({'file':out.name,'family':family,'weight':weight,'axes':coords,'postScriptName':post,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'source':base+urllib.parse.quote(filename),'sourceSha256':hashlib.sha256(variable).hexdigest(),'licenceFile':family+'-OFL.txt','licenceSha256':hashlib.sha256(licence).hexdigest()})
(root/'billing-month-fonts.json').write_text(json.dumps({'googleFontsCommit':commit,'fontTools':fontTools.__version__,'licence':'SIL OFL1.1; original notices retained; no declared Reserved Font Names','staticInstances':fonts},indent=2)+'\n')
print('Bundled six licensed static font weights')

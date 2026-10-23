"""Create original test-only SVGA 2.0 and 1.x files. Requires Pillow to regenerate."""
from pathlib import Path
from PIL import Image,ImageDraw
import io,struct,zlib,math,json,zipfile
root=Path(__file__).parent/'fixtures';root.mkdir(exist_ok=True)
scale=3;im=Image.new('RGBA',(320*scale,320*scale));d=ImageDraw.Draw(im)
def box(values):return tuple(round(x*scale) for x in values)
for bounds,color,width in [((26,26,294,294),'#9f6d22',10),((30,30,290,290),'#e7be61',8),((36,36,284,284),'#fff1b4',2),((24,24,296,296),'#e7be61',2)]:d.ellipse(box(bounds),outline=color,width=width*scale)
for angle in range(0,360,30):
 x=160+134*math.cos(math.radians(angle));y=160+134*math.sin(math.radians(angle));d.ellipse(box((x-4,y-4,x+4,y+4)),fill='#fff4be',outline='#ac7624',width=scale)
for x,y,r in [(57,59,15),(270,90,10),(259,262,17)]:
 d.polygon([(int((x+dx)*scale),int((y+dy)*scale)) for dx,dy in [(0,-r),(r*.24,-r*.24),(r,0),(r*.24,r*.24),(0,r),(-r*.24,r*.24),(-r,0),(-r*.24,-r*.24)]],fill='#efca70',outline='#a97a30')
im=im.resize((320,320),Image.Resampling.LANCZOS);buf=io.BytesIO();im.save(buf,'PNG');png=buf.getvalue()
def varint(n):
 b=bytearray()
 while n>127:b.append((n&127)|128);n>>=7
 b.append(n);return bytes(b)
def string(field,value):
 value=value.encode() if isinstance(value,str) else value
 return varint(field*8+2)+varint(len(value))+value
def number(field,value):return varint(field*8)+varint(value)
def floating(field,value):return varint(field*8+5)+struct.pack('<f',value)
def floats(items):return b''.join(floating(i+1,v) for i,v in enumerate(items))
frames=[];oldframes=[]
for i in range(60):
 angle=math.sin(i/60*2*math.pi)*.04;s=.94+.035*math.sin(i/60*2*math.pi);a=s*math.cos(angle);b=s*math.sin(angle);c=-b;tx=160-a*160-c*160;ty=160-b*160-a*160
 frames.append(floating(1,1)+string(2,floats([0,0,320,320]))+string(3,floats([a,b,c,a,tx,ty])))
 oldframes.append({'alpha':1,'layout':dict(x=0,y=0,width=320,height=320),'transform':dict(a=a,b=b,c=c,d=a,tx=tx,ty=ty)})
movie=string(1,'2.0')+string(2,floating(1,320)+floating(2,320)+number(3,30)+number(4,60))+string(3,string(1,'frame')+string(2,png))+string(4,string(1,'frame')+b''.join(string(2,frame) for frame in frames))
(root/'avatar-ring-2.svga').write_bytes(zlib.compress(movie))
spec={'movie':{'viewBox':{'width':320,'height':320},'fps':30,'frames':60},'images':{'frame':'frame'},'sprites':[{'imageKey':'frame','frames':oldframes}]}
with zipfile.ZipFile(root/'avatar-ring-1.svga','w',zipfile.ZIP_DEFLATED) as z:z.writestr('movie.spec',json.dumps(spec));z.writestr('frame.png',png)
(root/'broken.svga').write_bytes(b'not a valid SVGA file')
print('Created SVGA 2.0, ZIP-based 1.x and corrupt fixtures.')

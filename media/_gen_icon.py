# Generate a 128x128 PNG icon without external libs (minimal PNG writer)
import struct, zlib
W=H=128
def px(x,y):
    # dark rounded background + 3 accent kanban columns
    bg=(24,26,32); col=(56,189,248); accent=(244,114,98)
    # rounded corners
    r=18
    inside=True
    for cx,cy in [(r,r),(W-r,r),(r,H-r),(W-r,H-r)]:
        if (x<r and y<r and (x-r)**2+(y-r)**2>r*r): inside=False
        if (x>W-r and y<r and (x-(W-r))**2+(y-r)**2>r*r): inside=False
        if (x<r and y>H-r and (x-r)**2+(y-(H-r))**2>r*r): inside=False
        if (x>W-r and y>H-r and (x-(W-r))**2+(y-(H-r))**2>r*r): inside=False
    if not inside: return (0,0,0,0)
    # columns
    cols=[(20,28,40,86),(46,28,40,60),(72,28,40,98)]
    for i,(cxp,cyp,w,h) in enumerate(cols):
        if cxp<=x<cxp+w and cyp<=y<cyp+h:
            return (*(accent if i==2 else col),255)
    return (*bg,255)
raw=bytearray()
for y in range(H):
    raw.append(0)
    for x in range(W):
        r,g,b,a=px(x,y)
        raw+=bytes((r,g,b,a))
def chunk(t,d):
    return struct.pack(">I",len(d))+t+d+struct.pack(">I",zlib.crc32(t+d)&0xffffffff)
png=b"\x89PNG\r\n\x1a\n"
png+=chunk(b"IHDR",struct.pack(">IIBBBBB",W,H,8,6,0,0,0))
png+=chunk(b"IDAT",zlib.compress(bytes(raw),9))
png+=chunk(b"IEND",b"")
open("icon.png","wb").write(png)
print("icon.png", len(png), "bytes")

import qrcode
from io import BytesIO
def qr_png(value: str) -> bytes:
    img=qrcode.make(value)
    out=BytesIO();img.save(out,format="PNG")
    return out.getvalue()

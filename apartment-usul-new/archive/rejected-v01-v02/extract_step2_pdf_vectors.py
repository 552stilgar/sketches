import base64
import re
import zlib
from pathlib import Path


PROJECT = Path(__file__).resolve().parent
PDF = PROJECT.parent / "references" / "201 a 701 (3)(5).pdf"
OUT = PROJECT.parent / "tmp" / "pdfs" / "decoded_vector_streams"


def decode_stream(dictionary, payload):
    data = payload.rstrip(b"\r\n")
    if b"/ASCII85Decode" in dictionary:
        data = base64.a85decode(data, adobe=True)
    if b"/FlateDecode" in dictionary:
        data = zlib.decompress(data)
    return data


raw = PDF.read_bytes()
pattern = re.compile(rb"(\d+)\s+(\d+)\s+obj\s*<<(.*?)>>\s*stream\r?\n(.*?)\r?\nendstream", re.S)
OUT.mkdir(parents=True, exist_ok=True)
written = []

for index, match in enumerate(pattern.finditer(raw)):
    object_number, generation, dictionary, payload = match.groups()
    try:
        decoded = decode_stream(dictionary, payload)
    except Exception as exc:
        print(f"stream {index}: decode failed: {exc}")
        continue
    path_score = sum(decoded.count(token) for token in (b" m\n", b" l\n", b" re\n", b" S\n", b" s\n"))
    is_object_stream = b"/ObjStm" in dictionary
    if path_score < 5 and not is_object_stream:
        continue
    suffix = "objstm" if is_object_stream else "txt"
    output = OUT / f"object_{object_number.decode()}_stream_{index:03d}.{suffix}"
    output.write_bytes(decoded)
    written.append((index, int(object_number), len(decoded), path_score, str(output)))

for item in written:
    print(item)

print("PAGE AND OCG OBJECTS")
for match in re.finditer(rb"(\d+)\s+(\d+)\s+obj\s*(.*?)\s*endobj", raw, re.S):
    obj, _generation, body = match.groups()
    if b"/Type/Page" in body or b"/Type /Page" in body or b"/Type/OCG" in body or b"/Type /OCG" in body:
        preview = re.sub(rb"\s+", b" ", body[:1200])
        print(obj.decode(), preview.decode("latin1", "replace"))

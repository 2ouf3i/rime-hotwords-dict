#!/usr/bin/env python3
from pathlib import Path
import argparse,hashlib,json,shutil
p=argparse.ArgumentParser();p.add_argument('out');a=p.parse_args();root=Path(__file__).resolve().parents[1]/'multilingual/2026-11-01';out=Path(a.out);assert not out.exists()
m=json.loads((root/'resources.json').read_text());verified=[]
for key,meta in m['resources'].items():
 name=meta['url'].rsplit('/',1)[-1];src=root/'files'/name;data=src.read_bytes();assert len(data)==meta['bytes'] and hashlib.sha256(data).hexdigest()==meta['sha256'],key;verified.append((src,name))
out.mkdir();(out/'files').mkdir()
for src,name in verified:shutil.copyfile(src,out/'files'/name)
shutil.copyfile(root/'resources.json',out/'resources.json');print(json.dumps({'verifiedResources':len(verified),'sourceSnapshot':'2026-11-01'}))

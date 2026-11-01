#!/usr/bin/env python3
"""Reproduce seven reviewed resources from frozen revision-1 snapshots and an existing approved McBopomofo source."""
from pathlib import Path
import argparse,gzip,hashlib,json,subprocess

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',required=True,help='New output directory; must not exist')
    parser.add_argument('--zhuyin',required=True,help='Existing verified McBopomofo Source/Data directory')
    args=parser.parse_args();here=Path(__file__).resolve().parent;out=Path(args.out).resolve()
    if out.exists():raise SystemExit('Output exists; refusing to replace files')
    src=Path(args.zhuyin).resolve();source=json.loads((here/'zhuyin-build.json').read_text())['upstream']
    for name,meta in source['files'].items():
        data=(src/name).read_bytes();assert len(data)==meta['bytes'] and hashlib.sha256(data).hexdigest()==meta['sha256'],name
    frozen=json.loads(gzip.decompress((here/'frozen-inputs.json.gz').read_bytes()))
    expected=json.loads((here/'prepared-publication.json').read_text())['resources'];out.mkdir(parents=True)
    for group in ['baseline','review']:
        (out/group).mkdir()
        for name,text in frozen[group].items():
            assert Path(name).name==name
            (out/group/name).write_bytes(text.encode('utf-8'))
    (out/'pinyin_simp.dict.yaml').write_bytes(frozen['pinyin'].encode('utf-8'))
    tools=here/'tools';base=out/'baseline';review=out/'review'
    def run(*command):
        with (out/'build.log').open('a') as log:subprocess.run(list(map(str,command)),cwd=tools,stdout=log,stderr=log,check=True)
    run('node',tools/'scripts/build-english-wordlist.mjs',base/'english.dict.txt','--patch',review/'english-modern-words.tsv','--out',out/'english.dict.txt')
    js="import fs from 'node:fs';import {generate} from './scripts/build-english-in-pinyin.mjs';const a=process.argv.slice(1);fs.writeFileSync(a[2],generate(fs.readFileSync(a[0],'utf8'),fs.readFileSync(a[1],'utf8')).text);"
    run('node','--input-type=module','-e',js,out/'english.dict.txt',out/'pinyin_simp.dict.yaml',out/'english-in-pinyin.txt')
    run('node',tools/'scripts/letter-words/apply-curated-words.mjs','--base',base/'korean.dict.txt','--curated',review/'korean-20261101-round2.tsv','--lang','ko','--out',out/'korean.dict.txt')
    for lang,name in [('ja','ninan_japanese.next.txt'),('ko','korean.next.txt'),('vi','vietnamese.next.txt')]:
        command=['node',tools/'scripts/letter-words/apply-curated-next.mjs','--base',base/name,'--curated',review/f'next-{lang}.tsv','--lang',lang,'--out',out/name]
        if lang!='ja':command+=['--dict',out/'korean.dict.txt' if lang=='ko' else base/'vietnamese.dict.txt']
        run(*command)
    run('node',tools/'scripts/zhuyin/build-zhuyin-dict.mjs','--src',src,'--commit',source['commit'],'--phrases',review/'zhuyin-20261101.tsv','--out',out/'ninan_zhuyin.dict.yaml')
    names={'english':'english.dict.txt','englishInPinyin':'english-in-pinyin.txt','zhuyin':'ninan_zhuyin.dict.yaml','japaneseNext':'ninan_japanese.next.txt','korean':'korean.dict.txt','koreanNext':'korean.next.txt','vietnameseNext':'vietnamese.next.txt'}
    for key,name in names.items():
        data=(out/name).read_bytes();meta=expected[key]
        assert len(data)==meta['bytes'] and hashlib.sha256(data).hexdigest()==meta['sha256'],key
    print(json.dumps({'exactReproduction':True,'resources':list(names),'basis':'frozen audited revision-1 snapshots plus original overlays; existing pinned McBopomofo source','downloads':False,'otaPublished':False}))

if __name__=='__main__':main()

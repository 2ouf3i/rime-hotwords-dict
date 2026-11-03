#!/usr/bin/env node
// 常用短语的九宫格尾音节前缀。只生成数据,不发布词库、不读取用户记录。
// node scripts/gen-t9-completions.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadPhraseWeights, mergePhraseWeights, parseCreditLines, mergeCredits } from '../backend/scripts/build-pinyin-dict.mjs';
import { lexicalRows, prepareLexemes, buildLexicon, validateT9Lexicon } from './lib/t9-lexicon.mjs';
import { isRunDirectly } from './lib/run-directly.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = ['backend/dict/phrase-weights.txt', 'backend/dict/everyday-phrases.txt'];
const baseSource = 'apps/apple/NinanKeyboard/Rime/pinyin_simp.dict.yaml';
export const outputs = ['apps/apple/NinanKeyboard/NextWord/t9_completions.tsv', 'apps/android/app/src/main/assets/t9_completions.tsv'];
const values = JSON.parse(fs.readFileSync(path.join(root, 'contract/pinyin-t9-completion.json'), 'utf8')).values;
const letters = JSON.parse(fs.readFileSync(path.join(root, 'contract/t9-syllables.json'), 'utf8')).digitLetters;

export { t9Digits as digitCode, lexicalRows, prepareLexemes, buildLexicon, validateT9Lexicon } from './lib/t9-lexicon.mjs';

export function generate({ convert, dictionaryText } = {}) {
  const require = createRequire(path.join(root, 'backend/package.json'));
  const { pinyin } = require('pinyin-pro');
  const baseText = fs.readFileSync(path.join(root, baseSource), 'utf8');
  const overrides = mergePhraseWeights(sources.map(file => loadPhraseWeights(path.join(root, file)))).overrides
    .map(row => ({...row, pinyin: row.pinyin ?? pinyin(row.word, {toneType:'none',v:true})}));
  const rows = prepareLexemes(lexicalRows(baseText), overrides, dictionaryText);
  if (!convert) {
    const words = [...new Set(rows.map(row=>row.word))];
    const converted = spawnSync('opencc', ['-c', path.join(root,'apps/apple/NinanKeyboard/OpenCC/ninan_s2tw.json')], {
      input:words.join('\n')+'\n', encoding:'utf8', maxBuffer:8*1024*1024,
    });
    if(converted.error || converted.status!==0)throw new Error(`OpenCC: ${converted.error?.message??converted.stderr}`);
    const hant=converted.stdout.trimEnd().split('\n');
    if(hant.length!==words.length)throw new Error('OpenCC conversion length mismatch');
    const forms=new Map(words.map((w,i)=>[w,hant[i]]));convert=w=>forms.get(w);
  }
  const result=buildLexicon(rows,convert);
  validateT9Lexicon(result.text);
  const digest=createHash('sha256').update(baseText).update(dictionaryText??'').update(JSON.stringify({values,letters,build:JSON.parse(fs.readFileSync(path.join(root,'contract/pinyin-t9-completion.json'),'utf8')).buildValues}));
  for(const file of [...sources,'scripts/gen-t9-completions.mjs','scripts/lib/t9-lexicon.mjs','apps/apple/NinanKeyboard/OpenCC/ninan_s2tw.json','apps/apple/NinanKeyboard/OpenCC/ninan_s2tw_chars.ocd2','apps/apple/NinanKeyboard/OpenCC/ninan_s2tw_phrases.ocd2'])digest.update(file).update(fs.readFileSync(path.join(root,file)));
  const hash=digest.digest('hex');
  const credits=mergeCredits(sources.map(file=>parseCreditLines(fs.readFileSync(path.join(root,file),'utf8'))));
  const comments=[`# 输入SHA256: ${hash}`, ...(dictionaryText?[`# dictionarySHA256: ${createHash('sha256').update(dictionaryText).digest('hex')}`]:[]),`# 数据来源: ${dictionaryText?'审核后的完整词库快照；GPL-3.0，独立数据OTA，不随App打包':'随包Apache基础词库与Ninan原创审核短语'}`,
    ...credits.map(c=>`# 署名: ${c}`),'# 字形转换: OpenCC, Apache-2.0；逐键不转换'];
  return result.text.replace('#t9-completion v3\n','#t9-completion v3\n'+comments.join('\n')+'\n');
}

if (isRunDirectly(import.meta.url)) {
  const args = process.argv.slice(2);
  if(args.includes('--help')) {console.log('node scripts/gen-t9-completions.mjs [--check] | --dictionary FILE --out FILE (独立OTA数据)');process.exit(0)}
  let dictionary, output;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--check')continue;
    if(args[i]==='--dictionary'&&args[i+1]){dictionary=args[++i];continue}
    if(args[i]==='--out'&&args[i+1]){output=args[++i];continue}
    throw new Error('Unknown or incomplete argument');
  }
  if(Boolean(dictionary)!==Boolean(output)||dictionary&&args.includes('--check'))throw new Error('--dictionary requires a separate --out, without --check');
  if(dictionary && outputs.some(file=>path.resolve(root,file)===path.resolve(root,output)))throw new Error('Dictionary-derived data must remain outside bundled assets');
  const text=generate({dictionaryText:dictionary?fs.readFileSync(dictionary,'utf8'):undefined});
  for(const file of output?[output]:outputs) {
    if(args.includes('--check')) {if(fs.readFileSync(path.resolve(root,file),'utf8')!==text)throw new Error(`${file} is stale`)}
    else fs.writeFileSync(path.resolve(root,file),text);
  }
  console.log(`T9 v3: ${validateT9Lexicon(text)} lexemes, ${Buffer.byteLength(text)} bytes${output?' (prepared only)':''}`);
}

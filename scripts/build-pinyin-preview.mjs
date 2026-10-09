#!/usr/bin/env node
/**
 * 私人词库试验：在已校验的基准快照后追加新词，不重建上游、不改旧词或动态热词。
 * 不上传、不刷新定时发布镜像。原始词表不由此脚本读取。
 * node backend/scripts/build-pinyin-preview.mjs --baseline <现用 out 快照> --table <试验短语表> --out <忽略目录>
 */
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {manifestOf,parseDictLine,parseAutoDictLine,parsePhraseWeightLine} from './build-pinyin-dict.mjs';

export function appendPreview({main,auto,baseline,table}) {
  const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
  if(sha(main)!==baseline.sha256 || sha(auto)!==baseline.auto?.sha256) throw new Error('基准快照摘要不符');
  if(!main.endsWith('\n'))throw new Error('基准主表没有换行结尾');
  const known=new Set([
    ...main.split('\n').flatMap(l=>{const row=parseDictLine(l);return row?[row.word]:[];}),
    ...auto.split('\n').flatMap(l=>{const row=parseAutoDictLine(l);return row?[row.word]:[];}),
  ]);
  const rows=table.split('\n').map((line,i)=>parsePhraseWeightLine(line,i+1)).filter(Boolean);
  if(!rows.length)throw new Error('试验表为空');
  const added=new Set();
  for(const row of rows){
    if(!row.pinyin || row.pinyin.split(' ').length !== [...row.word].length)throw new Error(`试验词需要逐字拼音：${row.word}`);
    if(known.has(row.word))throw new Error(`试验只能追加，不覆盖已有词：${row.word}`);
    if(added.has(row.word))throw new Error(`试验词重复：${row.word}`);
    added.add(row.word);
  }
  const text=main+rows.map(r=>`${r.word}\t${r.pinyin}\t${r.weight}`).join('\n')+'\n';
  return {main:text,auto,manifest:manifestOf(text,baseline.upstreamRef,auto),metadata:{
    baselineVersion:baseline.version,baselineSha256:baseline.sha256,baselineAutoSha256:baseline.auto.sha256,
    additions:rows.length,existingRowsChanged:0,autoChanged:false,scope:'私人试验，未发布',
  }};
}
function main(args) {
  const usage='用法：node backend/scripts/build-pinyin-preview.mjs --baseline <现用 out 快照> --table <试验表> --out <忽略目录>';
  const values={};
  for(let i=0;i<args.length;i+=2){
    const key=args[i]?.replace(/^--/,'');
    if(!['baseline','table','out'].includes(key)||!args[i+1]||args[i+1].startsWith('--')||values[key])throw new Error(usage);
    values[key]=args[i+1];
  }
  if(!values.baseline||!values.table||!values.out)throw new Error(usage);
  if(resolve(values.baseline)===resolve(values.out))throw new Error('输出目录不能覆盖基准');
  const read=p=>readFileSync(p,'utf8');
  const result=appendPreview({main:read(join(values.baseline,'hotwords.dict.yaml')),auto:read(join(values.baseline,'hotwords_auto.dict.yaml')),
    baseline:JSON.parse(read(join(values.baseline,'manifest.json'))),table:read(values.table)});
  mkdirSync(values.out,{recursive:true});
  writeFileSync(join(values.out,'hotwords.dict.yaml'),result.main);
  writeFileSync(join(values.out,'hotwords_auto.dict.yaml'),result.auto);
  writeFileSync(join(values.out,'manifest.json'),JSON.stringify(result.manifest,null,2)+'\n');
  writeFileSync(join(values.out,'preview-metadata.json'),JSON.stringify({...result.metadata,source:values.table},null,2)+'\n');
  console.log(JSON.stringify(result.manifest));
}
let invoked='';try{invoked=realpathSync(resolve(process.argv[1]??''));}catch{/* imported */}
if(fileURLToPath(import.meta.url)===invoked){try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=2;}}

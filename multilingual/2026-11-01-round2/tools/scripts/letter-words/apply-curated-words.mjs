#!/usr/bin/env node
// Build-time only: add reviewed original words without reweighting/deleting the baseline.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {isRunDirectly} from '../lib/run-directly.mjs';
import {isBlocked,isVietnameseSyllable,loadBlocklist} from './build-letter-wordlist.mjs';

export function applyCuratedWords(baseText,patchText,{lang,blocked=loadBlocklist(lang)}={}) {
 if(!['ko','vi'].includes(lang))throw new Error('Language must be ko or vi');
 const baseline=new Map();
 function parse(text,{patch=false}={}) {
  const out=new Map();
  for(const [i,line] of text.split(/\r?\n/u).entries()) {
   if(!line||line.startsWith('#'))continue;
   const a=line.split('\t'),[word,raw]=a;
   const fail=reason=>{throw new Error(`Line ${i+1}: ${reason}`)};
   if(a.length!==2||!word||word!==word.normalize('NFC').toLowerCase()||!/^[1-9]\d*$/u.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>2147483647)fail('expected NFC word<TAB>positive Int32 weight');
   if(lang==='ko'&&!/^[가-힣]{1,8}$/u.test(word))fail('expected 1 to 8 Hangul syllables');
   if(lang==='vi'&&!isVietnameseSyllable(word))fail('expected Vietnamese syllable');
   if(out.has(word))fail('duplicate word');
   if(patch&&isBlocked(word,blocked))fail('blocked word');
   out.set(word,Number(raw));
  }
  return out;
 }
 for(const row of parse(baseText))baseline.set(...row);
 if(!baseline.size)throw new Error('Empty baseline');
 const patch=parse(patchText,{patch:true});
 const added=[...patch].filter(([word])=>!baseline.has(word));
 const stats={reviewed:patch.size,added:added.length,existing:patch.size-added.length,entries:baseline.size+added.length,addedWords:added.map(([word,weight])=>({word,weight})),existingWeightsChanged:0};
 if(!added.length)return {text:baseText,stats};
 const sha=createHash('sha256').update(patchText).digest('hex');
 const base=baseText.replace(/^# 词条数:\d+$/mu,`# 词条数:${stats.entries}`).replace(/\r?\n*$/u,'\n');
 const text=base+`# Ninan 原创日常词补充:${lang};审核 SHA-256 ${sha};新增 ${added.length} 项。\n`+
  '# 上述数量上限仅用于统计基线；补充权重为编辑值，不是字幕次数；既有词形与权重保留。\n'+added.map(([word,weight])=>`${word}\t${weight}`).join('\n')+'\n';
 return {text,stats};
}

export function main(argv) {
 const args={};
 for(let i=0;i<argv.length;i+=2){if(!['--base','--curated','--lang','--out','--report'].includes(argv[i])||!argv[i+1]||args[argv[i]])throw new Error('Expected --base FILE --curated FILE --lang ko|vi --out FILE [--report FILE]');args[argv[i]]=argv[i+1]}
 for(const k of ['--base','--curated','--lang','--out'])if(!args[k])throw new Error('Missing '+k);
 const result=applyCuratedWords(fs.readFileSync(args['--base'],'utf8'),fs.readFileSync(args['--curated'],'utf8'),{lang:args['--lang']});
 fs.writeFileSync(args['--out'],result.text);if(args['--report'])fs.writeFileSync(args['--report'],JSON.stringify(result.stats,null,2)+'\n');return result.stats;
}
if(isRunDirectly(import.meta.url)){try{console.log(JSON.stringify(main(process.argv.slice(2))))}catch(error){console.error(error.message);process.exitCode=1}}

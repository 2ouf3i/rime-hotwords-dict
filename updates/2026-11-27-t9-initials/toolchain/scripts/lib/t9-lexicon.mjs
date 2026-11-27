// Shared offline index builder/validator. No user history, network, or runtime engine queries.
import fs from 'node:fs';
const contract = JSON.parse(fs.readFileSync(new URL('../../contract/pinyin-t9-completion.json',import.meta.url),'utf8'));
export const T9_INDEX_LIMITS = {minInputLength:contract.values.minInputLength,maxInputLength:contract.values.maxInputLength,maxSuggestions:contract.values.maxSuggestions,maxWords:contract.buildValues.maxWords};
const DIGITS = Object.fromEntries(['abc','def','ghi','jkl','mno','pqrs','tuv','wxyz'].flatMap((s,i)=>[...s].map(c=>[c,String(i+2)])));
const canonicalReading = text => text.split(' ').map(s=>s.replace(/^([jqxy])v/u,'$1u').replace(/^([nl])ve$/u,'$1ue')).join(' ');
export const t9Digits = text => [...text].map(c=>DIGITS[c]??'').join('');
export function lexicalRows(text) {
 const rows=[];
 for(const line of text.split('\n')) {
  const [word,pinyin,value]=line.split('\t');const weight=Number(value);
  if(!word||!/^[\u4e00-\u9fff]{2,8}$/u.test(word)||!pinyin||!/^[a-z]+(?: [a-z]+)*$/u.test(pinyin)||pinyin.split(' ').length!==[...word].length||!Number.isFinite(weight)||weight<=0)continue;
  rows.push({word,pinyin:canonicalReading(pinyin),weight});
 }
 return rows;
}
/** Index-external chat words (backend/dict/t9-chat-words.txt): word, editorial weight, reading, scope, source, category. */
export function parseExtraWords(text) {
 const rows=[],seen=new Set();
 for(const line of text.split('\n')) {
  if(!line||line.startsWith('#'))continue;
  const [word,value,reading,scope,source,category,...extra]=line.split('\t');const weight=Number(value);
  const pinyin=canonicalReading(reading??'');
  if(extra.length||!/^[一-鿿]{2,8}$/u.test(word??'')||!/^[a-z]+(?: [a-z]+)*$/u.test(pinyin)||pinyin.split(' ').length!==[...word].length||
   !Number.isInteger(weight)||weight<=0||!['all','ota'].includes(scope)||!source||!category)throw new Error(`Invalid T9 extra word: ${line}`);
  const key=word+'\t'+pinyin;if(seen.has(key))throw new Error(`Duplicate T9 extra word: ${word}`);seen.add(key);
  rows.push({word,pinyin,weight,scope});
 }
 if(!rows.length)throw new Error('Empty T9 extra word list');return rows;
}
/**
 * The reviewed main dictionary is a membership/reading check only (2026-11-13): it never rescales weights, so the
 * independent table keeps the bundled scale that the clients' default weight and lead ratio assume. Extra chat words
 * bypass the frequency cut like reviewed phrases; with a dictionary only words it can type are kept.
 */
export function prepareLexemes(base, overrides, publishedText, extras=[]) {
 const rows=new Map();
 for(const row of base) {
  const key=row.word+'\t'+row.pinyin;
  if((rows.get(key)?.weight??0)<row.weight)rows.set(key,{...row,baseWeight:row.weight});
 }
 const known=publishedText?new Set(lexicalRows(publishedText).map(r=>r.word+'\t'+r.pinyin)):null;
 let skippedExtras=0;
 for(const extra of extras) {
  const key=extra.word+'\t'+extra.pinyin;
  if(known&&!known.has(key)){skippedExtras++;continue}
  const original=rows.get(key);
  rows.set(key,{word:extra.word,pinyin:extra.pinyin,weight:Math.max(original?.weight??0,extra.weight),baseWeight:Math.max(original?.baseWeight??0,extra.weight),reviewed:true});
 }
 for(const originalRow of overrides) {
  const row={...originalRow,pinyin:canonicalReading(originalRow.pinyin??'')};
  if(!row.pinyin)throw new Error('Reviewed readings required');
  const key=row.word+'\t'+row.pinyin;const original=rows.get(key);
  rows.set(key,{...row,weight:Math.max(original?.weight??0,row.weight),baseWeight:row.weight,reviewed:true});
 }
 return Object.assign([...rows.values()],{skippedExtras});
}
function order(a,b){return b.score-a.score||(a.word<b.word?-1:a.word>b.word?1:a.pinyin<b.pinyin?-1:a.pinyin>b.pinyin?1:0)}
export function buildLexicon(rows,convert=word=>word) {
 const eligible=rows.filter(r=>[...r.word].length<=6||r.reviewed);
 const selected=[...eligible].sort((a,b)=>b.weight-a.weight||(a.word<b.word?-1:a.word>b.word?1:(a.pinyin<b.pinyin?-1:a.pinyin>b.pinyin?1:0))).slice(0,T9_INDEX_LIMITS.maxWords);
 const stable=[...eligible].sort((a,b)=>(b.baseWeight??b.weight)-(a.baseWeight??a.weight)||(a.word<b.word?-1:a.word>b.word?1:a.pinyin<b.pinyin?-1:a.pinyin>b.pinyin?1:0)).slice(0,T9_INDEX_LIMITS.maxWords);
 const chosen=new Map(selected.concat(stable,eligible.filter(r=>r.reviewed)).map(r=>[r.word+'\t'+r.pinyin,r]));
 const buckets=new Map();
 const add=(key,item)=>{const list=buckets.get(key)??[];list.push(item);buckets.set(key,list)};
 for(const r of chosen.values()) {
  const syllables=r.pinyin.split(' '),full=t9Digits(r.pinyin),start=full.length-syllables.at(-1).length;
  for(let n=Math.max(T9_INDEX_LIMITS.minInputLength,start+1);n<full.length&&n<=T9_INDEX_LIMITS.maxInputLength;n++)add(full.slice(0,n),{...r,score:r.weight/(full.length-n+1),baseScore:(r.baseWeight??r.weight)/(full.length-n+1)});
  // Full-word initials participate as a separate, more ambiguous recall path.
  const initials=syllables.map(s=>s[0]).join('');
  if(initials.length>=T9_INDEX_LIMITS.minInputLength&&initials.length<=T9_INDEX_LIMITS.maxInputLength) {
   const key=t9Digits(initials);if(!full.startsWith(key))add(key,{...r,score:r.weight/(full.length-key.length+1)*0.5,baseScore:(r.baseWeight??r.weight)/(full.length-key.length+1)*0.5,reading:syllables.map(s=>s[0]).join("'")});
  }
 }
 const kept=[];const needed=new Map();
 for(const [key,items] of [...buckets].sort(([a],[b])=>a<b?-1:a>b?1:0)) {
  const seen=new Set();const hits=[];
  const stableItems=[...items].sort((a,b)=>b.baseScore-a.baseScore||(a.word<b.word?-1:a.word>b.word?1:a.pinyin<b.pinyin?-1:a.pinyin>b.pinyin?1:0));
  for(const item of stableItems)if(!seen.has(item.word)) {
   seen.add(item.word);hits.push(item);if(hits.length===T9_INDEX_LIMITS.maxSuggestions-1)break;
  }
  // A whole-word abbreviation competes with short words' unfinished full spellings.
  // Keep six stable hits; reserve the last slot only if its editorial weight can
  // match the normal fallback. Do not evict a stronger prefix for a weak initialism.
  const initial=[...items].filter(r=>r.reading).sort(order)[0];
  const fallback=[...items].sort(order).find(r=>!seen.has(r.word));
  if(initial&&!seen.has(initial.word)&&(!fallback||initial.weight>=fallback.weight)) {
   seen.add(initial.word);hits.push(initial);
  }
  // Updated statistics add a recall channel, rather than deleting a stable candidate.
  for(const item of [...items].sort(order))if(hits.length<T9_INDEX_LIMITS.maxSuggestions&&!seen.has(item.word)) {
   seen.add(item.word);hits.push(item);if(hits.length===T9_INDEX_LIMITS.maxSuggestions)break;
  }
  kept.push([key,hits]);for(const r of hits)needed.set(r.word+'\t'+r.pinyin,r);
 }
 // Keep chosen lexemes even when their last bucket slot changes: full-code
 // comparison and learned-word recall must not lose their readings or forms.
 for(const r of chosen.values())needed.set(r.word+'\t'+r.pinyin,r);
 // Same lexemes carry both completion weights and native full-code comparison weights.
 for(const r of rows)if(buckets.has(t9Digits(r.pinyin)))needed.set(r.word+'\t'+r.pinyin,r);
 const words=[...needed.values()].sort((a,b)=>a.word<b.word?-1:a.word>b.word?1:a.pinyin<b.pinyin?-1:a.pinyin>b.pinyin?1:0);
 const ids=new Map(words.map((r,i)=>[r.word+'\t'+r.pinyin,i]));
 const lines=['#t9-completion v3',...words.map((r,i)=>['W',i,r.pinyin.replaceAll(' ',"'"),r.word,convert(r.word),Math.max(1,Math.round(r.weight))].join('\t')),
 ...kept.map(([key,hits])=>['K',key,hits.map(r=>ids.get(r.word+'\t'+r.pinyin)+(r.reading?'/'+r.reading:'')).join(' ')].join('\t'))];
 return {text:lines.join('\n')+'\n',entries:words.length,keys:kept.length};
}
/** Strict transport validation, shared with publication. The clients mirror these invariants. */
export function validateT9Lexicon(text) {
 if(!text.startsWith('#t9-completion v3\n'))throw new Error('Invalid T9 header');
 const words=[];const keys=new Set();let keySection=false;
 for(const line of text.split('\n')) {
  if(!line||line.startsWith('#'))continue;const f=line.split('\t');
  if(f[0]==='W') {
   if(keySection||f.length!==6||!/^\d+$/u.test(f[1])||Number(f[1])!==words.length||words.length>=50000||!/^[a-z]+(?:'[a-z]+)+$/u.test(f[2])||!f[3]||!f[4]||!/^[\u4e00-\u9fff]{2,20}$/u.test(f[3])||!/^[\u4e00-\u9fff]{2,20}$/u.test(f[4])||!Number.isFinite(Number(f[5]))||Number(f[5])<=0)throw new Error('Invalid T9 word');
   words.push(f);continue;
  }
  keySection=true;
  if(f[0]!=='K'||f.length!==3||!/^[2-9]{3,20}$/u.test(f[1])||keys.has(f[1]))throw new Error('Invalid T9 key');
  keys.add(f[1]);const seen=new Set();const hits=f[2].split(' ');
  if(!hits.length||hits.length>T9_INDEX_LIMITS.maxSuggestions)throw new Error('Invalid T9 bucket');
  for(const hit of hits) {
   const [id,reading,...extra]=hit.split('/');const word=words[Number(id)];
   if(extra.length||!/^\d+$/u.test(id)||!word||seen.has(word[3]))throw new Error('Invalid T9 reference');seen.add(word[3]);
   if(reading) {
    const a=reading.split("'"),b=word[2].split("'");
    if(a.length!==b.length||!a.every((s,i)=>s.length===1&&b[i].startsWith(s))||t9Digits(reading)!==f[1])throw new Error('Invalid T9 abbreviation');
   } else if(!t9Digits(word[2]).startsWith(f[1])||t9Digits(word[2]).length<=f[1].length)throw new Error('Invalid T9 prefix');
  }
 }
 if(!words.length||!keys.size)throw new Error('Empty T9 index');return words.length;
}

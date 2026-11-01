#!/usr/bin/env node
// Build-time only. Keep the native key<TAB>successors format and untouched rows.
// Full rebuild: statistical builder -> this command with the same reviewed TSV.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isRunDirectly} from '../lib/run-directly.mjs';
import {compareCodePoints, isBlocked, isVietnameseSyllable, loadBlocklist} from './build-letter-wordlist.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
export const CURATED = lang => path.resolve(`backend/dict/multilingual/next-${lang}.tsv`);
const LANGUAGES = new Set(['ja', 'ko', 'vi']);

export function parseNext(text, {lang, vocabulary, blocked = null} = {}) {
  if (!LANGUAGES.has(lang)) throw new Error('Language must be ja, ko or vi');
  const rows = new Map();
  for (const [i, raw] of text.split(/\r?\n/u).entries()) {
    if (!raw || raw.startsWith('#')) continue;
    const parts = raw.split('\t');
    const fail = reason => { throw new Error(`Line ${i + 1}: ${reason}`); };
    if (parts.length !== 2 || !parts[0] || !parts[1]) fail('expected key<TAB>successors');
    const [key, values] = parts;
    if (key !== key.normalize('NFC').toLowerCase() || /\s/u.test(key)) fail('key must be lowercase NFC, without spaces');
    if (rows.has(key)) fail('duplicate key');
    const next = values.split(' ');
    if (next.length > 8 || next.some(x => !x || /\s/u.test(x))) fail('expected 1 to 8 space-separated words');
    if (new Set(next).size !== next.length || next.includes(key)) fail('duplicate or self successor');
    for (const word of [key, ...next]) {
      if (word !== word.normalize('NFC')) fail('word must be NFC');
      if (lang === 'ko' && !/^[가-힣]+$/u.test(word)) fail('expected Hangul word');
      if (lang === 'vi' && (word !== word.toLowerCase() || !isVietnameseSyllable(word))) fail('expected Vietnamese syllable');
      if (lang === 'ja' && (!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+$/u.test(word) || [...word].length > 16)) fail('expected Japanese word/block of at most 16 characters');
      if (vocabulary && !vocabulary.has(word)) fail(`word outside dictionary: ${word}`);
      if (isBlocked(word, blocked)) fail('blocked word');
    }
    if (lang === 'ja' && [...key].length === 1 && !/\p{Script=Han}/u.test(key)) fail('single kana context is ambiguous');
    rows.set(key, next);
  }
  return rows;
}

export function applyCuratedNext(baseText, curatedText, options) {
  // The statistical base can contain script/length exceptions. Do not re-clean
  // unreviewed rows; only require its structural invariants here.
  const base = new Map();
  let previous;
  for (const raw of baseText.split(/\r?\n/u)) {
    if (!raw || raw.startsWith('#')) continue;
    const parts = raw.split('\t');
    if (parts.length !== 2 || !parts[0] || !parts[1] || base.has(parts[0])) throw new Error('Malformed or duplicate base row');
    if (parts[0] !== parts[0].normalize('NFC').toLowerCase()) throw new Error('Base key must be lowercase NFC');
    if (previous !== undefined && compareCodePoints(previous, parts[0]) >= 0) throw new Error('Base keys must be strictly sorted');
    previous = parts[0]; base.set(parts[0], parts[1]);
  }
  if (base.size === 0) throw new Error('Empty statistical base');
  const patch = parseNext(curatedText, options);
  let addedKeys = 0, revisedKeys = 0, addedPairs = 0, removedPairs = 0;
  const changes = [];
  for (const [key, words] of patch) {
    const old = base.get(key);
    const next = words.join(' ');
    if (old === next) continue;
    const oldWords = old?.split(' ') ?? [];
    addedKeys += old === undefined ? 1 : 0;
    revisedKeys += old === undefined ? 0 : 1;
    addedPairs += words.filter(x => !oldWords.includes(x)).length;
    removedPairs += oldWords.filter(x => !words.includes(x)).length;
    changes.push({key, before: oldWords, after: words});
    base.set(key, next);
  }
  const stats = {reviewedKeys: patch.size, addedKeys, revisedKeys, addedPairs, removedPairs, entries: base.size, changes};
  if (!changes.length) return {text: baseText, stats};
  const headers = baseText.split(/\r?\n/u).filter(x => x.startsWith('#'))
    .map(x => x.startsWith('# 前词数:') ? `# 前词数:${base.size}` : x.startsWith('# 键数:') ? `# 键数:${base.size}` : x);
  headers.push(`# Ninan 日常接续审核:${options.lang};基准 SHA-256 ${sha(baseText)};审核 TSV SHA-256 ${sha(curatedText)}`,
    '# 人工审核只覆盖列出的键与顺序，不代表语料频次；原始来源及许可见上述声明。');
  if (options.lang === 'ja') headers.push('# 日语审核项可含完整礼貌词块，最长 16 字；上述 8 字门槛只用于原始语料统计。');
  const rows = [...base].sort((a, b) => compareCodePoints(a[0], b[0]));
  return {text: headers.join('\n') + '\n' + rows.map(([key, values]) => `${key}\t${values}`).join('\n') + '\n', stats};
}

export function reviewOptions(lang, dictPath) {
  if (!LANGUAGES.has(lang)) throw new Error('Language must be ja, ko or vi');
  if (lang === 'ja') return {lang};
  const name = lang === 'ko' ? 'korean' : 'vietnamese';
  const text = fs.readFileSync(dictPath ?? `apps/apple/NinanKeyboard/LetterWords/${name}.dict.txt`, 'utf8');
  return {lang, blocked: loadBlocklist(lang), vocabulary: new Set(text.split(/\r?\n/u).filter(x => x && !x.startsWith('#')).map(x => x.split('\t')[0]))};
}

export function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--base', '--curated', '--out', '--lang', '--dict', '--report'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Expected --base FILE --curated FILE --out FILE --lang ja|ko|vi [--dict FILE] [--report FILE]');
    if (options[args[i]]) throw new Error(`Duplicate option: ${args[i]}`);
    options[args[i]] = args[i + 1];
  }
  for (const key of ['--base', '--curated', '--out', '--lang']) if (!options[key]) throw new Error(`Missing ${key}`);
  const result = applyCuratedNext(fs.readFileSync(options['--base'], 'utf8'), fs.readFileSync(options['--curated'], 'utf8'), reviewOptions(options['--lang'], options['--dict']));
  fs.writeFileSync(options['--out'], result.text);
  if (options['--report']) fs.writeFileSync(options['--report'], JSON.stringify(result.stats, null, 2) + '\n');
  return result.stats;
}

if (isRunDirectly(import.meta.url)) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

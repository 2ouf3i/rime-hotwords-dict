// 注音符号 ↔ 大千式键位。注音键盘的方案生成、词典构建、评测都从这里取,别各写一份。
//
// 大千式就是把注音符号表照「数字排 / Q 排 / A 排 / Z 排」原样摆上 PC 键盘;喂给拼音引擎(librime)的就是这些
// PC 键盘上的字符。声调:二声 6、三声 3、四声 4、轻声 7,一声是空格。与维基百科「注音輸入法」条目的
// 「大千注音鍵盤排列」、rime-bopomofo 的键位、对标应用的方案三处逐键核对过(2026-10-05)。
//
// 键位的单源是 contract/zhuyin-keymap.json(两端键面、方案文件、这里的脚本都从它来,
// `check-parity.mjs --contract` 对拍两端的常量)。这个文件只负责把契约里的那几条串摊成好用的表。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const CONTRACT = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../contract/zhuyin-keymap.json'), 'utf8'),
);
const V = CONTRACT.values;

/** 37 个注音符号 → 键位。顺序 = 注音符号表的顺序(声母、介音、韵母)。 */
export const SYMBOL_KEYS = Object.freeze(Object.fromEntries([...V.symbols].map((symbol, i) => [symbol, [...V.symbolKeys][i]])));

const MARKED_TONES = [2, 3, 4, 5];
/** 声调(1~5,5 = 轻声)→ 键位。一声是空格。 */
export const TONE_KEYS = Object.freeze({1: V.firstToneKey, ...Object.fromEntries(MARKED_TONES.map((tone, i) => [tone, [...V.toneKeys][i]]))});
/** 声调 → 调号。一声在词典里不写调号;组字区里显示成 ˉ(U+02C9)。 */
export const TONE_MARKS = Object.freeze({1: '', ...Object.fromEntries(MARKED_TONES.map((tone, i) => [tone, [...V.toneMarks][i]]))});
export const FIRST_TONE_DISPLAY = V.firstToneDisplay;

/** 引擎方案的 id 与词典名。 */
export const SCHEMA_ID = V.schemaId;
export const DICT_NAME = V.dictName;

const MARK_TONE = {...Object.fromEntries(MARKED_TONES.map((tone) => [TONE_MARKS[tone], tone])), [FIRST_TONE_DISPLAY]: 1};
const KEY_SYMBOL = Object.fromEntries(Object.entries(SYMBOL_KEYS).map(([s, k]) => [k, s]));
const KEY_TONE_MARK = {[TONE_KEYS[1]]: FIRST_TONE_DISPLAY, ...Object.fromEntries(MARKED_TONES.map((tone) => [TONE_KEYS[tone], TONE_MARKS[tone]]))};

/** 37 个符号键连成一串(方案里 `speller/initials` 用)。 */
export const SYMBOL_KEY_STRING = Object.values(SYMBOL_KEYS).join('');
/** 37 个注音符号连成一串(与上面那串逐位对应,方案里 `xlit` 用)。 */
export const SYMBOL_STRING = Object.keys(SYMBOL_KEYS).join('');
/** 声调键:一声(空格)、二、三、四、轻声。 */
export const TONE_KEY_STRING = V.firstToneKey + V.toneKeys;

/** 手机上四排键各有哪些(= PC 键盘的数字排 / Q 排 / A 排 / Z 排;声调键夹在第一排里)。 */
export const ROWS = Object.freeze(CONTRACT.rows.map((row) => Object.freeze([...row])));

const SYLLABLE = /^([ㄅ-ㄩ]{1,3})([ˊˇˋ˙]?)$/u;

/**
 * 拆一个带调音节:「ㄐㄧㄝˊ」→ {body: 'ㄐㄧㄝ', tone: 2}。没有调号 = 一声。
 * 轻声的调号写在前面(印刷体的写法,˙ㄇㄜ)也认。认不出来返回 null。
 */
export function splitSyllable(syllable) {
  let s = syllable;
  if (s.startsWith('˙') && s.length > 1) s = s.slice(1) + '˙';
  const m = SYLLABLE.exec(s);
  if (!m) return null;
  return {body: m[1], tone: m[2] ? MARK_TONE[m[2]] : 1};
}

/** 规范写法:调号在后,一声不写。 */
export function normalizeSyllable(syllable) {
  const parts = splitSyllable(syllable);
  return parts ? parts.body + TONE_MARKS[parts.tone] : null;
}

/**
 * 一个带调音节 → 要按的键。`tone`:
 *   'all'    每个音节都按声调键(一声按空格)
 *   'marked' 二三四声、轻声按,一声什么都不按
 *   'none'   一个声调键都不按
 */
export function syllableToKeys(syllable, tone = 'all') {
  const parts = splitSyllable(syllable);
  if (!parts) throw new Error(`不是注音音节:${syllable}`);
  const body = [...parts.body].map((ch) => SYMBOL_KEYS[ch]).join('');
  if (tone === 'none') return body;
  if (tone === 'marked' && parts.tone === 1) return body;
  return body + TONE_KEYS[parts.tone];
}

/** 一串用空格隔开的带调音节 → 整串按键。 */
export function readingToKeys(reading, tone = 'all') {
  return reading.trim().split(/\s+/u).map((s) => syllableToKeys(s, tone)).join('');
}

/** 按键串 → 组字区里显示的样子(声调键显示成调号,一声显示成 ˉ)。认不得的字符原样留下。 */
export function keysToDisplay(keys) {
  return [...keys].map((k) => KEY_SYMBOL[k] ?? KEY_TONE_MARK[k] ?? k).join('');
}

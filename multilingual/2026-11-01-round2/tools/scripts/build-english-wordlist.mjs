#!/usr/bin/env node
// 把 AOSP LatinIME 的英文词表转成 Ninan 英文补全引擎吃的 `word<TAB>freq` 文本。
//
// 用法:
//   node scripts/build-english-wordlist.mjs <en_wordlist.combined> [--out <路径>] [--stats]
//                                            [--patch <路径>|--no-patch]
//
// 只改了补丁表、手上没有原表时,第一个参数可以直接给已经生成过的 `english.dict.txt`(见 `parseBuilt`):
//   node scripts/build-english-wordlist.mjs apps/apple/NinanKeyboard/English/english.dict.txt \
//     --out apps/apple/NinanKeyboard/English/english.dict.txt
//   (安卓那份 `apps/android/app/src/main/assets/english/english.dict.txt` 逐字节相同,生成后拷过去)
//
// 默认会并入**现代词补丁** `scripts/english-modern-words.tsv`(自己写的,无第三方版权):
// 主表冻结在 2014 年,`covid` / `GitHub` / `TikTok` 这类词整个没有,而 `app`(40)/
// `Instagram`(25)/ `iOS`(1)这些的频率是十年前的,排序上被冷僻词压住等于补不出来。
//
// 源表:AOSP LatinIME `dictionaries/en_wordlist.combined.gz`,**Apache-2.0**
//   https://android.googlesource.com/platform/packages/inputmethods/LatinIME/+/master/dictionaries/
//   取法(gitiles 只给 base64):
//     curl -sSL '<上面那个 URL>/en_wordlist.combined.gz?format=TEXT' | base64 -d | gunzip > en_wordlist.combined
//
// ⚠️ 合规:Apache-2.0 要求保留署名。装进安装包之前,app 内开源许可页要加
//   「Copyright (c) 2008, The Android Open Source Project」+ Apache-2.0 全文,
//   并照 `apps/android/app/src/main/assets/rime/NOTICE.md` 的既有格式追加一节。
//   它**不是 GPL**,可以直接随包分发,不必像 hotwords 那样走 OTA-only。
//
// 形状照 `scripts/check-release-version.mjs`:纯 node、零依赖、自带 `.test.mjs`。

import fs from 'node:fs';
import { isRunDirectly } from './lib/run-directly.mjs';

/** 源表每行形如 ` word=the,f=222,flags=,originalFreq=222`。 */
const LINE = /^\s*word=([^,]*),f=(-?\d+)(?:,flags=([^,]*))?/;

/**
 * 带这些 flag 的词一律不收。
 *
 * ⚠️ **是 `offensive` 不是 `possibly_offensive`。** 后者在这份表里实测**一条都没有**,
 * 按它过滤等于没过滤。实测分布:`offensive` 189 条 + `nonword:offensive` / `offensive:nonword`
 * 各 1 条 = 191 条。flags 列是**冒号分隔**的多值(`nonword:offensive`),不是空格。
 *
 * `nonword`(54 条,如 `qwerty` 这类键盘序列)一并剔掉:它们不是英语词,补出来只会占位。
 */
const REJECTED_FLAGS = new Set(['offensive', 'nonword']);

/**
 * 只收纯 ASCII 字母的词 —— 与两端引擎的 `isPlainWord` **同口径**。
 *
 * 带撇号的(`don't` / `I'll`,实测 1.1 万条)、带连字符的、带数字的都不收:
 * 用户打不出 `don` 就期待补出撇号,而它们会把前缀区间撑大。
 * ⚠️ 这道过滤同时是**跨端排序一致性**的前提(Kotlin 的 `compareTo` 是 UTF-16 码元序、
 * Swift 的 `<` 是 Unicode 标量序,两者只在 ASCII 内一致),别在这里放宽。
 */
function isPlainWord(word) {
  return word.length > 0 && /^[A-Za-z]+$/.test(word);
}

/**
 * 解析源表。
 *
 * 返回 `{ rows, stats }`。`rows` 里保留**原始大小写**(专名如 `American` 靠它),
 * 引擎侧再按「小写索引 + 输出时还原」处理。
 * ⚠️ 这一步**不合并**大小写变体 —— 合并发生在 `mergePatch`(与引擎同一套判据:按小写 key 取最高频)。
 */
export function parseCombined(text) {
  const rows = [];
  const stats = { total: 0, rejectedByFlag: 0, rejectedByShape: 0, rejectedByFreq: 0, kept: 0 };
  for (const line of text.split('\n')) {
    const m = LINE.exec(line);
    if (!m) continue;
    stats.total += 1;
    const word = m[1];
    const freq = Number.parseInt(m[2], 10);
    const flags = (m[3] || '').split(':').filter(Boolean);
    if (flags.some((f) => REJECTED_FLAGS.has(f))) { stats.rejectedByFlag += 1; continue; }
    if (!isPlainWord(word)) { stats.rejectedByShape += 1; continue; }
    // f=0 的词(实测 377 条)在引擎里永远排最后,占着名额却轮不到出场。
    if (!Number.isFinite(freq) || freq < 1) { stats.rejectedByFreq += 1; continue; }
    rows.push([word, freq]);
    stats.kept += 1;
  }
  return { rows, stats };
}

/**
 * 解析**已经生成过的** `english.dict.txt`(本脚本自己的输出:`word<TAB>freq`,`#` 开头整行跳过)。
 *
 * 用途(2026-10-17):只改了补丁表、手上没有 AOSP 原表时,拿现成的输出当主表、再并一次补丁。
 * 合并按小写 key 取最大频率,输出里每个 key 只剩一条,所以「旧输出 + 新补丁」与「原表 + 新补丁」逐行相同
 * (前提是原表没变;补丁里**删掉**的词这条路去不掉,那种改动要回到原表重建)。
 */
export function parseBuilt(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [word, freqText] = line.split('\t');
    const freq = Number.parseInt(freqText ?? '', 10);
    if (!isPlainWord(word ?? '') || !Number.isFinite(freq) || freq < 1) {
      throw new Error(`english.dict.txt 这一行不合法:${JSON.stringify(raw)}`);
    }
    rows.push([word, freq]);
  }
  return rows;
}

/** 输入是 AOSP 原表(` word=the,f=222,…`)还是本脚本的输出(`the<TAB>222`)。 */
export function isBuiltWordlist(text) {
  return !/^\s*word=/m.test(text);
}

/**
 * 解析现代词补丁表(`word<TAB>freq`,`#` 开头整行跳过)。判据与主表同一套 `isPlainWord`。
 */
export function parsePatch(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [word, freqText] = line.split('\t');
    if (!word || freqText === undefined) continue;
    const freq = Number.parseInt(freqText.trim(), 10);
    if (!isPlainWord(word) || !Number.isFinite(freq) || freq < 1) {
      throw new Error(`补丁表这一行不合法:${JSON.stringify(raw)}`);
    }
    rows.push([word, freq]);
  }
  return rows;
}

/**
 * 把补丁并进主表。**按小写 key 合并,频率取最大值。**
 *
 * ⚠️ 取最大值(而不是「补丁一律覆盖」)是有意的:补丁的职责是把过时的词**抬上来**,
 * 不是给主表降权 —— 万一补丁里某个数写小了,也不会把一个本来高频的词压下去。
 * 补丁赢的时候**连大小写一起用补丁的**(`GitHub` / `iPhone` / `iOS` 这类专名靠它写对);
 * 主表赢就原样留着(`apple` / `zoom` 这类普通名词的小写形态不许被品牌名顶掉)。
 *
 * 同一个词在主表里有多个大小写变体时(`WiFi` / `wifi`),各自与补丁比 —— 合并后
 * 引擎那侧还会再按「最高频变体的原形」收一次,两层都收敛到同一个结果。
 */
export function mergePatch(rows, patchRows) {
  const best = new Map(); // 小写 key → [原形, 频率]
  for (const [word, freq] of rows) {
    const key = word.toLowerCase();
    const prev = best.get(key);
    if (!prev || freq > prev[1]) best.set(key, [word, freq]);
  }
  const stats = { added: 0, raised: 0, unchanged: 0 };
  for (const [word, freq] of patchRows) {
    const key = word.toLowerCase();
    const prev = best.get(key);
    if (!prev) { best.set(key, [word, freq]); stats.added += 1; continue; }
    if (freq > prev[1]) { best.set(key, [word, freq]); stats.raised += 1; } else { stats.unchanged += 1; }
  }
  return { rows: [...best.values()], stats };
}

/**
 * 输出 `word<TAB>freq`,按**字母序**排(不是频率序)。
 *
 * ⚠️ 排字母序不是为了好看:两端引擎建表时**自己**会按频率裁剪再排字母序,
 * 而源文件按字母序存能让 diff 可读、也能让「这个词在不在表里」用二分直接查。
 * 频率信息一个字节不丢,裁剪由引擎按 `contract/english-completion.json` 的数字做。
 */
export function render(rows) {
  const sorted = [...rows].sort((a, b) => {
    const la = a[0].toLowerCase();
    const lb = b[0].toLowerCase();
    if (la !== lb) return la < lb ? -1 : 1;
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  const header = [
    '# Ninan 英文补全词表',
    '# 源:AOSP LatinIME en_wordlist.combined(Apache-2.0)',
    '# Copyright (c) 2008, The Android Open Source Project',
    '# 现代词补丁:scripts/english-modern-words.tsv(Ninan 自拟,无第三方版权)',
    '# 由 scripts/build-english-wordlist.mjs 生成,别手改 —— 改判据改脚本。',
    `# 词条数:${sorted.length}`,
    '',
  ].join('\n');
  return header + sorted.map(([w, f]) => `${w}\t${f}`).join('\n') + '\n';
}

function main(argv) {
  const args = argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  if (!input) {
    console.error('用法: node scripts/build-english-wordlist.mjs <en_wordlist.combined> [--out 路径] [--stats]');
    process.exit(2);
  }
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? args[outIndex + 1] : null;
  const inputText = fs.readFileSync(input, 'utf8');
  // 输入也可以是上一次的输出(只改了补丁表时用,见 `parseBuilt`)。
  let { rows, stats } = isBuiltWordlist(inputText)
    ? (() => {
      const built = parseBuilt(inputText);
      return { rows: built, stats: { total: built.length, kept: built.length, rejectedByFlag: 0, rejectedByShape: 0, rejectedByFreq: 0 } };
    })()
    : parseCombined(inputText);
  let patchStats = null;
  if (!args.includes('--no-patch')) {
    const patchIndex = args.indexOf('--patch');
    const patchPath = patchIndex >= 0
      ? args[patchIndex + 1]
      : new URL('./english-modern-words.tsv', import.meta.url).pathname;
    const merged = mergePatch(rows, parsePatch(fs.readFileSync(patchPath, 'utf8')));
    rows = merged.rows;
    patchStats = merged.stats;
  }
  if (args.includes('--stats')) {
    console.error(`总行 ${stats.total} / 收下 ${stats.kept}`
      + ` / 按 flag 剔除 ${stats.rejectedByFlag}`
      + ` / 按词形剔除 ${stats.rejectedByShape}`
      + ` / 按频率剔除 ${stats.rejectedByFreq}`);
    if (patchStats) {
      console.error(`现代词补丁:新增 ${patchStats.added} / 抬高 ${patchStats.raised}`
        + ` / 未动(主表已更高)${patchStats.unchanged}`);
    }
  }
  const text = render(rows);
  if (out) {
    fs.writeFileSync(out, text, 'utf8');
    console.error(`已写出 ${out}(${rows.length} 条,${(Buffer.byteLength(text) / 1048576).toFixed(2)} MB)`);
  } else {
    process.stdout.write(text);
  }
}

if (isRunDirectly(import.meta.url)) main(process.argv);

#!/usr/bin/env node
// 生成「拼音里出英文单词」用的小词表 `english-in-pinyin.txt`(2026-10-17)。
//
// 用户:「是不是可以在拼音输入中加入英文单词的推荐候选,比如在用户输入的过程中,取一个或两个英文单词作为候选」;
// 看过方案(第 2 格、默认开)后:「按你推荐来」。判据与数字的单源是 `contract/english-in-pinyin.json`。
//
// 用法:
//   node scripts/build-english-in-pinyin.mjs            重新生成两端那两份
//   node scripts/build-english-in-pinyin.mjs --check    只比对,两份与生成结果不一致时退出码 1
//   node scripts/build-english-in-pinyin.mjs --stats    顺带打印收了多少、被中文占住的高频词
//
// ### 为什么另做一张表,不直接用英文面那份 13 万词的
// 那份只在切到英文面时才加载;拼音面也用它的话,一直打中文的人要多占约 31 MB、多建 265 毫秒的表(电脑上量的)。
// 这张表只收词频不低的常用词,常驻约 1.4 MB。
//
// ### 收哪些词:按「这串字母当中文打到一半有多常见」筛
// 打中文的过程中,组合区里的字母串常常恰好是个英文词:打「不是」会先打出 bus,打「为」经过 we,打「可以」经过 key。
// 这些词收进来,打中文时英文候选会一直冒出来。所以拿随包的拼音词库估一下每个英文词作为「中文打到一半的状态」
// 出现得有多频繁(全拼的前缀 + 首字母缩写的前缀,再加两个词连着打),超过门槛的不收。
//   - 估法是**两词连打模型**:P(这串字母) = P(打到一半就是它) + Σ P(第一个词的全拼 = 前一截) × P(后一截是某个词打到一半)。
//     只按单个词算会漏掉 `nice`(打「你测试」时会经过它)这类。
//   - 用的是随包的 `pinyin_simp.dict.yaml`(git 里有、结果可复现);线上下发的大词库更全,真实的占用会偏高一点。
//
// ### 打到第几个字母起补全:同一把尺,门槛更严,算好写进第三列
// 原来键盘上的规则是「这串字母已经不可能是拼音打到一半才补全」,结果 delicious(de-li-ci-ou-s)、chinese、language
// 这类由拼音音节拼起来的词,一直到打完都补不出来。现在改成离线按占用算(见 [completionMinimumPrefix]),键盘只按第三列过滤,
// 手机上不再做拼音判断。
//
// 形状照 `scripts/build-english-wordlist.mjs`:纯 node、零依赖、自带 `.test.mjs`。

import fs from 'node:fs';
import { isRunDirectly } from './lib/run-directly.mjs';

/**
 * 词频(0–222 的对数刻度,同英文面那份)低于它的不收:长尾词混在拼音候选里只会添乱。
 * 2026-10-17 晚从 90 放到 85(用户:「拼一下联想的单词是不是有点少,比如 Delicious 就无法联想出来」;delicious 是 88)。
 */
export const MIN_FREQUENCY = 85;
/** 至少几个字母。单个字母的英文词(a / I)在拼音里只是噪声。 */
export const MIN_LENGTH = 2;
/** 当中文打到一半的占用超过这么多(百万分之几)就不收。 */
export const MAX_OCCUPANCY_PPM = 20;
/** 首字母缩写那一路的权重:打缩写比打全拼少,按全拼的两成算。 */
export const ABBREVIATION_WEIGHT = 0.2;
/** 至少几个字母才补全(键盘那边同一个数,契约 `completionMinimumLength`)。 */
export const COMPLETION_MINIMUM_LENGTH = 4;
/**
 * 补全的门槛:打到的这一截当中文打到一半的占用低于它,才拿以它开头的词补全(第三列,见 [completionMinimumPrefix])。
 *
 * 比整词那道(20)严得多:补全是「还没打完就猜」,前缀又短,打中文时经过它的机会比整词多。
 * 2026-10-17 晚量的(词频 ≥ 85):原来的「已经不可能是拼音打到一半才补全」,常用词(词频 ≥ 120、≥ 5 个字母)里
 * 82% 能在打完之前补出、打中文时约 0.44% 的击键冒出英文;改成这道 2 ppm 的门槛是 95% / 约 0.46%
 * (5 ppm 96% / 0.58%,20 ppm 98% / 1.09%)。delicious 打到 delici 就补得出。
 */
export const MAX_PREFIX_OCCUPANCY_PPM = 2;

const ROOT = new URL('../', import.meta.url);
export const INPUTS = {
  english: 'apps/apple/NinanKeyboard/English/english.dict.txt',
  pinyin: 'apps/apple/NinanKeyboard/Rime/pinyin_simp.dict.yaml',
};
export const OUTPUTS = [
  'apps/apple/NinanKeyboard/English/english-in-pinyin.txt',
  'apps/android/app/src/main/assets/english/english-in-pinyin.txt',
];

/** 英文词表(`word<TAB>freq`)→ [[原形, 词频]]。只收纯字母的,同英文面引擎的 `isPlainWord`。 */
export function parseEnglish(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [word, freqText] = line.split('\t');
    const freq = Number.parseInt(freqText ?? '', 10);
    if (!/^[A-Za-z]+$/.test(word ?? '') || !Number.isFinite(freq)) continue;
    rows.push([word, freq]);
  }
  return rows;
}

/** rime 词典(`字<TAB>读音<TAB>权重`)→ [[读音, 权重]]。读音是空格分开的音节;没有权重、或读音里有别的字符的跳过。 */
export function parsePinyin(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const parts = raw.split('\t');
    if (parts.length < 3 || !/^\d+$/.test(parts[2]) || !/^[a-z ]+$/.test(parts[1])) continue;
    rows.push([parts[1], Number(parts[2])]);
  }
  return rows;
}

/**
 * 每个字母串当「中文打到一半的状态」的分量,和每串全拼正好是一个词的分量。
 * - 全拼:`ni hao` 打的过程中经过 n / ni / nih / niha / nihao,每个前缀记一次这个词的权重。
 * - 首字母缩写(两个音节以上的词):`nh` 起的每个前缀记 `ABBREVIATION_WEIGHT` 倍。
 */
export function buildOccupancyModel(pinyinRows) {
  const prefix = new Map();
  const full = new Map();
  let total = 0;
  const add = (map, key, w) => map.set(key, (map.get(key) ?? 0) + w);
  for (const [code, weight] of pinyinRows) {
    const syllables = code.split(' ').filter(Boolean);
    const letters = syllables.join('');
    for (let i = 1; i <= letters.length; i += 1) add(prefix, letters.slice(0, i), weight);
    if (syllables.length >= 2) {
      const initials = syllables.map((s) => s[0]).join('');
      for (let i = 2; i <= initials.length; i += 1) add(prefix, initials.slice(0, i), weight * ABBREVIATION_WEIGHT);
    }
    add(full, letters, weight);
    total += weight;
  }
  return { prefix, full, total };
}

/** 这串字母当中文打到一半的占用(百万分之几),两词连打模型,见文件头。 */
export function occupancyPpm(letters, model) {
  const { prefix, full, total } = model;
  if (total <= 0) return 0;
  let p = (prefix.get(letters) ?? 0) / total;
  for (let k = 1; k < letters.length; k += 1) {
    const first = full.get(letters.slice(0, k));
    if (first) p += (first / total) * ((prefix.get(letters.slice(k)) ?? 0) / total);
  }
  return p * 1e6;
}

/**
 * 打到第几个字母起才拿这个词补全:从这一键起,往后每一截(不含整词)当中文打到一半的占用都低于
 * [MAX_PREFIX_OCCUPANCY_PPM]。至少 [COMPLETION_MINIMUM_LENGTH];一截都不行 → 词长(= 只能整词打出来)。
 * 要求「往后每一截都低」而不是「这一截低」:占用不随长度单调(多打一个字母可能正好凑成一个中文词),
 * 照这个算,补全出现之后不会在下一键又消失。
 */
export function completionMinimumPrefix(word, model) {
  let start = word.length;
  for (let k = word.length - 1; k >= COMPLETION_MINIMUM_LENGTH; k -= 1) {
    if (occupancyPpm(word.slice(0, k), model) >= MAX_PREFIX_OCCUPANCY_PPM) break;
    start = k;
  }
  return start;
}

/** 选词:词频够、长度够、不被中文占住。返回 { rows: [[原形, 词频, 补全起点]], dropped: [[原形, 词频, 占用]] }。 */
export function selectWords(englishRows, model) {
  const best = new Map(); // 小写 → [原形, 词频];同一个词的大小写变体取词频高的(同英文面引擎)
  for (const [word, freq] of englishRows) {
    const key = word.toLowerCase();
    const prev = best.get(key);
    if (!prev || freq > prev[1]) best.set(key, [word, freq]);
  }
  const rows = [];
  const dropped = [];
  for (const [key, [word, freq]] of best) {
    if (freq < MIN_FREQUENCY || key.length < MIN_LENGTH) continue;
    const ppm = occupancyPpm(key, model);
    if (ppm >= MAX_OCCUPANCY_PPM) dropped.push([word, freq, ppm]);
    else rows.push([word, freq, completionMinimumPrefix(key, model)]);
  }
  return { rows, dropped };
}

/** 输出:按小写字母序(两端建表时自己会再排,这里排序是为了 diff 可读),带来源与参数的头。 */
export function render(rows) {
  const sorted = [...rows].sort((a, b) => {
    const la = a[0].toLowerCase();
    const lb = b[0].toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
  const header = [
    '# Ninan 拼音里出英文单词的词表',
    '# 由 scripts/build-english-in-pinyin.mjs 生成,别手改 —— 改判据改脚本,数字的单源是 contract/english-in-pinyin.json。',
    '# 词取自英文面那份 english.dict.txt(AOSP LatinIME,Apache-2.0,Copyright (c) 2008, The Android Open Source Project;',
    '# 外加 Ninan 自拟的 scripts/english-modern-words.tsv),按随包拼音词库估的「当中文打到一半的占用」筛过。',
    `# 词频 ≥ ${MIN_FREQUENCY}、至少 ${MIN_LENGTH} 个字母、占用 < ${MAX_OCCUPANCY_PPM} ppm。词条数:${sorted.length}`,
    `# 每行:词<TAB>词频<TAB>打到第几个字母起才拿它补全(这一截往后的占用都 < ${MAX_PREFIX_OCCUPANCY_PPM} ppm;等于词长 = 只能整词打出来)。`,
    '',
  ].join('\n');
  return header + sorted.map(([w, f, m]) => `${w}\t${f}\t${m}`).join('\n') + '\n';
}

export function generate(englishText, pinyinText) {
  const model = buildOccupancyModel(parsePinyin(pinyinText));
  const { rows, dropped } = selectWords(parseEnglish(englishText), model);
  return { text: render(rows), rows, dropped };
}

function read(rel) {
  return fs.readFileSync(new URL(rel, ROOT), 'utf8');
}

function main(argv) {
  const args = argv.slice(2);
  const known = new Set(['--check', '--stats']);
  const unknown = args.find((a) => !known.has(a));
  if (unknown) {
    console.error(`不认识的参数:${unknown}\n用法: node scripts/build-english-in-pinyin.mjs [--check] [--stats]`);
    process.exit(2);
  }
  const { text, rows, dropped } = generate(read(INPUTS.english), read(INPUTS.pinyin));
  if (args.includes('--stats')) {
    const top = [...dropped].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([w]) => w);
    console.error(`收 ${rows.length} 个词;被中文占住、不收的 ${dropped.length} 个,词频最高的:${top.join(' ')}`);
  }
  if (args.includes('--check')) {
    const stale = OUTPUTS.filter((rel) => {
      try { return read(rel) !== text; } catch { return true; }
    });
    if (stale.length) {
      console.error(`english-in-pinyin.txt 与生成结果不一致:${stale.join('、')}\n跑一次 node scripts/build-english-in-pinyin.mjs`);
      process.exit(1);
    }
    console.error(`english-in-pinyin.txt 是最新的(${rows.length} 条)`);
    return;
  }
  for (const rel of OUTPUTS) fs.writeFileSync(new URL(rel, ROOT), text, 'utf8');
  console.error(`已写出 ${OUTPUTS.join('、')}(${rows.length} 条,${(Buffer.byteLength(text) / 1024).toFixed(0)} KB)`);
}

if (isRunDirectly(import.meta.url)) main(process.argv);

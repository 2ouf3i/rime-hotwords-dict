#!/usr/bin/env node
// 注音键盘的词典:把小麦注音(McBopomofo)的词库转成 Rime 词典(繁体、带声调)。
//
//   node scripts/zhuyin/build-zhuyin-dict.mjs --src <源文件目录> --out <ninan_zhuyin.dict.yaml> [--commit <上游提交号>]
//        [--fscale 2.7] [--scale 1e8] [--manifest <写一份统计与校验和的 JSON>]
//        [--phrases backend/dict/multilingual/zhuyin-20261101.tsv] [--phrase-weight 100]
//
// 源文件用 scripts/zhuyin/fetch-sources.sh 按固定提交号取(它会核对 sha256)。源数据不进仓库；词典生成物随包。
// 设计与评测:docs/superpowers/specs/2026-10-05-zhuyin-keyboard-design.md。
//
// ── 许可 ──
// 小麦注音是 MIT License(Copyright (c) 2011-2026 Mengjuei Hsieh et al.),词表最初取自 libtabe 的 tsi.src(BSD License)。
// 生成的词典是它的改编,可以随安装包分发;随包时要在许可页带上这两份声明(原文见设计文档「许可说明」一节)。
// 这个脚本没有照搬上游的构建脚本,只是照它的**算法**(下面逐条写了)重新实现,并在三处有意不同(标了「与上游不同」)。
//
// ── 用到的五种源文件,各自怎么用 ──
// 1. phrase.occ        「词 次数」。上游从自己的语料里数出来的出现次数(子串计数:「中華民國」出现一次,
//                      「中華」「民國」和每个单字也各记一次)。
// 2. exclusion.txt     「片段<Tab>不该算进去的词」。子串计数会把「國一下」算进「一下」里;这张表逐条列出要扣掉的:
//                      一下 的次数 -= 國一下 的次数。只扣表里列了的,不做通用的「长词扣短词」。
// 3. BPMFMappings.txt  「词 注音 注音 …」。两到九个字的词和它的读音。一个词有几种读法就有几行
//                      (「一丁點」既有 ㄧ 也有 ㄧˋ —— 上游把「一、不」的变调读法也收了,用户按哪种都打得出)。
//                      **同一个词的每种读法拿同样的词频**(上游如此;语料里数不出哪种读法各占多少)。
// 4. BPMFBase.txt      「字 注音 拼音 大千键码 来源」。单字和它的每个读音,只用前两列。文件里的先后顺序是有意排的
//                      (常用的在前),语料里没出现过的生僻字靠它定先后。
// 5. heterophony1/2/3.list 「字 注音」。破音字的第一、二、三常用读音(各 528 / 66 / 17 个字)。只管单字:
//                      - 字不在第一张表里:每个读音都拿这个字的全部词频(上游如此);
//                      - 读音 = 第一常用:全部词频;= 第二常用:折到 0.2027(10^-0.693,上游的数);= 第三常用:再折一次;
//                      - 其余读音:给一个很低的保底值(概率 10^-6.8,上游的 H_DEFLT_FREQ)。
//
// ── 词频怎么换算成 Rime 的权重 ──
// 上游的做法(frequency_builder.py):概率 = 2.7^(字数-1) × 次数 ÷ 归一化常数;次数不到 1 的按 0.5 算。
// 2.7^(字数-1) 是给多字词的加成 —— 子串计数里单字被重复数了很多次(每个词里的字都算一次),不加成的话整句会被拆成单字。
// 归一化常数 = 所有条目「加成 × 次数」之和,所以全部概率加起来是 1。
// Rime 这边:词条权重取对数后相加,没有语言模型时每个词再加一个固定的 ln(1e-8)(librime 的 grammar.h)。
// 也就是说它把「权重 × 1e-8」当概率用。所以 **权重 = 概率 × 1e8**(--scale),全部权重加起来正好是 1e8。
// (量过:这个量级与 Rime 自己那份「八股文」词频相当,八股文单字的中位数是这里的 1.8 倍、多字词是 3.3 倍。)
//
// ── 与上游不同的三处 ──
// a. 文本本身是注音符号 / 调号的那 41 条(ㄅ → ㄅ)不收。它们会让每个声母单独成一个「音节」,整句切分多出一堆歧义;
//    要打注音符号本身,键面在「没有候选」时把组字区原样上屏。「〇」照收。
// b. 破音字的次要读音不许高过主读音的一半。上游的保底值是个固定数,生僻字的主读音可能比它还低,次要读音反而排到前面。
// c. 归一化常数里,被排除表扣成负数的次数按 0 算(上游照负数加进去;差别在小数点后好几位)。
// d. 多字词里的「臺」一律写成「台」(用户 2026-10-05 定的:繁体用「台」不用「臺」,界面文案、后端出口、拼音候选同一个口径)。
//    上游两种写法都收(台灣 24,111 次、臺灣 0 次);这里把「臺…」的词改成「台…」,改完与已有的词重复就丢掉。
//    单字「臺」照收(排在「台」后面),要打这个字的人打得出。
//
// 纯 node、无依赖;测试在 build-zhuyin-dict.test.mjs。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {normalizeSyllable} from './keymap.mjs';
import {isRunDirectly} from '../lib/run-directly.mjs';

export const DEFAULTS = Object.freeze({
  fscale: 2.7,                         // 多字词的加成底数(上游的 fscale)
  scale: 1e8,                          // 概率 → Rime 权重
  unseenCount: 0.5,                    // 次数不到 1 的按它算(上游)
  secondReadingFactor: 10 ** -0.69314718055994,          // 第二常用读音的折价(上游在 log10 值上减 0.693)
  thirdReadingFactor: 10 ** (-0.69314718055994 * 2),     // 第三常用读音
  otherReadingProbability: 10 ** -6.8,                   // 其余读音的保底概率(上游的 H_DEFLT_FREQ)
  minorReadingCap: 0.5,                // 次要读音最多是主读音的几成(与上游不同 b)
  orderEpsilon: 1e-7,                  // 次数相同的单字按 BPMFBase 里的先后排:每往后一行权重少这么一点
  preferredVariants: Object.freeze([['臺', '台']]),      // 多字词里前者一律写成后者(与上游不同 d)
});

export const SOURCE_FILES = Object.freeze([
  'BPMFMappings.txt', 'BPMFBase.txt', 'phrase.occ',
  'heterophony1.list', 'heterophony2.list', 'heterophony3.list', 'exclusion.txt',
]);

const NOT_A_WORD = /^[ㄅ-ㄩˊˇˋ˙ˉ]+$/u;        // 文本本身是注音符号 / 调号(与上游不同 a)

function dataLines(text) {
  return text.split('\n').map((l) => l.replace(/\r$/u, '')).filter((l) => l.trim() !== '' && !l.startsWith('#'));
}

/** phrase.occ → Map(词 → 次数)。 */
export function parseOccurrences(text) {
  const counts = new Map();
  for (const line of dataLines(text)) {
    const [word, n] = line.trim().split(/\s+/u);
    if (word && n !== undefined && /^-?\d+$/u.test(n)) counts.set(word, Number(n));
  }
  return counts;
}

/** exclusion.txt → [[片段, 不该算进去的词]]。后者不含前者的行没有意义,丢掉(上游同)。 */
export function parseExclusions(text) {
  const pairs = [];
  for (const line of dataLines(text)) {
    const [fragment, phrase] = line.trim().split(/\s+/u);
    if (fragment && phrase && phrase.includes(fragment)) pairs.push([fragment, phrase]);
  }
  return pairs;
}

/** 按排除表扣次数:片段的次数 -= 那个词的次数(两边都在才扣;扣的是那个词**原来**的次数还是已扣过的,取决于先后 —— 与上游一样按表里的顺序)。 */
export function applyExclusions(counts, exclusions) {
  const adjusted = new Map(counts);
  for (const [fragment, phrase] of exclusions) {
    if (adjusted.has(fragment) && adjusted.has(phrase)) {
      adjusted.set(fragment, adjusted.get(fragment) - adjusted.get(phrase));
    }
  }
  return adjusted;
}

/** heterophony?.list → Map(字 → 读音)。 */
export function parseHeterophony(text) {
  const map = new Map();
  for (const line of dataLines(text)) {
    const [char, reading] = line.trim().split(/\s+/u);
    const normalized = reading && normalizeSyllable(reading);
    if (char && normalized) map.set(char, normalized);
  }
  return map;
}

/** BPMFBase.txt → [{text, reading, index}](index = 第几行,定生僻字的先后)。读音认不出来的行抛错。 */
export function parseBase(text) {
  const rows = [];
  dataLines(text).forEach((line, index) => {
    const [char, reading] = line.split(' ');
    if (!char || !reading) throw new Error(`BPMFBase 第 ${index + 1} 行不是「字 注音 …」:${line}`);
    if (NOT_A_WORD.test(char)) return;
    const normalized = normalizeSyllable(reading);
    if (!normalized) throw new Error(`BPMFBase 第 ${index + 1} 行的注音认不出来:${line}`);
    rows.push({text: char, reading: normalized, index});
  });
  return rows;
}

/** BPMFMappings.txt → [{text, syllables}]。字数与音节数对不上、注音认不出来的行抛错(宁可构建失败,不悄悄丢词)。 */
export function parseMappings(text) {
  const rows = [];
  dataLines(text).forEach((line, index) => {
    const [word, ...readings] = line.trim().split(/\s+/u);
    const syllables = readings.map(normalizeSyllable);
    if (!word || syllables.length === 0 || syllables.includes(null) || [...word].length !== syllables.length) {
      throw new Error(`BPMFMappings 第 ${index + 1} 行对不上(字数与音节数要相等,音节要是注音):${line}`);
    }
    rows.push({text: word, syllables});
  });
  return rows;
}

/**
 * 算出全部词条与权重。返回 {entries: [{text, code, weight}], stats}。
 * `counts` 是已经按排除表扣过的次数。
 */
export function buildEntries({base, mappings, counts, het1, het2, het3, options = {}}) {
  const o = {...DEFAULTS, ...options};
  const length = (word) => [...word].length;
  const boost = (word) => o.fscale ** (length(word) - 1);
  let norm = 0;
  for (const [word, n] of counts) norm += boost(word) * Math.max(n, 0);
  if (!(norm > 0)) throw new Error('phrase.occ 里没有一条次数大于 0 的');
  const probability = (word) => {
    const n = counts.get(word) ?? 0;
    return (boost(word) * (n < 1 ? o.unseenCount : n)) / norm;
  };

  const entries = [];
  const stats = {characters: 0, characterReadings: 0, phrases: 0, phraseReadings: 0, unseen: 0, minorReadings: 0, variantsDropped: 0, variantsRewritten: 0, norm};
  const seenChars = new Set();
  for (const {text, reading, index} of base) {
    const whole = probability(text);
    let p = whole;
    if (het1.has(text) && het1.get(text) !== reading) {
      // 破音字的次要读音(只有列进第一张表的字才分主次)
      let minor = o.otherReadingProbability;
      if (het2.get(text) === reading) minor = Math.max(whole * o.secondReadingFactor, o.otherReadingProbability);
      else if (het2.has(text) && het3.get(text) === reading) minor = Math.max(whole * o.thirdReadingFactor, o.otherReadingProbability);
      p = Math.min(minor, whole * o.minorReadingCap);
      stats.minorReadings += 1;
    }
    if (!seenChars.has(text)) {
      seenChars.add(text);
      stats.characters += 1;
      if ((counts.get(text) ?? 0) < 1) stats.unseen += 1;
    }
    stats.characterReadings += 1;
    entries.push({text, code: reading, weight: p * o.scale * (1 - index * o.orderEpsilon)});
  }
  // 多字词:先把「臺 → 台」这类写法统一掉。原来就写成「台…」的优先(它带着真实的次数);
  // 只有「臺…」写法的词改写后收进来,词频仍按它原来的写法查。
  const preferred = (word) => o.preferredVariants.reduce((w, [from, to]) => w.split(from).join(to), word);
  const phraseKeys = new Set(mappings.filter((m) => preferred(m.text) === m.text).map((m) => `${m.text}\t${m.syllables.join(' ')}`));
  const seenPhrases = new Set();
  for (const {text: original, syllables} of mappings) {
    const text = preferred(original);
    const code = syllables.join(' ');
    if (text !== original) {
      if (phraseKeys.has(`${text}\t${code}`)) {
        stats.variantsDropped += 1;
        continue;
      }
      phraseKeys.add(`${text}\t${code}`);
      stats.variantsRewritten += 1;
    }
    if (!seenPhrases.has(text)) {
      seenPhrases.add(text);
      stats.phrases += 1;
      if ((counts.get(original) ?? 0) < 1) stats.unseen += 1;
    }
    stats.phraseReadings += 1;
    entries.push({text, code, weight: probability(original) * o.scale});
  }
  stats.entries = entries.length;
  stats.totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  return {entries, stats};
}

function formatWeight(weight) {
  return String(Number(weight.toPrecision(7)));
}

/** Build-time original expressions. Preserve every existing reading and weight. */
export function addReviewedPhrases(entries, text, {weight = 100} = {}) {
  if (!Number.isFinite(weight) || weight <= 0) throw new Error('审核词权重必须大于 0');
  const known = new Set(entries.map(e => `${e.text}\t${e.code}`));
  const words = new Set(entries.map(e => e.text));
  const chars = new Map();
  for (const entry of entries) if ([...entry.text].length === 1) {
    if (!chars.has(entry.text)) chars.set(entry.text, new Set());
    chars.get(entry.text).add(entry.code);
  }
  const seen = new Set(), additions = [];
  let skippedReadings = 0, addedWordForms = 0;
  for (const [i, line] of text.split(/\r?\n/u).entries()) {
    if (!line || line.startsWith('#')) continue;
    const fields = line.split('\t');
    const fail = reason => { throw new Error(`审核词第 ${i + 1} 行:${reason}`); };
    if (fields.length !== 2 || !/^[一-鿿]{2,10}$/u.test(fields[0])) fail('必须为词形<TAB>注音');
    const [word, reading] = fields;
    const syllables = reading.split(' ').map(normalizeSyllable);
    if (syllables.includes(null) || syllables.length !== [...word].length) fail('注音与字数不符');
    for (const [j, char] of [...word].entries()) if (!chars.get(char)?.has(syllables[j])) fail(`缺少既有字音旁证:${char} ${syllables[j]}`);
    const key = `${word}\t${syllables.join(' ')}`;
    if (seen.has(key)) fail('重复词音');
    seen.add(key);
    if (known.has(key)) { skippedReadings += 1; continue; }
    if (!words.has(word)) addedWordForms += 1;
    words.add(word); known.add(key);
    additions.push({text: word, code: syllables.join(' '), weight});
  }
  return {entries: [...entries, ...additions], stats: {addedWordForms, addedReadings: additions.length, skippedReadings}};
}

/** 渲染成 Rime 词典。`provenance` 的每一行原样写进文件头的注释里。 */
export function renderDict({entries, name, version, provenance = []}) {
  const head = [
    '# encoding: utf-8',
    '# Ninan 注音词典(繁體、带声调)—— 生成物,别手改;改 scripts/zhuyin/build-zhuyin-dict.mjs 之后重新生成。',
    '# 词条与词频取自小麦注音(McBopomofo),MIT License,Copyright (c) 2011-2026 Mengjuei Hsieh et al.;',
    '# 词表最初取自 libtabe 的 tsi.src(BSD License)。本文件是它的改编。',
    ...provenance.map((line) => `# ${line}`),
    '---',
    `name: ${name}`,
    `version: "${version}"`,
    'sort: by_weight',
    '...',
    '',
  ];
  const body = entries.map((e) => `${e.text}\t${e.code}\t${formatWeight(e.weight)}`);
  return head.join('\n') + body.join('\n') + '\n';
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseArgs(argv) {
  const args = {fscale: DEFAULTS.fscale, scale: DEFAULTS.scale, name: 'ninan_zhuyin'};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith('--') || value === undefined) throw new Error(`参数不对:${key}`);
    args[key.slice(2)] = value;
    i += 1;
  }
  if (!args.src || !args.out) throw new Error('用法:build-zhuyin-dict.mjs --src <源文件目录> --out <词典.dict.yaml> [--commit <提交号>] [--fscale 2.7] [--scale 1e8] [--name ninan_zhuyin] [--manifest <文件>]');
  args.fscale = Number(args.fscale);
  args.scale = Number(args.scale);
  return args;
}

export function main(argv) {
  const args = parseArgs(argv);
  const read = (file) => fs.readFileSync(path.join(args.src, file));
  const buffers = Object.fromEntries(SOURCE_FILES.map((file) => [file, read(file)]));
  const text = (file) => buffers[file].toString('utf8');
  const counts = applyExclusions(parseOccurrences(text('phrase.occ')), parseExclusions(text('exclusion.txt')));
  let {entries, stats} = buildEntries({
    base: parseBase(text('BPMFBase.txt')),
    mappings: parseMappings(text('BPMFMappings.txt')),
    counts,
    het1: parseHeterophony(text('heterophony1.list')),
    het2: parseHeterophony(text('heterophony2.list')),
    het3: parseHeterophony(text('heterophony3.list')),
    options: {fscale: args.fscale, scale: args.scale},
  });
  const commit = args.commit ?? 'unknown';
  const provenance = [
    `上游:https://github.com/openvanilla/McBopomofo 提交 ${commit} 的 Source/Data/`,
    ...SOURCE_FILES.map((file) => `  ${file}  sha256 ${sha256(buffers[file])}`),
    `参数:fscale=${args.fscale} scale=${args.scale};词条 ${stats.entries}(单字读音 ${stats.characterReadings},词的读音 ${stats.phraseReadings})`,
  ];
  let reviewed;
  let version = commit.slice(0, 12);
  if (args.phrases) {
    const phraseText = fs.readFileSync(args.phrases, 'utf8');
    const result = addReviewedPhrases(entries, phraseText, {weight: Number(args['phrase-weight'] ?? 100)});
    entries = result.entries;
    reviewed = {...result.stats, sha256: sha256(Buffer.from(phraseText)), weight: Number(args['phrase-weight'] ?? 100)};
    stats = {...stats, entries: entries.length, phrases: stats.phrases + reviewed.addedWordForms,
      phraseReadings: stats.phraseReadings + reviewed.addedReadings,
      unseen: stats.unseen + reviewed.addedWordForms, totalWeight: entries.reduce((sum, e) => sum + e.weight, 0)};
    provenance.push(`Ninan 原创日常表达:${path.basename(args.phrases)} sha256 ${reviewed.sha256};新增词音 ${reviewed.addedReadings};独立权重 ${reviewed.weight}，既有词音与权重不变`);
    version += `-${reviewed.sha256.slice(0, 8)}`;
  }
  const out = renderDict({entries, name: args.name, version, provenance});
  fs.mkdirSync(path.dirname(path.resolve(args.out)), {recursive: true});
  fs.writeFileSync(args.out, out);
  const manifest = {
    name: args.name,
    upstream: {repo: 'openvanilla/McBopomofo', commit, files: Object.fromEntries(SOURCE_FILES.map((f) => [f, {bytes: buffers[f].length, sha256: sha256(buffers[f])}]))},
    options: {fscale: args.fscale, scale: args.scale},
    ...(reviewed ? {reviewed} : {}),
    stats,
    output: {bytes: Buffer.byteLength(out), sha256: sha256(Buffer.from(out))},
  };
  if (args.manifest) fs.writeFileSync(args.manifest, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`词典 → ${args.out}`);
  console.log(`  单字 ${stats.characters} 个(读音 ${stats.characterReadings} 条,其中破音字的次要读音 ${stats.minorReadings} 条)`);
  console.log(`  词 ${stats.phrases} 个(读音 ${stats.phraseReadings} 条);语料里没出现过的字词 ${stats.unseen} 个`);
  console.log(`  「臺 → 台」:与已有的词重复而丢掉 ${stats.variantsDropped} 条,改写后收进来 ${stats.variantsRewritten} 条`);
  console.log(`  共 ${stats.entries} 条,${manifest.output.bytes} 字节,sha256 ${manifest.output.sha256}`);
  return manifest;
}

if (isRunDirectly(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

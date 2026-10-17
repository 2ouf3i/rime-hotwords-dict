#!/usr/bin/env node
// backend/scripts/build-next-word-table.mjs
/**
 * 端上上屏联想的静态联想表(spec docs/superpowers/specs/2026-09-18-next-word-local-prediction-design.md §5)。
 *
 * 规则:对每个 2~8 字纯汉字词条,在每个切分点拆成 前缀|后缀;前缀 ≤4 字、后缀 ≤4 字、
 * **两段都在词库里**;同一对取最大词频;每键按词频留前 8。
 *
 * ⚠️ **产物按 GPL-3.0 公开**(输入含 rime-ice,见 docs/dict-ota-gpl-compliance.md)。
 *    `--builtin-only` 是例外:词典切分只来自内置 Apache 词库;可显式叠加 Ninan 原创 Apache 聊天续写,产物可以随 app 包分发。
 * ⚠️ **本脚本会被复制到仓库外的 launchd 镜像目录运行**(scripts/sync-pinyin-dict-local.sh 的
 *    MIRROR_FILES)。所以:①不在运行时读仓库相对路径(契约 JSON 由测试对拍,见 LIMITS);
 *    ②只 import 同目录的 build-pinyin-dict.mjs(它也在镜像清单里)。
 * ⚠️ 排序信号只用 rime-ice 的 base(真实词频 1..9999)与内置词库;ext 恒 100、tencent 恒 0,
 *    那两份的 weight 是「来源可信度层级」不是词频,拿来排序只会得到噪声。
 * ⚠️ **敏感词之后保持沉默**(2026-09-18 fix round 1,R2):黑名单的后缀级词条不但永不作「后继」,
 *    也永不作「键」——以它结尾的键同样不出联想(例:「自杀」被封后,「我想自杀」这个键也不再弹出
 *    「方法」之类的候选)。只看键尾,键只是**包含**该词但不以它结尾不受影响(如「自杀者」)。
 *    对级黑名单条目(`键→后继`)不受这条规则影响,仍然只挡那一对。
 * ⚠️ **`--blocklist` 两种模式都必填**(同一轮,R1):随包分发的 `--builtin-only` 产物发布后没有
 *    OTA 通道能事后再补黑名单,裸词库直接产出的风险和线上表一样高,所以不接受「忘了传参」这种
 *    失败模式——缺这个 flag 直接报错退出,不产出任何文件。
 *
 * 用法:
 *   node scripts/build-next-word-table.mjs --in <rime-ice/cn_dicts> --builtin <pinyin_simp.dict.yaml> \
 *     --out <目录> --ref <rime-ice commit 40hex> --blocklist <txt> [--golden <txt>] [--everyday <txt>] [--builtin-only]
 */
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { parseDictLine, requireUpstreamRef } from './build-pinyin-dict.mjs';

export const FORMAT_HEADER = '#next-word v1';
/** 与 contract/next-word.json 对拍(见同名 .test.mjs 第一条)。 */
export const LIMITS = { maxKeyChars: 4, maxSuffixChars: 4, topK: 8 };
const MIN_WORD_CHARS = 2;
const MAX_WORD_CHARS = 8;
/** 参与排序的上游文件。⚠️ 只有 base:理由见文件头。 */
export const RANKED_SOURCE_FILES = ['base.dict.yaml'];

const HAN = /^[一-鿿]+$/;
/** 全部字符都在 CJK 基本区。客户端按同一口径取「尾部纯汉字后缀」,所以表里的键必须是这个集合的子集。 */
export function isHan(s) { return typeof s === 'string' && HAN.test(s); }

/** 若干份 rime 词典文本 → Map<词, 最大词频>。只收纯汉字词。 */
export function loadLexicon(texts) {
  const lex = new Map();
  for (const text of texts) {
    for (const line of text.split('\n')) {
      const e = parseDictLine(line);
      if (!e || !isHan(e.word)) continue;
      if ((lex.get(e.word) ?? -1) < e.weight) lex.set(e.word, e.weight);
    }
  }
  return lex;
}

/** 黑名单:一行一个后缀(后缀级),或 `键→后继`(对级)。`#` 开头与空行跳过。 */
export function parseBlocklist(text) {
  const suffixes = new Set();
  const pairs = new Set();
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('→');
    if (at > 0) pairs.add(`${line.slice(0, at).trim()}\t${line.slice(at + 1).trim()}`);
    else suffixes.add(line);
  }
  return { suffixes, pairs };
}

/**
 * 键是否以某个后缀级黑名单词结尾(R2:敏感词之后保持沉默——不但不作后继,也不作键;
 * 以它结尾的键同样不出,例如「自杀」被封后「想自杀」这个键也不再弹出联想)。
 * 键最长 `LIMITS.maxKeyChars`(=4)字,最多检查这么多个「贴键尾对齐」的子串,线性、不放大。
 * 只看键尾,键中间/开头包含黑名单词但不以它结尾不受影响(如「自杀者」不受「自杀」牵连)。
 */
function endsWithBannedSuffix(key, suffixes) {
  const cs = Array.from(key);
  for (let i = 0; i < cs.length; i++) {
    if (suffixes.has(cs.slice(i).join(''))) return true;
  }
  return false;
}

/**
 * 拆表。`keyLexicon` 给了的话,**短语、键、后继三者都必须在它里面**(`--builtin-only` 用它
 * 保证产物不含任何 rime-ice 独有词);没给就用 `lexicon` 自己。
 */
export function buildTable(lexicon, { blocklist, keyLexicon } = {}) {
  const allowed = keyLexicon ?? lexicon;
  const bl = blocklist ?? { suffixes: new Set(), pairs: new Set() };
  const scores = new Map();   // 键 → Map<后继, 词频>
  for (const [word, weight] of lexicon) {
    if (weight <= 0) continue;                       // 0 = 无背书,不产出联想
    if (keyLexicon && !keyLexicon.has(word)) continue;
    const cs = Array.from(word);
    if (cs.length < MIN_WORD_CHARS || cs.length > MAX_WORD_CHARS) continue;
    for (let i = 1; i < cs.length; i++) {
      if (i > LIMITS.maxKeyChars || cs.length - i > LIMITS.maxSuffixChars) continue;
      const key = cs.slice(0, i).join('');
      const suf = cs.slice(i).join('');
      if (!allowed.has(key) || !allowed.has(suf)) continue;
      if (endsWithBannedSuffix(key, bl.suffixes)) continue;   // R2:键本身踩了后缀级黑名单 → 整个键不出
      if (bl.suffixes.has(suf) || bl.pairs.has(`${key}\t${suf}`)) continue;
      let m = scores.get(key);
      if (!m) scores.set(key, (m = new Map()));
      if ((m.get(suf) ?? 0) < weight) m.set(suf, weight);
    }
  }
  const table = new Map();
  for (const [key, m] of scores) {
    const top = [...m.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))   // 词频降序,同分按码点升序 —— 产物可复现
      .slice(0, LIMITS.topK)
      .map(([s]) => s);
    if (top.length > 0) table.set(key, top);
  }
  return table;
}

/** 文本形态。键全在 BMP,JS 默认的 UTF-16 序 = 码点序 = UTF-8 字节序,客户端按字节二分。 */
export function renderTable(table) {
  const keys = [...table.keys()].sort();
  const lines = [FORMAT_HEADER];
  for (const k of keys) lines.push(`${k}\t${table.get(k).join(' ')}`);
  return lines.join('\n') + '\n';
}

/** Original conversational continuations, supplied explicitly for mirrored/offline builds. */
export function parseEveryday(text) {
  const rows = new Map();
  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    const key = parts[0];
    const suffixes = (parts[1] ?? '').split(' ');
    if (parts.length !== 2 || !isHan(key) || key.length < 2 || key.length > LIMITS.maxKeyChars ||
        suffixes.length < 1 || suffixes.length > LIMITS.topK ||
        suffixes.some(s => !isHan(s) || s.length > LIMITS.maxSuffixChars) ||
        new Set(suffixes).size !== suffixes.length || rows.has(key)) {
      throw new Error(`聊天续写第 ${index + 1} 行无效`);
    }
    rows.set(key, suffixes);
  }
  return rows;
}

export function applyEveryday(table, rows, blocklist) {
  const result = new Map(table);
  for (const [key, suffixes] of rows) {
    if (endsWithBannedSuffix(key, blocklist.suffixes)) { result.delete(key); continue; }
    const allowed = suffixes.filter(s => !blocklist.suffixes.has(s) && !blocklist.pairs.has(`${key}\t${s}`));
    // An explicitly curated key never falls back to the dictionary fragments it replaced.
    if (allowed.length) result.set(key, allowed); else result.delete(key);
  }
  return result;
}

export function manifestOf(text, ref, entries) {
  return {
    sha256: createHash('sha256').update(text).digest('hex'),
    bytes: Buffer.byteLength(text),
    entries,
    upstreamRef: ref,
  };
}

/** 金标:`键<TAB>必须出现的后继(空格分隔)<TAB>前N`。 */
export function parseGolden(text) {
  const out = [];
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.startsWith('#')) continue;
    const [key, must, within] = line.split('\t');
    const n = Number.parseInt(within ?? '', 10);
    if (!key || !must || !Number.isInteger(n) || n < 1) throw new Error(`金标行格式不对:${JSON.stringify(line)}`);
    out.push({ key, mustContain: must.split(' ').filter(Boolean), within: n });
  }
  return out;
}

/** 返回违例清单(空 = 过)。黑名单里的东西出现在产物里也算违例 —— 黑名单没生效比没有黑名单更糟。 */
export function checkGolden(table, golden, blocklist) {
  const bad = [];
  for (const g of golden) {
    const got = (table.get(g.key) ?? []).slice(0, g.within);
    for (const w of g.mustContain) if (!got.includes(w)) bad.push(`金标:「${g.key}」前 ${g.within} 个里没有「${w}」(实际:${got.join(' ') || '空'})`);
  }
  const bl = blocklist ?? { suffixes: new Set(), pairs: new Set() };
  for (const [key, sufs] of table) {
    for (const s of sufs) if (bl.suffixes.has(s) || bl.pairs.has(`${key}\t${s}`)) bad.push(`黑名单漏网:「${key}→${s}」`);
  }
  return bad;
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * 读一份必须存在的输入文件。缺失 / 不可读时点名是哪个 flag、哪个路径后退出 1 ——
 * 不留原始 ENOENT 堆栈,调用点都在任何 `writeFileSync` 之前,退出时不产出任何文件。
 */
function readRequired(flag, path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    console.error(`--${flag} 读取失败:${path}(${err.code === 'ENOENT' ? '文件不存在' : err.message})`);
    process.exit(1);
  }
}

function main() {
  const inDir = arg('in');
  const builtin = arg('builtin');
  const outDir = arg('out');
  const builtinOnly = process.argv.includes('--builtin-only');
  if (!builtin || !outDir || (!builtinOnly && !inDir)) {
    console.error('用法:--in <cn_dicts> --builtin <pinyin_simp.dict.yaml> --out <目录> --ref <40hex> --blocklist <txt> [--golden <txt>] [--everyday <txt>] [--builtin-only]');
    process.exit(1);
  }
  const blPath = arg('blocklist');
  // R1(2026-09-18 fix round 1):两种模式都必填 —— --builtin-only 产物随包分发、没有 OTA 通道能
  // 事后再补黑名单,「记得传参」不是机制,缺这个 flag 就直接拒绝产出,不留任何侥幸路径。
  if (!blPath) {
    console.error('--blocklist 必填(--builtin-only 模式也不例外):产物一旦发布(尤其随包分发的 --builtin-only 表)就没有 OTA 通道能事后再补黑名单,必须在构建时就生效。');
    process.exit(1);
  }
  // requireUpstreamRef 缺失 --ref 时 throw,不是 process.exit —— 与 build-pinyin-dict.mjs
  // 的 main() 同款纪律:打印原因 + 非零退出(与本脚本其余错误分支同一个退出码 1,
  // 对齐 build-pinyin-dict.mjs 的 main() 统一用 1 的惯例),不让异常直接冒出去变成裸 stack trace。
  let ref;
  try {
    ref = requireUpstreamRef(arg('ref'));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  // 内置词表只读一次:非 --builtin-only 时它只用来并进排序词库,不需要单独再 loadLexicon 一遍。
  const builtinText = readRequired('builtin', resolve(builtin));
  const texts = [builtinText];
  if (!builtinOnly) for (const f of RANKED_SOURCE_FILES) texts.push(readRequired('in', join(resolve(inDir), f)));
  const lexicon = loadLexicon(texts);
  const builtinLex = builtinOnly ? loadLexicon([builtinText]) : undefined;
  const blocklist = parseBlocklist(readRequired('blocklist', resolve(blPath)));
  let table = buildTable(lexicon, { blocklist, keyLexicon: builtinLex });
  const everydayPath = arg('everyday');
  if (everydayPath) {
    try {
      table = applyEveryday(table, parseEveryday(readRequired('everyday', resolve(everydayPath))), blocklist);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  // 金标那半段在 --builtin-only 下跳过(内置词库只有 8 千键,金标词多半不在里面,必红);
  // **黑名单漏网那半段两种模式都跑** —— 随包兜底表恰恰是没有 OTA 通道能事后补救的那一份
  // (`--blocklist` 因此改成必填),漏网反查却一度跟着金标一起被跳过。终审 minor M2(2026-09-19)。
  const goldenPath = arg('golden');
  const golden = goldenPath && !builtinOnly ? parseGolden(readRequired('golden', resolve(goldenPath))) : [];
  const bad = checkGolden(table, golden, blocklist);
  if (bad.length > 0) { for (const b of bad) console.error(b); console.error(`金标/黑名单校验不过(${bad.length} 条)—— 不产出`); process.exit(1); }

  const text = renderTable(table);
  mkdirSync(resolve(outDir), { recursive: true });
  writeFileSync(join(resolve(outDir), 'next_word.tsv'), text);
  const manifest = manifestOf(text, ref, table.size);
  writeFileSync(join(resolve(outDir), 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  let pairs = 0; for (const v of table.values()) pairs += v.length;
  console.log(`next_word.tsv:${table.size} 键 / ${pairs} 对 / ${(manifest.bytes / 1e6).toFixed(2)} MB / sha ${manifest.sha256.slice(0, 8)}${builtinOnly ? '(builtin-only)' : ''}`);
}

// 与 build-pinyin-dict.mjs 同款的「是不是被直接执行」判据(空格路径 / 软链两个坑,见那边的注释)。
let invokedPath = '';
try { invokedPath = realpathSync(resolve(process.argv[1] ?? '')); } catch { /* 不是文件路径 */ }
if (fileURLToPath(import.meta.url) === invokedPath) main();

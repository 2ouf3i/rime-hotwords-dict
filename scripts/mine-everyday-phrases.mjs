#!/usr/bin/env node
// backend/scripts/mine-everyday-phrases.mjs
/**
 * 从 Tatoeba 的中文例句里数「单独成句的短语」:给日常短语表(backend/dict/everyday-phrases.txt)出候选,
 * 也给手写的短语权重表(backend/dict/phrase-weights.txt)做对照。**只出候选和统计,不写任何进词库的表** ——
 * 候选要人过一遍才进表(怎么过、收了多少,记在 everyday-phrases.txt 的头部)。
 *
 * 为什么要有它(2026-10-07):简拼评测的留出集里有 17% 的日常短语词库里根本没有(我在上班、我晚点到、下周再说 …),
 * 没有整词时纯首字母几乎从不出想要的那句,改权重救不了,要补词。补哪些得有个出处:不能凭一个人想,也不能拿别家产品的词库。
 *
 * ── 用到的公开数据(**不进仓库**,自己下载后用参数指过来;脚本会核对 sha256,对不上只提醒、不拦)──
 *   --sentences  cmn_sentences.tsv.bz2   Tatoeba 的中文(cmn)例句导出,https://tatoeba.org/zh-cn/downloads
 *                (https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences.tsv.bz2)
 *                许可:CC BY 2.0 FR(署名)。约 8.9 万行「编号<Tab>cmn<Tab>句子」,简繁都有。
 *                sha256 f907d1928eeaaaee75bac1987fb3349bd79c96caa8f1467b58cca042aa99a6aa
 *                也可以给解压好的 .tsv。.bz2 用系统的 bzcat 解。
 *   我们用的是:从句子里数出来的「哪些短语单独成句、各出现在多少个句子里」,以及短语本身(日常用语);不收任何完整的例句。
 *
 * 用法:
 *   node backend/scripts/mine-everyday-phrases.mjs --sentences <cmn_sentences.tsv.bz2> \
 *     --upstream <rime-ice/cn_dicts 目录> --builtin backend/vendor/pinyin_simp.dict.yaml --out <candidates.tsv> \
 *     [--min-count 2] [--weights backend/dict/phrase-weights.txt]
 *   --weights:再印一段对照 —— 那张手写的表里有多少条在例句里单独成句过、出现最多而表里没有的是哪些。
 *
 * ── 怎么数 ──
 * 1. 繁体句子先转成简体(opencc-js,后端依赖;按字转)。两种写法的同一句话算两个句子(编号不同),不合并。
 * 2. 每个句子按标点切成小句(,。!?、;:…—「」《》()引号、空白 都算断开)。
 * 3. 一个小句整个是 2 ~ 5 个汉字(不夹字母、数字)的,记一次;同一个句子里出现几次也只记一次。
 *    这就是「像一句完整的话」的判据:它在别人写的句子里**前后都是句读**(或句首句尾),不是从长句中间截出来的半截 ——
 *    2026-10-07 中午拿语言模型给短语打分时栽在半截话上(「你只能」压过「你在哪」),这里从源头上不产生半截话。
 *    另外记两个数供人判断:它作为整句(整个句子就是它)出现的句子数、它出现在任何位置(含长句中间)的句子数。
 * 4. 去掉带译名的(例句里到处是「汤姆」「玛丽」,见 [NAME_PARTS])。
 * 5. 查词库:上游 base / ext / 腾讯三层与随包词库里有没有这个整词、权重多少。
 *
 * 输出 candidates.tsv(按单独成句的句子数从多到少):
 *   短语 / 单独成句的句子数 / 作为整句的句子数 / 出现在任何位置的句子数 / 来源层(base|ext|tencent|builtin|absent)/ 上游权重
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';

export const SENTENCES_SHA256 = 'f907d1928eeaaaee75bac1987fb3349bd79c96caa8f1467b58cca042aa99a6aa';
/** 短语的字数范围。 */
export const MIN_LENGTH = 2;
export const MAX_LENGTH = 5;

/** 例句里的译名(Tatoeba 的例句大量用 Tom / Mary 这几个名字)。小句里带这些字样的不要。 */
export const NAME_PARTS = ['汤姆', '湯姆', '玛丽', '玛莉', '瑪麗', '瑪莉', '约翰', '約翰', '杰克', '傑克', '爱丽丝', '愛麗絲', '比尔', '比爾', '肯', '南希', '露西', '鲍勃', '麦克', '彼得', '保罗', '汉斯', '吉姆', '贝蒂', '简', '梅格', '艾米', '凯特', '苏珊', '海伦', '琳达', '迈克', '史密斯', '布朗', '田中', '山田', '太郎', '花子'];

const HAN_ONLY = /^\p{Script=Han}+$/u;
// 小句的分隔:所有不是汉字、字母、数字的字符(标点、空白、引号、括号 …)。
const SEPARATOR = /[^\p{Script=Han}\p{L}\p{N}]+/u;

/** 把一个句子切成小句(已经去掉了分隔符;夹着字母数字的小句原样留着,由调用方判断要不要)。 */
export function splitClauses(sentence) {
  return sentence.split(SEPARATOR).filter(Boolean);
}

/** 这个小句算不算一条短语候选:纯汉字、字数在范围内、不带译名。 */
export function isPhrase(clause) {
  if (!HAN_ONLY.test(clause)) return false;
  const n = [...clause].length;
  if (n < MIN_LENGTH || n > MAX_LENGTH) return false;
  return !NAME_PARTS.some((name) => clause.includes(name));
}

/**
 * 数。sentences = 已经转成简体的句子数组(一项一个句子)。返回 Map 短语 → {clause, whole}:
 *   clause 单独成句(是某个句子里的一个完整小句)的句子数;whole 整个句子就是它的句子数。
 * 同一个句子里出现几次只记一次;逐字相同的句子只算一个(导出里有重复收录的)。
 */
export function countPhrases(sentences) {
  const out = new Map();
  for (const sentence of new Set(sentences)) {
    const clauses = splitClauses(sentence);
    for (const clause of new Set(clauses)) {
      if (!isPhrase(clause)) continue;
      let row = out.get(clause);
      if (!row) { row = { clause: 0, whole: 0 }; out.set(clause, row); }
      row.clause += 1;
      if (clauses.length === 1) row.whole += 1;
    }
  }
  return out;
}

/** 这些短语各出现在多少个句子里(任何位置)。只给候选数,不然 2 ~ 5 字的全部子串太多。 */
export function countAnywhere(sentences, phrases) {
  const wanted = new Set(phrases);
  const out = new Map([...wanted].map((p) => [p, 0]));
  for (const sentence of new Set(sentences)) {
    const seen = new Set();
    for (const run of sentence.split(/[^\p{Script=Han}]+/u)) {
      const chars = [...run];
      for (let i = 0; i < chars.length; i++) {
        for (let n = MIN_LENGTH; n <= MAX_LENGTH && i + n <= chars.length; n++) {
          const piece = chars.slice(i, i + n).join('');
          if (wanted.has(piece) && !seen.has(piece)) { seen.add(piece); out.set(piece, out.get(piece) + 1); }
        }
      }
    }
  }
  return out;
}

/** 读 Tatoeba 导出的一行:`编号<Tab>cmn<Tab>句子`。不是这个形状的返回 null。 */
export function parseSentenceLine(line) {
  const parts = line.replace(/\r$/, '').split('\t');
  if (parts.length < 3 || !/^\d+$/.test(parts[0]) || !parts[2]) return null;
  return parts.slice(2).join('\t');
}

/** rime 词典第一列 → 第三列(权重;两列的无注音表是第二列)。 */
function dictWeights(text, columns = 3) {
  const out = new Map();
  let body = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line === '...') { body = true; continue; }
    if (!body || !line || line.startsWith('#')) continue;
    const a = line.split('\t');
    if (out.has(a[0])) continue;
    const w = columns === 2 ? a[1] : a[2];
    out.set(a[0], /^\d+$/.test((w ?? '').trim()) ? Number(w) : 0);
  }
  return out;
}

/** 来源层与上游权重。顺序即优先级(与构建脚本一致):base 先于 ext,再是腾讯表、随包词库。 */
export function tierOf(word, tiers) {
  for (const name of ['base', 'ext', 'tencent', 'builtin']) {
    if (tiers[name].has(word)) return { tier: name, weight: tiers[name].get(word) };
  }
  return { tier: 'absent', weight: 0 };
}

const USAGE = '用法: node backend/scripts/mine-everyday-phrases.mjs --sentences <cmn_sentences.tsv[.bz2]> --upstream <rime-ice/cn_dicts> '
  + '--builtin <pinyin_simp.dict.yaml> --out <candidates.tsv> [--min-count 2] [--weights <phrase-weights.txt>]';

function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
  const missing = ['sentences', 'upstream', 'builtin', 'out'].filter((k) => !arg(k));
  if (missing.length) {
    console.error(`缺参数:${missing.map((k) => `--${k}`).join(' ')}\n${USAGE}`);
    process.exit(2);
  }
  const minCount = Number(arg('min-count') ?? 2);
  if (!Number.isInteger(minCount) || minCount < 1) { console.error('--min-count 要正整数'); process.exit(2); }
  let OpenCC;
  try { OpenCC = createRequire(import.meta.url)('opencc-js'); } catch { console.error('找不到 opencc-js(繁体句子要先转成简体)。先装后端依赖:cd backend && npm ci'); process.exit(1); }
  const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });

  const path = arg('sentences');
  const raw = readFileSync(path);
  const sum = createHash('sha256').update(raw).digest('hex');
  if (path.endsWith('.bz2') && sum !== SENTENCES_SHA256) console.warn(`⚠️ --sentences 的 sha256 是 ${sum.slice(0, 16)}…,与脚本里记的 ${SENTENCES_SHA256.slice(0, 16)}… 不一样 —— 导出更新过?候选要重新过一遍。`);
  const text = path.endsWith('.bz2') ? execFileSync('bzcat', [path], { encoding: 'utf8', maxBuffer: 1 << 30 }) : raw.toString('utf8');
  const sentences = [];
  for (const line of text.split('\n')) {
    const sentence = parseSentenceLine(line);
    if (sentence) sentences.push(toSimplified(sentence));
  }
  if (sentences.length === 0) { console.error('一个句子都没读出来 —— 文件不是「编号<Tab>cmn<Tab>句子」的格式?'); process.exit(1); }

  const read = (p) => readFileSync(p, 'utf8');
  const up = arg('upstream');
  const tiers = {
    base: dictWeights(read(join(up, 'base.dict.yaml'))),
    ext: dictWeights(read(join(up, 'ext.dict.yaml'))),
    tencent: dictWeights(read(join(up, 'tencent.dict.yaml')), 2),
    builtin: dictWeights(read(arg('builtin'))),
  };
  const counts = countPhrases(sentences);
  const kept = [...counts].filter(([, c]) => c.clause >= minCount);
  const anywhere = countAnywhere(sentences, kept.map(([p]) => p));
  kept.sort((a, b) => b[1].clause - a[1].clause || (a[0] < b[0] ? -1 : 1));
  const lines = kept.map(([phrase, c]) => {
    const t = tierOf(phrase, tiers);
    return [phrase, c.clause, c.whole, anywhere.get(phrase), t.tier, t.weight].join('\t');
  });
  writeFileSync(arg('out'), `${lines.join('\n')}\n`, 'utf8');
  const byTier = {};
  for (const [phrase] of kept) { const t = tierOf(phrase, tiers).tier; byTier[t] = (byTier[t] ?? 0) + 1; }
  console.log(`${sentences.length} 个句子(去重后 ${new Set(sentences).size})→ 单独成句的 2 ~ 5 字短语 ${counts.size} 条,出现在 ${minCount} 个以上句子里的 ${kept.length} 条`);
  console.log(`  按来源层:${Object.entries(byTier).map(([k, v]) => `${k} ${v}`).join(',')}`);
  console.log(`已写 ${arg('out')}`);

  if (arg('weights')) {
    const table = new Set();
    for (const line of read(arg('weights')).split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) table.add(t.split('\t')[0]);
    }
    const hit = [...table].filter((w) => counts.has(w));
    console.log(`对照 ${arg('weights')}:表里 ${table.size} 条,其中 ${hit.length} 条在例句里单独成句过(${[...table].filter((w) => (counts.get(w)?.clause ?? 0) >= minCount).length} 条在 ${minCount} 个以上句子里)`);
  }
}

// 主程序判断:先把两边都化成真实路径再比(理由见 build-pinyin-dict.mjs 末尾)。
let invokedPath = '';
try { invokedPath = realpathSync(resolve(process.argv[1] ?? '')); } catch { /* 不是文件路径 */ }
if (fileURLToPath(import.meta.url) === invokedPath) main();

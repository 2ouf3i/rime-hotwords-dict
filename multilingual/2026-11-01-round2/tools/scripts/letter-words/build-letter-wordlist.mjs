#!/usr/bin/env node
// 把 hermitdave/FrequencyWords 的韩语 / 越南语词频表转成「日 / 韩 / 越键盘联想」第一期用的 `word<TAB>freq` 文本。
//
// 用法:
//   node scripts/letter-words/build-letter-wordlist.mjs <词频表> --lang ko|vi [--out <路径>] [--limit 30000] [--stats]
//                                                       [--no-syllable-check] [--no-blocklist]
//
// 默认剔掉同目录屏蔽表 `blocklist-<lang>.txt` 里的粗口(自拟,见 `parseBlocklist`);表情关键词那个脚本也读这两份。
//
//   node scripts/letter-words/build-letter-wordlist.mjs <下载目录>/ko_50k.txt --lang ko \
//     --out apps/apple/NinanKeyboard/LetterWords/korean.dict.txt
//   node scripts/letter-words/build-letter-wordlist.mjs <下载目录>/vi_50k.txt --lang vi \
//     --out apps/apple/NinanKeyboard/LetterWords/vietnamese.dict.txt
//   (安卓 `apps/android/app/src/main/assets/letterwords/` 放逐字节相同的一份,生成后拷过去)
//
// 源表:hermitdave/FrequencyWords `content/2018/<lang>/<lang>_50k.txt`(OpenSubtitles 2018 字幕语料统计),
//   每行 `{词} {出现次数}`。钉住的提交见下面的 SOURCE;升级上游时改那里(文件头注释里写的就是它)。
//   取法(下载的东西放进一个新建的空目录,别在那个目录里运行任何东西):
//     curl -fsSL -o <空目录>/ko_50k.txt \
//       https://raw.githubusercontent.com/hermitdave/FrequencyWords/<提交>/content/2018/ko/ko_50k.txt
//
// ⚠️ 合规:词频数据是 **CC BY-SA 4.0**(代码是 MIT,数据不是)。要署名、改编作品要按同一授权提供 ——
//   产物自己就是改编作品,文件头写了来源、授权与改动;归属说明在
//   `apps/apple/NinanKeyboard/LetterWords/NOTICE-LetterWords.md`(安卓那份逐字节相同)。
//
// 形状照 `scripts/build-english-wordlist.mjs`:纯 node、零依赖、自带 `.test.mjs`。

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isRunDirectly } from '../lib/run-directly.mjs';

export const USAGE = '用法:node scripts/letter-words/build-letter-wordlist.mjs <词频表> --lang ko|vi [--out 路径] [--limit 30000] [--stats] [--no-syllable-check] [--no-blocklist]';

/** 上游。升级时改这里 —— 产物的文件头照抄这几项。 */
export const SOURCE = {
  repo: 'hermitdave/FrequencyWords',
  url: 'https://github.com/hermitdave/FrequencyWords',
  commit: '525f9b560de45753a5ea01069454e72e9aa541c6',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  copyright: 'Copyright (c) 2016 Hermit Dave',
};

/** 最多留几条(按频次从高到低)。 */
export const DEFAULT_LIMIT = 30000;

// ── 韩语 ─────────────────────────────────────────────────────────

/** 只认现代谚文音节块(U+AC00–U+D7A3);兼容字母(ㅋㅋ)、古谚文、汉字、拉丁字母一律不收。 */
const HANGUL_SYLLABLES = /^[가-힣]+$/;
export const KO_MAX_SYLLABLES = 8;

export function isKoreanWord(word) {
  const n = Array.from(word).length;
  return n >= 1 && n <= KO_MAX_SYLLABLES && HANGUL_SYLLABLES.test(word);
}

// ── 越南语 ───────────────────────────────────────────────────────

/**
 * 越南语的元音字母(12 个基本形 × 6 个声调,全是 NFC 预组合字)。
 * 「必须含元音」看的就是这一串。
 */
export const VI_VOWELS = 'aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ';

/**
 * 越南语的辅音字母:a–z 去掉元音 a e i o u y,再去掉 **f j w z**(越南语本身不用这四个,出现即是外来词 / 噪音),加 đ。
 */
export const VI_CONSONANTS = 'bcdghklmnpqrstvxđ';
export const VI_MAX_LETTERS = 7;

const VI_LETTER = new Set(Array.from(VI_VOWELS + VI_CONSONANTS));
const VI_VOWEL = new Set(Array.from(VI_VOWELS));

/** 调用前先过 `normalize(…, 'vi')`(NFC + 小写);这里只看字母表、元音与长度。 */
export function isVietnameseWord(word) {
  const letters = Array.from(word);
  if (letters.length < 1 || letters.length > VI_MAX_LETTERS) return false;
  if (!letters.every((ch) => VI_LETTER.has(ch))) return false;
  return letters.some((ch) => VI_VOWEL.has(ch));
}

/**
 * 声调:`VI_VOWELS` 每 6 个一组,依次是 平声(不标)、玄声 ` 、锐声 ´ 、问声 ̉ 、跌声 ˜ 、重声 ̣ 。
 * 这里把每个带声调的元音拆成「不带声调的字母 + 第几声」。
 */
export const VI_TONES = ['ngang', 'huyền', 'sắc', 'hỏi', 'ngã', 'nặng'];
const VI_BASE = new Map();
const VI_TONE = new Map();
Array.from(VI_VOWELS).forEach((ch, i) => {
  VI_BASE.set(ch, Array.from(VI_VOWELS)[i - (i % 6)]);
  VI_TONE.set(ch, VI_TONES[i % 6]);
});

/** 拆掉声调:返回 `{ bare: 不带声调的写法, tones: 出现过的声调(平声不算) }`。 */
export function stripVietnameseTone(word) {
  let bare = '';
  const tones = [];
  for (const ch of Array.from(word)) {
    const tone = VI_TONE.get(ch);
    if (tone && tone !== 'ngang') tones.push(tone);
    bare += VI_BASE.get(ch) ?? ch;
  }
  return { bare, tones };
}

/** 声母(长的在前,按最长匹配取;没有声母 = 零声母)。 */
export const VI_INITIALS = [
  'ngh', 'ng', 'nh', 'ch', 'gh', 'gi', 'kh', 'ph', 'qu', 'th', 'tr',
  'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x',
];

/**
 * 越南语的韵母(不带声调的写法,按正字法写全;介音 o / u + 主元音 + 韵尾)。2026-10-26 照越南语正字法自拟。
 * 零声母时 iê 写成 yê(yên、yêu),所以两种都列;qu 后面的介音并进 qu(qua = qu + a),gi 后面的 i 可以省(gì、giết),
 * 这两种在 `isVietnameseSyllable` 里处理。
 */
export const VI_RHYMES = new Set([
  // 没有韵尾辅音的(含 i / y / o / u 收尾)
  'a', 'e', 'ê', 'i', 'y', 'o', 'ô', 'ơ', 'u', 'ư',
  'ai', 'ao', 'au', 'ay', 'âu', 'ây', 'eo', 'êu', 'ia', 'iu', 'oi', 'ôi', 'ơi', 'ua', 'ui', 'ưa', 'ưi', 'ưu',
  'iêu', 'yêu', 'uôi', 'ươi', 'ươu',
  'oa', 'oe', 'oai', 'oay', 'oao', 'oeo', 'uê', 'uơ', 'uy', 'uya', 'uyu', 'uây',
  // 带韵尾辅音的
  'ac', 'ach', 'am', 'an', 'ang', 'anh', 'ap', 'at',
  'ăc', 'ăm', 'ăn', 'ăng', 'ăp', 'ăt',
  'âc', 'âm', 'ân', 'âng', 'âp', 'ât',
  'ec', 'em', 'en', 'eng', 'ep', 'et',
  'êch', 'êm', 'ên', 'ênh', 'êp', 'êt',
  'ich', 'im', 'in', 'inh', 'ip', 'it',
  'oc', 'om', 'on', 'ong', 'op', 'ot', 'ooc', 'oong',
  'ôc', 'ôm', 'ôn', 'ông', 'ôp', 'ôt',
  'ơm', 'ơn', 'ơp', 'ơt',
  'uc', 'um', 'un', 'ung', 'up', 'ut',
  'ưc', 'ưm', 'ưng', 'ưt',
  'iêc', 'iêm', 'iên', 'iêng', 'iêp', 'iêt',
  'yêm', 'yên', 'yêng', 'yêt',
  'uôc', 'uôm', 'uôn', 'uông', 'uôt',
  'ươc', 'ươm', 'ươn', 'ương', 'ươp', 'ươt',
  'oac', 'oach', 'oam', 'oan', 'oang', 'oanh', 'oap', 'oat',
  'oăc', 'oăm', 'oăn', 'oăng', 'oăt',
  'oen', 'oet',
  'uân', 'uâng', 'uât',
  'uêch', 'uênh',
  'uych', 'uynh', 'uyp', 'uyt',
  'uyên', 'uyêt',
]);

/** 以 c / ch / p / t 收尾的韵母只能配锐声或重声(các、cạc;没有 cà、cả、cã,也没有不标调的 cac)。 */
const VI_STOP_FINAL = /(?:c|ch|p|t)$/;
/** k / gh / ngh 只在 i e ê y 前面;c / g / ng 不在 i e ê y 前面(gi 另算)。 */
const VI_FRONT = new Set(['i', 'e', 'ê', 'y']);

/**
 * 是不是一个越南语音节:声母(或零声母)+ `VI_RHYMES` 里的一个韵母,声调至多一个,塞音韵尾只配锐声 / 重声,
 * 并守 c / k、g / gh、ng / ngh 的拼写分工。
 *
 * 为什么要这一道(2026-10-26 实测,上游 vi_50k.txt @ 525f9b5):只按字母表过滤收下 27,832 条,
 * 其中约 19,000 条是字幕里的英文与人名(oh / okay / york / peter / camera …)。越南语书面语按音节分写,
 * 合法音节是一张有限的表,按韵母表卡能把 you / hey / dean / suit / ich 这类也剔掉,
 * 而 the(纱)/ ba / cho / con / an / in 这类越南语里真有的音节留着。
 * 代价:ok / ko(không 的缩写)这类聊天里常见的非正字法写法也会被剔掉。
 * 要回到只按字母表过滤的结果,命令行加 `--no-syllable-check`。
 */
export function isVietnameseSyllable(word) {
  const { bare, tones } = stripVietnameseTone(word);
  if (tones.length > 1) return false;
  const initial = VI_INITIALS.find((i) => bare.startsWith(i)) ?? '';
  const rhyme = bare.slice(initial.length);
  let effective = rhyme; // 拿去查韵母表、判韵尾的那一段
  if (initial === 'gi') {
    // gì = gi + i、gìn = gi + in:gi 后面的 i 省写,声调就标在这个 i 上;
    // 后面另有韵母时(già、giết)声调不能标在 gi 的 i 上(gíao 是错字,正字是 giáo)
    if (VI_RHYMES.has(rhyme)) {
      if (Array.from(word)[1] !== 'i') return false;
    } else {
      effective = `i${rhyme}`;
    }
  } else if (initial === 'qu') {
    // qua = qu + (o)a、quýt = qu + (u)yt:介音并进了 qu,剩下的不能再以 o / u 开头;
    // 声调也不能标在 qu 的 u 上(qúa、qủy 是错字,正字是 quá、quỷ)
    if (rhyme === '' || rhyme.startsWith('o') || rhyme.startsWith('u')) return false;
    if (Array.from(word)[1] !== 'u') return false;
    if (!VI_RHYMES.has(rhyme) && rhyme.startsWith('y')) effective = `u${rhyme}`;
  } else if (rhyme === '') {
    return false;
  }
  if (!VI_RHYMES.has(effective)) return false;
  const first = Array.from(rhyme)[0];
  if (['k', 'gh', 'ngh'].includes(initial) && !VI_FRONT.has(first)) return false;
  if (['c', 'g', 'ng'].includes(initial) && VI_FRONT.has(first)) return false;
  if (VI_STOP_FINAL.test(effective)) {
    const tone = tones[0];
    if (tone !== 'sắc' && tone !== 'nặng') return false;
  }
  return true;
}

// ── 粗口屏蔽 ─────────────────────────────────────────────────────

/** 屏蔽表的默认位置:本脚本旁边的 `blocklist-<lang>.txt`(Ninan 自拟,不取第三方的表)。 */
export function blocklistPath(lang) {
  return fileURLToPath(new URL(`./blocklist-${lang}.txt`, import.meta.url));
}

/**
 * 读屏蔽表:一行一个,`#` 开头的行是注释。行尾带 `*` 的按**前缀**屏蔽,其余只剔完全相同的词。
 * 条目先过 `normalize`(与词表同一套统一写法)再比。
 *
 * ⚠️ 前缀只给确凿的粗口词根:韩语 `씹` 不能当前缀(씹다「嚼」)、`시발` 不能(시발점「起点」)、`미친` 不能(영향을 미친다)。
 * 越南语一律只按整词 —— 按前缀会误伤 `lồng`(笼子)这类正常词,所以越南语的表里出现 `*` 直接报错。
 */
export function parseBlocklist(text, lang) {
  const exact = new Set();
  const prefixes = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const isPrefix = line.endsWith('*');
    const word = normalize(isPrefix ? line.slice(0, -1) : line, lang);
    if (!word || /[\s*]/.test(word)) throw new Error(`屏蔽表这一行不合法:${JSON.stringify(raw)}`);
    if (isPrefix && lang === 'vi') throw new Error(`越南语只按整词屏蔽,不许带 *:${JSON.stringify(raw)}`);
    if (isPrefix) prefixes.push(word); else exact.add(word);
  }
  return { exact, prefixes };
}

/** 这个词(已是统一写法)在不在屏蔽表里:完全相同,或以某个前缀条目开头。 */
export function isBlocked(word, blocklist) {
  if (!blocklist) return false;
  return blocklist.exact.has(word) || blocklist.prefixes.some((p) => word.startsWith(p));
}

/** 读某种语言的默认屏蔽表;文件不在返回 null。 */
export function loadBlocklist(lang) {
  const file = blocklistPath(lang);
  return fs.existsSync(file) ? parseBlocklist(fs.readFileSync(file, 'utf8'), lang) : null;
}

// ── 公共 ─────────────────────────────────────────────────────────

export const LANGS = {
  ko: {
    title: 'Ninan 韩语联想词表',
    sourceFile: 'content/2018/ko/ko_50k.txt',
    accept: isKoreanWord,
    rule: `只留整串是谚文音节(U+AC00–U+D7A3)的词,1–${KO_MAX_SYLLABLES} 个字`,
  },
  vi: {
    title: 'Ninan 越南语联想词表',
    sourceFile: 'content/2018/vi/vi_50k.txt',
    accept: (word, { syllableCheck = true } = {}) =>
      isVietnameseWord(word) && (!syllableCheck || isVietnameseSyllable(word)),
    rule: `NFC + 小写;只留由越南语字母组成、含元音、不含 f j w z 的词,1–${VI_MAX_LETTERS} 个字母`,
    syllableRule: '且是越南语音节(声母 + 越南语韵母表里的韵母,声调至多一个,c / ch / p / t 收尾只配锐声或重声)',
  },
};

/**
 * 统一写法。两种语言都先 NFC(韩语:把拆开的初中终声字母合回音节块;越南语:声调与元音合成一个字),
 * 越南语再小写(小写之后再 NFC 一次,防大小写映射把预组合字拆开)。
 */
export function normalize(word, lang) {
  const nfc = word.normalize('NFC');
  return lang === 'vi' ? nfc.toLowerCase().normalize('NFC') : nfc;
}

/**
 * 解析上游词频表(`{词} {次数}`,一行一条)。
 * 返回 `{ rows, malformed }`:`rows` 是 `[原词, 次数]`;对不上形状的行计数后跳过,由调用方决定要不要报错。
 */
export function parseFrequencyList(text) {
  const rows = [];
  let malformed = 0;
  for (const raw of text.replace(/^\uFEFF/, '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    const m = /^(\S+)\s+(\d+)\s*$/.exec(line);
    if (!m) { malformed += 1; continue; }
    const freq = Number.parseInt(m[2], 10);
    if (!Number.isFinite(freq) || freq < 1) { malformed += 1; continue; }
    rows.push([m[1], freq]);
  }
  return { rows, malformed };
}

/** 码点序比较(与 UTF-8 字节序一致;同频词的先后靠它定死,两次生成逐字节相同)。 */
export function compareCodePoints(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i += 1) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/**
 * 过滤 + 去重 + 排序 + 截断。
 *
 * 去重:统一写法(`normalize`)之后相同的词并成一条,**次数相加** —— 它们是语料里同一个词的不同写法,
 * 出现次数本来就该合在一起算(越南语大小写两种写法、韩语拆开 / 合成两种写法)。
 * 排序:次数降序;同次数按码点序。最多留 `limit` 条。
 * `syllableCheck`(只对越南语起作用,默认开):再过一道音节结构,见 `isVietnameseSyllable`。
 * `blocklist`(`parseBlocklist` 的结果,默认不用):屏蔽表里的词剔掉。
 */
export function buildWordlist(rows, lang, { limit = DEFAULT_LIMIT, syllableCheck = true, blocklist = null } = {}) {
  const spec = LANGS[lang];
  if (!spec) throw new Error(`不认识的语言:${lang}(只认 ko / vi)`);
  const merged = new Map();
  const stats = { total: rows.length, rejected: 0, blocked: 0, merged: 0, kept: 0, truncated: 0 };
  for (const [raw, freq] of rows) {
    const word = normalize(raw, lang);
    if (!spec.accept(word, { syllableCheck })) { stats.rejected += 1; continue; }
    if (isBlocked(word, blocklist)) { stats.blocked += 1; continue; }
    if (merged.has(word)) { merged.set(word, merged.get(word) + freq); stats.merged += 1; continue; }
    merged.set(word, freq);
  }
  const sorted = [...merged.entries()].sort((a, b) => (b[1] - a[1]) || compareCodePoints(a[0], b[0]));
  const kept = sorted.slice(0, limit);
  stats.kept = kept.length;
  stats.truncated = sorted.length - kept.length;
  return { rows: kept, stats };
}

/** 输出:`#` 头注释(来源、授权、改动、生成脚本、词条数)+ `word<TAB>freq`,按频次降序。 */
export function render(rows, lang, { limit = DEFAULT_LIMIT, syllableCheck = true, blocklist = null } = {}) {
  const spec = LANGS[lang];
  const rule = spec.syllableRule && syllableCheck ? `${spec.rule},${spec.syllableRule}` : spec.rule;
  const header = [
    `# ${spec.title}`,
    `# 源:${SOURCE.repo} ${spec.sourceFile}(提交 ${SOURCE.commit}),OpenSubtitles 2018 字幕语料的词频`,
    `# ${SOURCE.url}`,
    `# 授权:${SOURCE.license}(${SOURCE.licenseUrl})—— ${SOURCE.copyright}`,
    `# 本文件是上述数据的改编作品,同样按 ${SOURCE.license} 提供;归属说明见同目录 NOTICE-LetterWords.md`,
    `# 改动:${rule};统一写法后相同的词合并(次数相加);按次数降序,最多 ${limit} 条`,
    ...(blocklist
      ? [`# 剔除粗口:scripts/letter-words/blocklist-${lang}.txt(Ninan 自拟${blocklist.prefixes.length ? ';带 * 的按前缀' : ';只按整词'})`]
      : []),
    '# 由 scripts/letter-words/build-letter-wordlist.mjs 生成,别手改 —— 改判据改脚本。',
    `# 词条数:${rows.length}`,
    '',
  ].join('\n');
  return header + rows.map(([w, f]) => `${w}\t${f}`).join('\n') + '\n';
}

/** 命令行参数。认不出的参数直接报错(在读写任何文件之前)。 */
export function parseArgs(args) {
  const opts = { input: null, lang: null, out: null, limit: DEFAULT_LIMIT, stats: false, syllableCheck: true, blocklist: true };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--lang') opts.lang = args[++i] ?? null;
    else if (a === '--out') opts.out = args[++i] ?? null;
    else if (a === '--limit') opts.limit = Number.parseInt(args[++i] ?? '', 10);
    else if (a === '--stats') opts.stats = true;
    else if (a === '--no-syllable-check') opts.syllableCheck = false;
    else if (a === '--no-blocklist') opts.blocklist = false;
    else if (a.startsWith('--')) throw new Error(`不认识的参数:${a}`);
    else if (opts.input === null) opts.input = a;
    else throw new Error(`多余的参数:${a}`);
  }
  if (!opts.input || !opts.lang) throw new Error(USAGE);
  if (!LANGS[opts.lang]) throw new Error(`--lang 只认 ko / vi,收到 ${opts.lang}`);
  if (!Number.isInteger(opts.limit) || opts.limit < 1) throw new Error('--limit 要一个正整数');
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const { rows, malformed } = parseFrequencyList(fs.readFileSync(opts.input, 'utf8'));
  if (rows.length === 0) {
    console.error(`${opts.input} 里一条 {词} {次数} 都没解析出来 —— 上游换格式了?`);
    return 1;
  }
  const blocklist = opts.blocklist ? loadBlocklist(opts.lang) : null;
  const { rows: kept, stats } = buildWordlist(rows, opts.lang, { limit: opts.limit, syllableCheck: opts.syllableCheck, blocklist });
  if (opts.stats) {
    console.error(`总行 ${stats.total}(另有对不上形状的 ${malformed} 行)/ 按词形剔除 ${stats.rejected} / 粗口 ${stats.blocked}`
      + ` / 合并同形 ${stats.merged} / 收下 ${stats.kept} / 超出上限截掉 ${stats.truncated}`);
  }
  const text = render(kept, opts.lang, { limit: opts.limit, syllableCheck: opts.syllableCheck, blocklist });
  if (opts.out) {
    fs.writeFileSync(opts.out, text, 'utf8');
    console.error(`已写出 ${opts.out}(${kept.length} 条,${Buffer.byteLength(text)} 字节)`);
  } else {
    process.stdout.write(text);
  }
  return 0;
}

if (isRunDirectly(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

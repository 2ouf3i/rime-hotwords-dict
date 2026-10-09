#!/usr/bin/env node
// backend/scripts/build-pinyin-emoji.mjs
/**
 * 拼音 emoji 追加映射的离线管线:把 rime-ice 的 `opencc/emoji.txt` 原样打包成
 * 我们自己的 `ninan_emoji.txt`(经这条脚本产出的正是要下发给客户端的那份原文)。
 *
 * ⚠️ **产物与本脚本都必须按 GPL-3.0 公开**(rime-ice 是 GPL-3.0),与
 * `build-pinyin-dict.mjs` 同一条纪律 —— 见 docs/dict-ota-gpl-compliance.md。
 *
 * ⚠️ **只取 `opencc/emoji.txt` 一个文件,不取同目录的 `opencc/others.txt`。**
 * `others.txt` 是月份/星期/化学式/度量衡符号,以及大段与 emoji 完全无关的
 * 日文艺名对照表(逐行核对过,如"河北朝阳→河北あさひ"这类),不属于
 * 「emoji 追加」这个功能该有的内容 —— 纳入只会占用宝贵的候选位却不产出任何 emoji,
 * 且其中一部分内容与产品调性不符。这是**取用范围的裁剪**,不是"选一小批词"那种
 * 随意挑选:emoji.txt 本身是雾凇维护的**完整**emoji映射表,一条不漏地全部取用。
 *
 * ⚠️ **不做任何二次加工** —— 不像 `build-pinyin-dict.mjs` 那样按来源截断/剔重。
 * emoji.txt 只有 4857 行,是雾凇"纯手搓"的成熟数据(见其 README),没有需要清洗的
 * 权重/来源问题。本脚本只做:①校验每行格式(词\t响应,响应可以是多个空格分隔的
 * 备选值)②逐字节原样转发③算 manifest。校验失败宁可报错退出,也不静默产出半份数据。
 *
 * 用法:
 *   node scripts/build-pinyin-emoji.mjs --in <rime-ice/opencc 目录> --out <输出目录> --ref <commit-sha>
 */
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';

/**
 * emoji.txt 的行格式校验:`词\t响应1 响应2 …`(OpenCC 文本词典格式,tab 分两列,
 * 第二列内部以空格分隔多个候选值)。**只校验形状,不解析/不重排** —— 产物是原文件的
 * 逐字节转发,校验只是为了在上游换格式时尽早报错,而不是悄悄产出一份读不懂的数据。
 *
 * 返回该行是不是一条合法词条;空行返回 false(emoji.txt 结尾常有个空行,不算数据行)。
 */
export function isValidEmojiLine(line) {
  if (!line || !line.trim()) return false;
  const parts = line.replace(/\r$/, '').split('\t');
  if (parts.length !== 2) return false;
  const [word, responses] = parts;
  return word.trim().length > 0 && responses.trim().length > 0;
}

/**
 * 校验整份文本,返回合法词条数;一条不合法就报错退出(**不静默丢弃坏行**——
 * 与 `build-pinyin-dict.mjs` 的 `requireUpstreamRef`/`builtinDictPath` 同一条纪律:
 * 宁可让管线在这里炸,也不要下发一份"部分损坏但看起来正常"的数据)。
 *
 * ⚠️ 结尾允许恰好一个空行(常见的文件末尾换行符),不计入非法行也不计入词条数。
 */
export function validateEmojiText(text) {
  const lines = text.split('\n');
  // 去掉末尾至多一个空字符串(即文件以 \n 结尾产生的那个空元素)。
  const trimmedTail = lines.length > 0 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
  let count = 0;
  const bad = [];
  for (let i = 0; i < trimmedTail.length; i++) {
    if (isValidEmojiLine(trimmedTail[i])) {
      count += 1;
    } else if (trimmedTail[i].trim() !== '') {
      bad.push(i + 1);
    }
  }
  if (bad.length > 0) {
    throw new Error(
      `emoji.txt 有 ${bad.length} 行不是合法的"词\\t响应"格式(第 ${bad.slice(0, 5).join(', ')} 行等)`
      + ' —— 上游换格式了?宁可报错也不静默产出半份数据',
    );
  }
  if (count === 0) throw new Error('emoji.txt 一条词条都没解析出来 —— 上游换格式了?');
  return count;
}

/**
 * manifest.json 的形状与 `build-pinyin-dict.mjs` 的 `manifestOf` 对齐(version 是内容
 * SHA256 前 8 位,天然幂等),但**独立成一份文件**——emoji 追加与主词库/副表版本号
 * 互不牵连,上游改一次 emoji.txt 不该让主词库也判定"有更新"从而重下 27MB。
 */
export function manifestOf(text, ref, entries) {
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
  const manifest = {
    version: sha256.slice(0, 8),
    sha256,
    bytes: Buffer.byteLength(text, 'utf8'),
    entries,
  };
  if (ref) manifest.upstreamRef = ref;
  return manifest;
}

/** 校验 `--ref`。与 `build-pinyin-dict.mjs` 的 `requireUpstreamRef` 同一条纪律,不重复注释。 */
export function requireUpstreamRef(ref) {
  if (!ref || !ref.trim()) {
    throw new Error('必须用 --ref <commit-sha> 指定 rime-ice 的固定 commit,不接受浮动引用(main)');
  }
  return ref.trim();
}

function main() {
  const arg = (k) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const inDir = arg('in');
  const outDir = arg('out');
  if (!inDir || !outDir) {
    console.error('用法: node scripts/build-pinyin-emoji.mjs --in <rime-ice/opencc> --out <目录> --ref <commit-sha>');
    process.exit(1);
  }
  let ref;
  try {
    ref = requireUpstreamRef(arg('ref'));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const srcPath = join(inDir, 'emoji.txt');
  let text;
  try {
    text = readFileSync(srcPath, 'utf8');
  } catch (err) {
    console.error(`读不到 ${srcPath}:${err.message}`);
    process.exit(1);
  }
  let entries;
  try {
    entries = validateEmojiText(text);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const manifest = manifestOf(text, ref, entries);
  mkdirSync(outDir, { recursive: true });
  // ⚠️ 逐字节原样转发(不重新拼接/不改行尾)—— GPL 分发义务下"未修改内容"是最简单
  // 也最不容易出错的立场,与 `NOTICE.md` 里 `pinyin_simp.dict.yaml` 那条"未修改内容"
  // 的表述一致。
  writeFileSync(join(outDir, 'ninan_emoji.txt'), text, 'utf8');
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`读入 ${entries} 条 emoji 映射`);
  console.log(`version=${manifest.version} bytes=${manifest.bytes} upstreamRef=${manifest.upstreamRef}`);
}

// ⚠️ 主程序判断有**两个**坑,表现完全一样:main() 不跑 → **静默退出 0、零产物**,
// 而上游脚本读到的信号与「跑了、没事可做」一模一样(2026-09-07 生产事故就是这么发生的)。
// ① URL 会把空格编成 %20 —— 别拿 import.meta.url 直接比字符串(launchd 镜像实测);
// ② 软链:import.meta.url 是**解析后**的真路径,argv[1] 是调用时的原路径 —— macOS 的
//    /tmp、/var/folders 都是软链,经它们调用就不相等(2026-09-07 补测,评审 M11)。
// 所以两边都落到真实路径再比;realpath 失败(路径不存在,如 node -e)就当作「不是主程序」。
let invokedPath = '';
try { invokedPath = realpathSync(resolve(process.argv[1] ?? '')); } catch { /* 不是文件路径 */ }
if (fileURLToPath(import.meta.url) === invokedPath) main();

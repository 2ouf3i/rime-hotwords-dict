#!/usr/bin/env node
// backend/scripts/build-pinyin-dict.mjs
/**
 * 拼音热词库离线管线:把 rime-ice 处理成我们自己的 `hotwords.dict.yaml`。
 *
 * ⚠️ **产物与本脚本都必须按 GPL-3.0 公开**(rime-ice 是 GPL-3.0,见 spec §三)。
 * 这不是可选项,是我们能用这份词库的前提。
 *
 * 用法:
 *   node scripts/build-pinyin-dict.mjs --in <rime-ice/cn_dicts 目录> --out <输出目录> --ref <commit-sha>
 *
 * ⚠️ `--ref` 必传:rime-ice 是 `main` 浮动引用,不锁 commit 会导致 (1) GPL 归属声明
 * 说不清"derived from 哪个版本" (2) 产物不可复现——版本号是内容哈希,今天与下周跑出来的
 * 东西会静默不一样。见 requireUpstreamRef。
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

/** rime 词典是三列 TSV:词\t拼音\t词频(第三列可省)。注释与 YAML 头返回 null。 */
export function parseDictLine(line) {
  if (!line || line.startsWith('#') || line.startsWith('---') || line.startsWith('...')) return null;
  const parts = line.replace(/\r$/, '').split('\t');
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  const weight = parts.length > 2 && parts[2].trim() ? Number.parseInt(parts[2], 10) : 0;
  return { word: parts[0], pinyin: parts[1], weight: Number.isFinite(weight) ? weight : 0 };
}

/**
 * 按词频截断 + 剔除已内置的词。
 * `exclude` 传我们 `pinyin_simp.dict.yaml` 里已有的词 —— 重复收录只会撑大产物,
 * 对候选没有增量(rime 自己会合并,但下发的字节是我们付的)。
 */
export function filterEntries(entries, { minWeight, exclude }) {
  return entries.filter((e) => e.weight >= minWeight && !exclude.has(e.word));
}

/**
 * `ref` 是锁定的 rime-ice commit sha(见 requireUpstreamRef)。传了就把上游链接扩成
 * 带 commit 的 `/tree/<ref>` 形式,拿到词库文件的人能直接核对来源版本;不传就退回
 * 不带 commit 的老链接(保持向后兼容 —— 老测试/老调用方没打算传 ref 也不该炸)。
 */
export function renderDict(entries, ref) {
  const upstreamLine = ref
    ? `# 上游: https://github.com/iDvel/rime-ice/tree/${ref} (GPL-3.0)`
    : '# 上游: https://github.com/iDvel/rime-ice (GPL-3.0)';
  // ⚠️ 归属注释必须在 `---` 之后:测试断言文件以 `---\n` 开头(合法 rime 词典的
  // YAML 头就是从 `---` 起算),注释挪到文档体内(`...` 收尾前)依然是合法 YAML 注释。
  const head = [
    '---',
    'name: hotwords',
    'version: "1"',
    'sort: by_weight',
    '# 拼音热词库 —— 由 scripts/build-pinyin-dict.mjs 从 rime-ice 生成',
    upstreamLine,
    '# 本产物同样按 GPL-3.0 授权。',
    '...',
    '',
  ].join('\n');
  const body = entries.map((e) => `${e.word}\t${e.pinyin}\t${e.weight}`).join('\n');
  return `${head}${body}\n`;
}

/**
 * 版本号 = 内容 SHA256 前 8 位。内容没变就不下发,天然幂等。
 * `ref` 传了就多带 `upstreamRef` 字段(锁定的 rime-ice commit,给运维/合规看的产物元数据)。
 * ⚠️ 不传时**不**产出这个字段 —— 保持 Task 2/3 依赖的 {version,sha256,bytes,entries}
 * 四字段形状向后兼容,后端 `PinyinDictManifest` 这次不动。
 */
export function manifestOf(dictText, ref) {
  const sha256 = createHash('sha256').update(dictText, 'utf8').digest('hex');
  const manifest = {
    version: sha256.slice(0, 8),
    sha256,
    bytes: Buffer.byteLength(dictText, 'utf8'),
    entries: dictText.split('\n').filter((l) => parseDictLine(l) !== null).length,
  };
  if (ref) manifest.upstreamRef = ref;
  return manifest;
}

/**
 * 校验 `--ref`。**选择"未传报错退出"这条**(而不是记成 `"unpinned"` + 警告放行):
 * 产物直接决定 GPL 归属声明能不能说清版本,静默降级成 unpinned 太容易被无视 ——
 * 报错能让漏传在提交/CI 那一刻就现形,而不是等复现不出来时才回头查。
 */
export function requireUpstreamRef(ref) {
  if (!ref || !ref.trim()) {
    throw new Error('必须用 --ref <commit-sha> 指定 rime-ice 的固定 commit,不接受浮动引用(main)');
  }
  return ref.trim();
}

/**
 * 内置拼音词表(`pinyin_simp.dict.yaml`)的路径。**必传,没有默认值。**
 *
 * 这份表用来剔重:内置词库已经有的词不重复下发。
 *
 * ⚠️ **为什么不给默认值** —— 两个理由,都吃过亏:
 * 1. 这个脚本要能**原样**搬进 GPL 公开仓库跑(GPL 要求提供能复现产物的源)。
 *    默认值写死本仓库的目录结构,就得在公开仓库里改一份 —— 而**分叉出去的脚本迟早
 *    跟这份对不上**,到那时「复现出来的产物跟我们下发的不是同一个」最难查。
 * 2. 忘传的后果是**静默**的:剔重不发生,产物从 833,931 条变成 891,293 条(多出来的
 *    全是内置词库已有的重复词),而脚本照常成功、照常吐 manifest。与 `--ref` 同款纪律:
 *    **宁可报错,也不静默产出一份不对的东西。**
 */
export function builtinDictPath(path) {
  if (!path) throw new Error('必须用 --builtin <pinyin_simp.dict.yaml> 指定内置词表(用于剔重);不给默认值的理由见该函数注释');
  return path;
}

/**
 * **按来源选,不按权重选。** 这是 2026-08-28 对 R11 的第二次改判(第一次改到 `minWeight=0`,
 * 那次只看了 base+ext,漏掉了目录里另外四个文件,数字错了近一倍)。
 *
 * 实测 rime-ice `cn_dicts/` 六个文件的权重画像:
 *
 * | 文件 | 条数 | 性质 | 权重 |
 * |---|---|---|---|
 * | `base.dict.yaml` | 543,012 | 词,人工调频 | 1..9999(最常见 1) |
 * | `ext.dict.yaml` | 339,151 | 日常更新的新词 | **恒 100** |
 * | `8105.dict.yaml` | 8,757 | 通用规范汉字(单字) | 有梯度 |
 * | `others.dict.yaml` | 633 | 零碎补充 | 多为 0 |
 * | `41448.dict.yaml` | 46,019 | **全字符集生僻单字**(𠼞/𥥩/㑸) | **恒 0** |
 * | `tencent.dict.yaml` | 981,095 | 腾讯词向量词表 | **恒 0** |
 *
 * 关键结论:**weight 这一列标的是「来源可信度层级」,不是词频** ——
 * 0 = 无背书(tencent / 生僻字),100 = ext,1..9999 = base 的人工调频。
 * 数字阈值能**碰巧**近似实现来源选择(minWeight=1 正好切掉那两个恒 0 的文件),
 * 但那是巧合:上游哪天给 tencent 调一次权重,我们阈值的语义就变了,**而且是静默变**。
 * 所以选择写成文件白名单,让「要什么、不要什么」是显式的。
 *
 * ⚠️ 顺序即优先级(同词只取第一次出现,与 rime 的 import 顺序一致)。
 * 原来靠 `readdirSync` 的字母序**碰巧**让 base 排在 ext 前面 —— 那不是保证,是运气。
 *
 * 排除的两个,理由:
 * - `41448`:全字符集生僻单字,权重恒 0,纯噪音(我们的内置底库已覆盖常用单字)。
 * - `tencent`:98 万条、比 base+ext 加起来还大,权重恒 0 = **没有任何排序信号**,
 *   体积翻倍(27MB → 45.8MB)换来的是一堆排在最后、既排不上前又占空间的词。
 *   要不要收它是个独立问题,得先有真机上的候选质量数据再谈。
 *
 * 选定组合 = 891,293 条 / 落盘 27.0MB / gzip 9.4MB,而 spec §二 那个 **1311ms 端上重编
 * 正是在 880,089 条这个量级测出来的** —— 耗时数据直接适用;1.9M 条的耗时从未测过。
 */
export const SOURCE_FILES = ['base.dict.yaml', 'ext.dict.yaml', '8105.dict.yaml', 'others.dict.yaml'];

function loadWords(path) {
  const set = new Set();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const row = parseDictLine(line);
    if (row) set.add(row.word);
  }
  return set;
}

function main() {
  const arg = (k) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const inDir = arg('in');
  const outDir = arg('out');
  // ⚠️ **默认 0 = 不按权重截断。** 2026-08-28 实测推翻了原来的 minWeight=1000 定案:
  // rime-ice 的 weight **不是跨文件可比的频次信号** —— `ext.dict.yaml` 那 338,154 条
  // 权重**全部恒等于 100**(一条例外都没有),`base.dict.yaml` 里最常见的权重值是 1(占 11%)。
  // 于是「minWeight=1000」实际干的事不是「留下常用词」,而是**把整个 ext 一刀切光**。
  // 当初的「体积/条数拐点」判据量错了对象:那个拐点是两个文件权重体系不同造成的,不是词频。
  //
  // 更硬的证否:spec §九 的验收清单里,「绝绝子」权重 107、「嘴替」权重 **7** ——
  // 阈值 1000 会把它们切掉,**当前定案连 spec 自己的验收条件都过不了**;
  // 「嘴替=7」实质上把阈值钉死在 ≤7,也就是 0。
  //
  // 全量的三项成本都已实测可接受:882,163 条 / 落盘 26.9MB / **gzip 传输 9.3MB**,
  // 而 spec §二 那个 1311ms 端上重编就是在 880,089 条(≈全量)下测的。
  //
  // 旋钮保留:若真机上发现 ext 的噪音(`啊啊啊啊啊啊`、`阿爸父` 这类,权重与「细思极恐」
  // 同为 100,排序上分不开)拖坏了候选质量,再把这个数拧上去。**判据是候选质量,不是字节数。**
  const minWeight = Number.parseInt(arg('minWeight') ?? '0', 10);
  if (!inDir || !outDir) {
    console.error('用法: node scripts/build-pinyin-dict.mjs --in <cn_dicts> --out <目录> --ref <commit-sha> [--builtin <pinyin_simp.dict.yaml>]');
    process.exit(1);
  }
  let ref;
  try {
    ref = requireUpstreamRef(arg('ref'));
  } catch (err) {
    console.error(err.message);
    console.error('用法: node scripts/build-pinyin-dict.mjs --in <cn_dicts> --out <目录> --ref <commit-sha> [--builtin <pinyin_simp.dict.yaml>]');
    process.exit(1);
  }
  let builtin;
  try {
    builtin = loadWords(builtinDictPath(arg('builtin')));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const rows = [];
  const seen = new Set();
  // 未登记的 `.dict.yaml` 一律跳过,但**要吼一声** —— rime-ice 哪天新增一个词表,
  // 静默忽略会让我们以为「上游没动」,静默包含会让噪音悄悄混进候选。两种静默都不要。
  const present = new Set(readdirSync(inDir).filter((n) => n.endsWith('.dict.yaml')));
  for (const f of present) {
    if (!SOURCE_FILES.includes(f)) console.warn(`⚠️ 跳过未登记的词表 ${f}(要用就加进 SOURCE_FILES 并写明理由)`);
  }
  for (const f of SOURCE_FILES) {
    if (!present.has(f)) throw new Error(`登记的词表 ${f} 不在 ${inDir} 里 —— 上游改名了?宁可报错也不静默产出一份小词库`);
    for (const line of readFileSync(join(inDir, f), 'utf8').split('\n')) {
      const row = parseDictLine(line);
      // 同词只取第一次出现(base 先于 ext,与 rime 的 import 顺序一致)
      if (row && !seen.has(row.word)) { seen.add(row.word); rows.push(row); }
    }
  }
  const kept = filterEntries(rows, { minWeight, exclude: builtin });
  const text = renderDict(kept, ref);
  const manifest = manifestOf(text, ref);
  mkdirSync(outDir, {recursive: true});   // 实跑时这里 ENOENT 挂过一次:脚本从不建输出目录
  writeFileSync(join(outDir, 'hotwords.dict.yaml'), text, 'utf8');
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`读入 ${rows.length} 条 → 保留 ${kept.length} 条(minWeight=${minWeight})`);
  console.log(`version=${manifest.version} bytes=${manifest.bytes} upstreamRef=${manifest.upstreamRef}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

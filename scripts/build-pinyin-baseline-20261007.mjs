#!/usr/bin/env node
// backend/scripts/build-pinyin-dict.mjs
/**
 * 拼音热词库离线管线:把 rime-ice 处理成我们自己的 `hotwords.dict.yaml`。
 *
 * ⚠️ **产物与本脚本都必须按 GPL-3.0 公开**(rime-ice 是 GPL-3.0,见 spec §三)。
 * 这不是可选项,是我们能用这份词库的前提。
 *
 * 用法:
 *   node scripts/build-pinyin-dict.mjs --in <rime-ice/cn_dicts 目录> --out <输出目录> --ref <commit-sha> \
 *     --builtin <pinyin_simp.dict.yaml> --hotwords <backend/dict/ninan-hotwords.txt> \
 *     --phrase-weights <backend/dict/phrase-weights.txt>
 *
 * `--phrase-weights`(2026-10-07 起,必传,可以给多次):一份「词 + 权重」的表,**覆盖上游词条的权重**。上游的权重标的是
 * 来源层级不是词频(ext 与腾讯两层恒为 100),日常口语短语排不上来(wjt 出「为家庭」不出「我今天」)。见 [applyPhraseWeights]。
 * 给多次时**先给的优先**(手写的那份放前面,生成出来的放后面),见 [mergePhraseWeights]。
 *
 * ⚠️ `--minWeight` 是**实验旋钮**,R11 已两次否决「按权重截断」,不要用它产出下发的产物
 * (理由见 filterEntries / minWeightWarning 的注释)。
 *
 * ⚠️ `--ref` 必传:rime-ice 是 `main` 浮动引用,不锁 commit 会导致 (1) GPL 归属声明
 * 说不清"derived from 哪个版本" (2) 产物不可复现——版本号是内容哈希,今天与下周跑出来的
 * 东西会静默不一样。见 requireUpstreamRef。
 */
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, realpathSync, writeFileSync, readdirSync } from 'node:fs';

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
 *
 * ⚠️ **`minWeight` 是实验旋钮,不要用它产出下发的产物。** R11 前后两次改判都否掉了
 * 「按权重截断」这条路:rime-ice 的 weight 标的是**来源可信度层级**,不是词频
 * (`ext.dict.yaml` 那 33.9 万条恒等于 100),于是 `minWeight=1000` 实际干的事不是
 * 「留下常用词」而是**把整个 ext 一刀切光** —— 连 spec §九 自己的验收词都过不了
 * (嘴替 = 7、绝绝子 = 107、细思极恐 = 100)。选词的真判据是 [SOURCE_FILES] 白名单。
 *
 * **选择留着这个参数而不是删掉**,两条理由:①`filterEntries` 本身还要做 `exclude` 剔重,
 * 函数不会消失,删的只是一个入参;②spec §十「tencent 收不收」仍未决,那个实验要靠它
 * 试噪音下限,删了到时还得原样加回来。代价是它随手可用 —— 所以非 0 时
 * [minWeightWarning] 会在命令行喊一声,`--help` 也标了「实验旋钮」。
 */
export function filterEntries(entries, { minWeight, exclude }) {
  return entries.filter((e) => e.weight >= minWeight && !exclude.has(e.word));
}

/**
 * 解析 `--minWeight`。未传 / 空 = 0(不按权重截断);传了就必须是**非负整数**。
 *
 * ⚠️ **非法值报错退出,不接受静默降级** —— 与 `--ref` / `--builtin` 同款纪律。
 * `Number.parseInt('abc')` 得 NaN,而 `e.weight >= NaN` **恒为 false**,于是
 * [filterEntries] 把词条**全过滤空**:脚本照常成功、照常吐 manifest、照常写出一份
 * 0 条词条的"词库",下发出去就是所有人的候选一夜归零。
 * 更阴的是 [minWeightWarning] 也接不住这一格 —— `!NaN === true`,它走的是"没传"那条,
 * **一声不吭**。所以校验必须放在边界上,而不是指望告警兜底。
 */
export function parseMinWeight(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(
      `--minWeight 必须是非负整数,收到 "${raw}" —— ` +
        '非法值会让 weight 比较恒为 false、词条被全过滤空,而脚本照常成功',
    );
  }
  return Number.parseInt(text, 10);
}

/**
 * `--minWeight` 非 0 时该喊的那句话(0 / 未传 = null,不喊)。
 *
 * 做成**导出的纯函数**是为了让「这道提醒还在不在」能被测试钉住 ——
 * 直接埋在 main() 里的 console.warn 没有任何闸,被人顺手删掉不会有任何反应,
 * 而这个旋钮恰恰是 R11 两次否决之后**唯一**还留在手边的那条错路。
 */
export function minWeightWarning(minWeight) {
  if (!minWeight) return null;
  return (
    `⚠️ --minWeight=${minWeight}:R11 已两次否决「按权重截断」` +
    '(rime-ice 的 weight 是来源可信度层级,不是词频,阈值会把整个 ext 一刀切光)。' +
    '这个旋钮只用于实验,产出的词库不要下发。'
  );
}

/**
 * **署名随产物走**(2026-10-07)。权重表(`--phrase-weights` 给的那几份)里可以写署名行:
 *   `# 署名:<一句话>`
 * 构建时把各份表里的署名按先后收齐(去重),写进两份产物的头注释,每条一行、前面加「# 另含:」。
 * 为什么:表里用了别人的公开数据(地名表用了 THUOCL 的词频与行政区划名称,日常短语用了 Tatoeba 的例句统计),
 * 其中有的许可要求署名(CC BY)。署名只写在仓库里的表头不够 —— 下发到设备上的是产物,不是那几张表。
 * 没有任何署名行时头注释与原来逐字节相同(空表不改产物这条性质靠它保住)。
 * 写坏的(冒号后面是空的)直接抛错:静默丢掉 = 以为署了名、其实没有。
 */
export function parseCreditLines(text) {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    const m = raw.replace(/\r$/, '').match(/^#\s*署名[:：](.*)$/);
    if (!m) return;
    const credit = m[1].trim();
    if (!credit) throw new Error(`第 ${i + 1} 行:「# 署名:」后面要写内容`);
    out.push(credit);
  });
  return out;
}

/** 把几份表的署名并成一份(按先后、去重)。 */
export function mergeCredits(lists) {
  return [...new Set(lists.flat())];
}

function creditLines(credits) {
  return credits.map((c) => `# 另含:${c}`);
}

/**
 * `ref` 是锁定的 rime-ice commit sha(见 requireUpstreamRef)。传了就把上游链接扩成
 * 带 commit 的 `/tree/<ref>` 形式,拿到词库文件的人能直接核对来源版本;不传就退回
 * 不带 commit 的老链接(保持向后兼容 —— 老测试/老调用方没打算传 ref 也不该炸)。
 */
export function renderDict(entries, ref, credits = []) {
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
    ...creditLines(credits),
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
export function manifestOf(dictText, ref, autoText) {
  const sha256 = createHash('sha256').update(dictText, 'utf8').digest('hex');
  const manifest = {
    // ⚠️ **version 必须覆盖两个文件**:只按主词库算的话,无注音那份单独变了
    // 版本号不动 → 客户端判「无事可做」→ 新词永远到不了设备(静默)。
    version: (autoText === undefined
      ? sha256
      : createHash('sha256').update(dictText, 'utf8').update(autoText, 'utf8').digest('hex')
    ).slice(0, 8),
    // 这个仍是**主词库自己的**摘要 —— 客户端拿它校验主词库那次下载。
    sha256,
    bytes: Buffer.byteLength(dictText, 'utf8'),
    entries: dictText.split('\n').filter((l) => parseDictLine(l) !== null).length,
  };
  if (ref) manifest.upstreamRef = ref;
  if (autoText !== undefined) {
    manifest.auto = {
      sha256: createHash('sha256').update(autoText, 'utf8').digest('hex'),
      bytes: Buffer.byteLength(autoText, 'utf8'),
      entries: autoText.split('\n').filter((l) => parseAutoDictLine(l) !== null).length,
    };
  }
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
/**
 * **无注音**词表白名单(2 列:词 + 权重,没有拼音列)。
 *
 * ⚠️ 这批词单独出一个文件,不能与上面那批混在一起 —— rime 的 `columns:` 是
 * **整文件级**声明,一个文件只能是 `[text, code, weight]` 或 `[text, weight]` 之一。
 *
 * ⚠️ **2026-08-30 之前它被整个排除,那是个 bug**:我按 3 列解析这个文件,
 * 「第 3 列为空」被读成「权重恒为 0」,据此判定它没价值。真相是它 2 列、权重恒 100,
 * 拼音由 rime **按方案字表自动注音**(文件头的 `columns:` 就是那个开关)。
 * 代价是整整 98 万条现代词汇 / 人名 / 网络词一条都没进来 ——
 * 用户实测「wangjiaer 打不出王嘉尔」「jicaowuliu 打不出基操勿六」,
 * 而这类词**穷举不完**,因为缺的是一整层。本地探针实测:加回来之后两个词都排第 1。
 */
export const AUTO_SOURCE_FILES = ['tencent.dict.yaml'];

/** 解析无注音词条(`词\t权重`)。列数不对一律返回 null —— 与 [parseDictLine] 同纪律。 */
export function parseAutoDictLine(line) {
  if (!line || line.startsWith('#')) return null;
  const parts = line.replace(/\r$/, '').split('\t');
  if (parts.length !== 2) return null;
  const [word, w] = parts;
  if (!word || !/^\d+$/.test(w)) return null;
  return { word, weight: Number(w) };
}

/**
 * 渲染无注音词表。**`columns: [text, weight]` 是这份文件的全部意义** ——
 * 少了它 rime 按默认三列解析,把权重当成拼音,非法拼写**静默丢弃**、不报任何错。
 * (那正是我第一次实验失败的原因,还让我错误地下结论说 librime 不支持自动注音。)
 */
export function renderAutoDict(entries, ref, credits = []) {
  const upstreamLine = ref
    ? `# 上游: https://github.com/iDvel/rime-ice/tree/${ref} (GPL-3.0)`
    : '# 上游: https://github.com/iDvel/rime-ice (GPL-3.0)';
  const head = [
    '---',
    'name: hotwords_auto',
    'version: "1"',
    'sort: by_weight',
    // ⚠️ 这两行不能删,见函数注释。
    'columns:',
    '  - text',
    '  - weight',
    '# 无注音热词库(拼音由 rime 按方案字表自动注音)—— 由 scripts/build-pinyin-dict.mjs 生成',
    upstreamLine,
    '# 本产物同样按 GPL-3.0 授权。',
    ...creditLines(credits),
    '...',
    '',
  ].join('\n');
  const body = entries.map((e) => `${e.word}\t${e.weight}`).join('\n');
  return `${head}${body}\n`;
}

/**
 * 主表(带拼音)的来源白名单。**顺序即优先级**,base 必须在 ext 前面。
 *
 * ⚠️ 想往这里加东西之前,先读 `build-pinyin-dict.test.mjs` 里那条「排除的两个词表不许悄悄
 * 加回白名单」—— 41448(大字表)与 tencent 都是**评估过才排除的**,理由和实测数字都记在那儿,
 * 加回来会让那条测试变红。tencent 另有去处(见 [AUTO_SOURCE_FILES]),不是不收。
 */
export const SOURCE_FILES = ['base.dict.yaml', 'ext.dict.yaml', '8105.dict.yaml', 'others.dict.yaml'];

/**
 * **Ninan 自己维护的热词清单**(`backend/dict/ninan-hotwords.txt`,2026-09-14 起)。
 *
 * 用途:rime-ice 还没收、但我们想让用户马上打得出来的词(网络热词、Ninan 用户群常说的词)。
 * 一行一个词;自动注音会注错的(多音字),在词后面加 Tab + 空格分隔的拼音,进主表。
 *
 * ⚠️ 权重统一取 [HOTWORD_WEIGHT] = 3000,2026-09-14 本地探针(scripts/rime-probe.sh)实测定的:
 * - 先试的 100(= `ext` 批量收词那一档)**太低**:22 个词里短词大多排 2~5 位,压不过
 *   外壕(370)/ 朗洁(770)/ 来采(111)/ 马喽(111)这类生僻同音词,「老己」连前 5 都进不去。
 * - rime-ice **人工精选**的流行词在 2222~6666(来踩 2222、硬控 3333、邪修 4444、搭子 6666)。
 *   3000 压得过生僻同音词,又压不过真正的常用词(老几 9825、外号 24595、牢记 102150),
 *   与上游精选的 3333 那档打平时也让着上游(泰裤辣 < 太酷啦 3333)。
 * 这份清单是人工挑过的少量词,配得上精选档;要再往上调,先拿真机上的误选反馈。
 *
 * ⚠️ 这份清单会并进 GPL 产物一起下发 —— **只许放公开的词,绝不许放任何来自单个用户的内容**
 * (见 docs/dict-ota-gpl-compliance.md)。
 */
export const HOTWORD_WEIGHT = 3000;

const HAN_WORD = /^\p{Script=Han}{2,}$/u;
const PINYIN = /^[a-z]+( [a-z]+)*$/;

/**
 * 解析清单一行。空行 / `#` 注释返回 null;**格式不对直接抛错**(与 `--ref` 同款纪律:
 * 手滑写坏的一行宁可让构建失败,也不能静默丢掉、让人以为已经上线)。
 */
export function parseHotwordLine(line, lineNo = 0) {
  const text = line.replace(/\r$/, '').trim();
  if (!text || text.startsWith('#')) return null;
  const parts = text.split('\t').map((s) => s.trim());
  const where = `ninan-hotwords 第 ${lineNo} 行「${text}」`;
  if (parts.length > 2) throw new Error(`${where}:最多两列(词 + 可选拼音)`);
  const [word, pinyin] = parts;
  if (!HAN_WORD.test(word)) throw new Error(`${where}:词必须是两个以上的汉字(拼音方案只打得出汉字)`);
  if (pinyin === undefined || pinyin === '') return { word };
  if (!PINYIN.test(pinyin)) throw new Error(`${where}:拼音只能是小写字母,音节之间一个空格`);
  if (pinyin.split(' ').length !== [...word].length) throw new Error(`${where}:拼音音节数与字数不一致`);
  return { word, pinyin };
}

/**
 * 把清单并进上游词表。**上游已经有的词不重复收**,记进 `alreadyUpstream` 让构建日志提醒
 * 「可以从清单里删了」—— 清单只该装上游还没有的词,否则它会越攒越长、没人敢删。
 * 带拼音的进主表,不带的进无注音表(拼音由 rime 按字表自动注音)。
 */
export function mergeHotwords({ mainRows, autoRows, hotwords }) {
  const upstream = new Set([...mainRows.map((r) => r.word), ...autoRows.map((r) => r.word)]);
  const seen = new Set();
  const main = [...mainRows];
  const auto = [...autoRows];
  const added = [];
  const alreadyUpstream = [];
  for (const h of hotwords) {
    if (seen.has(h.word)) continue;
    seen.add(h.word);
    if (upstream.has(h.word)) { alreadyUpstream.push(h.word); continue; }
    if (h.pinyin) main.push({ word: h.word, pinyin: h.pinyin, weight: HOTWORD_WEIGHT });
    else auto.push({ word: h.word, weight: HOTWORD_WEIGHT });
    added.push(h.word);
  }
  return { mainRows: main, autoRows: auto, added, alreadyUpstream };
}

/**
 * **短语权重表**(`backend/dict/phrase-weights.txt`,2026-10-07 起)—— 覆盖上游词条的权重。
 *
 * 为什么要有它:rime-ice 的 weight 标的是「来源层级」不是词频(见 [SOURCE_FILES] 上面那张表)——
 * `ext` 34 万条、腾讯表 98 万条恒为 100,合起来约七成词条。而只要有一个整词盖住全部输入,引擎就不造句、
 * 不问语言模型,候选只按词条权重排。于是简拼 `wjt` 的首选是「为家庭」(base,13300),「我今天」(ext,100)
 * 连前八都进不去 —— 词库里有这个词,只是权重是占位值。[mergeHotwords] 帮不上:它遇到上游已有的词就跳过。
 *
 * 一行一条:`词<Tab>权重[<Tab>拼音]`。
 * - 上游(主表或无注音表,连同热词清单并进来的)**已经有**这个词 → 把它的权重换成表里的数。
 * - 上游**没有**:带拼音的加进主表;不带拼音的**不加**,记进 `missing` 让构建日志点名
 *   (要加新词走热词清单;这张表管的是「已有的词排第几」)。
 * - 带了拼音、而主表里这个词的读音与它不一样:多半是写错了,或者是多音字的另一个读音 —— 这一行**不生效**,
 *   记进 `pinyinConflict` 点名。把权重套到另一个读音上比不生效更糟。
 *
 * ⚠️ 权重的刻度是上游 base 层的刻度(人工调过频的那一层):三字词条的中位数约 500,前 10% 在 1.2 万以上,
 * 「没问题」10 万、「对不起」40 万。给多少、怎么量,见那份表的头注释与 scripts/rime-abbr-eval.sh。
 *
 * ⚠️ 与热词清单同一条纪律:这张表会并进 GPL 产物一起下发 —— **只许放公开的词**。
 */
export const PHRASE_WEIGHT_MAX = 20_000_000;

/**
 * 解析权重表一行。空行 / `#` 注释返回 null;**格式不对直接抛错**(与 [parseHotwordLine] 同款纪律)。
 * 权重必须是 0 ~ [PHRASE_WEIGHT_MAX] 的整数:上游 base 层最大的权重是 1926 万,比这还大的多半是多打了几个零,
 * 而一条天文数字的权重会让这个词压过同音的所有词。0 是允许的(把一个词沉到底)。
 */
export function parsePhraseWeightLine(line, lineNo = 0) {
  const text = line.replace(/\r$/, '').trim();
  if (!text || text.startsWith('#')) return null;
  const parts = text.split('\t').map((s) => s.trim());
  const where = `phrase-weights 第 ${lineNo} 行「${text}」`;
  if (parts.length < 2 || parts.length > 3) throw new Error(`${where}:要两列或三列(词 + 权重 + 可选拼音),用 Tab 分隔`);
  const [word, weightText, pinyin] = parts;
  if (!HAN_WORD.test(word)) throw new Error(`${where}:词必须是两个以上的汉字`);
  if (!/^\d+$/.test(weightText)) throw new Error(`${where}:权重必须是非负整数`);
  const weight = Number.parseInt(weightText, 10);
  if (weight > PHRASE_WEIGHT_MAX) throw new Error(`${where}:权重超过 ${PHRASE_WEIGHT_MAX}(上游最大的也只有 1926 万)—— 多打了几个零?`);
  if (pinyin === undefined || pinyin === '') return { word, weight };
  if (!PINYIN.test(pinyin)) throw new Error(`${where}:拼音只能是小写字母,音节之间一个空格`);
  if (pinyin.split(' ').length !== [...word].length) throw new Error(`${where}:拼音音节数与字数不一致`);
  return { word, weight, pinyin };
}

/** 权重表路径。**必传,没有默认值** —— 忘传 = 权重静默没覆盖(wjt 又回到「为家庭」,而构建照常成功),理由同 [builtinDictPath]。 */
export function phraseWeightsPath(path) {
  if (!path) throw new Error('必须用 --phrase-weights <phrase-weights.txt> 指定短语权重表(可以是只有注释的空表)');
  return path;
}

/**
 * 读权重表。**同一个词出现两次直接抛错**:两行给了不同的权重时,哪一行生效取决于先后,
 * 改了前一行却不生效这种事没法从构建日志里看出来。
 */
export function loadPhraseWeights(path) {
  const seen = new Map();
  const out = [];
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    const row = parsePhraseWeightLine(line, i + 1);
    if (row === null) return;
    if (seen.has(row.word)) throw new Error(`phrase-weights 第 ${i + 1} 行「${row.word}」:第 ${seen.get(row.word)} 行已经写过这个词`);
    seen.set(row.word, i + 1);
    out.push(row);
  });
  return out;
}

/**
 * 把几份权重表并成一份:**先给的优先**。同一个词在后面的表里又出现时不生效,记进 `shadowed`(只报个数)——
 * 这是有意的分工,不是写错:手写的那份(`phrase-weights.txt`)说了算,生成出来的表(按词频、按语言模型估的)
 * 整份重新生成时不必去避开手写的词。同一份表里重复仍然是错(见 [loadPhraseWeights])。
 * 现在构建时给三份(scripts/sync-pinyin-dict-local.sh):手写的 phrase-weights.txt、日常短语 everyday-phrases.txt(上游没有的新词)、
 * 地名 place-names.txt(backend/scripts/gen-place-names.mjs 生成)。按语言模型估的那条路量过、没有采用,
 * 见 scripts/gen-phrase-weights-lm.sh 末尾的记录。
 */
export function mergePhraseWeights(tables) {
  const seen = new Set();
  const overrides = [];
  let shadowed = 0;
  for (const table of tables) {
    for (const row of table) {
      if (seen.has(row.word)) { shadowed += 1; continue; }
      seen.add(row.word);
      overrides.push(row);
    }
  }
  return { overrides, shadowed };
}

/**
 * 把权重表套到词表上(见 [PHRASE_WEIGHT_MAX] 上面那段的规则)。**不改条目的先后**:只换权重,新增的排在主表最后 ——
 * 表是空的时候,产物与没有这一步时逐字节相同。不动传进来的数组。
 * 返回新的两张表,外加四份名单:`overridden`(换了权重的,带原来的数)、`added`、`missing`、`pinyinConflict`,
 * 以及 `unchanged`(上游的权重本来就是这个数 —— 这一行可以删了)。
 */
export function applyPhraseWeights({ mainRows, autoRows, overrides }) {
  const byWord = new Map(overrides.map((o) => [o.word, o]));
  const hit = new Set();
  const hitInMain = new Set();
  const overridden = [];
  const unchanged = [];
  const conflicted = new Set();
  const main = mainRows.map((row) => {
    const o = byWord.get(row.word);
    if (!o) return row;
    if (o.pinyin && o.pinyin !== row.pinyin) { conflicted.add(row.word); return row; }
    hit.add(row.word);
    hitInMain.add(row.word);
    if (row.weight === o.weight) { unchanged.push(row.word); return row; }
    overridden.push({ word: row.word, table: 'main', from: row.weight, to: o.weight });
    return { ...row, weight: o.weight };
  });
  const auto = autoRows.map((row) => {
    const o = byWord.get(row.word);
    if (!o) return row;
    hit.add(row.word);
    if (row.weight === o.weight) { unchanged.push(row.word); return row; }
    overridden.push({ word: row.word, table: 'auto', from: row.weight, to: o.weight });
    return { ...row, weight: o.weight };
  });
  const added = [];
  const missing = [];
  const pinyinConflict = [];
  for (const o of overrides) {
    // 主表里有这个词、但没有一条读音对得上:不生效,也不另加一条(同一个词两个读音各一条权重,排序就说不清了)。
    // 无注音表里碰巧也有它、在那边换了权重的,照样点名 —— 写的人想改的是主表里那一条。
    if (conflicted.has(o.word) && !hitInMain.has(o.word)) { pinyinConflict.push(o.word); continue; }
    if (hit.has(o.word)) continue;
    // 上游没有、也没写拼音:不加(无注音表靠引擎按字表注音,多音字会注错;要加新词走热词清单,那边有人看)。
    if (!o.pinyin) { missing.push(o.word); continue; }
    main.push({ word: o.word, pinyin: o.pinyin, weight: o.weight });
    added.push(o.word);
  }
  return { mainRows: main, autoRows: auto, overridden, unchanged, added, missing, pinyinConflict };
}

/** 清单路径。**必传,没有默认值** —— 忘传 = 热词静默没进产物,理由同 [builtinDictPath]。 */
export function hotwordsPath(path) {
  if (!path) throw new Error('必须用 --hotwords <ninan-hotwords.txt> 指定 Ninan 热词清单(可以是只有注释的空清单)');
  return path;
}

export function loadHotwords(path) {
  return readFileSync(path, 'utf8').split('\n')
    .map((line, i) => parseHotwordLine(line, i + 1))
    .filter((h) => h !== null);
}

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
  // 可以给多次的参数:按命令行上的先后收齐。
  const args = (k) => process.argv.flatMap((a, i) => (a === `--${k}` ? [process.argv[i + 1]] : []));
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
  let minWeight;
  try {
    minWeight = parseMinWeight(arg('minWeight'));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (!inDir || !outDir) {
    console.error('用法: node scripts/build-pinyin-dict.mjs --in <cn_dicts> --out <目录> --ref <commit-sha> --builtin <pinyin_simp.dict.yaml> --hotwords <ninan-hotwords.txt> --phrase-weights <phrase-weights.txt> [--minWeight <n>:实验旋钮,R11 已两次否决按权重截断,不要用它产出下发的产物]');
    process.exit(1);
  }
  let ref;
  try {
    ref = requireUpstreamRef(arg('ref'));
  } catch (err) {
    console.error(err.message);
    console.error('用法: node scripts/build-pinyin-dict.mjs --in <cn_dicts> --out <目录> --ref <commit-sha> --builtin <pinyin_simp.dict.yaml> --hotwords <ninan-hotwords.txt> --phrase-weights <phrase-weights.txt> [--minWeight <n>:实验旋钮,R11 已两次否决按权重截断,不要用它产出下发的产物]');
    process.exit(1);
  }
  let builtin;
  let hotwords;
  let phraseWeights;
  let credits;
  try {
    builtin = loadWords(builtinDictPath(arg('builtin')));
    hotwords = loadHotwords(hotwordsPath(arg('hotwords')));
    const tables = args('phrase-weights');
    phraseWeights = mergePhraseWeights((tables.length ? tables : [undefined]).map((p) => loadPhraseWeights(phraseWeightsPath(p))));
    credits = mergeCredits(tables.map((p) => parseCreditLines(readFileSync(p, 'utf8'))));
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
    if (!SOURCE_FILES.includes(f) && !AUTO_SOURCE_FILES.includes(f)) console.warn(`⚠️ 跳过未登记的词表 ${f}(要用就加进 SOURCE_FILES 并写明理由)`);
  }
  for (const f of SOURCE_FILES) {
    if (!present.has(f)) throw new Error(`登记的词表 ${f} 不在 ${inDir} 里 —— 上游改名了?宁可报错也不静默产出一份小词库`);
    for (const line of readFileSync(join(inDir, f), 'utf8').split('\n')) {
      const row = parseDictLine(line);
      // 同词只取第一次出现(base 先于 ext,与 rime 的 import 顺序一致)
      if (row && !seen.has(row.word)) { seen.add(row.word); rows.push(row); }
    }
  }
  const warning = minWeightWarning(minWeight);
  if (warning) console.warn(warning);
  // ⚠️ **2026-08-30 起不再按内置底库剔重** —— 真机 + 本地探针双重实锤:
  // 剔重让「似乎/我是/什么」这批**最常用**的词只剩内置库的小权重(似乎=17,983),
  // 而没被剔的词全带着 rime-ice 的 50 万量级 —— 于是**模糊匹配的「伺服」(≈25万,还带惩罚)
  // 压过精确的「似乎」**,整句里「我师傅」(双重模糊)赢过「我似乎」。
  // 剔重当时只为省 ~54k 条 / 1.5MB(27MB 里的 5%),换来的是权重体系劈成两半。
  // 两份表里都有的词,rime 合并后高权重那条主导排序 —— 这正是我们要的。
  const kept = filterEntries(rows, { minWeight, exclude: new Set() });

  // 无注音那批(见 AUTO_SOURCE_FILES 的注释)。**不与上面那批去重**:
  // 上游自述「与 base ext 没有重复」,而真有重复时 rime 合并后高权重那条主导排序,
  // 正是我们要的 —— 自己再剔一遍只会重蹈 2026-08-30 那次「剔重劈碎权重体系」。
  const autoRows = [];
  for (const f of AUTO_SOURCE_FILES) {
    if (!present.has(f)) throw new Error(`登记的无注音词表 ${f} 不在 ${inDir} 里 —— 上游改名了?宁可报错也不静默少一层词汇`);
    for (const line of readFileSync(join(inDir, f), 'utf8').split('\n')) {
      const row = parseAutoDictLine(line);
      if (row) autoRows.push(row);
    }
  }
  if (autoRows.length === 0) throw new Error('无注音词表一条都没解析出来 —— 上游换格式了?宁可报错也不静默产出半份词库');

  // Ninan 热词清单最后并入(见 [mergeHotwords]):上游已有的跳过,只补上游还没有的。
  const merged = mergeHotwords({ mainRows: kept, autoRows, hotwords });
  // 短语权重表在热词之后套(见 [applyPhraseWeights]):上游词条与热词并进来的词都能被它改权重。
  const weighted = applyPhraseWeights({ mainRows: merged.mainRows, autoRows: merged.autoRows, overrides: phraseWeights.overrides });
  const text = renderDict(weighted.mainRows, ref, credits);
  const autoText = renderAutoDict(weighted.autoRows, ref, credits);

  const manifest = manifestOf(text, ref, autoText);
  mkdirSync(outDir, {recursive: true});   // 实跑时这里 ENOENT 挂过一次:脚本从不建输出目录
  writeFileSync(join(outDir, 'hotwords.dict.yaml'), text, 'utf8');
  writeFileSync(join(outDir, 'hotwords_auto.dict.yaml'), autoText, 'utf8');
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`读入 ${rows.length} 条 → 保留 ${kept.length} 条(minWeight=${minWeight})`);
  console.log(`无注音词表 ${autoRows.length} 条(拼音由 rime 按字表自动注音)`);
  console.log(`Ninan 热词清单 ${hotwords.length} 条 → 新增 ${merged.added.length} 条`);
  if (merged.alreadyUpstream.length) {
    console.warn(`⚠️ 这些词上游已经收了,可以从清单里删掉:${merged.alreadyUpstream.join('、')}`);
  }
  const inMain = weighted.overridden.filter((o) => o.table === 'main').length;
  const lowered = weighted.overridden.filter((o) => o.to < o.from);
  console.log(`短语权重表 ${phraseWeights.overrides.length} 条 → 换了权重 ${weighted.overridden.length} 条(主表 ${inMain} / 无注音表 ${weighted.overridden.length - inMain};其中调低 ${lowered.length} 条),新增 ${weighted.added.length} 条`
    + (phraseWeights.shadowed ? `;后面的表里有 ${phraseWeights.shadowed} 条被前面的表盖住` : ''));
  if (lowered.length) {
    // 表里的数比上游还低:可能是有意压低,也可能是上游后来把这个词调高了、表里的数过时了 —— 点出来让人看一眼。
    console.warn(`⚠️ 权重表把这 ${lowered.length} 个词的权重调**低**了(有意的就不用管;上游后来调高了的话,把这一行删掉):${lowered.slice(0, 20).map((o) => `${o.word} ${o.from}→${o.to}`).join('、')}${lowered.length > 20 ? ' …' : ''}`);
  }
  if (weighted.unchanged.length) {
    console.warn(`⚠️ 权重表里这 ${weighted.unchanged.length} 个词,上游的权重本来就是这个数,可以删掉:${weighted.unchanged.slice(0, 20).join('、')}${weighted.unchanged.length > 20 ? ' …' : ''}`);
  }
  if (weighted.missing.length) {
    console.warn(`⚠️ 权重表里这 ${weighted.missing.length} 个词上游没有、又没写拼音,**没有生效**(上游删了这个词?要加新词请写上拼音,或走热词清单):${weighted.missing.slice(0, 20).join('、')}${weighted.missing.length > 20 ? ' …' : ''}`);
  }
  if (weighted.pinyinConflict.length) {
    console.warn(`⚠️ 权重表里这 ${weighted.pinyinConflict.length} 个词写的拼音与主表里的读音不一样,**没有生效**:${weighted.pinyinConflict.slice(0, 20).join('、')}${weighted.pinyinConflict.length > 20 ? ' …' : ''}`);
  }
  if (credits.length) console.log(`署名 ${credits.length} 条写进了两份产物的头注释`);
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

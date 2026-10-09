import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAutoDictLine,
  renderAutoDict,
  parseDictLine,
  filterEntries,
  renderDict,
  manifestOf,
  builtinDictPath,
  requireUpstreamRef,
  minWeightWarning,
  parseMinWeight,
  SOURCE_FILES,
  HOTWORD_WEIGHT,
  parseHotwordLine,
  mergeHotwords,
  hotwordsPath,
  loadHotwords,
  PHRASE_WEIGHT_MAX,
  parsePhraseWeightLine,
  phraseWeightsPath,
  loadPhraseWeights,
  mergePhraseWeights,
  applyPhraseWeights,
  parseCreditLines,
  mergeCredits,
} from './build-pinyin-dict.mjs';

test('parseDictLine 认 rime 的三列格式,注释与残行返回 null', () => {
  assert.deepEqual(parseDictLine('基操勿六\tji cao wu liu\t6666'),
    { word: '基操勿六', pinyin: 'ji cao wu liu', weight: 6666 });
  // 没有第三列时权重按 0 —— rime 允许省略
  assert.deepEqual(parseDictLine('内卷\tnei juan'), { word: '内卷', pinyin: 'nei juan', weight: 0 });
  assert.equal(parseDictLine('# 注释'), null);
  assert.equal(parseDictLine('---'), null);
  assert.equal(parseDictLine('没有制表符'), null);
});

test('filterEntries 按词频截断,并剔除已内置的词', () => {
  const rows = [
    { word: '内卷', pinyin: 'nei juan', weight: 900 },
    { word: '冷门', pinyin: 'leng men', weight: 10 },
    { word: '你好', pinyin: 'ni hao', weight: 9999 },
  ];
  const out = filterEntries(rows, { minWeight: 100, exclude: new Set(['你好']) });
  assert.deepEqual(out.map((e) => e.word), ['内卷']);
});

test('renderDict 产出合法的 rime 词典(带 YAML 头)', () => {
  const text = renderDict([{ word: '内卷', pinyin: 'nei juan', weight: 900 }]);
  assert.match(text, /^---\n/);
  assert.match(text, /name: hotwords\n/);
  assert.match(text, /\.\.\.\n/);
  assert.match(text, /内卷\tnei juan\t900/);
  // 不传 ref 时退回老链接,不该带 /tree/
  assert.match(text, /# 上游: https:\/\/github\.com\/iDvel\/rime-ice \(GPL-3\.0\)/);
});

test('renderDict 传 ref 时头部注释写入锁定的上游 commit', () => {
  const text = renderDict([{ word: '内卷', pinyin: 'nei juan', weight: 900 }], 'abc1234');
  assert.match(text, /# 上游: https:\/\/github\.com\/iDvel\/rime-ice\/tree\/abc1234 \(GPL-3\.0\)/);
});

test('manifestOf 的版本号只由内容决定(幂等)', () => {
  const a = manifestOf('同样的内容');
  const b = manifestOf('同样的内容');
  assert.equal(a.version, b.version);
  assert.equal(a.version.length, 8);
  assert.notEqual(manifestOf('别的内容').version, a.version);
  assert.equal(a.bytes, Buffer.byteLength('同样的内容'));
  // 不传 ref 时不产出 upstreamRef —— 保持 Task 2/3 依赖的四字段形状向后兼容
  assert.equal('upstreamRef' in a, false);
});

test('manifestOf 传 ref 时多出 upstreamRef 字段,记录锁定的 rime-ice commit', () => {
  const m = manifestOf('同样的内容', 'abc1234');
  assert.equal(m.upstreamRef, 'abc1234');
  // 其余四字段形状不受影响
  assert.equal(typeof m.version, 'string');
  assert.equal(typeof m.sha256, 'string');
  assert.equal(typeof m.bytes, 'number');
  assert.equal(typeof m.entries, 'number');
});

test('requireUpstreamRef 未传(或空白)时报错退出 —— 不接受 rime-ice 的浮动引用', () => {
  assert.throws(() => requireUpstreamRef(undefined), /--ref/);
  assert.throws(() => requireUpstreamRef(''), /--ref/);
  assert.throws(() => requireUpstreamRef('   '), /--ref/);
});

test('requireUpstreamRef 传了就原样(去空白)放行', () => {
  assert.equal(requireUpstreamRef('abc1234'), 'abc1234');
  assert.equal(requireUpstreamRef('  abc1234  '), 'abc1234');
});

test('builtinDictPath 必传 —— 忘了传要报错,不能静默不剔重', () => {
  // 忘传的后果是**静默**的:剔重不发生,产物从 833,931 条涨到 891,293 条(多出来的全是
  // 内置词库已有的重复词),而脚本照常成功、照常吐 manifest。与 --ref 同款纪律。
  assert.throws(() => builtinDictPath(), /--builtin/);
  assert.throws(() => builtinDictPath(''), /--builtin/);
  // 传了就原样用 —— 不再从脚本位置推仓库结构,这样它能**原样**搬进 GPL 公开仓库跑。
  assert.equal(builtinDictPath('vendor/pinyin_simp.dict.yaml'), 'vendor/pinyin_simp.dict.yaml');
});

/**
 * 来源白名单是**决定锁**,不是断言自己等于自己 —— 它会在有人把排除掉的词表加回来时变红,
 * 逼那个人先去读排除的理由。
 *
 * ## 41448(大字表)—— 2026-09-10 实测复核,结论仍是「不收」
 *
 * 每轮构建都会打印一次「跳过未登记的词表 41448.dict.yaml」,于是这个问题隔一阵就被重问一次。
 * 把当时量到的数字钉在这里,免得下次又从头查。
 *
 * **它是什么**:上游的生僻字全集(字来自 Unihan kMandarin、音来自汉典),46,019 条**单字-读音**
 * 对 / 40,423 个字。**全库唯一一张两列表**(无权重),我们的解析器给 0 —— 但 `sort: by_weight`
 * 下 0 是沉底,上游自己也建议「41448 殿后让生僻字自动排末尾」。
 * **所以「灌噪音」不是主要理由**(那是这条断言原来的说法,量完偏弱),真正的理由是下面两条。
 *
 * **收益极小**:端上字表 = 内置 pinyin_simp 16,472 字 + OTA 主表 8,183 字 = 17,117 字。
 * 41448 净增 23,481 字,其中扩展 B 及以上 14,263(多数设备无字体,打出来是 □)、
 * 扩展 A 5,172、CJK 基本区仅 4,046。拿真会被打的字探过一轮 —— 人名与网络热字
 * (頔玥昀甯淼焱燚婳祎彧珩琤犇骉烎龘䶮喆堃赟垚昶)**已全部覆盖**;
 * 41448 唯一能补上的常用俗字是 **囍 嫑 兲 巭 叒** 这五个。要它们的话往内置底库
 * `backend/vendor/pinyin_simp.dict.yaml` 加五行,比收整张表划算得多。
 *
 * **对自动注音零价值**(这条是被证伪的假设,不是没想过):副表那 98 万条 tencent 词没有拼音,
 * 靠 rime 按字表现推,字表缺字的词会被**静默丢弃** —— 听起来是收 41448 的硬理由。实测
 * **980,961 条里含「端上无读音的字」的是 0 条**,一条都不漏。这条路上它没有价值。
 *
 * **成本**:键盘扩展内存配额只有 ~177MB,而 librime 编词库正是最吃内存的一步;+46,019 条 ≈ +5%。
 *
 * ## tencent —— 排除的是「收进主表」,不是不收
 *
 * ⚠️ 别被这条断言误读:tencent **在发**,走 [AUTO_SOURCE_FILES] 那条无注音副表的路。
 * 这里锁住的只是「别把它塞进带拼音的主表」。
 */
test('排除的两个词表不许悄悄加回白名单', () => {
  assert.ok(!SOURCE_FILES.includes('41448.dict.yaml'),
    '41448 = 生僻字全集(净增 23,481 字,六成在扩展 B 以上、无字体);常用字与人名用字端上已全有,' +
      '它唯一能补的是 囍嫑兲巭叒 五个 —— 换键盘扩展多编 46,019 条,不划算(2026-09-10 实测,见上方注释)');
  assert.ok(!SOURCE_FILES.includes('tencent.dict.yaml'),
    'tencent 有 98 万条、权重恒 0(无排序信号),收进主表体积从 27MB 翻到 45.8MB —— ' +
      '要收先拿真机候选质量数据。注意它已在发,走 AUTO_SOURCE_FILES 的无注音副表');
});

test('base 必须排在 ext 前面 —— 顺序即优先级', () => {
  const b = SOURCE_FILES.indexOf('base.dict.yaml');
  const e = SOURCE_FILES.indexOf('ext.dict.yaml');
  assert.ok(b >= 0 && e >= 0, 'base/ext 是主词库,不许从白名单里拿掉');
  assert.ok(b < e, 'base(人工调频)必须优先于 ext(权重恒 100);原来靠 readdirSync 字母序碰巧成立,不是保证');
});

/**
 * R11 两次改判之后,`--minWeight` 成了随手可用的陷阱:它看着像「选常用词」,
 * 实际是把整个 ext 一刀切光(weight 是来源可信度层级,不是词频)。
 * 参数保留(exclude 剔重还要用它那个函数,tencent 实验也还要它),
 * 但**非 0 时必须喊**——这条测试守的就是那声喊还在不在。
 */
test('minWeightWarning:0/未传不喊,非 0 必须喊明「R11 已否决 / 实验 / 不要下发」', () => {
  assert.equal(minWeightWarning(0), null, '默认值也喊 = 每次正常跑都刷一行,喊多了等于没喊');
  assert.equal(minWeightWarning(undefined), null);
  const w = minWeightWarning(1000);
  assert.match(w, /R11/, '不点出 R11,看到的人无从知道这条路已经被否过两次');
  assert.match(w, /实验/);
  assert.match(w, /不要下发/, '最要紧的一句:这样产出的词库不能下发');
  assert.match(w, /1000/, '要把实际传进来的值回显出来');
});

/**
 * `--minWeight abc` 原来会静默产出一份**空词库**:`parseInt('abc')` 得 NaN,
 * `e.weight >= NaN` 恒为 false → 词条全过滤空,而脚本照常成功、照常吐 manifest。
 * 与 --ref / --builtin 同款纪律:非法值报错退出,不静默产出不对的东西。
 */
test('parseMinWeight:未传=0,非法值报错退出(不静默产出空词库)', () => {
  assert.equal(parseMinWeight(undefined), 0, '未传 = 不按权重截断,这是定案的默认');
  assert.equal(parseMinWeight(''), 0);
  assert.equal(parseMinWeight('0'), 0);
  assert.equal(parseMinWeight('1000'), 1000);
  assert.equal(parseMinWeight(' 1000 '), 1000);
  assert.throws(() => parseMinWeight('abc'), /--minWeight/, 'NaN 那一格正是会产出空词库的那格');
  assert.throws(() => parseMinWeight('1.5'), /--minWeight/);
  assert.throws(() => parseMinWeight('-5'), /--minWeight/);
  // ⚠️ 记录**为什么校验必须放在边界上**:告警接不住 NaN(`!NaN === true` 走的是「没传」那条),
  // 指望它兜底就等于没有闸。下面这行钉的是这个盲区本身,不是期望的行为。
  assert.equal(
    minWeightWarning(Number.parseInt('abc', 10)),
    null,
    '告警对 NaN 一声不吭 —— 所以闸只能设在 parseMinWeight,不能设在告警里',
  );
});

// ===== 无注音词表(2026-08-30) =====

test('parseAutoDictLine 只认两列', () => {
  assert.deepEqual(parseAutoDictLine('王嘉尔\t100'), { word: '王嘉尔', weight: 100 });
  // ⚠️ 三列必须拒:混进来就意味着这份文件同时有两种列结构,而 `columns:` 是文件级的,
  // rime 会把第二列(拼音)当权重解析 —— 整批词静默错位。
  assert.equal(parseAutoDictLine('王嘉尔\twang jia er\t100'), null);
  assert.equal(parseAutoDictLine('# 注释'), null);
  assert.equal(parseAutoDictLine('王嘉尔\tabc'), null);
  assert.equal(parseAutoDictLine(''), null);
});

test('renderAutoDict 必须声明 columns —— 少了它整批词被静默丢弃', () => {
  const t = renderAutoDict([{ word: '王嘉尔', weight: 100 }], 'abc123');
  // 这三行是这份文件的**全部意义**:没有 columns,rime 按默认三列解析,
  // 把 `100` 当拼音,非法拼写不报错直接丢。本地探针实测过两种情况。
  assert.ok(t.includes('columns:'), '少了 columns 声明');
  assert.ok(/columns:\n\s+- text\n\s+- weight/.test(t), 'columns 必须正好是 [text, weight]');
  assert.ok(t.startsWith('---\n'), '必须是合法 rime 词典头');
  assert.ok(t.includes('王嘉尔\t100'), '词条必须是两列');
  assert.ok(t.includes('GPL-3.0'), 'GPL 归属不能丢');
});

test('version 覆盖两个文件 —— 无注音那份单独变了也必须换版本号', () => {
  const main = renderDict([{ word: '细思极恐', pinyin: 'xi si ji kong', weight: 100 }], 'r1');
  const a = renderAutoDict([{ word: '王嘉尔', weight: 100 }], 'r1');
  const b = renderAutoDict([{ word: '王嘉尔', weight: 100 }, { word: '基操勿六', weight: 100 }], 'r1');
  const ma = manifestOf(main, 'r1', a);
  const mb = manifestOf(main, 'r1', b);
  // ⚠️ 只按主词库算版本号的话,这两个会相等 —— 客户端判「无事可做」,
  // 新词永远到不了设备,而且**完全静默**。
  assert.notEqual(ma.version, mb.version, '无注音那份变了,版本号却没变');
  // 主词库自己的摘要不受影响(客户端拿它校验主词库那次下载)
  assert.equal(ma.sha256, mb.sha256);
  assert.equal(ma.auto.entries, 1);
  assert.equal(mb.auto.entries, 2);
  assert.ok(ma.auto.sha256.length === 64);
  assert.ok(ma.auto.bytes > 0);
});

test('不传 autoText 时形状与从前逐字节兼容', () => {
  const main = renderDict([{ word: '细思极恐', pinyin: 'xi si ji kong', weight: 100 }], 'r1');
  const m = manifestOf(main, 'r1');
  assert.equal(m.auto, undefined, '老调用方不该凭空多出 auto 字段');
  assert.equal(m.version, m.sha256.slice(0, 8), '老语义:版本号 = 主词库摘要前 8 位');
});

// ===== Ninan 热词清单(2026-09-14) =====

test('parseHotwordLine:一列进无注音表,两列带拼音进主表,注释空行跳过', () => {
  assert.deepEqual(parseHotwordLine('泰裤辣'), { word: '泰裤辣' });
  assert.deepEqual(parseHotwordLine('行长\thang zhang'), { word: '行长', pinyin: 'hang zhang' });
  assert.deepEqual(parseHotwordLine('  泰裤辣  \r'), { word: '泰裤辣' });
  assert.equal(parseHotwordLine('# 2026-09 热词'), null);
  assert.equal(parseHotwordLine('   '), null);
});

test('parseHotwordLine:写坏的行必须让构建失败,不能静默丢掉', () => {
  // 静默丢 = 维护的人以为词已经上线,用户还是打不出来,而且没有任何地方会提醒。
  assert.throws(() => parseHotwordLine('city不city', 3), /第 3 行.*汉字/, '拼音方案打不出字母,收了也白收');
  assert.throws(() => parseHotwordLine('卷'), /两个以上的汉字/, '单字交给字表,不走热词');
  assert.throws(() => parseHotwordLine('行长\tHang Zhang'), /小写/);
  assert.throws(() => parseHotwordLine('行长\thang'), /音节数/, '音节对不上字数 = rime 静默丢弃这条');
  assert.throws(() => parseHotwordLine('行长\thang zhang\t100'), /两列/);
});

test('mergeHotwords:上游已有的不重复收并点名,带拼音进主表、不带进无注音表,权重取精选档', () => {
  const r = mergeHotwords({
    mainRows: [{ word: '显眼包', pinyin: 'xian yan bao', weight: 100 }],
    autoRows: [{ word: '王嘉尔', weight: 100 }],
    hotwords: [
      { word: '泰裤辣' }, { word: '显眼包' }, { word: '王嘉尔' },
      { word: '行长', pinyin: 'hang zhang' }, { word: '泰裤辣' },
    ],
  });
  assert.equal(HOTWORD_WEIGHT, 3000,
    '探针实测:100 压不过外壕(370)这类生僻同音词;高过 3333 会跟上游精选词抢平局 —— 改档位先重跑探针');
  assert.deepEqual(r.added, ['泰裤辣', '行长'], '清单里重复的只收一次');
  assert.deepEqual(r.alreadyUpstream, ['显眼包', '王嘉尔'], '上游已有的要点名,提醒从清单删掉');
  assert.deepEqual(r.mainRows.at(-1), { word: '行长', pinyin: 'hang zhang', weight: 3000 });
  assert.deepEqual(r.autoRows.at(-1), { word: '泰裤辣', weight: 3000 });
  assert.equal(r.mainRows.length, 2);
  assert.equal(r.autoRows.length, 2);
});

test('hotwordsPath 必传 —— 忘传 = 热词静默没进产物', () => {
  assert.throws(() => hotwordsPath(), /--hotwords/);
  assert.throws(() => hotwordsPath(''), /--hotwords/);
  assert.equal(hotwordsPath('dict/ninan-hotwords.txt'), 'dict/ninan-hotwords.txt');
});

test('仓库里那份清单每一行都解析得过', () => {
  const words = loadHotwords(fileURLToPath(new URL('../dict/ninan-hotwords.txt', import.meta.url)));
  assert.equal(new Set(words.map((w) => w.word)).size, words.length, '清单里有重复的词');
});

// ===== 短语权重表(2026-10-07) =====
// 起因:简拼 wjt 的首选是「为家庭」(base,13300),「我今天」(ext,权重是占位值 100)连前八都进不去。
// 词库里有这个词,只是权重不对;热词清单帮不上(上游已有的词它跳过)。所以多了一个输入:一份「词 + 权重」的表。

test('parsePhraseWeightLine:两列改权重,三列带拼音(上游没有时用来加词),注释空行跳过', () => {
  assert.deepEqual(parsePhraseWeightLine('我今天\t200000'), { word: '我今天', weight: 200000 });
  assert.deepEqual(parsePhraseWeightLine('行长\t3000\thang zhang'), { word: '行长', weight: 3000, pinyin: 'hang zhang' });
  assert.deepEqual(parsePhraseWeightLine('  我今天\t200000  \r'), { word: '我今天', weight: 200000 });
  assert.deepEqual(parsePhraseWeightLine('某某词\t0'), { word: '某某词', weight: 0 }, '0 是允许的:把一个词沉到底');
  assert.equal(parsePhraseWeightLine('# 人称 + 时间'), null);
  assert.equal(parsePhraseWeightLine('   '), null);
});

test('parsePhraseWeightLine:写坏的行必须让构建失败,不能静默丢掉', () => {
  // 静默丢 = 以为权重改了,其实没改;而产物照常发出去,没有任何地方会提醒。
  assert.throws(() => parsePhraseWeightLine('我今天', 7), /第 7 行.*两列或三列/, '只有词没有权重');
  assert.throws(() => parsePhraseWeightLine('我今天 200000'), /两列或三列/, '用空格分隔的认不出来,要 Tab');
  assert.throws(() => parsePhraseWeightLine('我今天\t二十万'), /非负整数/);
  assert.throws(() => parsePhraseWeightLine('我今天\t-5'), /非负整数/);
  assert.throws(() => parsePhraseWeightLine('我今天\t1.5'), /非负整数/);
  assert.throws(() => parsePhraseWeightLine(`我今天\t${PHRASE_WEIGHT_MAX + 1}`), /多打了几个零/, '上游最大的权重是 1926 万');
  assert.doesNotThrow(() => parsePhraseWeightLine(`我今天\t${PHRASE_WEIGHT_MAX}`));
  assert.throws(() => parsePhraseWeightLine('OK的\t100'), /汉字/);
  assert.throws(() => parsePhraseWeightLine('我\t100'), /两个以上的汉字/, '单字的权重在字表里,不走这张表');
  assert.throws(() => parsePhraseWeightLine('行长\t3000\tHang Zhang'), /小写/);
  assert.throws(() => parsePhraseWeightLine('行长\t3000\thang'), /音节数/);
  assert.throws(() => parsePhraseWeightLine('行长\t3000\thang zhang\t多一列'), /两列或三列/);
});

test('phraseWeightsPath 必传 —— 忘传 = 权重静默没覆盖', () => {
  assert.throws(() => phraseWeightsPath(), /--phrase-weights/);
  assert.throws(() => phraseWeightsPath(''), /--phrase-weights/);
  assert.equal(phraseWeightsPath('dict/phrase-weights.txt'), 'dict/phrase-weights.txt');
});

test('loadPhraseWeights:同一份表里同一个词写两次直接报错(哪一行生效说不清)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ninan-phrase-weights-'));
  try {
    const ok = join(dir, 'ok.txt');
    writeFileSync(ok, '# 注释\n我今天\t200000\n\n我们的\t200000\n');
    assert.deepEqual(loadPhraseWeights(ok), [{ word: '我今天', weight: 200000 }, { word: '我们的', weight: 200000 }]);
    const dup = join(dir, 'dup.txt');
    writeFileSync(dup, '我今天\t200000\n我们的\t200000\n我今天\t60000\n');
    assert.throws(() => loadPhraseWeights(dup), /第 3 行「我今天」.*第 1 行已经写过/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mergePhraseWeights:几份表先给的优先,后面重复的不生效、只计数', () => {
  const r = mergePhraseWeights([
    [{ word: '我今天', weight: 200000 }],
    [{ word: '我今天', weight: 6000 }, { word: '马上到', weight: 4000 }],
  ]);
  assert.deepEqual(r.overrides, [{ word: '我今天', weight: 200000 }, { word: '马上到', weight: 4000 }],
    '手写的那份放前面:同一个词以它为准,生成出来的那份重新生成时不必去避开手写的词');
  assert.equal(r.shadowed, 1);
  assert.deepEqual(mergePhraseWeights([[]]), { overrides: [], shadowed: 0 });
});

test('applyPhraseWeights:上游已有的换权重(主表、无注音表都算),条目先后不变,不动传进来的数组', () => {
  const mainRows = [
    { word: '为家庭', pinyin: 'wei jia ting', weight: 13300 },
    { word: '我今天', pinyin: 'wo jin tian', weight: 100 },
    { word: '没问题', pinyin: 'mei wen ti', weight: 103280 },
  ];
  const autoRows = [{ word: '明天早上', weight: 100 }, { word: '王嘉尔', weight: 100 }];
  const r = applyPhraseWeights({
    mainRows,
    autoRows,
    overrides: [{ word: '明天早上', weight: 200000 }, { word: '我今天', weight: 200000 }],
  });
  assert.deepEqual(r.mainRows.map((e) => `${e.word} ${e.pinyin} ${e.weight}`),
    ['为家庭 wei jia ting 13300', '我今天 wo jin tian 200000', '没问题 mei wen ti 103280']);
  assert.deepEqual(r.autoRows, [{ word: '明天早上', weight: 200000 }, { word: '王嘉尔', weight: 100 }]);
  assert.deepEqual(r.overridden, [
    { word: '我今天', table: 'main', from: 100, to: 200000 },
    { word: '明天早上', table: 'auto', from: 100, to: 200000 },
  ]);
  assert.deepEqual([r.added, r.missing, r.pinyinConflict, r.unchanged], [[], [], [], []]);
  assert.equal(mainRows[1].weight, 100, '传进来的数组被改了');
  assert.equal(autoRows[0].weight, 100, '传进来的数组被改了');
});

test('applyPhraseWeights:上游没有的词 —— 带拼音的加进主表最后,不带的不加、点名', () => {
  const r = applyPhraseWeights({
    mainRows: [{ word: '为家庭', pinyin: 'wei jia ting', weight: 13300 }],
    autoRows: [{ word: '王嘉尔', weight: 100 }],
    overrides: [{ word: '新造的词', weight: 60000, pinyin: 'xin zao de ci' }, { word: '没有的词', weight: 60000 }],
  });
  assert.deepEqual(r.added, ['新造的词']);
  assert.deepEqual(r.mainRows.at(-1), { word: '新造的词', pinyin: 'xin zao de ci', weight: 60000 });
  assert.deepEqual(r.missing, ['没有的词'], '上游没有、又没写拼音:不加(多音字靠引擎自动注音会注错),要点名');
  assert.equal(r.mainRows.length, 2);
  assert.equal(r.autoRows.length, 1, '不带拼音的不许悄悄塞进无注音表');
});

test('applyPhraseWeights:拼音与主表里的读音不一样 → 不生效并点名;一样的照常换;权重本来就是这个数的也点名', () => {
  const r = applyPhraseWeights({
    mainRows: [
      { word: '行长', pinyin: 'hang zhang', weight: 50370 },
      { word: '我今天', pinyin: 'wo jin tian', weight: 100 },
      { word: '没问题', pinyin: 'mei wen ti', weight: 103280 },
    ],
    autoRows: [],
    overrides: [
      { word: '行长', weight: 900, pinyin: 'xing chang' },
      { word: '我今天', weight: 200000, pinyin: 'wo jin tian' },
      { word: '没问题', weight: 103280 },
    ],
  });
  assert.deepEqual(r.pinyinConflict, ['行长'], '把权重套到另一个读音上比不生效更糟');
  assert.equal(r.mainRows[0].weight, 50370);
  assert.equal(r.mainRows.length, 3, '读音对不上时不另加一条(同一个词两个读音各一条权重,排序就说不清了)');
  assert.equal(r.mainRows[1].weight, 200000);
  assert.deepEqual(r.unchanged, ['没问题'], '上游的权重本来就是这个数:这一行可以删了,要提醒');
  assert.deepEqual(r.overridden.map((o) => o.word), ['我今天']);
});

test('applyPhraseWeights:读音对不上的词在无注音表里碰巧也有 —— 那边照换,但冲突照样点名', () => {
  const r = applyPhraseWeights({
    mainRows: [{ word: '行长', pinyin: 'hang zhang', weight: 50370 }],
    autoRows: [{ word: '行长', weight: 100 }],
    overrides: [{ word: '行长', weight: 900, pinyin: 'xing chang' }],
  });
  assert.deepEqual(r.pinyinConflict, ['行长'], '写的人想改的是主表里那一条;不点名的话他会以为改到了');
  assert.equal(r.mainRows[0].weight, 50370);
  assert.equal(r.autoRows[0].weight, 900);
  assert.deepEqual(r.added, []);
});

test('applyPhraseWeights:未指定读音只调主读音，明确拼音可单独调恢复的其他读音', () => {
  const mainRows = [
    { word: '朝阳', pinyin: 'chao yang', weight: 255010 },
    { word: '朝阳', pinyin: 'zhao yang', weight: 198365 },
  ];
  const plain = applyPhraseWeights({ mainRows, autoRows: [], overrides: [{ word: '朝阳', weight: 300000 }] });
  assert.deepEqual(plain.mainRows.map(row => row.weight), [300000, 198365]);
  const explicit = applyPhraseWeights({ mainRows, autoRows: [], overrides: [{ word: '朝阳', pinyin: 'zhao yang', weight: 300000 }] });
  assert.deepEqual(explicit.mainRows.map(row => row.weight), [255010, 300000]);
  assert.deepEqual(explicit.pinyinConflict, []);
  assert.deepEqual(mainRows.map(row => row.weight), [255010, 198365]);
});

test('applyPhraseWeights:空表时词表原样返回 —— 产物与没有这一步时逐字节相同', () => {
  const mainRows = [{ word: '为家庭', pinyin: 'wei jia ting', weight: 13300 }, { word: '我今天', pinyin: 'wo jin tian', weight: 100 }];
  const autoRows = [{ word: '王嘉尔', weight: 100 }];
  const r = applyPhraseWeights({ mainRows, autoRows, overrides: [] });
  assert.equal(renderDict(r.mainRows, 'r1'), renderDict(mainRows, 'r1'));
  assert.equal(renderAutoDict(r.autoRows, 'r1'), renderAutoDict(autoRows, 'r1'));
});

test('仓库里那份权重表每一行都解析得过:只有两列、权重在四档之内', () => {
  const hand = loadPhraseWeights(fileURLToPath(new URL('../dict/phrase-weights.txt', import.meta.url)));
  assert.ok(hand.length > 0, '手写的起步表不该是空的');
  assert.ok(hand.length <= 1000, '手写的表是「几百条以内」:再多就不是人看得过来的了,长尾交给另一份');
  for (const row of hand) {
    assert.equal(row.pinyin, undefined, `${row.word}:起步表只收上游已有的词,不带拼音(要加新词走热词清单)`);
    assert.ok([500000, 200000, 60000, 20000].includes(row.weight), `${row.word}:权重 ${row.weight} 不在四档之内(档位与依据见那份表的头注释)`);
  }
});

// 署名随产物走(2026-10-07):地名表、日常短语表用了别人的公开数据,其中有的许可要求署名。
// 下发到设备上的是产物,不是仓库里那几张表,所以署名要进产物的头注释。
test('parseCreditLines / mergeCredits:认「# 署名:」开头的行,按先后去重;冒号后面是空的要报错', () => {
  assert.deepEqual(parseCreditLines('# 表头\n# 署名:甲数据(MIT)\n我今天\t200000\n# 署名: 乙数据(CC BY)\n'), ['甲数据(MIT)', '乙数据(CC BY)']);
  assert.deepEqual(parseCreditLines('# 普通注释里提到署名:不算\n我今天\t200000\n'), []);
  assert.throws(() => parseCreditLines('# 署名:\n'), /第 1 行.*要写内容/);
  assert.deepEqual(mergeCredits([['甲'], ['乙', '甲'], []]), ['甲', '乙']);
});

test('renderDict / renderAutoDict:有署名就写进头注释(仍在 `...` 之前),没有时头注释一个字节都不变', () => {
  const rows = [{ word: '内卷', pinyin: 'nei juan', weight: 900 }];
  const plain = renderDict(rows, 'r1');
  assert.equal(renderDict(rows, 'r1', []), plain);
  const credited = renderDict(rows, 'r1', ['甲数据(MIT)', '乙数据(CC BY)']);
  assert.equal(credited, plain.replace('# 本产物同样按 GPL-3.0 授权。\n', '# 本产物同样按 GPL-3.0 授权。\n# 另含:甲数据(MIT)\n# 另含:乙数据(CC BY)\n'));
  assert.ok(credited.indexOf('# 另含:甲数据') < credited.indexOf('\n...\n'), '署名要在 YAML 头里,不能落到词条区');
  assert.equal(manifestOf(credited, 'r1').entries, 1, '署名行不算词条');
  const autoRows = [{ word: '王嘉尔', weight: 100 }];
  const autoPlain = renderAutoDict(autoRows, 'r1');
  assert.equal(renderAutoDict(autoRows, 'r1', []), autoPlain);
  assert.ok(renderAutoDict(autoRows, 'r1', ['甲数据(MIT)']).includes('# 本产物同样按 GPL-3.0 授权。\n# 另含:甲数据(MIT)\n...\n'));
});

test('仓库里三份表的署名:地名表署 THUOCL 与行政区划,日常短语表署 Tatoeba,手写的权重表不带署名', () => {
  const read = (name) => readFileSync(fileURLToPath(new URL(`../dict/${name}`, import.meta.url)), 'utf8');
  const place = parseCreditLines(read('place-names.txt'));
  assert.ok(place.some((c) => /THUOCL/.test(c) && /MIT/.test(c)), '地名表的权重用了 THUOCL 的词频(MIT)');
  assert.ok(place.some((c) => /Administrative-divisions-of-China/.test(c)), '地名取自行政区划数据');
  assert.ok(parseCreditLines(read('everyday-phrases.txt')).some((c) => /Tatoeba/.test(c) && /CC BY 2\.0 FR/.test(c)),
    'everyday-phrases.txt 里有照 Tatoeba 例句挑的短语(CC BY 2.0 FR 要求署名)');
  // 手写的权重表是按常识写的;对照 Tatoeba 补的那 345 条权重(2026-10-07)量下来不值得,没有收进来 —— 所以它不该带 Tatoeba 的署名,
  // 也不该有任何一行数据出自例句。哪天真往里放了有出处的内容,把对应的署名行和这条断言一起改。
  assert.deepEqual(parseCreditLines(read('phrase-weights.txt')), []);
  // 三份并起来:同一句署名只出现一次
  const all = mergeCredits(['phrase-weights.txt', 'everyday-phrases.txt', 'place-names.txt'].map((n) => parseCreditLines(read(n))));
  assert.equal(all.length, new Set(all).size);
  assert.equal(all.filter((c) => /Tatoeba/.test(c)).length, 1);
});

test('仓库里另外两份表(日常短语、地名)也读得进去,三份之间手写的那份说了算', () => {
  const load = (name) => loadPhraseWeights(fileURLToPath(new URL(`../dict/${name}`, import.meta.url)));
  const hand = load('phrase-weights.txt');
  const everyday = load('everyday-phrases.txt');
  const places = load('place-names.txt');
  const merged = mergePhraseWeights([hand, everyday, places]);
  assert.equal(merged.overrides.length + merged.shadowed, hand.length + everyday.length + places.length);
  // 手写的表里的词,权重以手写的为准(哪怕生成出来的地名表里也有)
  const byWord = new Map(merged.overrides.map((o) => [o.word, o.weight]));
  for (const row of hand) assert.equal(byWord.get(row.word), row.weight, row.word);
});

/** 一份极小的上游目录 + 两份输入,真跑一遍 main(),看产物。 */
function runBuild(dir, extraArgs) {
  const cn = join(dir, 'cn_dicts');
  mkdirSync(cn, { recursive: true });
  const head = (name) => `---\nname: ${name}\nversion: "1"\nsort: by_weight\n...\n`;
  writeFileSync(join(cn, 'base.dict.yaml'), `${head('base')}为家庭\twei jia ting\t13300\n忘记他\twang ji ta\t6475\n`);
  writeFileSync(join(cn, 'ext.dict.yaml'), `${head('ext')}我今天\two jin tian\t100\n`);
  writeFileSync(join(cn, '8105.dict.yaml'), `${head('8105')}我\two\t29569261\n`);
  writeFileSync(join(cn, 'others.dict.yaml'), head('others'));
  writeFileSync(join(cn, 'tencent.dict.yaml'), `${head('tencent')}明天早上\t100\n王嘉尔\t100\n`);
  writeFileSync(join(dir, 'builtin.dict.yaml'), head('pinyin_simp'));
  writeFileSync(join(dir, 'hotwords.txt'), '# 空清单\n');
  const out = join(dir, 'out');
  const r = spawnSync(process.execPath, [
    fileURLToPath(new URL('./build-pinyin-dict.mjs', import.meta.url)),
    '--in', cn, '--out', out, '--ref', 'abc1234', '--builtin', join(dir, 'builtin.dict.yaml'), '--hotwords', join(dir, 'hotwords.txt'),
    ...extraArgs,
  ], { encoding: 'utf8' });
  const read = (name) => { try { return readFileSync(join(out, name), 'utf8'); } catch { return null; } };
  return { r, main: read('hotwords.dict.yaml'), auto: read('hotwords_auto.dict.yaml'), manifest: read('manifest.json') };
}

test('真跑一遍:不传 --phrase-weights 报错退出、不产出;空表不改产物;两份表先给的优先', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ninan-dict-build-'));
  try {
    const none = runBuild(join(dir, 'none'), []);
    assert.equal(none.r.status, 1);
    assert.match(none.r.stderr, /必须用 --phrase-weights/);
    assert.equal(none.main, null, '报错退出时不该留下产物');

    const emptyTable = join(dir, 'empty.txt');
    writeFileSync(emptyTable, '# 只有注释\n');
    const empty = runBuild(join(dir, 'empty'), ['--phrase-weights', emptyTable]);
    assert.equal(empty.r.status, 0, empty.r.stderr);
    assert.match(empty.main, /^我今天\two jin tian\t100$/m);
    assert.match(empty.r.stdout, /短语权重表 0 条/);

    const hand = join(dir, 'hand.txt');
    const lm = join(dir, 'lm.txt');
    writeFileSync(hand, '我今天\t200000\n没有的词\t60000\n');
    writeFileSync(lm, '我今天\t6000\n明天早上\t4000\n');
    const both = runBuild(join(dir, 'both'), ['--phrase-weights', hand, '--phrase-weights', lm]);
    assert.equal(both.r.status, 0, both.r.stderr);
    assert.match(both.main, /^我今天\two jin tian\t200000$/m, '手写的那份(先给的)优先');
    assert.match(both.main, /^为家庭\twei jia ting\t13300$/m, '表里没有的词不动');
    assert.match(both.auto, /^明天早上\t4000$/m, '无注音表里的词也能改');
    assert.match(both.auto, /^王嘉尔\t100$/m);
    assert.match(both.r.stdout, /换了权重 2 条\(主表 1 \/ 无注音表 1;其中调低 0 条\)/);
    assert.match(both.r.stdout, /后面的表里有 1 条被前面的表盖住/);
    assert.match(both.r.stderr, /没有的词/, '上游没有、又没写拼音的要在日志里点名');
    // 行数与先后都不变:只有那两行的权重不一样。
    assert.equal(both.main.replace('200000', '100'), empty.main);
    assert.equal(both.auto.replace('4000', '100'), empty.auto);
    assert.notEqual(JSON.parse(both.manifest).version, JSON.parse(empty.manifest).version, '权重变了,版本号必须跟着变(否则到不了设备)');

    // 表里写了署名行:进两份产物的头注释;没写的(上面那几次)头注释里没有「另含」
    assert.doesNotMatch(both.main, /另含/);
    const credited = join(dir, 'credited.txt');
    writeFileSync(credited, '# 署名:某某公开数据(CC BY)\n我今天\t200000\n');
    const withCredit = runBuild(join(dir, 'credit'), ['--phrase-weights', credited, '--phrase-weights', lm]);
    assert.equal(withCredit.r.status, 0, withCredit.r.stderr);
    assert.ok(withCredit.main.includes('# 本产物同样按 GPL-3.0 授权。\n# 另含:某某公开数据(CC BY)\n...\n'), withCredit.main.slice(0, 400));
    assert.ok(withCredit.auto.includes('# 另含:某某公开数据(CC BY)\n...\n'), withCredit.auto.slice(0, 400));
    assert.match(withCredit.r.stdout, /署名 1 条写进了两份产物的头注释/);

    const lower = join(dir, 'lower.txt');
    writeFileSync(lower, '为家庭\t50\n');
    const lowered = runBuild(join(dir, 'lower'), ['--phrase-weights', lower]);
    assert.equal(lowered.r.status, 0, lowered.r.stderr);
    assert.match(lowered.r.stderr, /调\*\*低\*\*了.*为家庭 13300→50/, '把上游的权重调低要点名(可能是上游后来调高了、表里的数过时了)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 与 build-pinyin-emoji.test.mjs 里那条同源(见其注释):主程序判断不触发 = **exit 0 + 零输出**,
// 与「跑了、没事可做」是同一个信号。这里不喂输入,只断言 main() 真的跑起来了 ——
// 不带参数时它会打用法并 exit 1;守卫要是没触发,得到的会是 exit 0 + 一个字都没有。
// 变异验证(2026-09-07):守卫改回 `=== resolve(process.argv[1] ?? '')` → 本条红(status 0、stderr 空)。
test('带空格 / 经软链的目录里 spawn 也会真跑 main()(不是静默 exit 0、零输出)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ninan dict guard '));
  assert.ok(dir.includes(' '), '临时目录名必须含空格,否则这条测试什么也没验');
  try {
    const script = join(dir, 'build-pinyin-dict.mjs');
    copyFileSync(fileURLToPath(new URL('./build-pinyin-dict.mjs', import.meta.url)), script);
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(r.status, 1, `退出码应为 1(打用法),实为 ${r.status}`);
    assert.match(r.stderr, /用法: node scripts\/build-pinyin-dict\.mjs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('CLI 按词和读音去重，保留多音词/单字的全部读音，并维持同读音的来源优先级', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ninan-reading-dedup-'));
  try {
    const input = join(tmp, 'cn_dicts');
    const out = join(tmp, 'out');
    mkdirSync(input);
    const header = '---\nname: fixture\n...\n';
    const data = {
      'base.dict.yaml': '熟悉\tshou xi\t500469\n熟悉\tshu xi\t500469\n',
      'ext.dict.yaml': '熟悉\tshu xi\t100\n',
      '8105.dict.yaml': '行\thang\t2756706\n行\txing\t2756706\n',
      'others.dict.yaml': '行\txing\t1\n',
      'tencent.dict.yaml': '公开热词\t100\n',
    };
    for (const [name, body] of Object.entries(data)) writeFileSync(join(input, name), header + body);
    const builtin = join(tmp, 'builtin.yaml');
    const hotwords = join(tmp, 'hotwords.txt');
    const weights = join(tmp, 'weights.txt');
    writeFileSync(builtin, header + '熟悉\tshu xi\t1\n');
    writeFileSync(hotwords, '# 空清单\n');
    writeFileSync(weights, '# 空表\n');
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('./build-pinyin-dict.mjs', import.meta.url)),
      '--in', input, '--out', out, '--ref', '1234567', '--builtin', builtin,
      '--hotwords', hotwords, '--phrase-weights', weights], {encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr);
    const rows = readFileSync(join(out, 'hotwords.dict.yaml'), 'utf8').split('\n').map(parseDictLine).filter(Boolean);
    assert.deepEqual(rows, [
      {word: '熟悉', pinyin: 'shou xi', weight: 500469},
      {word: '熟悉', pinyin: 'shu xi', weight: 500469},
      {word: '行', pinyin: 'hang', weight: 2756706},
      {word: '行', pinyin: 'xing', weight: 2756706},
    ]);
  } finally { rmSync(tmp, {recursive: true, force: true}); }
});

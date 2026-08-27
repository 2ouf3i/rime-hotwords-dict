import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDictLine,
  filterEntries,
  renderDict,
  manifestOf,
  builtinDictPath,
  requireUpstreamRef,
  SOURCE_FILES,
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
 * 逼那个人先去读排除的理由(权重恒 0 = 没有排序信号 / 体积翻倍换一堆排不上前的词)。
 */
test('排除的两个词表不许悄悄加回白名单', () => {
  assert.ok(!SOURCE_FILES.includes('41448.dict.yaml'),
    '41448 是全字符集生僻单字(𠼞/𥥩/㑸)、权重恒 0,加回来等于往候选里灌噪音');
  assert.ok(!SOURCE_FILES.includes('tencent.dict.yaml'),
    'tencent 有 98 万条、权重恒 0(无排序信号),体积从 27MB 翻到 45.8MB —— 要收它先拿真机候选质量数据');
});

test('base 必须排在 ext 前面 —— 顺序即优先级', () => {
  const b = SOURCE_FILES.indexOf('base.dict.yaml');
  const e = SOURCE_FILES.indexOf('ext.dict.yaml');
  assert.ok(b >= 0 && e >= 0, 'base/ext 是主词库,不许从白名单里拿掉');
  assert.ok(b < e, 'base(人工调频)必须优先于 ext(权重恒 100);原来靠 readdirSync 字母序碰巧成立,不是保证');
});

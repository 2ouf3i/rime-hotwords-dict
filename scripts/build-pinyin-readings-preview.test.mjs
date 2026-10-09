import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreReadings} from './build-pinyin-readings-preview.mjs';
import {manifestOf, SOURCE_FILES} from './build-pinyin-dict.mjs';

const ref = 'da1fbe602e38f26db846fa10120ee64c2b0324c0';
const main = '---\nname: hotwords\n...\n熟悉\tshou xi\t500469\n行\thang\t2756706\n动态热词\tdong tai re ci\t3000\n';
const auto = '---\nname: hotwords_auto\ncolumns: [text, weight]\n...\n热词\t3000\n';
const sources = [
  '熟悉\tshou xi\t500469\n熟悉\tshu xi\t500469\n行\thang\t2756706\n',
  '熟悉\tshu xi\t100\n新词\txin ci\t100\n',
  '行\txing\t2756706\n',
  '行\txing\t1\n',
].map((text, i) => ({name: SOURCE_FILES[i], text}));
const fixture = {main, auto, baseline: manifestOf(main, ref, auto), sources, sourceRef: ref};

test('恢复词和单字的另一个读音，同时保留原行、动态热词与副表的每个字节', () => {
  const result = restoreReadings(fixture);
  assert.equal(result.main, main + '熟悉\tshu xi\t500469\n行\txing\t2756706\n');
  assert.equal(result.auto, auto);
  assert.equal(result.manifest.auto.sha256, fixture.baseline.auto.sha256);
  assert.equal(result.manifest.entries, fixture.baseline.entries + 2);
  assert.equal(result.metadata.newWordForms, 0);
  assert.equal(result.metadata.restoredCharacterReadings, 1);
  assert.notEqual(result.manifest.version, fixture.baseline.version);
});
test('相同词不同读音都保留，相同词相同读音取优先来源，重复执行不再追加', () => {
  const result = restoreReadings(fixture);
  assert.equal(result.additions[0].weight, 500469);
  const again = restoreReadings({...fixture, main: result.main, baseline: result.manifest});
  assert.equal(again.main, result.main);
  assert.equal(again.additions.length, 0);
});
test('拒绝错版本、损坏快照、残缺或错顺序原表，不能把未证实的数据写成修复', () => {
  assert.throws(() => restoreReadings({...fixture, sourceRef: 'other'}), /版本/);
  assert.throws(() => restoreReadings({...fixture, main: main + '损坏'}), /摘要/);
  assert.throws(() => restoreReadings({...fixture, auto: auto + '损坏'}), /摘要/);
  assert.throws(() => restoreReadings({...fixture, sources: sources.slice(1)}), /来源/);
  assert.throws(() => restoreReadings({...fixture, sources: [...sources].reverse()}), /来源/);
  assert.throws(() => restoreReadings({...fixture, sources: sources.map((s, i) => i === 1 ? {...s, text: '# 空'} : s)}), /有效词条/);
});

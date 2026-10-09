import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appendPreview} from './build-pinyin-preview.mjs';
import {manifestOf} from './build-pinyin-dict.mjs';

const main='---\nname: hotwords\nsort: by_weight\n...\n测试\tce shi\t100\n';
const auto='---\nname: hotwords_auto\n...\n动态热词\t3000\n';
const baseline=manifestOf(main,'da1fbe602e38f26db846fa10120ee64c2b0324c0',auto);
const fixture={main,auto,baseline,table:'试验\t50\tshi yan\n'};
test('追加试验保留基准每个字节和动态热词，摘要与新增版本绑定',()=>{
  const result=appendPreview(fixture);
  assert.equal(result.main,main+'试验\tshi yan\t50\n');
  assert.equal(result.auto,auto);
  assert.notEqual(result.manifest.version,baseline.version);
  assert.equal(result.manifest.auto.sha256,baseline.auto.sha256);
  assert.equal(result.manifest.entries,baseline.entries+1);
  assert.equal(result.metadata.existingRowsChanged,0);
});
test('摘要不符、空表、重复词及已有主副表词不能被覆盖',()=>{
  assert.throws(()=>appendPreview({...fixture,main:main+'篡改'}),/摘要不符/);
  assert.throws(()=>appendPreview({...fixture,auto:auto+'篡改'}),/摘要不符/);
  for(const table of ['# 空表','试验\t50\tshi yan\n试验\t2000\tshi yan','测试\t50\tce shi','动态热词\t50\tdong tai re ci']){
    assert.throws(()=>appendPreview({...fixture,table}));
  }
});
test('省略拼音和错误读音格式拒绝追加',()=>{
  for(const table of ['试验\t50','试验\t50\tshi','试验\t50\tSHI YAN'])assert.throws(()=>appendPreview({...fixture,table}));
});
test('核查表只有独立的两档权重，849条，无重复或残缺读音',()=>{
  const text=readFileSync(new URL('../dict/chat-phrases-preview.txt',import.meta.url),'utf8');
  const result=appendPreview({...fixture,table:text});
  const rows=result.main.slice(main.length).trim().split('\n').map(l=>l.split('\t'));
  assert.equal(rows.length,849);
  assert.equal(rows.filter(r=>r[2]==='50').length,507);
  assert.equal(rows.filter(r=>r[2]==='2000').length,342);
  assert.ok(rows.every(r=>r[0].length>=3&&r[0].length<=5));
});

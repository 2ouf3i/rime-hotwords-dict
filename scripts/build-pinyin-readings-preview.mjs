#!/usr/bin/env node
/**
 * 私人读音修复试验：从同一版雾凇原表补回构建时丢掉的「词 + 拼音」。
 * 只追加已有词的其他读音；旧主表和动态热词字节保留，副表不变。
 * 不发布、不写缓存、不改客户端的输入路径。
 * node backend/scripts/build-pinyin-readings-preview.mjs --baseline <快照> --upstream <cn_dicts> --out <新目录>
 */
import {readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseDictLine, manifestOf, SOURCE_FILES} from './build-pinyin-dict.mjs';

const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const keyOf = row => JSON.stringify([row.word, row.pinyin]);

export function restoreReadings({main, auto, baseline, sources, sourceRef}) {
  if (sha(main) !== baseline.sha256 || sha(auto) !== baseline.auto?.sha256) throw new Error('基准快照摘要不符');
  if (!sourceRef || sourceRef !== baseline.upstreamRef) throw new Error('雾凇原表版本与基准不一致');
  if (!main.endsWith('\n')) throw new Error('基准主表缺少结尾换行');
  const names = sources.map(s => s.name);
  if (names.length !== SOURCE_FILES.length || names.some((name, i) => name !== SOURCE_FILES[i])) throw new Error('原表必须按来源优先级完整提供');
  const original = main.split('\n').map(parseDictLine).filter(Boolean);
  const words = new Set(original.map(row => row.word));
  const known = new Set(original.map(keyOf));
  const additions = [];
  const sourceHashes = [];
  const sourceCounts = {};
  for (const {name, text} of sources) {
    sourceHashes.push({name, sha256: sha(text)});
    let count = 0;
    for (const line of text.split('\n')) {
      const row = parseDictLine(line);
      if (!row) continue;
      count++;
      const key = keyOf(row);
      if (!words.has(row.word) || known.has(key)) continue;
      // 词和读音原样来自同一版上游；不是重新猜音或增加新词。
      known.add(key);
      additions.push({...row, source: name});
    }
    if (!count) throw new Error(`原表没有有效词条：${name}`);
    sourceCounts[name] = count;
  }
  const text = main + additions.map(row => `${row.word}\t${row.pinyin}\t${row.weight}\n`).join('');
  return {
    main: text, auto, manifest: manifestOf(text, sourceRef, auto), additions,
    metadata: {
      scope: '私人读音修复试验，未发布', baselineVersion: baseline.version,
      baselineSha256: baseline.sha256, baselineAutoSha256: baseline.auto.sha256,
      sourceRef, sourceHashes, sourceCounts, restoredReadings: additions.length,
      restoredWords: new Set(additions.map(r => r.word)).size,
      restoredCharacterReadings: additions.filter(r => [...r.word].length === 1).length,
      existingRowsChanged: 0, newWordForms: 0, autoChanged: false,
    },
  };
}

function main(args) {
  const usage = '用法：--baseline <快照> --upstream <cn_dicts> --out <不存在的新目录>';
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return; }
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (!['baseline', 'upstream', 'out'].includes(key) || values[key] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(usage);
    values[key] = args[i + 1];
  }
  if (!values.baseline || !values.upstream || !values.out) throw new Error(usage);
  // 输出必须是新目录，连经符号链接覆盖现用数据的机会也不留。
  if (existsSync(values.out)) throw new Error('输出目录已存在，不能覆盖快照或现用数据');
  const read = path => readFileSync(path, 'utf8');
  const sourceRef = execFileSync('git', ['-C', values.upstream, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const sources = SOURCE_FILES.map(name => ({name, text: read(join(values.upstream, name))}));
  // 版本相同但工作区被改过也不算原表。
  for (const {name, text} of sources) {
    const committed = execFileSync('git', ['-C', values.upstream, 'show', `${sourceRef}:cn_dicts/${name}`], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
    if (sha(text) !== sha(committed)) throw new Error(`原表有未提交改动：${name}`);
  }
  const result = restoreReadings({main: read(join(values.baseline, 'hotwords.dict.yaml')),
    auto: read(join(values.baseline, 'hotwords_auto.dict.yaml')),
    baseline: JSON.parse(read(join(values.baseline, 'manifest.json'))), sources, sourceRef});
  mkdirSync(values.out, {recursive: true});
  writeFileSync(join(values.out, 'hotwords.dict.yaml'), result.main);
  writeFileSync(join(values.out, 'hotwords_auto.dict.yaml'), result.auto);
  writeFileSync(join(values.out, 'manifest.json'), JSON.stringify(result.manifest, null, 2) + '\n');
  writeFileSync(join(values.out, 'preview-metadata.json'), JSON.stringify(result.metadata, null, 2) + '\n');
  writeFileSync(join(values.out, 'restored-readings.json'), JSON.stringify(result.additions, null, 2) + '\n');
  console.log(JSON.stringify({...result.metadata, version: result.manifest.version}));
}
let invoked = ''; try { invoked = realpathSync(resolve(process.argv[1] ?? '')); } catch { /* imported */ }
if (fileURLToPath(import.meta.url) === invoked) { try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; } }

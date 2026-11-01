# 多语言审核输入

继续维护先读 [词库长期入口](../../../docs/lexicon-maintenance.md) 和 [本批交接](../../../docs/handoff/2026-11-01-multilingual-lexicon.md)。本目录是审核输入，不是运行时下载目录；数据加入仓库不等于已发布。

| 文件 | 含义 | 合入位置 |
|---|---|---|
| `english-20261101.tsv` | 108 个自拟词形与频率建议，30 新词、69 调权、9 不变 | 已并入 `scripts/english-modern-words.tsv`，生成 iOS / 安卓英文表及中英混输小表 |
| `zhuyin-20261101.tsv` | 62 个词形和带声调注音，2 个已存在，新增 60 | `build-zhuyin-dict.mjs --phrases`，不改旧权重 |
| `next-ja.tsv` | 60 个日语前文的自然接续，直接拼接 | `build-japanese-next.mjs --curated` |
| `next-ko.tsv` | 47 个韩语前词的自然接续，键盘补空格 | `build-next-words.mjs --lang ko --curated` |
| `next-vi.tsv` | 64 个越南语前词的自然接续，保留声调和音节间空格 | `build-next-words.mjs --lang vi --curated` |
| `pinyin-20261101-review.txt` | 259 条原始审词草稿，含已存在或暂缓项 | 不能整表导入；采用项在上层 `lexicon-fusion-round12-preview.txt` |

审核接续格式为 `前词<TAB>后词1 后词2 …`，1–8 个后词，不为凑数补满。只覆盖审核键，未列出的行不变。
韩语与越南语每个值须在既有词表内、通过屏蔽表；越南语不把多个音节拼成一个假词。
日语允许最长 16 字的完整礼貌词块；原始统计仍按原来 8 字门槛。审核顺序是 Ninan 的编辑决定，不能冒充来源频次。

没有原语料时，可在已冻结、校验过的基准表上运行：

```sh
node scripts/letter-words/apply-curated-next.mjs \
  --base <基准 next.txt> --curated backend/dict/multilingual/next-ko.tsv \
  --lang ko --out <新 next.txt> --report <变更.json>
```

改动随包数据时，iOS 和安卓必须一致；日语、注音由安卓 Gradle 从 Apple 目录打包，英文和韩越是两份镜像。
构建完成后运行对应 Node 检查和实际 Swift / Kotlin 查询核对，中文词音另跑 librime 候选与学习回归。
完整重建要显式带审核文件，否则会丢掉这一层；本批提供冻结基准和复现脚本。

这些是离线数据维护，不改变按键查询算法。增加组字、纠错或查询规则仍须遵守手感规则，不能借补词直接接入。

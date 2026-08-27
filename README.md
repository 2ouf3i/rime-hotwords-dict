# rime-hotwords-dict

一份给 [RIME](https://rime.im) 输入法用的拼音热词库,以及生成它的脚本。

**本仓库按 [GPL-3.0](LICENSE) 授权** —— 因为产物派生自
[rime-ice 雾凇拼音](https://github.com/iDvel/rime-ice)(GPL-3.0)。
公开它不是可选项,是我们能使用这份词库的前提。

## 这是什么

`hotwords.dict.yaml` 是一份 [RIME](https://rime.im) 格式的拼音词库,
由 `scripts/build-pinyin-dict.mjs` 从 rime-ice 的 `cn_dicts/` 生成。
把它作为附加词表(`import_tables`)导入,补齐内置词库缺失的现代词汇 ——
常见的场景是内置词库年代久远(比如派生自 2009 年的 AOSP PinyinIME),
「内卷」「躺平」「嘴替」「细思极恐」这类词一个都打不出来。

产物本体在 [Releases](../../releases) 里(约 27 MB,不入 git 历史)。

## 怎么复现

```bash
git clone --depth 1 https://github.com/iDvel/rime-ice.git
git -C rime-ice checkout <上游 commit>          # 见产物 manifest.json 的 upstreamRef
node scripts/build-pinyin-dict.mjs \
  --in rime-ice/cn_dicts --out out \
  --builtin vendor/pinyin_simp.dict.yaml --ref <上游 commit>
```

产物是**确定性**的:版本号取内容 SHA256 前 8 位,同样的输入必然得到同样的 `version`。

## 选了哪些上游词表,为什么

管线**按来源白名单选,不按权重阈值选**。

rime-ice `cn_dicts/` 六个文件的权重画像完全不同:

| 文件 | 条数 | 性质 | 权重 |
|---|---|---|---|
| `base.dict.yaml` | 543,012 | 词,人工调频 | 1..9999(最常见是 1) |
| `ext.dict.yaml` | 339,151 | 日常更新的新词 | **恒 100** |
| `8105.dict.yaml` | 8,757 | 通用规范汉字(单字) | 有梯度 |
| `others.dict.yaml` | 633 | 零碎补充 | 多为 0 |
| `41448.dict.yaml` | 46,019 | 全字符集生僻单字 | **恒 0** |
| `tencent.dict.yaml` | 981,095 | 腾讯词向量词表 | **恒 0** |

也就是说 **weight 标的是「来源可信度层级」,不是词频**。任何单一 `minWeight`
阈值的真实语义都是「切掉某几个文件」,与词常不常用无关 —— 我们一开始用
「体积/条数拐点」定阈值,结果把「绝绝子」(权重 107)和「嘴替」(权重 **7**)切掉了,
而它们正是这份词库要解决的那类词。

所以改成显式白名单 `[base, ext, 8105, others]`(顺序即优先级)。
排除 `41448`(生僻单字,纯噪音)与 `tencent`(98 万条、无排序信号、体积翻倍)。
数字阈值能*碰巧*近似实现来源选择,但上游哪天给 tencent 调一次权重,语义就会**静默**改变。

## 归属与许可

- 上游数据:[rime-ice](https://github.com/iDvel/rime-ice),**GPL-3.0**。本产物是其派生作品,
  同样按 GPL-3.0 授权。
- `vendor/pinyin_simp.dict.yaml` 派生自 [AOSP PinyinIME](https://android.googlesource.com/platform/packages/inputmethods/PinyinIME/),
  **Apache-2.0**。管线用它来剔重(内置词库已有的词不重复下发),不是产物的一部分。
- 生成脚本(`scripts/`)按 GPL-3.0 授权。

详见 [NOTICE.md](NOTICE.md)。

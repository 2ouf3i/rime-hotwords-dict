# 韩语 / 越南语联想词表、下一个词表与表情关键词的第三方归属

本目录(安卓 `apps/android/app/src/main/assets/letterwords/` 是逐字节相同的一份)里的六份数据都是生成物,别手改:

| 文件 | 上游 | 授权 | 生成脚本 |
|---|---|---|---|
| `korean.dict.txt` | FrequencyWords `content/2018/ko/ko_50k.txt` | CC BY-SA 4.0 | `scripts/letter-words/build-letter-wordlist.mjs --lang ko` |
| `vietnamese.dict.txt` | FrequencyWords `content/2018/vi/vi_50k.txt` | CC BY-SA 4.0 | `scripts/letter-words/build-letter-wordlist.mjs --lang vi` |
| `korean.next.txt` | OPUS OpenSubtitles v2018 单语语料(ko) | 见第三节(要求引用) | `scripts/letter-words/build-next-words.mjs --lang ko` |
| `vietnamese.next.txt` | OPUS OpenSubtitles v2018 单语语料(vi) | 见第三节(要求引用) | `scripts/letter-words/build-next-words.mjs --lang vi` |
| `emoji_keywords_ko.txt` | Unicode CLDR 49.0.0 表情关键词(ko) | Unicode License v3 | `scripts/emoji-keywords/build-emoji-keywords.mjs --lang ko` |
| `emoji_keywords_vi.txt` | Unicode CLDR 49.0.0 表情关键词(vi) | Unicode License v3 | `scripts/emoji-keywords/build-emoji-keywords.mjs --lang vi` |

(本文件叫 `NOTICE-LetterWords.md` 而不是 `NOTICE.md`:iOS 键盘目录是文件夹同步,资源拍平进包,`NOTICE.md` 会和 `English/NOTICE.md` 重名。)

## 一、韩语 / 越南语词频(FrequencyWords)

**hermitdave/FrequencyWords** —— <https://github.com/hermitdave/FrequencyWords>

- 提交:`525f9b560de45753a5ea01069454e72e9aa541c6`(2022-02-07)
- 文件与下载时的 SHA-256:
  - `content/2018/ko/ko_50k.txt` —— `8d00401b6728c8d6feeaa5455583c1a33408dd020aae4aa55609b25004d1d99d`
  - `content/2018/vi/vi_50k.txt` —— `3f5b112e4324136c2ba82d3151038607e3dd1dfa0911c226929d7544cc11adf3`
- 署名:**FrequencyWords by Hermit Dave**(Copyright (c) 2016 Hermit Dave)
- 授权:上游 README 写明「MIT License for code. CC-by-sa-4.0 for content.」—— 词频表属于 content,按
  **Creative Commons Attribution-ShareAlike 4.0 International(CC BY-SA 4.0)**:
  <https://creativecommons.org/licenses/by-sa/4.0/>(法律文本 <https://creativecommons.org/licenses/by-sa/4.0/legalcode>)
- 数据来历:上游用 OPUS 的 OpenSubtitles 2018 语料统计(<http://opus.nlpl.eu/OpenSubtitles2018.php>;
  P. Lison and J. Tiedemann, 2016, *OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV Subtitles*, LREC 2016;
  字幕来自 <http://www.opensubtitles.org/>)。

### 我们做了什么转换

上游每行 `{词} {出现次数}`。两种语言共同:

1. 统一写法:NFC(韩语把拆开的初中终声字母合回音节块;越南语把「字母 + 组合声调符号」合成预组合字),越南语再转小写。
2. 统一写法之后相同的词并成一条,出现次数相加(上游越南语表里约 2,600 行是同一个词的拆开写法,例如 `là` 有预组合与 `a + U+0300` 两种)。
3. 剔掉粗口:屏蔽表是我们自己写的 `scripts/letter-words/blocklist-ko.txt` / `blocklist-vi.txt`(不取第三方的表)。
   韩语对确凿的粗口词根按前缀剔(`씨발…`、`병신…`),其余按整词;越南语一律按整词(`lồng`、`cặp` 这类近形词不受影响)。
4. 按出现次数降序(同次数按码点序),最多留 30,000 条;输出 `词<TAB>出现次数`,文件头 `#` 注释写来源、授权与改动。

韩语:只留整串都是谚文音节(U+AC00–U+D7A3)的词,1–8 个字(兼容字母 `ㅋㅋ`、汉字、拉丁字母、数字一律不收)。

越南语:

- 只留由越南语字母组成的词:辅音 b c d đ g h k l m n p q r s t v x,元音 a ă â e ê i o ô ơ u ư y 及其五种声调形式;
  **f j w z 不收**(越南语本身不用这四个字母);必须含元音;1–7 个字母。
- 再过一道越南语音节检查:声母只认越南语的(b c ch d đ g gh gi h k kh l m n ng ngh nh p ph qu r s t th tr v x 或零声母),
  韵母只认越南语正字法里有的那一套(我们自己按正字法写的韵母表,在脚本的 `VI_RHYMES`);声调至多一个,
  c / ch / p / t 收尾只配锐声或重声;守 c / k、g / gh、ng / ngh 的拼写分工;声调不许标在 gi / qu 的那个字母上。
  只按字母表过滤时收下 27,832 条,其中约 19,000 条是字幕里的英文与人名(`okay`、`york`、`peter`、`you`、`dean` …),
  这一道把它们剔掉,`the`、`ba`、`cho`、`con` 这类越南语里真有的音节留着;`ok` / `ko` 这类聊天写法也随之剔掉。
  要拿只按字母表过滤的结果,脚本加 `--no-syllable-check`。

### 相同方式共享

`korean.dict.txt` 与 `vietnamese.dict.txt` 是上述数据的**改编作品**,这两份文件按 **CC BY-SA 4.0** 提供
(署名同上;改动即本节所列)。

## 二、表情关键词(Unicode CLDR)

**Unicode CLDR** —— <https://cldr.unicode.org/>,JSON 版 **unicode-org/cldr-json** <https://github.com/unicode-org/cldr-json>

- 版本:release tag `49.0.0`(提交 `a4b67247b446fd51b475991017a2481911210c60`)
- 文件与下载时的 SHA-256:
  - `cldr-json/cldr-annotations-full/annotations/ko/annotations.json` —— `a5c9ee589b657a0252a4d951bbe2df6d2b8e95a8a24e12a152629ce055f7b5fa`
  - `cldr-json/cldr-annotations-derived-full/annotationsDerived/ko/annotations.json` —— `8e70f4aa18defa6c7124f6329f61b530bdc0a027bc969bb69bd0cbd1082df24e`
  - `cldr-json/cldr-annotations-full/annotations/vi/annotations.json` —— `76881dfc7dce10be23076ce502f5303ca07c4b146804206301152dae52c6ae19`
  - `cldr-json/cldr-annotations-derived-full/annotationsDerived/vi/annotations.json` —— `d28796666cdd7e977b2b9dca44337589ec9945538a811da3e415564b7c291e96`
- 授权:Unicode License v3(原文见下)。

### 我们做了什么转换

1. 每个表情的关键词 = CLDR 的 `default` 关键词 + `tts` 名称;NFC、去首尾空白,越南语转小写;整个被一对引号包着的剥掉引号(`"가능"` → `가능`)。
2. 不收的关键词:「类别: 细节」式的合成名(`가족: 성인, 아이`、`gia đình: người lớn`、旗帜的「깃발: 일본」)、剥完外层仍带引号的、
   一个字母或数字都没有的(`!`、`÷`)、超过 12 个字的。
3. 关键词里任何一个词在上面那两份粗口屏蔽表里的不收(同一套判据)。
4. 只收 Ninan 表情面板目录(`emoji-catalog.json`)里有的表情,不收肤色变体;输出用目录里的完整写法(带 U+FE0F)。
5. 按关键词聚合成 `关键词<TAB>表情1 表情2 …`,每个关键词最多 5 个表情。先后:常用词先按我们自己写的手工先后表
   `scripts/emoji-keywords/priority-ko.txt` / `priority-vi.txt`(几十个高频词,如 사랑 / tim → ❤️;表里有、CLDR 没有的词也补进去),
   其次是关键词正好等于 tts 名称的那个表情,其余按目录先后;按关键词码点序输出,文件头 `#` 注释写来源、授权与改动。

### Unicode License v3(原文)

```
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 2015-2024 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.

SPDX-License-Identifier: Unicode-3.0
```

## 三、下一个词表(OPUS OpenSubtitles 2018)

2026-11-01：在统计表上合并 Ninan 自拟并审核的日常接续（`backend/dict/multilingual/next-ko.tsv`、`next-vi.tsv`）。
只调整列出的前词及其顺序，保留其他行、原始来源和许可；审核项不是字幕出现次数。
完整重建时给上述生成脚本传 `--curated <相应 TSV>`，或用 `scripts/letter-words/apply-curated-next.mjs` 合并。

**OPUS** —— <https://opus.nlpl.eu/> 的 OpenSubtitles v2018 单语语料(一行一句电影 / 电视字幕原文)。

- 文件与下载时的 SHA-256:
  - <https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/ko.txt.gz> —— `19492a2b41ce6f3b0de0b14cf2d5868ebda98cece4daf968c03b15ab46bfb89e`(2,308,308 行)
  - <https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/vi.txt.gz> —— `1aae9970414129b76a4be17dd55f0b9ec6156c1ca0d7a6ec4bee852f453ae2a1`(5,126,239 行)
- 引用(OPUS 要求使用这份语料时注明):P. Lison and J. Tiedemann, 2016,
  *OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV Subtitles*,
  Proceedings of the 10th International Conference on Language Resources and Evaluation(LREC 2016)。
- 字幕来自 <http://www.opensubtitles.org/>。

### 我们做了什么转换

**原始统计层只有词对(前词 → 最常跟在后面的几个词)，不含原文句子；人工审核层见本节开头。**

1. 逐行读语料,按空白切;每个片段去掉两头的标点和符号,统一写法(NFC,越南语再转小写)。
2. 前后两个词都要在本目录的 `korean.dict.txt` / `vietnamese.dict.txt` 里(那两份已经剔了粗口,这里再过一遍粗口屏蔽表)。
3. 只数同一行里紧挨着的两个词;词的两头带了标点或符号(, . ! ? … 引号、括号、破折号之类)就在那里断开,中间夹着一个不在词表里的词也断开。
4. 一对至少出现 3 次,且出现在至少 3 个不同的块里(语料按每 5000 行切块;同一部片子的字幕是连续的行,这一条剔掉只在一两部片子里出现的人名与专有说法);
   前词作为前词一共至少出现 10 次;后词不等于前词;每个前词留出现最多的 8 个后词(次数相同按码点序)。
5. 输出 `前词<TAB>后词1 后词2 …`(按次数从多到少),前词按 Unicode 码点升序;文件头 `#` 注释写来源、SHA-256、门槛与条数。

## 合规待办

- app 内「开源许可」页要列出:FrequencyWords(Hermit Dave,CC BY-SA 4.0,附许可链接与「已改编」说明)、Unicode CLDR(Unicode License v3 全文),
  以及 OPUS OpenSubtitles 2018(上面那条引用与 opensubtitles.org 链接)。
- CC BY-SA 4.0 的「相同方式共享」:我们的理解是它管的是上面两份改编出来的词表(要按 CC BY-SA 4.0 提供、不得附加限制条款),
  不延及读取它们的代码与其余数据;这一条是 agent 的理解,未经法务确认。

## Ninan 第二批日常审核（2026-11-01）

韩语统计基线的 30,000 词及原权重保留，另加 36 个 Ninan 自拟日常／现代词；审核输入为 `backend/dict/multilingual/korean-20261101-round2.tsv`，用 `scripts/letter-words/apply-curated-words.mjs` 叠加。补充权重是编辑值，不是字幕次数。韩语／越南语的审核接续分别在 `next-ko.tsv`／`next-vi.tsv`，只覆盖其中明确列出的键；不改未审核行。原始来源及上述许可继续保留。

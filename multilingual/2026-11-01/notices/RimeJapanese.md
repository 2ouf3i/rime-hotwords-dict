# 日语词典的来源与许可

本目录里的 `ninan_japanese.schema.yaml` 是日语九键(假名)键盘的引擎方案,我们自己写的(由 `scripts/japanese/gen-japanese-schema.mjs` 生成)。
词典 `ninan_japanese.dict.yaml` **不随包**:用户加了「假名」键盘之后从 Ninan 的服务器下载。它是 Mozc 开源词典的改编。

## ninan_japanese.dict.yaml

- 词条(读音、写法、代价)与品词连接代价取自 **Mozc** 的开源词典 `src/data/dictionary_oss/`:
  上游 `https://github.com/google/mozc`,提交 `c4b2aef7c65e61be394bacadaec200eb5b97f91c`。
- 怎么改编的:`scripts/japanese/build-japanese-dict.mjs` —— 品词连接按平稳分布折进每个词的权重(Rime 没有品词);
  同一读音同一写法合并;去掉「拆开组句明显更好」的整串词条;按折算后的代价留前 30 万条;读音换成键盘的两字母码。
  另加了我们自己写的记号候选(`scripts/japanese/symbols.tsv`)。
- Mozc 开源词典的词汇基本同 IPAdic(mecab-ipadic-2.7.0-20070801),大量条目源自 ICOT Free Software,另用了沖縄辞書(Public Domain)。
  按各自的条款,下面三段原样附上。

### Mozc

```
Copyright 2010-2018, Google Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

  * Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above
    copyright notice, this list of conditions and the following disclaimer
    in the documentation and/or other materials provided with the
    distribution.
  * Neither the name of Google Inc. nor the names of its
    contributors may be used to endorse or promote products derived from
    this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### IPAdic / ICOT(原文,取自 Mozc `src/data/dictionary_oss/README.txt`)

```
IPAdic is licensed as follows:

Copyright 2000, 2001, 2002, 2003 Nara Institute of Science
and Technology.  All Rights Reserved.

Use, reproduction, and distribution of this software is permitted.
Any copy of this software, whether in its original form or modified,
must include both the above copyright notice and the following
paragraphs.

Nara Institute of Science and Technology (NAIST),
the copyright holders, disclaims all warranties with regard to this
software, including all implied warranties of merchantability and
fitness, in no event shall NAIST be liable for
any special, indirect or consequential damages or any damages
whatsoever resulting from loss of use, data or profits, whether in an
action of contract, negligence or other tortuous action, arising out
of or in connection with the use or performance of this software.

A large portion of the dictionary entries
originate from ICOT Free Software.  The following conditions for ICOT
Free Software applies to the current dictionary as well.

Each User may also freely distribute the Program, whether in its
original form or modified, to any third party or parties, PROVIDED
that the provisions of Section 3 ("NO WARRANTY") will ALWAYS appear
on, or be attached to, the Program, which is distributed substantially
in the same form as set out herein and that such intended
distribution, if actually made, will neither violate or otherwise
contravene any of the laws and regulations of the countries having
jurisdiction over the User or the intended distribution itself.

NO WARRANTY

The program was produced on an experimental basis in the course of the
research and development conducted during the project and is provided
to users as so produced on an experimental basis.  Accordingly, the
program is provided without any warranty whatsoever, whether express,
implied, statutory or otherwise.  The term "warranty" used herein
includes, but is not limited to, any warranty of the quality,
performance, merchantability and fitness for a particular purpose of
the program and the nonexistence of any infringement or violation of
any right of any third party.

Each user of the program will agree and understand, and be deemed to
have agreed and understood, that there is no warranty whatsoever for
the program and, accordingly, the entire risk arising from or
otherwise connected with the program is assumed by the user.

Therefore, neither ICOT, the copyright holder, or any other
organization that participated in or was otherwise related to the
development of the program and their respective officials, directors,
officers and other employees shall be held liable for any and all
damages, including, without limitation, general, special, incidental
and consequential damages, arising out of or otherwise in connection
with the use or inability to use the program or any product, material
or result produced or otherwise obtained by using the program,
regardless of whether they have been advised of, or otherwise had
knowledge of, the possibility of such damages at any time during the
project or thereafter.  Each user will be deemed to have agreed to the
foregoing by his or her commencement of use of the program.  The term
"use" as used herein includes, but is not limited to, the use,
modification, copying and distribution of the program and the
production of secondary products from the program.

In the case where the program, whether in its original form or
modified, was distributed or delivered to or received by a user from
any person, organization or entity other than ICOT, unless it makes or
grants independently of ICOT any specific warranty to the user in
writing, such person, organization or entity, will also be exempted
from and not be held liable to the user for any such damages as noted
above as far as the program is concerned.
```

### 沖縄辞書(原文)

```
Okinawa dictionary is licensed as follows

Public Domain Dataです。使用・変更・配布に関しては一切の制限をつけません。
商品などに組み込むことも自由に行なってください。すでにいくつかの辞書には沖縄辞書が採用されています。
勝手ながら、沖縄辞書に寄贈された辞書も in the Public Domain' 扱いとさせていただきます。
```

## ninan_emoji_ja.txt(表情关键词)

假名候选后面追加表情用的 OpenCC 文本词典(`词<TAB>词 表情1 表情2 …`,每行第一个值是词本身 —— 原候选还在、表情追加在后面,
与中文那份 `ninan_emoji.txt` 同一种写法)。OpenCC 的文本词典不认 `#` 注释,所以来源与授权写在这里。

- 上游:**Unicode CLDR** 表情关键词 —— **unicode-org/cldr-json** <https://github.com/unicode-org/cldr-json>,
  release tag `49.0.0`(提交 `a4b67247b446fd51b475991017a2481911210c60`)
- 文件与下载时的 SHA-256:
  - `cldr-json/cldr-annotations-full/annotations/ja/annotations.json` —— `e42dacabf2eee0aab36c168c995efeaf8add896f8940c5ee86a809d85c2816e7`
  - `cldr-json/cldr-annotations-derived-full/annotationsDerived/ja/annotations.json` —— `3d83cf7e4093f7fe77055dc21b1a3a65cd8f48a0249127552d58d3b058dbe4cd`
- 生成:`scripts/emoji-keywords/build-emoji-keywords.mjs --lang ja … --opencc-out …`。
  关键词 = CLDR 的 `default` 关键词 + `tts` 名称;NFC、去首尾空白,整个被一对引号包着的剥掉引号;不收「类别: 细节」式的合成名
  (`家族: 大人二人と子供一人`、`旗: 日本`)、剥完仍带引号的、一个字母或数字都没有的(`!`、`〒♪&%`)、超过 12 个字的、带空白的(OpenCC 拿空格切值);只收 Ninan 表情面板目录里有的表情,
  不收肤色变体;同一个词下先按我们自己写的手工先后表 `scripts/emoji-keywords/priority-ja.txt`(ハート → ❤️、猫 → 🐱 这类高频词,
  表里有、CLDR 没有的词也补进去),其次是关键词正好等于 tts 名称的那个表情,其余按目录先后,**每个词只挂前 2 个表情**
  (Rime 会把值里的表情全部插在候选后面,挂多了会把别的候选挤远);按关键词码点序输出。
- 授权:Unicode License v3,原文如下。

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

## ninan_japanese.next.txt(下一个词表)

2026-11-01：在统计表上合并 Ninan 自拟并审核的日常接续（`backend/dict/multilingual/next-ja.tsv`）。
只调整列出的键及顺序，保留其他行；审核项不是字幕频次。审核值可为最长 16 字的完整礼貌词块，
下述 8 字门槛仍用于原始语料统计。完整重建时传 `--curated <审核 TSV>`，或用 `scripts/letter-words/apply-curated-next.mjs` 合并。

上屏一个候选之后接着出的联想(`键<TAB>值1 值2 …`,ありがとう → ございます、今日 → は)。

- 语料:**OPUS** <https://opus.nlpl.eu/> 的 OpenSubtitles v2018 日语单语语料
  <https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/ja.txt.gz>,
  下载时的 SHA-256 `95bdfba5e350366b2b52051a12cde50b4ec4b76c52aa5390dda894fd5f662485`(3,170,155 行,全部用上)。
- 引用(OPUS 要求使用这份语料时注明):P. Lison and J. Tiedemann, 2016,
  *OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV Subtitles*,
  Proceedings of the 10th International Conference on Language Resources and Evaluation(LREC 2016)。字幕来自 <http://www.opensubtitles.org/>。
- 切词用的是上面那份 **Mozc** 开源词典(同一个提交 `c4b2aef7c65e61be394bacadaec200eb5b97f91c`)的词条与连接代价,授权见上文 Mozc / IPAdic / 沖縄辞書三段。
- **原始统计层只有词对，不含原文句子；人工审核层见本节开头。**
- 生成:`scripts/japanese/build-japanese-next.mjs`。逐行去掉对白破折号,在空白与标点处断开;每段用 Mozc 词典 + 连接代价求最短路切词
  (整句寒暄词条如「ありがとうございます」不用,让它按小词切开);助動詞、非自立的動詞 / 形容詞、接尾辞、接続助詞「て / で」并进前一块,
  接頭詞与后一个词并块,其余助詞单独成块;计「词 → 所在块剩下的部分或下一块」与「两个词以上的块 → 下一块」两种词对。
  门槛:一对至少 3 次,且出现在至少 3 个不同的块里(语料按每 5000 行切块,剔掉只在一两部片子里出现的人名与专有说法);
  键至少 10 次;值不等于键、不是纯数字 / 标点 / 拖长音、不超过 8 个字;每个键最多 8 个值。键统一成 NFC + 小写(大小写不同的合并,值不动),
  按 Unicode 码点升序。

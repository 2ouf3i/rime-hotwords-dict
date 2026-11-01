# 注音词典的来源与许可

本目录里的 `ninan_zhuyin.dict.yaml` 是注音键盘(繁體中文)的词典,随键盘扩展打包;
`ninan_zhuyin.schema.yaml` 是我们自己写的引擎方案(由 `scripts/zhuyin/gen-zhuyin-schema.mjs` 生成)。

## ninan_zhuyin.dict.yaml

2026-11-01：另补 Ninan 自拟日常表达及人工核对的注音（`backend/dict/multilingual/zhuyin-20261101.tsv`），
新增 60 个词音、独立权重 100，不更改既有词音或词频。逐字读音须能在上述小麦注音来源中找到，
词义和多音字仍单独核对。完整重建时给生成脚本传 `--phrases <审核 TSV>`；来源摘要写在词典头部。

- 词条与词频取自 **小麦注音(McBopomofo)** 的词库,是它的改编:
  上游 `https://github.com/openvanilla/McBopomofo`,提交 `be6564acad6c4d3265c34a2e1a872d80f9db6068`,目录 `Source/Data/`
  (`BPMFMappings.txt`、`BPMFBase.txt`、`phrase.occ`、`heterophony1.list` ~ `heterophony3.list`、`exclusion.txt`)。
- 怎么改编的:`scripts/zhuyin/build-zhuyin-dict.mjs`(换成拼音引擎的词典格式;按上游的算法由词频算权重;
  「臺」统一成「台」;算法与上游不同的地方写在那个脚本的文件头)。每个源文件的 sha256 写在词典文件的头部。
- 小麦注音的词表最初取自 libtabe 的 `tsi.src`(上游数据目录的 README 原话:
  "Originally simplified from tsi.src of libtabe (BSD Licensed) with modifications")。

下面两份许可声明照原文抄录(2026-10-05 读取:第一份出自上面那个提交的 `LICENSE.txt`;第二份出自 libtabe 0.2.6 的
`tsi-src/COPYING`,经 Debian 源码归档 `sources.debian.org` 的 `libtabe 0.2.6-1.2` 取得。原文里的拼写原样保留)。

### McBopomofo — MIT License

```
MIT License

Copyright (c) 2011-2026 Mengjuei Hsieh et al.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### libtabe(tsi.src)— BSD License

```
/*
 * Copyrighy (c) 1999 TaBE Project.
 * Copyright (c) 1999 Pai-Hsiang Hsiao.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * . Redistributions of source code must retain the above copyright
 *   notice, this list of conditions and the following disclaimer.
 * . Redistributions in binary form must reproduce the above copyright
 *   notice, this list of conditions and the following disclaimer in
 *   the documentation and/or other materials provided with the
 *   distribution.
 * . Neither the name of the TaBE Project nor the names of its
 *   contributors may be used to endorse or promote products derived
 *   from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
 * FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * REGENTS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/*
 * Copyright (c) 1999 Computer Systems and Communication Lab,
 *                    Institute of Information Science, Academia Sinica.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * . Redistributions of source code must retain the above copyright
 *   notice, this list of conditions and the following disclaimer.
 * . Redistributions in binary form must reproduce the above copyright
 *   notice, this list of conditions and the following disclaimer in
 *   the documentation and/or other materials provided with the
 *   distribution.
 * . Neither the name of the Computer Systems and Communication Lab
 *   nor the names of its contributors may be used to endorse or
 *   promote products derived from this software without specific
 *   prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
 * FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * REGENTS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 */

Copyright 1996 Chih-Hao Tsai @ Beckman Institute, University of Illinois
c-tsai4@uiuc.edu  http://casper.beckman.uiuc.edu/~c-tsai4
```

## 没随包的

方案里写着一个语言模型的名字(`ninan_grammar_hant`)。模型文件**不在安装包里**,运行时经 OTA 下发(2026-10-14 起),
只有键盘列表里有「繁體中文」的人才下,不在时注音照常出字。

- 来源:https://github.com/lotem/rime-octagram-data `hant` 分支提交 `97bf55046aad163c3d1881abae5312040b1bbed9` 的
  `zh-hant-t-essay-bgw.gram`(41,415,724 字节,sha256 `0488ebd6688f900a39200f2b794f2f99bcbf1e8fc27280ae4a2324b08b1559c1`)
- 许可证:LGPL-3.0。**逐字节原样转发**,只改文件名(落盘名 `ninan_grammar_hant.gram`);出处同时写在词库清单的
  `grammarHant.source` 里随数据下发。换一个同名的 `.gram` 放到同一个位置即生效。
- 下发与合规的写法见 `docs/dict-ota-gpl-compliance.md`「2026-10-14 繁体语言模型」一节。

## 这份声明要跟着什么一起改

- 换上游提交 / 重新生成词典:改这里的提交号,并核对上游 `LICENSE.txt` 的版权行有没有变;
- 安卓把这份词典打进安装包时(注音第 3 期):同样的声明要进安卓那边的归属文件。
- App 里还没有给用户看的「开源许可」页;MIT 与 BSD 都要求声明随副本出现,现在靠这份随包文件。要不要在「关于」里加一页,
  见设计文档 `docs/superpowers/specs/2026-10-05-zhuyin-keyboard-design.md` 第 9 节。

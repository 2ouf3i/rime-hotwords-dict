# 英文补全词表的第三方归属

本目录下的 `english.dict.txt` 由 `scripts/build-english-wordlist.mjs` 从下述上游转换而来。

## 上游

**AOSP LatinIME 英文词表** —— `packages/inputmethods/LatinIME/dictionaries/en_wordlist.combined.gz`
<https://android.googlesource.com/platform/packages/inputmethods/LatinIME/+/master/dictionaries/>

```
Copyright (c) 2008, The Android Open Source Project

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

许可证依据:该包根 `NOTICE` 文件明载上述文本,`dictionaries/` 目录下无独立许可文件,受包根覆盖。

## 与 `rime/` 那份 GPL 词库的关键区别

⚠️ **这份是 Apache-2.0,不是 GPL,因此可以直接打进安装包。**
`rime/` 下的 rime-ice 衍生词库是 GPL-3.0,按 `docs/dict-ota-gpl-compliance.md` 的处置**只走 OTA、不随包分发**;
英文这份没有那条约束,随包即可,不必建 OTA 链路。两者别混为一谈。

## 我们做了什么转换

1. 解析 ` word=X,f=N,flags=...` 行,取 `word` 与 `f`(0–222 的**对数**词频)。
2. **剔除带 `offensive` 标记的词**(实测 191 条,含 `nonword:offensive` / `offensive:nonword` 两条复合形式)。
   ⚠️ 注意标记名是 `offensive` 而不是 `possibly_offensive` —— 后者在这份表里实测**一条都没有**。
3. 剔除 `nonword`(键盘序列这类非英语词)。
4. 剔除非纯 ASCII 字母的词(撇号词 `don't`、连字符词、含数字的词),与两端引擎的 `isPlainWord` 同口径。
5. 剔除 `f < 1` 的词(实测 369 条,排序上永远垫底)。
6. 保留**原始大小写**(专名 `American` 靠它),按小写字母序输出 `word<TAB>freq`。

产物:**134,334 条 / 1.59 MB**。上游共 165,544 行。

## 已知短板

上游数据冻结在 **2014-10-31**。实测缺 `wifi` / `covid` / `crypto` / `selfie` / `blockchain` / `github` / `iphone` / `vlog`。
补现代词要另建一份补丁表 —— **自己写的词表是自有版权,零许可负担**,别再从别处抄。

## 合规待办

app 内「开源许可」页要列出上述 Apache-2.0 全文与版权行。

---

## 现代词补丁(Ninan 自有)

`scripts/english-modern-words.tsv` 是本项目自己写的现代词表(词与频率均自拟),
由构建脚本并入上面那份主表。**它不含任何第三方内容,不适用上面的 Apache-2.0 条款**,
列在这里只是为了说明随包词表不是单一来源。

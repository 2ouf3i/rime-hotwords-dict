# 第三方组件与许可

## rime-ice(雾凇拼音)—— GPL-3.0

- 来源:https://github.com/iDvel/rime-ice
- 用途:`hotwords.dict.yaml` 的**全部词条数据**来自其 `cn_dicts/` 下的
  `base` / `ext` / `8105` / `others` 四份词表。
- 许可:GNU General Public License v3.0。

本仓库的产物是 rime-ice 的**派生作品**,因此:

1. 产物与生成脚本一并按 **GPL-3.0** 授权(见 `LICENSE`);
2. 每份产物文件头部都写明上游仓库与**锁定的 commit**;
3. 产物的 `manifest.json` 带 `upstreamRef` 字段,记录该 commit。

⚠️ 使用固定 commit 而非浮动的 `main`,是为了让归属声明指向一个**确定的**上游状态 ——
否则「派生自哪一版」这句话没有意义,复现也无从谈起。

## AOSP PinyinIME —— Apache-2.0

- 来源:https://android.googlesource.com/platform/packages/inputmethods/PinyinIME/
- 文件:`vendor/pinyin_simp.dict.yaml`(经 RIME 社区转换为 `.dict.yaml` 格式)
- 用途:**仅用于剔重** —— 生成时把内置词库已有的词从产物里排除,避免重复下发(用 `--builtin <path>` 指定)。
  它本身不是产物的组成部分。
- 许可:Apache License 2.0。

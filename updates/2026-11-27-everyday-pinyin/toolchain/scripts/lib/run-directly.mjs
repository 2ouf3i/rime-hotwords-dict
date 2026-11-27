// 判断「这个脚本是被直接运行的(node scripts/xxx.mjs),还是被自测 / 别的脚本 import 的」。
// scripts/ 下带 main 的脚本都用这一个函数,不要各写各的:
//
//     import {isRunDirectly} from './lib/run-directly.mjs';
//     …
//     if (isRunDirectly(import.meta.url)) {
//       process.exitCode = main(process.argv.slice(2));
//     }
//
// ⚠️ 为什么不能自己拿 process.argv[1] 去比(2026-10-06 以前 scripts/ 下 24 个脚本都是那样写的):
// node 给 import.meta.url 的是**解开符号链接之后**的真实路径,而 process.argv[1] 是命令行上写的那个路径
// (只补成绝对路径,不解符号链接)。仓库放在带符号链接的路径下、又用绝对路径去调脚本时,两边对不上 ——
// main 不执行,**什么都不打印,退出码 0**,和「检查通过」是同一个信号。
//   - macOS 的 /tmp、/var 就是这种路径(指向 /private/…),临时检出常放在那里;
//   - 发布 / 部署脚本里写的是 `node "$ROOT_DIR/scripts/…"`,ROOT_DIR 来自 `pwd`,带着符号链接。
//   (在仓库里用相对路径调 —— `node scripts/xxx.mjs`、`npm run gates` —— 不受影响:node 拿当前目录的真实路径去补全。)
// 直接比 URL 字符串(`import.meta.url === \`file://${process.argv[1]}\``)还多一个坑:路径里的空格、中文会被编成 %xx。
// 所以两边都先化成真实路径再比。
//
// 自测:scripts/run-directly.test.mjs —— 它同时扫 scripts/ 与 backend/scripts/ 下每个脚本的入口写法,
// 并把用这个函数的脚本逐个经符号链接路径跑一遍。
//
// backend/scripts/ 下的脚本**不 import 这个文件**:后端部署只带 backend/ 目录,词库同步还会把其中几个
// 单独拷到镜像目录里跑(scripts/sync-pinyin-dict-local.sh 的 MIRROR_FILES)。那边用同一个意思的内联写法,
// 见 backend/scripts/build-pinyin-dict.mjs 末尾。
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

/**
 * @param {string} moduleUrl 调用方自己的 `import.meta.url`
 * @param {string} [invokedPath] 命令行上的脚本路径。平时不传(就是 process.argv[1]),只有自测才传
 * @returns {boolean}
 */
export function isRunDirectly(moduleUrl, invokedPath = process.argv[1]) {
  // 忘了传、或者传成了路径:当场报错。要是悄悄当成「不是直接运行」,那就又是一个什么都不打印、退出码 0 的脚本。
  if (typeof moduleUrl !== 'string' || !moduleUrl.startsWith('file:')) {
    throw new TypeError('isRunDirectly 要传调用方自己的 import.meta.url:isRunDirectly(import.meta.url)');
  }
  if (!invokedPath) return false; // node -e、交互模式:没有脚本路径
  try {
    return fs.realpathSync(invokedPath) === fs.realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false; // 路径不存在(例如从标准输入读脚本时 process.argv[1] 是 "-")
  }
}

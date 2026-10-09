#!/usr/bin/env node
// backend/scripts/gen-place-names.mjs
/**
 * 生成地名表 `backend/dict/place-names.txt`:构建拼音词库时与短语权重表一起套在上游词条上
 * (backend/scripts/build-pinyin-dict.mjs 的 `--phrase-weights`,可以给多次;这一份排在手写的那份后面)。
 *
 * 为什么要有它(2026-10-07 量到的):上游 rime-ice 的地名基本来自清华 THUOCL 的地名词库(4.4 万条里有 4 万条在 base 层,
 * 其中 3.4 万条的权重就等于 THUOCL 的频次),但口头说的**简称**缺得厉害 —— 县一级 2624 个简称里有 846 个整个词库都没有
 * (高邮、德清、霞浦、南浔、硚口、黄陂 …,它们的全称「高邮市」「德清县」倒是在);另有一批简称在 base 里的权重只有 1 ~ 3
 * (桐庐 1、番禺 2、株洲 2,而 THUOCL 给它们的频次是两千到两万)。乡镇街道一级 2.7 万个简称里有 1.9 万个没有。
 * 没有整词时引擎只能逐字造句,生僻字的地名(甪直、车陂)根本拼不出来。
 *
 * ── 用到的公开数据(**都不进仓库**,自己下载后用参数指过来;脚本会核对 sha256,对不上只提醒、不拦)──
 *   --thuocl   THUOCL_diming.txt   清华大学开放中文词库(THUOCL)地名词库,https://github.com/thunlp/THUOCL(data/THUOCL_diming.txt)
 *              许可:MIT(仓库的 LICENSE;README 写明可用于商业)。约 4.4 万行「词<Tab>文档频次」,带 BOM,行分隔是单个 \r。
 *              sha256 ca5574399da5750a2c36dc373f36e31a66ed1f8a4b21646df6ca44ec0b888d89
 *   --areas    areas.json          https://github.com/modood/Administrative-divisions-of-China(dist/areas.json)
 *   --streets  streets.json        同上(dist/streets.json)。许可:WTFPL;数据整理自国家统计局公布的区划代码。
 *              县级 2978 条、乡级 41352 条的名称与代码(本脚本只用名称)。
 *              sha256 areas   fbe1575eecba4ffd4d50c3d2d6887bd873ceca6a203fb2d66698b5007826b6b6
 *              sha256 streets 7f5e073a7e543de44a0cb7f05cd9e4bf8ecf7a887be0e36870c0dc1ed4ef066b
 *   地级行政区的名单这两份数据里没有,写在本文件的 [PREFECTURES](按常识写的,332 个)。
 *
 * 用法:
 *   node backend/scripts/gen-place-names.mjs --thuocl <THUOCL_diming.txt> --areas <areas.json> --streets <streets.json> \
 *     --upstream <rime-ice/cn_dicts 目录> --builtin backend/vendor/pinyin_simp.dict.yaml \
 *     --readings backend/dict/place-name-readings.txt --out backend/dict/place-names.txt [--report <目录>] [--check]
 *   `--check`:不写文件,只比现有的表与这次生成的是否一致(不一致退出 1)。
 *   `--report <目录>`:把每一步的名单(没收的、读音要人看的、抬了权重的)写成几份 tsv,给人过目用。
 *   `--tiers prefecture,county`:只出这几级(收紧用;默认三级都出)。
 *   `--town-min-evidence <n>`:乡级简称至少要有多少依据才收(默认见 [TOWN_MIN_EVIDENCE];0 = 没有依据的也收)。
 *
 * ── 规则(每一条都只抬不压:算出来的数不比词库里现有的高,就不出这一行)──
 * 一、收哪些名字
 *   地级:[PREFECTURES] 里的简称(杭州、湖州、恩施 …)。
 *   县级(areas.json):简称(霞浦)+ 全称(霞浦县;七个字以内的)。开发区 / 管理区 / 园区 / 示范区一类不是正式区划,不收。
 *   乡级(streets.json):只收简称(塘栖),而且要有依据(见三);全称(塘栖街道、塘栖镇)不收 —— 有了简称引擎自己会接上后缀。
 *     农场 / 林场 / 开发区 / 工业园 / 监狱一类(不以 街道 / 镇 / 乡 / 苏木 结尾的)不收。
 *   简称 = 全称去掉后缀(市 / 县 / 区 / 旗 / 新区 / 矿区 / 特区 / 自治县 / 自治旗 / 街道 / 镇 / 乡 / 苏木),
 *     自治县、民族乡再去掉末尾的民族名(围场满族蒙古族自治县 → 围场)。去掉之后只剩一个字的(莘县、乌镇)没有简称,
 *     全称本身就是口头说的名字,按简称对待。「某某旗」「市中区」不出简称(口头不这么说)。
 *   同一个简称在全国 5 处以上都有的(城关 129 处、太平 70、新城 53 …)**不抬权重**,词库里没有的才加、给最低一档 ——
 *     它们多半已经是普通词,按哪一个地方的分量去抬都不对。
 * 二、读音从哪来(行政区划数据不带读音;上游主表里已经有的词不用管读音,只抬权重)
 *   ① 手工核对过的地名读音表 backend/dict/place-name-readings.txt 里的整词;② 随包词库(pinyin_simp)里这个词的读音;
 *   ③ 上游里它的全称的读音去掉后缀(霞浦县 xia pu xian → 霞浦 xia pu)—— 但上游那些生僻地名的读音看起来是批量注的,
 *   多音字一律给了最常见的读音(英都 ying dou、青石咀 qing shi ju),所以要过 [doubtAboutReading] 这一关;
 *   ④ 全称 = 简称的读音 + 后缀;⑤ 逐字拼:只有一个读音的字用那个读音,多音字用读音表里的「地名里默认读什么」。
 *   **有多音字、读音表里又没有交代的,整个词不收**;不在《通用规范汉字表》里的字(数据里的异体 / 讹字)不逐字拼。
 *   没收的都记在 --report 的 skipped.tsv 里。
 *   pinyin-pro(后端依赖)只用来对照:它给的读音与上面定下来的不一样的,列进 --report 的 reading-diffs.tsv 给人看
 *   (它在地名上错得不少:花都 hua dou、莘庄 shen zhuang、塘厦 tang sha,所以不拿它定读音)。
 * 三、权重(刻度就是上游 base 层的刻度 —— base 里的地名权重本来就是 THUOCL 的频次)
 *   依据一:简称不低于它的全称在 base 层的权重(南京 5 万、南京市 20.8 万 → 南京抬到 20.8 万)。
 *   依据二:THUOCL 的频次 —— **只在上游没有给这个词调过频时用**(词库里没有、在占位层、或者 base 里的权重不超过
 *     [UNTUNED_MAX]:桐庐 1、番禺 2)。上游自己有词频的不拿 THUOCL 去盖:THUOCL 的频次是这串字在语料里出现的次数,
 *     「北站」「河堤」「金店」这类普通词碰巧也是乡镇名,按它抬就抬错了。
 *   每一级有下限和上限(见 [LEVELS]):下限是「这一级的名字至少该有的量级」,上限防的是 THUOCL 的新闻语料把个别地名
 *   抬得过高(北川 11.6 万)。目标 = 依据与下限取大、再压到上限。乡级另有门槛 [TOWN_MIN_EVIDENCE]:依据不到这个数的不收。
 *   「不抢首选」:目标不许达到同音词里现有的最高权重 —— 对象是每一个单字的读音,和最常用的 3 万个词的读音
 *   (见 [protectedTops]);撞上了就压到它下面一点(西安压到「先」下面、太原压到「太远」下面)。
 *
 * 产物会并进 GPL-3.0 词库一起下发;三份数据的许可都允许这样用,记在 docs/dict-ota-gpl-compliance.md。
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';

/** 公开数据的校验和(写这份脚本时下载到的版本)。对不上只提醒:上游仓库会更新,但数字要重新看过。 */
export const DATA_SHA256 = {
  thuocl: 'ca5574399da5750a2c36dc373f36e31a66ed1f8a4b21646df6ca44ec0b888d89',
  areas: 'fbe1575eecba4ffd4d50c3d2d6887bd873ceca6a203fb2d66698b5007826b6b6',
  streets: '7f5e073a7e543de44a0cb7f05cd9e4bf8ecf7a887be0e36870c0dc1ed4ef066b',
};

/**
 * 每一级的下限 / 上限。数字怎么来的(2026-10-07,上游 @3aea6d36):
 * - 地级:base 里权重正常的小地级市在 9000 ~ 2 万(七台河 9090、中卫 9055、乌海 13110、驻马店 21165),省会在 50 万;
 *   而嘉兴 102、舟山 458、株洲 2、定西 2,湖州 / 金华 / 丽水 base 里根本没有(只在随包词库里,几百)。
 *   下限 5000(比正常的最低一档再低一些:没有任何依据时不往高里猜)。
 * - 县级简称:base 里已有的 1726 个,权重中位数 2515、前一成 3.7 万;它们的全称中位数 1410、后四分之一 710。
 *   下限 1000,上限 4 万(前一成的量级。昆山 9.5 万、顺德 12.5 万这类本来就高的不受影响 —— 只抬不压)。
 * - 县级全称:多数已经在 base 里(权重 = THUOCL 频次)。下限 300,只为补上没有的那几十个(新设的区、单字县)。
 * - 乡级简称:有 THUOCL 频次的 4594 个,中位数 170、前一成 2275。没有任何依据的给 50 ——
 *   比占位层的 100 还低:保证打得出来,但不排到任何已有的词前面。上限 3000(同样是前一成的量级)。
 */
export const LEVELS = {
  prefecture: { floor: 5_000, cap: 500_000 },
  county: { floor: 1_000, cap: 40_000 },
  countyFull: { floor: 300, cap: 40_000 },
  town: { floor: 50, cap: 3_000 },
};
/**
 * 乡级简称至少要有多少依据(THUOCL 频次,或全称在 base 里的权重)才收。0 = 没有依据的也收(给下限 50)。
 * 默认值怎么定的见文件末尾「记录」:没有依据的 1.5 万个乡镇名都加进去,每加一个两个字的整词,就有一串拼音从
 * 「逐字造句」变成「先出这个词」(taha 原来出「他哈…」、现在先出「塔哈」),护栏会掉。
 */
export const TOWN_MIN_EVIDENCE = 100;
/**
 * 上游 base 层的权重不超过这个数的,当成「没有调过频」(桐庐 1、番禺 2、株洲 2):THUOCL 的频次可以拿来盖它。
 * 超过这个数的是上游自己有词频的,THUOCL 的频次不去盖(北站 3748、河堤 1071 这类普通词碰巧也是乡镇名),
 * 只用「简称不低于全称」和级别下限。
 */
export const UNTUNED_MAX = 10;
/** 同一个简称在全国几处以上就算「到处都有」:不抬权重,没有的才加、给乡级的下限。 */
export const GENERIC_UNITS = 5;
/** 县级全称最多几个字(再长的不收)。 */
export const FULL_NAME_MAX = 7;
/** 「不抢常用词的首选」保护的范围:按权重排在前多少个读音的首选。 */
export const PROTECT_TOP = 30_000;

/**
 * 地级行政区的简称(293 个地级市 + 30 个自治州 + 7 个地区 + 3 个盟 = 333 个,这里列了 332 个:青海的海南藏族自治州
 * 不列,它的简称与海南省相同)。areas.json / streets.json 里只有它们的代码、没有名字。
 * 直辖市、省直辖的县级市不在这里(前者权重本来就高,后者在 areas.json 里)。「兴安盟」带着「盟」字:单说「兴安」指不清是哪里。
 */
export const PREFECTURES = `
石家庄 唐山 秦皇岛 邯郸 邢台 保定 张家口 承德 沧州 廊坊 衡水
太原 大同 阳泉 长治 晋城 朔州 晋中 运城 忻州 临汾 吕梁
呼和浩特 包头 乌海 赤峰 通辽 鄂尔多斯 呼伦贝尔 巴彦淖尔 乌兰察布 兴安盟 锡林郭勒 阿拉善
沈阳 大连 鞍山 抚顺 本溪 丹东 锦州 营口 阜新 辽阳 盘锦 铁岭 朝阳 葫芦岛
长春 吉林 四平 辽源 通化 白山 松原 白城 延边
哈尔滨 齐齐哈尔 鸡西 鹤岗 双鸭山 大庆 伊春 佳木斯 七台河 牡丹江 黑河 绥化 大兴安岭
南京 无锡 徐州 常州 苏州 南通 连云港 淮安 盐城 扬州 镇江 泰州 宿迁
杭州 宁波 温州 嘉兴 湖州 绍兴 金华 衢州 舟山 台州 丽水
合肥 芜湖 蚌埠 淮南 马鞍山 淮北 铜陵 安庆 黄山 滁州 阜阳 宿州 六安 亳州 池州 宣城
福州 厦门 莆田 三明 泉州 漳州 南平 龙岩 宁德
南昌 景德镇 萍乡 九江 新余 鹰潭 赣州 吉安 宜春 抚州 上饶
济南 青岛 淄博 枣庄 东营 烟台 潍坊 济宁 泰安 威海 日照 临沂 德州 聊城 滨州 菏泽
郑州 开封 洛阳 平顶山 安阳 鹤壁 新乡 焦作 濮阳 许昌 漯河 三门峡 南阳 商丘 信阳 周口 驻马店
武汉 黄石 十堰 宜昌 襄阳 鄂州 荆门 孝感 荆州 黄冈 咸宁 随州 恩施
长沙 株洲 湘潭 衡阳 邵阳 岳阳 常德 张家界 益阳 郴州 永州 怀化 娄底 湘西
广州 韶关 深圳 珠海 汕头 佛山 江门 湛江 茂名 肇庆 惠州 梅州 汕尾 河源 阳江 清远 东莞 中山 潮州 揭阳 云浮
南宁 柳州 桂林 梧州 北海 防城港 钦州 贵港 玉林 百色 贺州 河池 来宾 崇左
海口 三亚 三沙 儋州
成都 自贡 攀枝花 泸州 德阳 绵阳 广元 遂宁 内江 乐山 南充 眉山 宜宾 广安 达州 雅安 巴中 资阳 阿坝 甘孜 凉山
贵阳 六盘水 遵义 安顺 毕节 铜仁 黔西南 黔东南 黔南
昆明 曲靖 玉溪 保山 昭通 丽江 普洱 临沧 楚雄 红河 文山 西双版纳 大理 德宏 怒江 迪庆
拉萨 日喀则 昌都 林芝 山南 那曲 阿里
西安 铜川 宝鸡 咸阳 渭南 延安 汉中 榆林 安康 商洛
兰州 嘉峪关 金昌 白银 天水 武威 张掖 平凉 酒泉 庆阳 定西 陇南 临夏 甘南
西宁 海东 海北 黄南 果洛 玉树 海西
银川 石嘴山 吴忠 固原 中卫
乌鲁木齐 克拉玛依 吐鲁番 哈密 昌吉 博尔塔拉 巴音郭楞 阿克苏 克孜勒苏 喀什 和田 伊犁 塔城 阿勒泰
`.split(/\s+/).filter(Boolean);

/** 自治县 / 民族乡的名字里要去掉的民族名(带不带「族」字都认:木垒哈萨克自治县)。长的排前面,先匹配长的。 */
export const ETHNIC_GROUPS = [
  '蒙古', '回', '藏', '维吾尔', '苗', '彝', '壮', '布依', '朝鲜', '满', '侗', '瑶', '白', '土家', '哈尼', '哈萨克', '傣', '黎', '傈僳',
  '佤', '畲', '高山', '拉祜', '水', '东乡', '纳西', '景颇', '柯尔克孜', '土', '达斡尔', '仫佬', '羌', '布朗', '撒拉', '毛南', '仡佬',
  '锡伯', '阿昌', '普米', '塔吉克', '怒', '乌孜别克', '俄罗斯', '鄂温克', '德昂', '保安', '裕固', '京', '塔塔尔', '独龙', '鄂伦春',
  '赫哲', '门巴', '珞巴', '基诺', '各',
].sort((a, b) => b.length - a.length);

const HAN = /^\p{Script=Han}+$/u;
const charsOf = (word) => [...word];

/**
 * 读 THUOCL 的词表:带 BOM,行分隔是单个 \r(也认 \n / \r\n)。返回 Map 词 → 频次。
 * 原文件里有两行的频次后面带着一个问号(「柴塔村<Tab>3?」):这种认不出频次的行跳过,个数记在返回值的 `bad` 上;
 * 过半的行都认不出来说明文件不是这个格式,直接抛错。
 */
export function parseThuocl(text) {
  const out = new Map();
  let bad = 0;
  let total = 0;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) continue;
    total += 1;
    const parts = line.split(/\s+/);
    if (parts.length !== 2 || !/^\d+$/.test(parts[1])) { bad += 1; continue; }
    if (!HAN.test(parts[0])) continue; // 非汉字的词打不出来
    out.set(parts[0], Math.max(out.get(parts[0]) ?? 0, Number(parts[1])));
  }
  if (bad * 2 > total) throw new Error(`THUOCL 词表有 ${bad} / ${total} 行不是「词 + 频次」两列 —— 文件不对?`);
  out.bad = bad;
  return out;
}

/**
 * 去掉末尾的民族名:「围场满族蒙古族」→「围场」,「木垒哈萨克」→「木垒」。去到只剩民族名本身就不动
 * (鄂温克族自治旗的主名就是「鄂温克」)。只认带「族」字的,或者后面紧跟着已经去掉的民族名的 / 整个结尾的不带「族」的写法。
 */
export function stripEthnic(stem) {
  let current = stem;
  for (;;) {
    let next = null;
    for (const group of ETHNIC_GROUPS) {
      for (const tail of [`${group}族`, group]) {
        // 不带「族」的只认两个字以上的民族名(单字的「回」「白」「水」会误伤:白水、清水)。
        if (tail === group && group.length < 2) continue;
        if (current.endsWith(tail) && current.length > tail.length) { next = current.slice(0, -tail.length); break; }
      }
      if (next !== null) break;
    }
    if (next === null) return current;
    current = next;
  }
}

/** 这些「简称」口头不单说,不出。 */
const NO_SHORT = new Set(['市中', '城', '郊', '矿', '市辖']);

/**
 * 把一个区划名拆成 全称 + 简称。level = 'county' | 'town'。
 * 返回 null = 不是正式区划(开发区、农场 …)或者不是纯汉字,不收;
 * 返回 {full, short}:short 为 null 表示没有简称(去掉后缀只剩一个字,或者是「某某旗」)。
 */
export function splitAdminName(name, level) {
  if (!HAN.test(name)) return null;
  let m;
  if (level === 'county') {
    if (/(开发区|管理区|园区|示范区|产业区|实验区|聚集区|保税区|名胜区|食品区|新城|群岛|海域|委员会|管委会|市辖区)$/.test(name)) return null;
    if ((m = name.match(/^(.+?)自治[县旗]$/))) {
      const stem = stripEthnic(m[1]);
      // 主名就是民族名(鄂温克族自治旗、鄂伦春自治旗):不出简称。
      return { full: name, short: stem === m[1] && /族$/.test(stem) ? null : shortOrNull(stem) };
    }
    // 「林区」全国只有神农架一个;别的以「林区」结尾的是「某某林」+「区」(太原万柏林区的简称是万柏林)。
    if (name === '神农架林区') return { full: name, short: '神农架' };
    if ((m = name.match(/^(.+)(新区|矿区|特区)$/))) {
      // 「邯郸冀南新区」「德州天衢新区」是功能区,名字里带着上一级的市名;正式的区划名都不长(浦东新区、六枝特区、井陉矿区)。
      if (charsOf(m[1]).length > 3) return null;
      return { full: name, short: shortOrNull(m[1]) };
    }
    if ((m = name.match(/^(.+)(县|市|区)$/))) return { full: name, short: shortOrNull(stripEthnic(m[1])) };
    if (/旗$/.test(name)) return { full: name, short: null };
    return null;
  }
  if (level === 'town') {
    if ((m = name.match(/^(.+)(街道办事处|街道|镇|苏木)$/))) {
      // 「川沙新镇」是川沙 + 新镇;「维新镇」「建新镇」是维新 / 建新 + 镇。按去掉「新」之后还剩不剩两个字来分。
      const stem = m[2] === '镇' && m[1].endsWith('新') && charsOf(m[1]).length >= 3 ? m[1].slice(0, -1) : m[1];
      return { full: name, short: shortOrNull(stem) };
    }
    // 民族乡有两种写法:「某某苗族乡」和「某某哈萨克民族乡」。
    if ((m = name.match(/^(.+?)(民族)?乡$/))) return { full: name, short: shortOrNull(stripEthnic(m[1])) };
    return null;
  }
  throw new Error(`splitAdminName:不认识的级别 ${level}`);
}

function shortOrNull(stem) {
  return charsOf(stem).length >= 2 && !NO_SHORT.has(stem) ? stem : null;
}

/**
 * 读手工核对的地名读音表。一行两列,Tab 分隔:
 *   长<Tab>chang          ← 一个字:这个多音字在地名里默认读什么
 *   长子<Tab>zhang zi     ← 两个字以上:整词的读音(优先于逐字拼)
 *   某某<Tab>-            ← 两个字以上:这个名字不收(读音拿不准,或者数据里的写法本身有问题)
 * 写坏的行直接抛错;同一个字 / 词写两次也抛错。返回 {chars, words, excluded}。
 */
export function parseReadingsTable(text) {
  const chars = new Map();
  const words = new Map();
  const excluded = new Set();
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split('\t').map((s) => s.trim());
    const where = `place-name-readings 第 ${i + 1} 行「${line}」`;
    if (parts.length !== 2) throw new Error(`${where}:要两列(字或词 + 读音),用 Tab 分隔`);
    const [key, pinyin] = parts;
    if (!HAN.test(key)) throw new Error(`${where}:第一列只能是汉字`);
    if (pinyin === '-') {
      if (charsOf(key).length < 2) throw new Error(`${where}:「不收」只能写在两个字以上的名字上`);
      if (excluded.has(key) || words.has(key)) throw new Error(`${where}:「${key}」已经写过一次`);
      excluded.add(key);
      return;
    }
    if (!/^[a-z]+( [a-z]+)*$/.test(pinyin)) throw new Error(`${where}:读音只能是小写字母,音节之间一个空格`);
    const n = charsOf(key).length;
    if (pinyin.split(' ').length !== n) throw new Error(`${where}:音节数与字数不一致`);
    const target = n === 1 ? chars : words;
    if (target.has(key) || excluded.has(key)) throw new Error(`${where}:「${key}」已经写过一次`);
    target.set(key, pinyin);
  });
  return { chars, words, excluded };
}

/** rime 词典的正文行(`...` 之后):返回 [词, 第二列, 第三列] 的数组。 */
function dictRows(text) {
  const rows = [];
  let body = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line === '...') { body = true; continue; }
    if (!body || !line || line.startsWith('#')) continue;
    rows.push(line.split('\t'));
  }
  return rows;
}

/**
 * 把上游与随包词库读成查表用的结构(与构建脚本同一个口径:主表里同一个词只认第一次出现)。
 *   main    Map 词 → {pinyin, weight, tier}        base / ext / 8105 / others
 *   auto    Map 词 → weight                        tencent(无注音)
 *   builtin Map 词 → {pinyin, weight}              随包词库里权重最高的那个读音
 *   charReadings  Map 字 → Set<读音>               两边单字条目的全部读音(判多音字用)
 *   charMain      Map 字 → 读音                    只有一个读音的字的读音
 *   charDominant  Map 字 → 读音                    多音字里「明显占多数」的那个读音(上游单字表里权重最高且不并列;
 *                                                  并列时看随包词库)。没有明显占多数的不在这张表里。
 *   standardChars Set<字>                          上游 8105.dict.yaml 里的字(《通用规范汉字表》)
 *   charWeights   {upstream, builtin}: Map 字 → Map 读音 → 权重
 */
export function buildLexicon({ base, ext, chars8105, others, tencent, builtin }) {
  const main = new Map();
  const charReadings = new Map();
  const charWeights = { upstream: new Map(), builtin: new Map() };
  const standardChars = new Set();
  const noteChar = (ch, pinyin, weight, source) => {
    if (!charReadings.has(ch)) charReadings.set(ch, new Set());
    charReadings.get(ch).add(pinyin);
    const table = charWeights[source];
    if (!table.has(ch)) table.set(ch, new Map());
    table.get(ch).set(pinyin, Math.max(table.get(ch).get(pinyin) ?? 0, weight));
  };
  for (const [tier, text] of [['base', base], ['ext', ext], ['8105', chars8105], ['others', others]]) {
    for (const a of dictRows(text)) {
      if (a.length < 2 || !a[0] || !a[1]) continue;
      const weight = a.length > 2 && /^\d+$/.test(a[2].trim()) ? Number(a[2]) : 0;
      if (charsOf(a[0]).length === 1) {
        noteChar(a[0], a[1], weight, 'upstream');
        if (tier === '8105') standardChars.add(a[0]);
      }
      if (!main.has(a[0])) main.set(a[0], { pinyin: a[1], weight, tier });
    }
  }
  const auto = new Map();
  for (const a of dictRows(tencent)) {
    if (a.length === 2 && /^\d+$/.test(a[1])) auto.set(a[0], Number(a[1]));
  }
  const builtinMap = new Map();
  for (const a of dictRows(builtin)) {
    if (a.length < 2 || !a[0] || !a[1]) continue;
    const weight = a.length > 2 && /^\d+$/.test(a[2].trim()) ? Number(a[2]) : 0;
    if (charsOf(a[0]).length === 1) noteChar(a[0], a[1], weight, 'builtin');
    const had = builtinMap.get(a[0]);
    if (!had || weight > had.weight) builtinMap.set(a[0], { pinyin: a[1], weight });
  }
  // 占多数的读音:权重最高的那个,而且至少是第二名的两倍(「长」的 chang / zhang 各占一半,不算有占多数的)。
  const dominantIn = (table, ch) => {
    const ranked = [...(table.get(ch) ?? [])].sort((x, y) => y[1] - x[1]);
    if (ranked.length === 0) return null;
    if (ranked.length === 1) return ranked[0][0];
    return ranked[0][1] > 0 && ranked[0][1] >= 2 * ranked[1][1] ? ranked[0][0] : null;
  };
  const charMain = new Map();
  const charDominant = new Map();
  for (const [ch, all] of charReadings) {
    if (all.size === 1) { charMain.set(ch, [...all][0]); continue; }
    const dominant = dominantIn(charWeights.upstream, ch) ?? dominantIn(charWeights.builtin, ch);
    if (dominant) charDominant.set(ch, dominant);
  }
  return { main, auto, builtin: builtinMap, charReadings, charMain, charDominant, standardChars, charWeights };
}

/**
 * 「不抢首选」要保护的那些读音:Map 读音(去掉空格)→ {word, weight}。两部分:
 *   ① 每一个单字的读音,不论权重高低 —— 地名的全拼连起来正好是一个音节时(西安 xian、六安 luan、吉安 jian),
 *     打这个音节的人多半要的是那个字;
 *   ② 2 ~ 4 个字的词按读音归组、每组取权重最高的,按权重排在前 [PROTECT_TOP] 的那些组
 *     (与 scripts/rime-typo-eval.sh 的「常用词」护栏同一个取法)。
 * 权重按**设备上实际生效的**算:方案先导入随包词库再导入下发的词库,单字「同一个字同一个读音」只认先出现的那一条,
 * 所以单字用随包词库的权重(先 84326),随包里没有的才用上游的(上游的「先」是 166 万,但到不了设备上);
 * 多字词两边都留着、权重高的排前面,取两边的大值。
 */
export function protectedTops({ main, builtin, charWeights }, limit = PROTECT_TOP) {
  // 单字在设备上生效的权重:随包词库里有这个(字,读音)就用它的,没有才用上游的。
  const effective = new Map(); // `${字}\t${读音}` → 权重
  for (const [ch, byReading] of charWeights.upstream) for (const [reading, weight] of byReading) effective.set(`${ch}\t${reading}`, weight);
  for (const [ch, byReading] of charWeights.builtin) for (const [reading, weight] of byReading) effective.set(`${ch}\t${reading}`, weight);
  const singles = new Map();
  for (const [key, weight] of effective) {
    const [ch, reading] = key.split('\t');
    const had = singles.get(reading);
    if (!had || weight > had.weight) singles.set(reading, { word: ch, weight });
  }
  const best = new Map();
  const noteWord = (word, pinyin, weight) => {
    const n = charsOf(word).length;
    if (n < 2 || n > 4 || pinyin.split(' ').length !== n) return;
    const key = pinyin.replace(/ /g, '');
    const had = best.get(key);
    if (!had || weight > had.weight) best.set(key, { word, weight });
  };
  for (const [word, e] of main) noteWord(word, e.pinyin, e.weight);
  for (const [word, e] of builtin) noteWord(word, e.pinyin, e.weight);
  const out = new Map([...best].sort((x, y) => y[1].weight - x[1].weight).slice(0, limit));
  for (const [reading, top] of singles) {
    const had = out.get(reading);
    if (!had || top.weight > had.weight) out.set(reading, top);
  }
  return out;
}

/**
 * 逐字拼读音:只有一个读音的字用那个读音;多音字用读音表里的「地名里默认读什么」;都没有就返回 {unresolved}。
 * 不在《通用规范汉字表》里的字不拼(数据里的异体 / 讹字:叶尓羌、洩湖 —— 字表给它们的读音靠不住)。
 */
export function spellByChar(word, { charReadings, charMain, standardChars }, readings) {
  const out = [];
  for (const ch of charsOf(word)) {
    const hand = readings.chars.get(ch);
    if (hand) { out.push(hand); continue; }
    const all = charReadings.get(ch);
    if (!all || all.size === 0) return { unresolved: `字表里没有「${ch}」` };
    if (!standardChars.has(ch)) return { unresolved: `「${ch}」不在通用规范汉字表里` };
    if (all.size > 1) return { unresolved: `多音字「${ch}」(${[...all].join(' / ')})读音表里没有交代` };
    out.push(charMain.get(ch));
  }
  return { pinyin: out.join(' ') };
}

/**
 * 上游(或随包词库)里一个现成的读音靠不靠得住。上游那些生僻地名的读音看起来是批量注的:多音字一律给了最常见的读音
 * (英都 ying dou、青石咀 qing shi ju、平安地 ping an de),而它特意给了少见读音的那些是对的(高行 gao hang、麻涌 ma chong、
 * 团泊 tuan po、厦港 xia gang)。所以逐字看:
 *   - 不是多音字:没问题;
 *   - 读音表里有这个字的默认读音:与默认一样才算数(不一样的要读音表里写整词);
 *   - 读音表里没有:上游给的是「占多数的读音」之外的那个(特意挑的)才算数;给的就是占多数的那个,分不出是对是错,不算数。
 * 返回 null = 靠得住;否则返回一句原因。
 */
export function doubtAboutReading(word, pinyin, lexicon, readings) {
  const syllables = pinyin.split(' ');
  const chars = charsOf(word);
  if (syllables.length !== chars.length) return '音节数与字数不一致';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const all = lexicon.charReadings.get(ch);
    if (!all || all.size <= 1) continue;
    const hand = readings.chars.get(ch);
    if (hand) {
      if (hand !== syllables[i]) return `「${ch}」上游读 ${syllables[i]},读音表的默认是 ${hand}`;
      continue;
    }
    const dominant = lexicon.charDominant.get(ch);
    if (!dominant || dominant === syllables[i]) return `多音字「${ch}」上游读 ${syllables[i]}(最常见的读音,分不出是不是批量注的)`;
  }
  return null;
}

/**
 * 定一个「上游主表里没有」的词的读音。fulls = 它的全称们(从「霞浦县 xia pu xian」推出「霞浦 xia pu」);
 * shortOf = 它是全称时对应的简称(「乐亭县」= 乐亭的读音 + 县)。
 * 返回 {pinyin, via} 或 {unresolved}。via:'table'(读音表整词)| 'builtin' | 'full' | 'short' | 'chars'。
 */
export function resolveReading(word, lexicon, readings, { fulls = [], shortOf = null } = {}) {
  if (readings.excluded.has(word)) return { unresolved: '读音表里写了不收' };
  const table = readings.words.get(word);
  if (table) return { pinyin: table, via: 'table' };
  const n = charsOf(word).length;
  // 随包词库是人工整理的常用词表,读音直接用。
  const inBuiltin = lexicon.builtin.get(word);
  if (inBuiltin && inBuiltin.pinyin.split(' ').length === n) return { pinyin: inBuiltin.pinyin, via: 'builtin' };
  const derived = new Map();
  for (const full of fulls) {
    const e = lexicon.main.get(full) ?? lexicon.builtin.get(full);
    if (!e || !full.startsWith(word)) continue;
    const syllables = e.pinyin.split(' ');
    if (syllables.length !== charsOf(full).length) continue;
    derived.set(syllables.slice(0, n).join(' '), full);
  }
  const spelled = spellByChar(word, lexicon, readings);
  if (derived.size > 1) return { unresolved: `几个全称推出来的读音不一致:${[...derived.keys()].join(' / ')}` };
  if (derived.size === 1) {
    const pinyin = [...derived.keys()][0];
    if (spelled.pinyin === pinyin) return { pinyin, via: 'full' };
    const doubt = doubtAboutReading(word, pinyin, lexicon, readings);
    if (!doubt) return { pinyin, via: 'full' };
    // 上游推出来的读音靠不住时,逐字拼得出来就用逐字拼的(读音表的默认读音),拼不出来就不收。
    return spelled.pinyin ? { pinyin: spelled.pinyin, via: 'chars', overrode: `${pinyin}(${doubt})` } : { unresolved: `从全称推出来的 ${pinyin} 靠不住:${doubt}` };
  }
  if (shortOf && word.startsWith(shortOf)) {
    const head = lexicon.main.get(shortOf)?.pinyin ?? resolveReading(shortOf, lexicon, readings).pinyin;
    const tail = spellByChar(word.slice(shortOf.length), lexicon, readings);
    if (head && tail.pinyin) return { pinyin: `${head} ${tail.pinyin}`, via: 'short' };
  }
  return spelled.pinyin ? { pinyin: spelled.pinyin, via: 'chars' } : spelled;
}

/**
 * 把三份数据理成候选:Map 名字 → {level, kind, units, fulls, shortOf}。
 *   level 取最高的一级(地级 > 县级 > 乡级);kind = 'short' | 'full'(县级全称);
 *   units = 全国有几处区划的简称是它;fulls = 它对应的全称(推读音、找依据用);shortOf = 全称对应的简称。
 */
export function collectCandidates({ areas, streets, prefectures = PREFECTURES }) {
  const out = new Map();
  const rank = { prefecture: 0, county: 1, town: 2 };
  const note = (name, level, kind, full, shortOf = null) => {
    let c = out.get(name);
    if (!c) { c = { level, kind, units: 0, fulls: new Set(), shortOf }; out.set(name, c); }
    if (rank[level] < rank[c.level]) { c.level = level; c.kind = kind; }
    else if (level === c.level && kind === 'short') c.kind = 'short';
    if (kind === 'short') { c.units += 1; if (full && full !== name) c.fulls.add(full); }
  };
  for (const name of prefectures) {
    note(name, 'prefecture', 'short', null);
    for (const suffix of ['市', '地区', '州', '盟']) out.get(name).fulls.add(name.endsWith(suffix) ? name : `${name}${suffix}`);
  }
  for (const name of areas) {
    const s = splitAdminName(name, 'county');
    if (!s) continue;
    // 全称太长的(围场满族蒙古族自治县)不收:没人整串打,收了只会在打到一半时多出一条补全。它的简称照收。
    const fullOk = charsOf(s.full).length <= FULL_NAME_MAX;
    if (s.short) { note(s.short, 'county', 'short', s.full); if (fullOk) note(s.full, 'county', 'full', null, s.short); }
    // 去掉后缀只剩一个字(莘县):全称本身就是口头说的名字,按简称对待。带「旗」的、主名是民族名的,只收全称。
    else if (charsOf(s.full).length === 2) note(s.full, 'county', 'short', null);
    else if (fullOk) note(s.full, 'county', 'full', null);
  }
  for (const name of streets) {
    const s = splitAdminName(name, 'town');
    if (!s) continue;
    if (s.short) note(s.short, 'town', 'short', s.full);
    else if (charsOf(s.full).length === 2) note(s.full, 'town', 'short', null);
  }
  return out;
}

/** 目标权重:依据与下限取大、压到上限。 */
export function targetWeight({ level, kind, evidence }) {
  const tier = kind === 'full' ? LEVELS.countyFull : LEVELS[level];
  return Math.min(tier.cap, Math.max(tier.floor, evidence));
}

/**
 * 主流程(不碰文件):候选 → 依据 → 目标 → 只抬不压 → 定读音。
 * 返回 {rows, skipped, capped, stats, candidates}。rows:[{word, weight, pinyin?, level, kind, via, from, evidence}],按级别、权重、词排好。
 */
export function planPlaceNames({ thuocl, areas, streets, lexicon, readings, tiers = ['prefecture', 'county', 'town'], prefectures = PREFECTURES, townMinEvidence = TOWN_MIN_EVIDENCE }) {
  const candidates = collectCandidates({ areas, streets, prefectures });
  const protectedTop = protectedTops(lexicon);
  const rows = [];
  const skipped = [];
  const capped = [];
  const stats = { candidates: candidates.size, already: 0, generic: 0, noEvidence: 0, overrode: [] };
  for (const [word, c] of candidates) {
    if (!tiers.includes(c.level)) continue;
    const inMain = lexicon.main.get(word);
    const inAuto = lexicon.auto.has(word);
    const present = Boolean(inMain) || inAuto;
    const current = Math.max(inMain?.weight ?? 0, lexicon.auto.get(word) ?? 0, lexicon.builtin.get(word)?.weight ?? 0);
    const generic = c.kind === 'short' && c.level !== 'prefecture' && c.units >= GENERIC_UNITS;
    // 依据一:简称不低于它的全称在 base 层的权重(ext 的 100 是占位值,不算)。
    let evidence = 0;
    for (const full of c.fulls) {
      const e = lexicon.main.get(full);
      if (e?.tier === 'base') evidence = Math.max(evidence, e.weight);
    }
    // 依据二:THUOCL 的频次 —— 只在上游没有给这个词调过频时用(见 [UNTUNED_MAX])。
    const untuned = !inMain || inMain.tier !== 'base' || inMain.weight <= UNTUNED_MAX;
    if (untuned) {
      evidence = Math.max(evidence, thuocl.get(word) ?? 0);
      for (const full of c.fulls) evidence = Math.max(evidence, thuocl.get(full) ?? 0);
    }
    let target;
    if (c.level === 'town' && evidence < townMinEvidence) { stats.noEvidence += 1; continue; }
    if (generic) {
      // 到处都有的名字:词库里(哪一层都算)已经有了就不动;没有的给乡级的下限,只为打得出来。
      stats.generic += 1;
      if (present || lexicon.builtin.has(word)) { stats.already += 1; continue; }
      target = LEVELS.town.floor;
    } else {
      target = targetWeight({ ...c, evidence });
    }
    if (target <= current) { stats.already += 1; continue; }
    let reading;
    if (inMain) reading = { pinyin: inMain.pinyin, via: 'main' };
    else {
      reading = resolveReading(word, lexicon, readings, { fulls: [...c.fulls], shortOf: c.shortOf });
      if (reading.overrode) stats.overrode.push({ word, used: reading.pinyin, upstream: reading.overrode });
      // 只在无注音表里的词:读音定不下来也可以只抬权重(引擎按字表自动注音),但读音表写了不收的照样不收。
      if (!reading.pinyin && (!inAuto || readings.excluded.has(word))) { skipped.push({ word, level: c.level, kind: c.kind, reason: reading.unresolved }); continue; }
    }
    // 「不抢常用词的首选」:同音的常用词首选的权重是多少,就压到它下面。
    if (reading.pinyin) {
      const top = protectedTop.get(reading.pinyin.replace(/ /g, ''));
      if (top && top.word !== word && target >= top.weight) {
        const lowered = top.weight - 1;
        capped.push({ word, level: c.level, wanted: target, top: top.word, topWeight: top.weight, kept: lowered > current });
        if (lowered <= current) { stats.already += 1; continue; }
        target = lowered;
      }
    }
    rows.push({
      word,
      weight: target,
      // 上游已经有这个词(主表或无注音表)就不带读音:带了读音、而与上游不一样时构建脚本会让这一行不生效。
      ...(present ? {} : { pinyin: reading.pinyin }),
      level: c.level,
      kind: c.kind,
      via: present ? (inMain ? 'main' : 'auto') : reading.via,
      from: current,
      evidence,
    });
  }
  const order = { prefecture: 0, county: 1, town: 2 };
  rows.sort((a, b) => order[a.level] - order[b.level] || (a.kind === b.kind ? 0 : a.kind === 'short' ? -1 : 1)
    || b.weight - a.weight || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  return { rows, skipped, capped, stats, candidates };
}

const SECTION_NAMES = {
  'prefecture|short': '地级(地级市 / 自治州 / 地区 / 盟的简称)',
  'county|short': '县级 · 简称(含去掉后缀只剩一个字、全称就是口头名字的:莘县)',
  'county|full': '县级 · 全称',
  'town|short': '乡级(乡镇、街道)· 简称',
};

/** 渲染成 `--phrase-weights` 认的表:一行「词<Tab>权重[<Tab>拼音]」,按级别分节。 */
export function renderPlaceNames(rows, meta) {
  const head = [
    '# Ninan 地名表 —— 每次构建拼音词库时与短语权重表一起套在上游词条上(backend/scripts/build-pinyin-dict.mjs 的 --phrase-weights,',
    '# 这一份排在手写的 phrase-weights.txt 后面;同一个词两份都有时以手写的为准)。',
    '#',
    '# ⚠️ 这个文件是生成的,不要手改:由 backend/scripts/gen-place-names.mjs 从下面几份公开数据生成(规则、下载地址与校验和在那份脚本的头部)。',
    '# 读音有问题的改 backend/dict/place-name-readings.txt 再重新生成。',
    '#',
    '# 来源与许可:',
    '#   清华大学开放中文词库 THUOCL · 地名(https://github.com/thunlp/THUOCL),MIT —— 用的是「词 + 文档频次」里的频次。',
    '#   中华人民共和国行政区划(https://github.com/modood/Administrative-divisions-of-China),WTFPL,数据整理自国家统计局公布的',
    '#   区划代码 —— 用的是县级、乡级区划的名称。',
    '#   地级行政区的名单是按常识写在生成脚本里的。读音来自上游词库 / 随包词库里的同名词条,以及手工核对的地名读音表。',
    '#',
    '# 下面两行「署名」会被构建脚本抄进下发的词库产物的头注释(build-pinyin-dict.mjs 的 parseCreditLines),不要删、不要改写法:',
    '# 署名:地名的权重参考了清华大学开放中文词库 THUOCL 的地名词频(https://github.com/thunlp/THUOCL,MIT License,THUNLP)。',
    '# 署名:县区与乡镇街道的名称取自 https://github.com/modood/Administrative-divisions-of-China(WTFPL,整理自国家统计局公布的区划代码)。',
    '#',
    '# 写法(与 phrase-weights.txt 相同):词<Tab>权重            ← 上游已经有这个词:把权重抬到这个数(这份表只抬不压)',
    '#                                  词<Tab>权重<Tab>拼音   ← 上游没有:加进主表',
    '#',
    `# 生成时的上游:rime-ice @${meta.upstreamRef || '(没有记录)'};共 ${rows.length} 行(加新词 ${rows.filter((r) => r.pinyin).length},抬权重 ${rows.filter((r) => !r.pinyin).length})。`,
    `# 各级的下限 ~ 上限:地级 ${LEVELS.prefecture.floor}~${LEVELS.prefecture.cap},县级简称 ${LEVELS.county.floor}~${LEVELS.county.cap},`
      + `县级全称 ${LEVELS.countyFull.floor}~${LEVELS.countyFull.cap},乡级简称 ${LEVELS.town.floor}~${LEVELS.town.cap}(乡级至少要有 ${meta.townMinEvidence ?? TOWN_MIN_EVIDENCE} 的依据才收)。`,
    '# ⚠️ 这张表会并进 GPL-3.0 词库产物公开下发。',
    '',
  ];
  const body = [];
  let section = '';
  for (const row of rows) {
    const key = `${row.level}|${row.kind}`;
    if (key !== section) {
      section = key;
      const n = rows.filter((r) => `${r.level}|${r.kind}` === key).length;
      body.push('', `# ── ${SECTION_NAMES[key]}(${n} 行)──`);
    }
    body.push(row.pinyin ? `${row.word}\t${row.weight}\t${row.pinyin}` : `${row.word}\t${row.weight}`);
  }
  return `${head.join('\n')}${body.join('\n')}\n`;
}

const USAGE = '用法: node backend/scripts/gen-place-names.mjs --thuocl <THUOCL_diming.txt> --areas <areas.json> --streets <streets.json> '
  + '--upstream <rime-ice/cn_dicts> --builtin <pinyin_simp.dict.yaml> --readings <place-name-readings.txt> --out <place-names.txt> '
  + '[--report <目录>] [--check] [--tiers prefecture,county,town] [--town-min-evidence <n>]';

function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
  const need = ['thuocl', 'areas', 'streets', 'upstream', 'builtin', 'readings', 'out'];
  const missing = need.filter((k) => !arg(k));
  if (missing.length) {
    console.error(`缺参数:${missing.map((k) => `--${k}`).join(' ')}\n${USAGE}`);
    process.exit(2);
  }
  const read = (p) => readFileSync(p, 'utf8');
  for (const key of ['thuocl', 'areas', 'streets']) {
    const sum = createHash('sha256').update(readFileSync(arg(key))).digest('hex');
    if (sum !== DATA_SHA256[key]) console.warn(`⚠️ --${key} 的 sha256 是 ${sum.slice(0, 16)}…,与脚本里记的 ${DATA_SHA256[key].slice(0, 16)}… 不一样 —— 数据更新过?生成结果要重新看一遍、重新量。`);
  }
  const up = arg('upstream');
  const lexicon = buildLexicon({
    base: read(join(up, 'base.dict.yaml')),
    ext: read(join(up, 'ext.dict.yaml')),
    chars8105: read(join(up, '8105.dict.yaml')),
    others: read(join(up, 'others.dict.yaml')),
    tencent: read(join(up, 'tencent.dict.yaml')),
    builtin: read(arg('builtin')),
  });
  const readings = parseReadingsTable(read(arg('readings')));
  const names = (p) => JSON.parse(read(p)).map((x) => x.name);
  const tiers = (arg('tiers') ?? 'prefecture,county,town').split(',');
  const townMinEvidence = arg('town-min-evidence') === undefined ? TOWN_MIN_EVIDENCE : Number(arg('town-min-evidence'));
  if (!Number.isInteger(townMinEvidence) || townMinEvidence < 0) { console.error('--town-min-evidence 要非负整数'); process.exit(2); }
  const plan = planPlaceNames({ thuocl: parseThuocl(read(arg('thuocl'))), areas: names(arg('areas')), streets: names(arg('streets')), lexicon, readings, tiers, townMinEvidence });
  let upstreamRef = arg('ref') ?? '';
  if (!upstreamRef) {
    try { upstreamRef = execFileSync('git', ['-C', join(up, '..'), 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* 不是 git 检出 */ }
  }
  const text = renderPlaceNames(plan.rows, { upstreamRef, townMinEvidence });
  const count = (f) => plan.rows.filter(f).length;
  console.log(`候选 ${plan.stats.candidates} 个名字 → 出 ${plan.rows.length} 行:`
    + `地级 ${count((r) => r.level === 'prefecture')},县级简称 ${count((r) => r.level === 'county' && r.kind === 'short')},`
    + `县级全称 ${count((r) => r.level === 'county' && r.kind === 'full')},乡级简称 ${count((r) => r.level === 'town')}`
    + `(加新词 ${count((r) => r.pinyin)},抬权重 ${count((r) => !r.pinyin)})`);
  console.log(`没收:乡级里依据不到 ${townMinEvidence} 的 ${plan.stats.noEvidence} 个;读音没定下来的 ${plan.skipped.length} 个;被「不抢常用词的首选」压低或挡下的 ${plan.capped.length} 个;到处都有(≥ ${GENERIC_UNITS} 处)的 ${plan.stats.generic} 个不抬权重`);
  if (arg('report')) writeReport(arg('report'), plan, lexicon, readings);
  if (argv.includes('--check')) {
    let existing = '';
    try { existing = read(arg('out')); } catch { /* 还没有 */ }
    if (existing !== text) { console.error(`${arg('out')} 与这次生成的不一致(重新生成后要重新量)`); process.exit(1); }
    console.log(`${arg('out')} 与生成结果一致`);
    return;
  }
  writeFileSync(arg('out'), text, 'utf8');
  console.log(`已写 ${arg('out')}(${Buffer.byteLength(text, 'utf8')} 字节)`);
}

/** 给人过目的几份名单。pinyin-pro 只在这里用(对照读音);没装就跳过那一份。 */
function writeReport(dir, plan, lexicon, readings) {
  mkdirSync(dir, { recursive: true });
  const tsv = (rows) => `${rows.map((r) => r.join('\t')).join('\n')}\n`;
  writeFileSync(join(dir, 'rows.tsv'), tsv(plan.rows.map((r) => [r.word, r.weight, r.pinyin ?? '', r.level, r.kind, r.via, r.from, r.evidence])));
  writeFileSync(join(dir, 'skipped.tsv'), tsv(plan.skipped.map((r) => [r.word, r.level, r.kind, r.reason])));
  writeFileSync(join(dir, 'capped.tsv'), tsv(plan.capped.map((r) => [r.word, r.level, r.wanted, r.top, r.topWeight, r.kept ? '压低' : '挡下'])));
  writeFileSync(join(dir, 'overrode.tsv'), tsv(plan.stats.overrode.map((r) => [r.word, r.used, r.upstream])));
  let pinyinPro = null;
  try { pinyinPro = createRequire(import.meta.url)('pinyin-pro').pinyin; } catch { console.warn('⚠️ 找不到 pinyin-pro(cd backend && npm ci),跳过读音对照'); }
  if (pinyinPro) {
    const tool = (w) => pinyinPro(w, { toneType: 'none', type: 'array', v: true }).join(' ');
    const diffs = plan.rows.filter((r) => r.pinyin && tool(r.word) !== r.pinyin).map((r) => [r.word, r.pinyin, tool(r.word), r.via, r.level]);
    writeFileSync(join(dir, 'reading-diffs.tsv'), tsv(diffs));
    console.log(`读音对照:加的新词里 pinyin-pro 给的读音与定下来的不一样的 ${diffs.length} 个 → ${join(dir, 'reading-diffs.tsv')}`);
  }
  // 逐字拼的办法在「上游已经有读音的地名」上对不对:拿它去拼那些词,与上游的读音比 —— 错的要么是读音表缺了例外,要么是上游错了。
  const check = [];
  let comparable = 0;
  for (const word of plan.candidates.keys()) {
    const e = lexicon.main.get(word);
    if (!e || e.pinyin.split(' ').length !== charsOf(word).length) continue;
    const spelled = spellByChar(word, lexicon, readings);
    if (!spelled.pinyin) continue;
    comparable += 1;
    if (spelled.pinyin !== e.pinyin && readings.words.get(word) !== e.pinyin) check.push([word, e.pinyin, spelled.pinyin, e.weight, plan.candidates.get(word).level]);
  }
  writeFileSync(join(dir, 'chars-vs-upstream.tsv'), tsv(check));
  console.log(`逐字拼的办法在上游已有读音的 ${comparable} 个地名上:与上游不一样的 ${check.length} 个 → ${join(dir, 'chars-vs-upstream.tsv')}`);
}

// ── 记录 ──
// 2026-10-07 第一版(上游 rime-ice @3aea6d36,三份数据的校验和见 [DATA_SHA256]):
//   候选 30953 个名字 → 3147 行:地级 160、县级简称 1580、县级全称 561、乡级简称 846;其中加新词 1603、抬权重 1544。
//   没收的:乡级里依据不到 100 的 24327 个;读音没定下来的 11 个;「不抢首选」压低的 6 个;到处都有(≥ 5 处)的 451 个不抬权重。
//   读音:逐字拼的办法在「上游已经有读音」的 1 万多个地名上核对过,与上游不一样的 29 个 —— 要么是读音表里记了的例外
//   (乐亭县、长子县、洪洞县、六合区 …),要么上游那个词是普通词的读音(长官、礼乐、星宿),要么是上游注错了(英都 ying dou、
//   四都坪 si dou ping、红角洲 hong jue zhou)。加进去的新词里,地级、县级含多音字的近 200 个逐个看过;乡级含多音字的 143 个也看过。
//   量到的效果、乡级门槛怎么定的、护栏里变了哪几条:scripts/rime-place-eval.sh 的头部与末尾「记录」。
//   想把没有依据的乡镇也都收进来:`--town-min-evidence 0`(多出约 1.8 万个新词),代价写在那份记录里。

// 主程序判断:先把两边都化成真实路径再比(理由见 build-pinyin-dict.mjs 末尾)。
let invokedPath = '';
try { invokedPath = realpathSync(resolve(process.argv[1] ?? '')); } catch { /* 不是文件路径 */ }
if (fileURLToPath(import.meta.url) === invokedPath) main();

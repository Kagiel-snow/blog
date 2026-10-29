'use strict';
// ============ 军团之王：要塞 —— 所有数值都在这里，改这里就能调平衡 ============
//
// 属性说明（所有单位通用）
//   hp 生命  patk 物理攻击  matk 魔法攻击  pdef 物理防御  mdef 魔法防御
//   cd 攻击间隔（秒，越小攻速越快）  range 射程  acc 弹道精度（0~1，越高越不容易打偏）  pspd 弹速
//   ls 吸血（造成伤害的百分比转为生命）  regen 每秒自然回血  crit 暴击率  critMul 暴击倍率  spd 移动速度
// 伤害公式：物理伤害 × 100/(100+物理防御) + 魔法伤害 × 100/(100+魔法防御)
// 高低地：站在高地向低处射击，射程 +15%、精度 +10%、伤害 +10%；从低处向高处射击，精度 -25%
// onhit：攻击附带的特殊效果 { st: 状态, chance: 触发几率, pow: 每秒伤害 = 攻击力 × pow, dur: 持续秒数 }
//   状态：burn 灼烧（魔法伤害） poison 中毒（无视防御，回血减半） bleed 流血（物理伤害） chill 冰冻减速 stun 眩晕（无法行动）

const MAX_WAVE = 20;
const PREP_TIME = 60;          // 每波前的准备时间（秒）
const FIRST_PREP_TIME = 90;    // 第一波准备时间
const START_RES = { gold: 150, wood: 260, stone: 240, food: 120 };
const COIN_TO_MAT = 0.10;      // 波次结束时没捡的金币按此比例转化为木材和石材（各自）
const BOSS_WAVES = { 5: 'troll', 10: 'demon', 15: 'lich', 20: 'dragon' };

// ---------- 画面观感（觉得画面太花、太刺眼就调这里） ----------
// contrast：地面贴图对比度（1 = 原图，越小越平）  sat：饱和度（1 = 原图）  bright：亮度（1 = 原图）
// vignette：屏幕四周压暗（0 = 关）  flowers：地上的小花草数量（有地面贴图时，贴图里已经有花草）
// 画面基调：地面低对比、低饱和、偏暗；树石再退一层；角色加深色描边、略提亮，从背景里跳出来
const VISUAL = { contrast: 0.32, sat: 0.55, bright: 0.78, vignette: 0.28, flowers: 0,
  decorSat: 0.7, decorBright: 0.82, outline: '#140e0a', charSat: 1.12, charBright: 1.06 };

// ---------- 粮食与士气 ----------
// 每波开战时，每名士兵按体型（pop）消耗粮食，每位英雄消耗 hero。粮食不够就会士气低迷甚至饥饿
const FOOD_UPKEEP = { pop: 4, hero: 10 };
const MORALE = {
  fed: { name: '军心稳定', icon: '🍖', color: '#9fe07a', atk: 1, aspd: 1, spd: 1, drain: 0, desc: '粮食充足，没有惩罚' },
  low: { name: '士气低迷', icon: '😟', color: '#ffc04a', atk: 0.8, aspd: 0.85, spd: 0.9, drain: 0, desc: '粮食只够一半以上：攻击 -20%、攻速 -15%、移速 -10%' },
  starve: { name: '饥饿', icon: '😫', color: '#ff5a4a', atk: 0.6, aspd: 0.7, spd: 0.8, drain: 0.01, desc: '粮食不到一半：攻击 -40%、攻速 -30%、移速 -20%，每秒损失 1% 生命' },
};

// ---------- 经验与等级 ----------
// 击杀者获得全部经验，附近 XP_RANGE 内的其他友军各分到 XP_SHARE；防御塔击杀时附近友军各得 XP_SHARE
const XP_NEED = lvl => Math.round(30 * Math.pow(lvl, 1.5));   // 从 lvl 级升到下一级需要的经验
const LVL_MAX = { lord: 20, hero: 15, unit: 10 };
const XP_SHARE = 0.3, XP_RANGE = 280;
const XP_OF = (gold, elite, boss) => Math.round(gold * 4 * (elite ? 3 : 1) * (boss ? 2 : 1));
// 复活祭坛：复活价格 = (英雄原价 + 能力估值) × REVIVE_MUL；估值 = 每级 HERO_LVL_VALUE(级) 之和 + 每个已学技能 PERK_VALUE
const REVIVE_MUL = 1.3;
const HERO_LVL_VALUE = lvl => 50 * lvl;
const PERK_VALUE = 150;

// ---------- 难度 ----------
// glory: 荣耀倍率；ehp/edmg: 敌人生命/伤害倍率；count: 敌人数量倍率；elite: 精英几率倍率；res: 开局资源倍率；prep: 每波准备时间增减（秒）
const DIFFICULTIES = [
  { id: 'easy', name: '简单', icon: '🌱', color: '#9fe07a', desc: '敌人更弱更少，开局资源更多，准备时间 +20 秒', ehp: 0.7, edmg: 0.7, count: 0.8, elite: 0.5, res: 1.5, prep: 20, glory: 0.6 },
  { id: 'normal', name: '普通', icon: '⚔️', color: '#ffd76a', desc: '标准体验', ehp: 1, edmg: 1, count: 1, elite: 1, res: 1, prep: 0, glory: 1 },
  { id: 'hard', name: '困难', icon: '🔥', color: '#ff9a5a', desc: '敌人生命 +35%、伤害 +25%、数量 +20%，开局资源更少', ehp: 1.35, edmg: 1.25, count: 1.2, elite: 1.5, res: 0.85, prep: -10, glory: 1.5 },
  { id: 'nightmare', name: '噩梦', icon: '💀', color: '#ff5a4a', desc: '敌人生命 +80%、伤害 +50%、数量 +40%，精英翻倍，准备时间 -15 秒', ehp: 1.8, edmg: 1.5, count: 1.4, elite: 2, res: 0.7, prep: -15, glory: 2 },
];

// ---------- 地图 ----------
// 坐标：castle/plateaus/ramps 用格子（1 格 = 40 像素，地图 80×80 格）；portals/lakes/forests/rocks/veins 用像素
// plateaus：高地（e: 椭圆 [中心x, 中心y, 半径x, 半径y]，r: 矩形 [x, y, 宽, 高]）；ramps：坡道矩形，只有从坡道才能上下高地
// res: 开局资源倍率；castle: 主城每秒产出 {wood, stone, gold}（按主城 1/2/3 级）
const MAPS = [
  { id: 'vale', name: '翠绿河谷', icon: '🌲', color: '#9fe07a',
    desc: '森林茂密，木材充足。主城坐落在中央高地上，东南西北四条坡道是天然的隘口，守住坡道就守住了城。',
    tags: ['木材丰富', '中央高地', '8 个刷怪口'],
    ground: ['#3b5f33', '#3a5e31', '#2e4a28', '#43703a', '#4f6a30', '#35552c'], high: '#5c7a3e', ramp: '#8a7650',
    castle: [38, 38],
    plateaus: [{ e: [40, 40, 13, 11] }, { e: [62, 18, 7, 5] }, { e: [18, 61, 7, 5] }],
    ramps: [[37, 27, 6, 5], [37, 49, 6, 5], [25, 37, 5, 6], [51, 37, 5, 6], [60, 21, 5, 5], [16, 53, 5, 5]],
    portals: [
      { x: 1600, y: 110, name: '北方山口' }, { x: 3060, y: 380, name: '东北密林' }, { x: 3090, y: 1650, name: '东方荒原' },
      { x: 2900, y: 3060, name: '东南遗迹' }, { x: 1500, y: 3090, name: '南方沼泽' }, { x: 160, y: 2900, name: '西南墓地' },
      { x: 110, y: 1550, name: '西方峡谷' }, { x: 380, y: 140, name: '西北冰原' }],
    lakes: [[820, 860, 230, 150], [2420, 2380, 260, 170], [900, 2450, 150, 110], [2620, 1100, 120, 90]],
    forests: [[2300, 1300, 260, 34], [1100, 1350, 200, 30], [1900, 2350, 220, 34], [600, 1900, 240, 36], [2800, 2000, 200, 30],
      [1500, 600, 220, 34], [2100, 400, 180, 28], [400, 700, 200, 26], [2900, 2700, 180, 24], [1200, 2800, 200, 28]],
    rocks: [[1250, 1900, 120, 14], [2050, 1150, 120, 14], [2650, 1450, 130, 14], [700, 1300, 120, 12]],
    veins: [[2500, 700, 90, 5], [700, 2650, 90, 5]],
    graves: [350, 2650, 260],
    res: { gold: 1, wood: 1.25, stone: 0.9 }, castleProd: { wood: [3.5, 6, 9], stone: [2, 3.5, 5.5], food: [1, 1.6, 2.4] } },
  { id: 'highland', name: '灰岩高地', icon: '⛰️', color: '#b8b0a0',
    desc: '岩石遍布，石材丰富而树木稀少。主城在南方低谷，敌人从东西两侧的高原和北方山脊顺着坡道冲下来。',
    tags: ['石材丰富', '敌人居高临下', '7 个刷怪口'],
    ground: ['#4a5a3a', '#55623f', '#4a5236', '#5a5a44', '#50583c', '#465238'], high: '#7a7a62', ramp: '#8a7a5a',
    castle: [38, 60],
    plateaus: [{ e: [12, 20, 18, 26] }, { e: [67, 20, 17, 26] }, { e: [40, 7, 12, 7] }],
    ramps: [[10, 44, 5, 5], [27, 28, 5, 5], [65, 44, 5, 5], [48, 28, 5, 5], [38, 12, 5, 5]],
    portals: [
      { x: 360, y: 300, name: '西岭哨塔' }, { x: 1600, y: 140, name: '北方山脊' }, { x: 2840, y: 300, name: '东岭废矿' },
      { x: 130, y: 1100, name: '西崖' }, { x: 3070, y: 1100, name: '东崖' }, { x: 150, y: 2950, name: '西南谷口' }, { x: 3050, y: 2950, name: '东南谷口' }],
    lakes: [[1600, 1500, 170, 110], [700, 2300, 140, 100]],
    forests: [[1150, 2600, 180, 24], [2300, 2200, 160, 20], [1900, 2900, 140, 16]],
    rocks: [[500, 900, 220, 22], [2700, 900, 220, 22], [1600, 700, 160, 16], [1200, 1900, 150, 16], [2100, 1800, 150, 16],
      [700, 2700, 140, 14], [2600, 2600, 160, 16], [1600, 1100, 120, 12], [350, 1600, 140, 12], [2850, 1600, 140, 12]],
    veins: [[1600, 300, 80, 5], [2350, 1400, 80, 5]],
    graves: [2700, 2850, 200],
    res: { gold: 1, wood: 0.85, stone: 1.4 }, castleProd: { wood: [2, 3.5, 5.5], stone: [3.5, 6, 9], food: [0.7, 1.2, 1.8] } },
  { id: 'oasis', name: '黄金沙海', icon: '🏜️', color: '#ffcf6a',
    desc: '沙漠中的绿洲。木材和石材都很稀缺，但遍地金矿，可以建金矿场换取大量金币来招兵和召唤英雄。六座台地散布四周，抢占高地架塔。',
    tags: ['金矿遍地', '木石稀缺', '六座台地'],
    ground: ['#c8a86a', '#d0b070', '#bfa060', '#c9a465', '#d6b878', '#b89858'], high: '#b08850', ramp: '#9a7a48',
    castle: [36, 36],
    plateaus: [{ e: [16, 18, 7, 6] }, { e: [63, 15, 8, 6] }, { e: [66, 62, 7, 6] }, { e: [15, 63, 8, 6] }, { e: [40, 68, 6, 4] }, { e: [58, 40, 4, 10] }],
    ramps: [[14, 22, 5, 5], [61, 19, 5, 5], [64, 54, 5, 5], [13, 55, 5, 5], [38, 62, 5, 5], [52, 38, 5, 5]],
    portals: [
      { x: 1600, y: 110, name: '北方沙丘' }, { x: 3060, y: 380, name: '东北盐沼' }, { x: 3090, y: 1650, name: '东方石林' },
      { x: 2900, y: 3060, name: '东南古墓' }, { x: 1500, y: 3090, name: '南方峡谷' }, { x: 160, y: 2900, name: '西南废城' },
      { x: 110, y: 1550, name: '西方商道' }, { x: 380, y: 140, name: '西北枯井' }],
    lakes: [[1100, 1050, 180, 120], [2200, 2300, 110, 80]],
    forests: [[1150, 800, 140, 14], [2350, 2450, 120, 10]],
    rocks: [[2300, 1100, 140, 12], [900, 2100, 140, 12], [2000, 2900, 120, 10]],
    veins: [[700, 1400, 120, 8], [2500, 700, 120, 8], [2700, 2000, 120, 8], [1300, 2400, 120, 8], [1900, 500, 100, 6], [500, 2600, 100, 6]],
    graves: [2900, 2900, 220], palms: true,
    res: { gold: 1.8, wood: 0.85, stone: 0.85 }, castleProd: { wood: [2.5, 4, 6], stone: [2, 3.5, 5.5], gold: [1, 1.6, 2.4], food: [0.8, 1.3, 2] } },
];

// ---------- 领主（玩家自己） ----------
// 三种攻击方式，Q 键切换；空格释放当前方式的技能
const LORD = { name: '领主', icon: '🤴', color: '#ffd76a', hp: 260, pdef: 20, mdef: 15, regen: 1.5, spd: 210, crit: 0.05, critMul: 2,
  modes: {
    sword: { name: '剑术', icon: '⚔️', patk: 30, cd: 0.55, range: 120, ls: 0.08, onhit: { st: 'bleed', chance: 0.3, pow: 0.3, dur: 3 }, desc: '近身扇形斩击，8% 吸血，30% 几率流血',
      skill: { name: '旋风斩', icon: '🌀', cd: 6, desc: '原地旋转三圈，持续斩击周围所有敌人并击退' } },
    bow: { name: '弓术', icon: '🏹', patk: 17, cd: 0.42, range: 560, acc: 0.85, pspd: 850, pierce: 1, desc: '远程物理箭矢，可穿透 1 个敌人',
      skill: { name: '箭雨', icon: '🌧️', cd: 8, desc: '向鼠标位置降下 40 支箭' } },
    magic: { name: '魔法', icon: '✨', matk: 26, cd: 0.85, range: 480, acc: 0.8, pspd: 480, aoe: 65, onhit: { st: 'burn', chance: 0.4, pow: 0.3, dur: 3 }, desc: '奥术飞弹，命中后范围魔法伤害，40% 几率灼烧',
      skill: { name: '奥术新星', icon: '💥', cd: 9, desc: '以自身为中心爆发魔法冲击波，造成大量魔法伤害并击退' } },
  } };

// ---------- 建筑 ----------
// size: 占地格数；cost: 每级花费；hp: 每级生命；cat: defense(城墙/防御塔，优先被攻击) | eco | main | trap
const BUILDINGS = {
  castle: { name: '主城', icon: '🏰', size: 4, cat: 'main', hp: [4000, 6500, 10000],
    cost: [null, { wood: 300, stone: 300 }, { wood: 600, stone: 650 }],
    desc: '被摧毁即失败。自带箭楼，并持续产出材料（不同地图产出不同）。升级主城会解锁更高等级的建筑和兵种。', noBuild: true,
    attack: { patk: [16, 26, 40], cd: 0.9, range: 320, acc: 0.9, pspd: 850, kind: 'arrow', air: true } },
  barracks: { name: '兵营', icon: '⛺', size: 3, cat: 'main', hp: [900, 1500, 2400],
    cost: [{ wood: 120, stone: 60 }, { wood: 200, stone: 160 }, { wood: 380, stone: 320 }],
    desc: '招募士兵的地方。等级越高，能招募的兵种越多。', key: '1' },
  altar: { name: '英雄祭坛', icon: '🛕', size: 3, cat: 'main', hp: [1000, 1600, 2500], max: 1, slots: [2, 3, 4],
    cost: [{ wood: 150, stone: 150 }, { wood: 250, stone: 260, gold: 100 }, { wood: 400, stone: 420, gold: 200 }],
    desc: '花金币召唤英雄。每种英雄同时只能有一位，阵亡后本局无法再召唤。祭坛等级决定同时在场的英雄数量（2/3/4）。', key: '2' },
  wall: { name: '城墙', icon: '🧱', size: 1, cat: 'defense', hp: [350, 900, 2000], names: ['木栅栏', '石墙', '钢铁城墙'],
    cost: [{ wood: 8 }, { stone: 12 }, { stone: 20, wood: 10 }],
    desc: '阻挡敌人。敌人会绕路，绕不过去就会拆墙。按住鼠标拖动可以连续建造。建在坡道上能卡死隘口。', key: '3', drag: true },
  arrow: { name: '箭塔', icon: '🏹', size: 2, cat: 'defense', hp: [500, 850, 1400],
    cost: [{ wood: 70, stone: 40 }, { wood: 90, stone: 90 }, { wood: 160, stone: 180 }],
    attack: { patk: [16, 26, 42], cd: 0.55, range: 280, acc: 0.88, pspd: 850, kind: 'arrow', air: true },
    desc: '快速射出物理箭矢，可以打飞行单位。建在高地上射程和精度更高。', key: '4' },
  cannon: { name: '投石炮台', icon: '💣', size: 2, cat: 'defense', hp: [600, 1000, 1600],
    cost: [{ wood: 60, stone: 120 }, { wood: 100, stone: 180 }, { wood: 180, stone: 320 }],
    attack: { patk: [40, 66, 108], cd: 2.0, range: 330, acc: 0.7, pspd: 520, kind: 'shell', aoe: 70 },
    desc: '物理范围爆炸，打不到飞行单位。精度较低，打移动目标容易落空。', key: '5' },
  magic: { name: '法师塔', icon: '🔮', size: 2, cat: 'defense', hp: [450, 750, 1200], castle: 2,
    cost: [{ wood: 100, stone: 120, gold: 50 }, { wood: 140, stone: 180, gold: 80 }, { wood: 220, stone: 300, gold: 150 }],
    attack: { matk: [32, 52, 88], cd: 1.5, range: 260, acc: 1, kind: 'chain', chains: [3, 4, 6], air: true },
    desc: '魔法连锁闪电，必定命中，弹射多个敌人并减速。克制物理防御高的骷髅、怨灵。需要 2 级主城。', key: '6' },
  trap: { name: '尖刺陷阱', icon: '📌', size: 1, cat: 'trap', hp: [200, 300, 450], solid: false,
    cost: [{ wood: 20, stone: 15 }, { stone: 25 }, { stone: 45 }],
    trap: { patk: [18, 30, 50], cd: 0.6 },
    desc: '铺在路上，持续刺伤踩上去的敌人（物理伤害），不会阻挡道路。', key: '7' },
  house: { name: '民居', icon: '🏠', size: 2, cat: 'eco', hp: [300, 500, 800],
    cost: [{ wood: 60, stone: 20 }, { wood: 90, stone: 60 }, { wood: 160, stone: 120 }],
    gold: [1.2, 2.2, 3.8],
    desc: '每秒产出金币。', key: '8' },
  farm: { name: '农田', icon: '🌾', size: 2, cat: 'eco', hp: [250, 400, 650],
    cost: [{ wood: 40, stone: 10 }, { wood: 70, stone: 40 }, { wood: 130, stone: 90 }],
    food: [1.5, 2.6, 4], nearWater: 0.05, nearMax: 0.8,
    desc: '每秒产出粮食。靠近湖泊产量更高（最多 +80%）。士兵和英雄每波开战都要吃饭。' },
  shrine: { name: '复活祭坛', icon: '⛩️', size: 2, cat: 'main', hp: [800, 1200, 1800], max: 1, discount: [0, 0.1, 0.2],
    cost: [{ wood: 180, stone: 220, gold: 80 }, { wood: 260, stone: 300, gold: 150 }, { wood: 400, stone: 450, gold: 250 }],
    desc: '花金币复活阵亡的英雄，保留阵亡前的等级和技能。价格 = (原价 + 能力估值) × 130%，祭坛升级可打折 10%/20%。' },
  lumber: { name: '伐木场', icon: '🪓', size: 2, cat: 'eco', hp: [300, 500, 800],
    cost: [{ wood: 30, stone: 40 }, { wood: 60, stone: 80 }, { wood: 120, stone: 150 }],
    wood: [1.2, 2.2, 3.6], near: ['🌲', '🌳', '🌴'], nearPer: 0.08,
    desc: '每秒产出木材。附近树木越多产量越高（最多 +100%）。', key: '9' },
  quarry: { name: '采石场', icon: '⛏️', size: 2, cat: 'eco', hp: [300, 500, 800],
    cost: [{ wood: 60, stone: 15 }, { wood: 110, stone: 50 }, { wood: 200, stone: 100 }],
    stone: [1.3, 2.4, 4], near: ['🪨'], nearPer: 0.08,
    desc: '每秒产出石材。附近岩石越多产量越高（最多 +100%）。', key: '0' },
  mine: { name: '金矿场', icon: '💰', size: 2, cat: 'eco', hp: [350, 550, 850],
    cost: [{ wood: 80, stone: 60 }, { wood: 120, stone: 110 }, { wood: 200, stone: 200 }],
    gold: [0.6, 1.2, 2], near: ['💎'], nearPer: 0.3, nearMax: 2.5,
    desc: '每秒产出金币。必须靠近金矿脉💎才划算：每条矿脉 +30%，最多 +250%。', key: '-' },
  smithy: { name: '铁匠铺', icon: '⚒️', size: 2, cat: 'main', hp: [600, 900, 1400], max: 1,
    cost: [{ wood: 120, stone: 120 }, { wood: 200, stone: 220 }, { wood: 350, stone: 400 }],
    desc: '升级领主和士兵的装备、防御塔的弹药。等级决定可升级的上限。', key: '=' },
  training: { name: '训练场', icon: '🎯', size: 3, cat: 'main', hp: [600, 900, 1400], max: 1,
    cost: [{ wood: 140, stone: 70 }, { wood: 220, stone: 150 }, { wood: 360, stone: 300 }],
    desc: '用金币训练各兵种，提升它们的等级（已有和新招募的都生效）。', key: '[' },
};
// 快捷栏分页：数字键 1~0、-、= 对应当前分页里的第 1~12 项，Tab 切换分页
const BUILD_TABS = [
  { id: 'build', name: '建筑', icon: '🏗️', list: ['barracks', 'altar', 'shrine', 'farm', 'house', 'lumber', 'quarry', 'mine', 'smithy', 'training'] },
  { id: 'def', name: '城防', icon: '🏹', list: ['wall', 'arrow', 'cannon', 'magic', 'trap'] },
  { id: 'unit', name: '兵种', icon: '⚔️' },
  { id: 'hero', name: '英雄', icon: '⭐' },
];
const BUILD_ORDER = [...BUILD_TABS[0].list, ...BUILD_TABS[1].list];

// ---------- 士兵（兵营招募，花金币） ----------
// proj: 远程弹道外观；aoe: 爆炸范围；pierce: 穿透数；cleave/slam: 近战范围伤害；taunt: 嘲讽半径；antiBig: 对大型/精英/首领的伤害倍率
const UNITS = {
  swordsman: { name: '王国剑士', icon: '🤺', role: '近战', cost: 30, pop: 1, time: 3, barracks: 1,
    hp: 150, patk: 13, pdef: 30, mdef: 10, cd: 0.8, range: 26, spd: 170, desc: '耐打的前排步兵' },
  shieldguard: { name: '塔盾卫士', icon: '🪖', role: '坦克', cost: 40, pop: 1, time: 3, barracks: 1,
    hp: 240, patk: 8, pdef: 70, mdef: 25, cd: 1.0, range: 24, spd: 150, taunt: 140, desc: '物理防御极高，嘲讽附近敌人' },
  archer: { name: '精灵弓手', icon: '🧝', role: '远程', cost: 35, pop: 1, time: 3, barracks: 1,
    hp: 80, patk: 12, pdef: 5, mdef: 10, cd: 0.85, range: 290, acc: 0.8, pspd: 700, spd: 175,
    proj: { color: '#e2f7a0', r: 5 }, desc: '站在墙后或高地上射击' },
  spearman: { name: '长枪卫兵', icon: '💂', role: '反重甲', cost: 45, pop: 1, time: 4, barracks: 2,
    hp: 180, patk: 16, pdef: 35, mdef: 10, cd: 0.9, range: 40, spd: 165, antiBig: 2.2, onhit: { st: 'bleed', chance: 0.25, pow: 0.3, dur: 3 }, desc: '对精英、首领和大型怪造成 2.2 倍伤害，长枪可造成流血' },
  cleric: { name: '光明牧师', icon: '👼', role: '治疗', cost: 50, pop: 1, time: 4, barracks: 2,
    hp: 90, matk: 8, pdef: 10, mdef: 40, cd: 1.1, range: 250, acc: 0.9, pspd: 480, spd: 175, heal: 16, healCd: 1.8,
    proj: { color: '#fff2a0', r: 6 }, desc: '治疗领主、英雄和士兵' },
  crossbow: { name: '矮人弩手', icon: '🧔', role: '穿透', cost: 55, pop: 1, time: 4, barracks: 2,
    hp: 110, patk: 24, pdef: 20, mdef: 10, cd: 1.4, range: 330, acc: 0.92, pspd: 950, spd: 160,
    proj: { color: '#d0d8e0', r: 5, pierce: 3 }, onhit: { st: 'bleed', chance: 0.3, pow: 0.3, dur: 3 }, desc: '重弩箭精准且能穿透 3 个敌人，造成流血' },
  monk: { name: '战斗僧侣', icon: '🧘', role: '魔武', cost: 55, pop: 1, time: 4, barracks: 2,
    hp: 170, patk: 6, matk: 16, pdef: 20, mdef: 45, cd: 0.7, range: 26, spd: 185, ls: 0.15, regen: 1.5, onhit: { st: 'stun', chance: 0.12, dur: 0.7 }, desc: '拳掌附带魔法伤害，15% 吸血并自然回血，有几率眩晕' },
  berserker: { name: '北地狂战士', icon: '🪓', role: '狂暴', cost: 60, pop: 1, time: 4, barracks: 2,
    hp: 170, patk: 20, pdef: 5, mdef: 5, cd: 0.55, range: 28, spd: 210, cleave: 40, ls: 0.1, onhit: { st: 'bleed', chance: 0.35, pow: 0.25, dur: 3 }, desc: '攻速极快的双斧横扫，10% 吸血，造成流血，但几乎没有防御' },
  knight: { name: '皇家骑士', icon: '🏇', role: '骑兵', cost: 85, pop: 2, time: 6, barracks: 3,
    hp: 400, patk: 28, pdef: 55, mdef: 20, cd: 1.0, range: 30, spd: 250, cleave: 50, onhit: { st: 'stun', chance: 0.15, dur: 0.8 }, desc: '高速重骑兵，横扫一片，冲撞可眩晕敌人' },
  battlemage: { name: '战斗法师', icon: '🧙‍♂️', role: '法术', cost: 75, pop: 2, time: 6, barracks: 3,
    hp: 120, matk: 26, pdef: 10, mdef: 35, cd: 1.4, range: 270, acc: 0.75, pspd: 430, spd: 170,
    proj: { color: '#ff7a2a', r: 8, aoe: 60 }, onhit: { st: 'burn', chance: 0.5, pow: 0.3, dur: 3 }, desc: '发射爆炸火球（魔法范围伤害），附带灼烧' },
  griffin: { name: '狮鹫骑士', icon: '🦅', role: '飞行', cost: 90, pop: 2, time: 6, barracks: 3,
    hp: 260, patk: 24, pdef: 25, mdef: 25, cd: 0.8, range: 30, spd: 280, fly: true, desc: '飞行骑兵，无视城墙和悬崖' },
  // 特殊单位（天赋、技能获得，不能招募）
  dragon: { name: '幼龙', icon: '🐉', role: '宠物', hp: 260, matk: 22, pdef: 20, mdef: 30, cd: 1.2, range: 270, acc: 0.8, pspd: 430, spd: 220, fly: true, special: true,
    proj: { color: '#ff7a2a', r: 8, aoe: 60 }, onhit: { st: 'burn', chance: 0.6, pow: 0.3, dur: 3 }, desc: '喷吐火球，附带灼烧' },
  golem: { name: '岩石魔像', icon: '🗿', role: '坦克', hp: 900, patk: 26, pdef: 80, mdef: 10, cd: 1.6, range: 30, spd: 140, taunt: 240, slam: 80, special: true, desc: '嘲讽并重击' },
  wolf: { name: '霜狼', icon: '🐺', role: '宠物', hp: 180, patk: 12, pdef: 15, mdef: 15, cd: 0.45, range: 22, spd: 300, ls: 0.1, special: true, onhit: { st: 'bleed', chance: 0.3, pow: 0.4, dur: 3 }, desc: '迅捷撕咬，造成流血' },
  skeleton: { name: '骷髅战士', icon: '☠️', role: '亡灵', hp: 80, patk: 12, pdef: 30, mdef: 0, cd: 0.7, range: 24, spd: 220, special: true, desc: '死灵召唤物' },
};
const RECRUITABLE = Object.keys(UNITS).filter(k => !UNITS[k].special);

// ---------- 兵种进化：士兵满 10 级后，在训练场二选一进化（每个士兵一次） ----------
// set：覆盖兵种原有属性（未写的保持不变）；进化后等级上限提高到 EVO_LVL_MAX
const EVO_LVL_MAX = 15;
const EVO_COST = type => ({ gold: 150 + UNITS[type].cost * 4 });
const EVOLUTIONS = {
  swordsman: [
    { id: 'aegis', name: '圣盾卫士', icon: '🛡️', desc: '厚重圣盾，嘲讽并持续回血，前排的定海神针', set: { hp: 330, patk: 15, pdef: 75, mdef: 40, regen: 2.5, taunt: 120 } },
    { id: 'blademaster', name: '狂刃剑圣', icon: '⚔️', desc: '快剑连斩，高暴击与闪避，攻击造成流血', set: { hp: 190, patk: 30, cd: 0.5, crit: 0.3, critMul: 2.5, dodge: 0.15, onhit: { st: 'bleed', chance: 0.35, pow: 0.35, dur: 3 } } },
  ],
  shieldguard: [
    { id: 'bulwark', name: '不动壁垒', icon: '🏯', desc: '更大的嘲讽范围和极高的双防', set: { hp: 520, pdef: 120, mdef: 65, regen: 3, taunt: 200 } },
    { id: 'shieldbash', name: '盾击卫士', icon: '💥', desc: '盾牌横扫一片，几率眩晕', set: { hp: 380, patk: 20, pdef: 90, cleave: 45, onhit: { st: 'stun', chance: 0.25, dur: 1 } } },
  ],
  archer: [
    { id: 'hawkeye', name: '鹰眼神射', icon: '🎯', desc: '超远射程、百发百中、高暴击', set: { patk: 30, cd: 1.0, range: 380, acc: 1, crit: 0.35, critMul: 2.5, pspd: 1100 } },
    { id: 'windrunner', name: '疾风游侠', icon: '🍃', desc: '极快的连射，箭矢穿透 2 个敌人，身手敏捷', set: { patk: 12, cd: 0.4, range: 300, dodge: 0.2, spd: 210, proj: { color: '#b0ffb0', r: 5, pierce: 2 } } },
  ],
  spearman: [
    { id: 'dragonlancer', name: '屠龙枪骑', icon: '🐲', desc: '对精英、首领和大型怪造成 3.5 倍伤害', set: { patk: 28, range: 48, antiBig: 3.5, onhit: { st: 'bleed', chance: 0.4, pow: 0.35, dur: 3 } } },
    { id: 'phalanx', name: '方阵统领', icon: '🔰', desc: '长枪横扫并嘲讽，守住隘口', set: { hp: 340, pdef: 70, mdef: 30, range: 50, cleave: 40, taunt: 110 } },
  ],
  cleric: [
    { id: 'archbishop', name: '大主教', icon: '✝️', desc: '治疗量翻倍，施法更快', set: { hp: 150, mdef: 60, heal: 34, healCd: 1.3 } },
    { id: 'inquisitor', name: '审判官', icon: '⚖️', desc: '圣光审判敌人并灼烧，仍保留少量治疗', set: { matk: 28, cd: 0.8, heal: 10, onhit: { st: 'burn', chance: 0.5, pow: 0.4, dur: 3 } } },
  ],
  crossbow: [
    { id: 'siegebow', name: '攻城弩炮手', icon: '💣', desc: '爆裂弩矢造成范围伤害', set: { patk: 40, cd: 1.6, proj: { color: '#ffb070', r: 7, aoe: 55 } } },
    { id: 'repeater', name: '连弩专家', icon: '🏹', desc: '高速连发的穿透毒弩', set: { patk: 16, cd: 0.6, onhit: { st: 'poison', chance: 0.35, pow: 0.3, dur: 4 } } },
  ],
  monk: [
    { id: 'vajra', name: '金刚武僧', icon: '🔔', desc: '金刚不坏：嘲讽、双防大增、强力回血', set: { hp: 360, pdef: 50, mdef: 85, regen: 5, taunt: 100 } },
    { id: 'windfist', name: '风拳宗师', icon: '👊', desc: '疾风连拳，高闪避，更容易眩晕', set: { matk: 30, cd: 0.45, dodge: 0.3, spd: 230, onhit: { st: 'stun', chance: 0.2, dur: 0.8 } } },
  ],
  berserker: [
    { id: 'bloodking', name: '血怒狂王', icon: '🩸', desc: '大范围横扫，25% 吸血', set: { hp: 260, patk: 30, ls: 0.25, cleave: 60 } },
    { id: 'wolfsoul', name: '狼魂战士', icon: '🐺', desc: '狼一样迅捷，攻速更快并重度流血', set: { spd: 260, cd: 0.4, dodge: 0.2, pdef: 25, onhit: { st: 'bleed', chance: 0.5, pow: 0.4, dur: 3 } } },
  ],
  knight: [
    { id: 'templar', name: '圣殿骑士', icon: '✨', desc: '圣光护甲，嘲讽并回血，攻击附带神圣伤害', set: { hp: 700, matk: 12, pdef: 90, mdef: 60, regen: 4, taunt: 120 } },
    { id: 'dragoon', name: '龙骑士', icon: '🔥', desc: '烈焰长枪横扫更大范围并灼烧', set: { patk: 42, cleave: 80, spd: 290, onhit: { st: 'burn', chance: 0.4, pow: 0.35, dur: 3 } } },
  ],
  battlemage: [
    { id: 'pyromancer', name: '炎魔导师', icon: '🌋', desc: '更大更强的爆炎火球', set: { matk: 42, proj: { color: '#ff5a1a', r: 10, aoe: 90 }, onhit: { st: 'burn', chance: 0.7, pow: 0.4, dur: 3 } } },
    { id: 'cryomancer', name: '冰霜术士', icon: '❄️', desc: '冰爆术冻结一片敌人，施法更快', set: { matk: 26, cd: 1.0, proj: { color: '#9adfff', r: 8, aoe: 70 }, onhit: { st: 'chill', chance: 0.6, dur: 2 } } },
  ],
  griffin: [
    { id: 'skylord', name: '天空骑士长', icon: '🦅', desc: '重甲狮鹫，横扫地面', set: { hp: 450, pdef: 50, mdef: 45, cleave: 40 } },
    { id: 'stormgriffin', name: '风暴狮鹫', icon: '⚡', desc: '在空中远程投射闪电，几率眩晕', set: { patk: 0, matk: 26, cd: 0.9, range: 230, acc: 0.9, pspd: 800, proj: { color: '#9adfff', r: 6 }, onhit: { st: 'stun', chance: 0.15, dur: 0.6 } } },
  ],
};

// ---------- 英雄（在英雄祭坛召唤：每种只能有一位，阵亡后要在复活祭坛花钱复活） ----------
// ability: 自动释放的技能；altar: 需要的祭坛等级；dodge: 闪避率
// perks: 升到对应等级学会的新技能。type: onhit 攻击附带状态 | stat 属性加成（cdr 为技能冷却缩减） | ability 第二个主动技能
const HEROES = {
  paladin: { name: '圣骑士', title: '光明的守护者', icon: '🛡️', color: '#ffd76a', cost: 180, altar: 1,
    hp: 700, patk: 30, matk: 10, pdef: 70, mdef: 50, cd: 0.9, range: 32, spd: 190, regen: 3, taunt: 200, cleave: 45,
    ability: { id: 'holy', name: '圣光审判', icon: '✝️', cd: 10, desc: '治疗周围友军 25% 生命，并对周围敌人造成魔法伤害' },
    dodge: 0.05, perks: [{ lvl: 3, type: 'stat', name: '神圣壁垒', icon: '🔰', mod: { pdef: 25, mdef: 25 }, desc: '物防、魔防 +25' }, { lvl: 6, type: 'onhit', name: '审判之锤', icon: '🔨', on: { st: 'stun', chance: 0.18, dur: 0.8 }, desc: '攻击 18% 几率眩晕敌人' }, { lvl: 10, type: 'ability', name: '圣光鼓舞', icon: '🌟', ab: { id: 'warcry', name: '圣光鼓舞', icon: '🌟', cd: 18 }, desc: '新技能：全军攻击和攻速 +40%，治疗 30%' }],
    desc: '重甲坦克，嘲讽周围敌人，物理和魔法防御都很高' },
  ranger: { name: '精灵游侠', title: '森林的猎手', icon: '🏹', color: '#9fe07a', cost: 160, altar: 1,
    hp: 380, patk: 26, pdef: 25, mdef: 25, cd: 0.45, range: 420, acc: 0.95, pspd: 950, spd: 240, crit: 0.2,
    proj: { color: '#e6f5a8', r: 6, pierce: 2 },
    ability: { id: 'volley', name: '万箭齐发', icon: '🎯', cd: 8, desc: '向目标扇形射出 24 支穿透箭' },
    dodge: 0.15, perks: [{ lvl: 3, type: 'onhit', name: '淬毒箭', icon: '🧪', on: { st: 'poison', chance: 0.35, pow: 0.35, dur: 4 }, desc: '箭矢 35% 几率使敌人中毒' }, { lvl: 6, type: 'stat', name: '鹰眼', icon: '🦅', mod: { crit: 0.15, acc: 0.05, range: 60 }, desc: '暴击 +15%、精度 +5%、射程 +60' }, { lvl: 10, type: 'ability', name: '致命一箭', icon: '🏹', ab: { id: 'snipe', name: '致命一箭', icon: '🏹', cd: 10 }, desc: '新技能：贯穿直线的巨额伤害箭' }],
    desc: '攻速快、精度高的远程物理输出，20% 暴击' },
  archmage: { name: '奥术法师', title: '元素的支配者', icon: '🧙', color: '#9c8cff', cost: 200, altar: 1,
    hp: 340, matk: 40, pdef: 15, mdef: 60, cd: 1.1, range: 400, acc: 0.85, pspd: 520, spd: 190,
    proj: { color: '#ff7b2a', r: 9, aoe: 75 },
    ability: { id: 'meteor', name: '陨石天降', icon: '☄️', cd: 10, desc: '召唤 6 颗陨石轰炸敌群（魔法伤害）' },
    dodge: 0.05, perks: [{ lvl: 3, type: 'onhit', name: '烈焰', icon: '🔥', on: { st: 'burn', chance: 0.5, pow: 0.3, dur: 3 }, desc: '火球 50% 几率灼烧' }, { lvl: 6, type: 'stat', name: '奥术精通', icon: '📘', mod: { cdr: 0.25, matk: 8 }, desc: '技能冷却 -25%，魔攻 +8' }, { lvl: 10, type: 'ability', name: '冰封领域', icon: '❄️', ab: { id: 'blizzard', name: '冰封领域', icon: '❄️', cd: 14 }, desc: '新技能：暴风雪' }],
    desc: '远程魔法范围伤害，克制高物防敌人' },
  necro: { name: '死灵法师', title: '亡者的君王', icon: '🧛', color: '#b07aff', cost: 200, altar: 1,
    hp: 380, matk: 28, pdef: 20, mdef: 50, cd: 0.8, range: 360, acc: 1, pspd: 420, spd: 195, ls: 0.1,
    proj: { color: '#b07aff', r: 7, homing: true },
    ability: { id: 'raise', name: '亡者大军', icon: '⚰️', cd: 14, desc: '召唤 5 名骷髅战士作战 15 秒' },
    dodge: 0.05, perks: [{ lvl: 3, type: 'onhit', name: '腐化', icon: '🦠', on: { st: 'poison', chance: 0.5, pow: 0.35, dur: 4 }, desc: '魂弹 50% 几率使敌人中毒' }, { lvl: 6, type: 'stat', name: '汲魂', icon: '🩸', mod: { ls: 0.15, mdef: 20 }, desc: '吸血 +15%、魔防 +20' }, { lvl: 10, type: 'ability', name: '瘟疫之云', icon: '☠️', ab: { id: 'plague', name: '瘟疫之云', icon: '☠️', cd: 12 }, desc: '新技能：毒云持续伤害并让敌人中毒' }],
    desc: '追踪魂弹必定命中；附近敌人死亡时 15% 几率化为骷髅' },
  frostwitch: { name: '冰霜女巫', title: '永冬的使者', icon: '🧝‍♀️', color: '#8fdcff', cost: 220, altar: 1,
    hp: 360, matk: 30, pdef: 15, mdef: 60, cd: 0.9, range: 380, acc: 0.9, pspd: 560, spd: 195, slow: 1.5,
    proj: { color: '#bfefff', r: 7 },
    ability: { id: 'blizzard', name: '暴风雪', icon: '❄️', cd: 12, desc: '在敌群处降下 4 秒暴风雪，持续魔法伤害并大幅减速' },
    dodge: 0.08, perks: [{ lvl: 3, type: 'onhit', name: '冰封', icon: '🧊', on: { st: 'stun', chance: 0.12, dur: 1 }, desc: '攻击 12% 几率冻结敌人 1 秒' }, { lvl: 6, type: 'stat', name: '寒冰护体', icon: '💠', mod: { mdef: 30, pdef: 15, regen: 3 }, desc: '魔防 +30、物防 +15、回血 +3' }, { lvl: 10, type: 'ability', name: '冰霜新星', icon: '🌨️', ab: { id: 'nova', name: '冰霜新星', icon: '🌨️', cd: 10, st: 'stun' }, desc: '新技能：冻结周围所有敌人 1.5 秒' }],
    desc: '攻击附带减速，控场能力强' },
  warlord: { name: '军团统帅', title: '万军之王', icon: '👑', color: '#ff9a5a', cost: 240, altar: 1,
    hp: 650, patk: 34, pdef: 50, mdef: 35, cd: 0.8, range: 34, spd: 200, cleave: 55, aura: 0.1,
    ability: { id: 'warcry', name: '王者战吼', icon: '📣', cd: 15, desc: '8 秒内全体士兵攻击和攻速 +40%，并治疗 30%' },
    dodge: 0.05, perks: [{ lvl: 3, type: 'stat', name: '铁血', icon: '🛡️', mod: { pdef: 20, regen: 3 }, desc: '物防 +20、回血 +3' }, { lvl: 6, type: 'onhit', name: '撕裂', icon: '🩸', on: { st: 'bleed', chance: 0.35, pow: 0.35, dur: 3 }, desc: '横扫 35% 几率造成流血' }, { lvl: 10, type: 'ability', name: '万军之怒', icon: '😤', ab: { id: 'rage', name: '万军之怒', icon: '😤', cd: 16 }, desc: '新技能：自身狂暴 6 秒' }],
    desc: '光环：在场时全体士兵攻击 +10%' },
  assassin: { name: '影刃刺客', title: '暗夜的獠牙', icon: '🥷', color: '#ff5a7a', cost: 250, altar: 2,
    hp: 420, patk: 48, pdef: 25, mdef: 25, cd: 0.5, range: 28, spd: 290, ls: 0.2, crit: 0.35, critMul: 2.5,
    ability: { id: 'c4', name: '烈性炸药', icon: '🧨', cd: 9, desc: '闪现到敌群中安放炸药，1.5 秒后大爆炸（物理伤害）' },
    dodge: 0.25, perks: [{ lvl: 3, type: 'onhit', name: '剧毒刃', icon: '🐍', on: { st: 'poison', chance: 0.6, pow: 0.3, dur: 4 }, desc: '攻击 60% 几率使敌人中毒' }, { lvl: 6, type: 'stat', name: '残影', icon: '👤', mod: { dodge: 0.15, crit: 0.1 }, desc: '闪避 +15%、暴击 +10%' }, { lvl: 10, type: 'ability', name: '影舞', icon: '🌑', ab: { id: 'rage', name: '影舞', icon: '🌑', cd: 12 }, desc: '新技能：6 秒内攻速翻倍、吸血 +30%' }],
    desc: '单兵作战之王：高攻速、高暴击、20% 吸血' },
  gunner: { name: '雷霆火枪手', title: '矮人的神射手', icon: '🔫', color: '#ffc04a', cost: 230, altar: 2,
    hp: 400, patk: 70, pdef: 30, mdef: 20, cd: 1.6, range: 560, acc: 0.97, pspd: 1500, spd: 180, crit: 0.25,
    proj: { color: '#fff0a0', r: 5, pierce: 2 },
    ability: { id: 'snipe', name: '穿甲狙击', icon: '💥', cd: 9, desc: '射出贯穿整条直线的子弹，造成巨额物理伤害' },
    dodge: 0.05, perks: [{ lvl: 3, type: 'onhit', name: '开花弹', icon: '💢', on: { st: 'bleed', chance: 0.5, pow: 0.25, dur: 3 }, desc: '子弹 50% 几率造成流血' }, { lvl: 6, type: 'stat', name: '快速装填', icon: '⚙️', mod: { cdr: 0.3, aspd: 0.2 }, desc: '技能冷却 -30%、攻速 +20%' }, { lvl: 10, type: 'ability', name: '集束手雷', icon: '💣', ab: { id: 'c4', name: '集束手雷', icon: '💣', cd: 11 }, desc: '新技能：向敌群扔出延时手雷' }],
    desc: '超远射程、超高弹速，几乎不会打偏' },
  druid: { name: '森林德鲁伊', title: '自然的守望者', icon: '🧚', color: '#7ae0a0', cost: 220, altar: 2,
    hp: 420, matk: 22, pdef: 25, mdef: 50, cd: 1.0, range: 340, acc: 0.9, pspd: 480, spd: 200, regen: 4, heal: 30, healCd: 1.5,
    proj: { color: '#9affb0', r: 7 },
    ability: { id: 'grove', name: '自然之愈', icon: '🌿', cd: 14, desc: '治疗周围所有友军 40%，8 秒内每秒回血 +6，并召唤 2 只霜狼' },
    dodge: 0.08, perks: [{ lvl: 3, type: 'stat', name: '生生不息', icon: '🌱', mod: { regen: 4, mdef: 15 }, desc: '回血 +4、魔防 +15' }, { lvl: 6, type: 'onhit', name: '荆棘', icon: '🌵', on: { st: 'poison', chance: 0.4, pow: 0.35, dur: 4 }, desc: '攻击 40% 几率使敌人中毒' }, { lvl: 10, type: 'ability', name: '藤蔓缠绕', icon: '🌿', ab: { id: 'nova', name: '藤蔓缠绕', icon: '🌿', cd: 12, st: 'stun' }, desc: '新技能：定住周围所有敌人 1.5 秒' }],
    desc: '持续治疗队友，群体回血' },
  beastlord: { name: '熊人酋长', title: '荒野的霸主', icon: '🐻', color: '#c08a5a', cost: 260, altar: 2,
    hp: 950, patk: 38, pdef: 60, mdef: 30, cd: 0.85, range: 34, spd: 210, slam: 70, ls: 0.25, regen: 6, taunt: 160,
    ability: { id: 'rage', name: '狂暴', icon: '😤', cd: 14, desc: '6 秒内攻速翻倍、吸血 +30%' },
    dodge: 0.05, perks: [{ lvl: 3, type: 'onhit', name: '撕咬', icon: '🦷', on: { st: 'bleed', chance: 0.4, pow: 0.35, dur: 3 }, desc: '攻击 40% 几率造成流血' }, { lvl: 6, type: 'stat', name: '厚皮', icon: '🐾', mod: { pdef: 30, ls: 0.1 }, desc: '物防 +30、吸血 +10%' }, { lvl: 10, type: 'ability', name: '震地咆哮', icon: '🌋', ab: { id: 'nova', name: '震地咆哮', icon: '🌋', cd: 12, st: 'stun' }, desc: '新技能：震晕周围所有敌人' }],
    desc: '高吸血高回血的肉盾，越打越硬' },
};

// ---------- 局外成长：每局结束获得荣耀，累计荣耀达到要求就永久解锁 ----------
// 荣耀 = (守住的波数 × 2 + 击杀首领 × 5 + 通关 30) × 难度倍率
const UNLOCKS = [
  { kind: 'hero', id: 'necro', need: 15 },
  { kind: 'unit', id: 'crossbow', need: 25 },
  { kind: 'hero', id: 'frostwitch', need: 40 },
  { kind: 'unit', id: 'monk', need: 55 },
  { kind: 'hero', id: 'assassin', need: 70 },
  { kind: 'unit', id: 'berserker', need: 85 },
  { kind: 'hero', id: 'warlord', need: 100 },
  { kind: 'unit', id: 'knight', need: 120 },
  { kind: 'hero', id: 'gunner', need: 140 },
  { kind: 'unit', id: 'battlemage', need: 160 },
  { kind: 'hero', id: 'druid', need: 185 },
  { kind: 'unit', id: 'griffin', need: 210 },
  { kind: 'hero', id: 'beastlord', need: 240 },
];

// ---------- 铁匠铺升级（每级花费 = 基础 × 等级） ----------
const SMITHY = [
  { id: 'lordWeapon', name: '领主武器', icon: '🗡️', desc: '领主攻击 +15%', cost: { gold: 60, stone: 30 } },
  { id: 'lordArmor', name: '领主护甲', icon: '🥋', desc: '领主物防 +8、魔防 +6、生命 +30', cost: { gold: 50, stone: 40 } },
  { id: 'unitWeapon', name: '士兵兵刃', icon: '⚔️', desc: '士兵和英雄物理攻击 +12%', cost: { gold: 70, wood: 20, stone: 40 } },
  { id: 'unitArcane', name: '奥术附魔', icon: '🔯', desc: '士兵和英雄魔法攻击 +12%', cost: { gold: 80, wood: 40 } },
  { id: 'unitArmor', name: '士兵铠甲', icon: '🛡️', desc: '士兵和英雄物防 +8、魔防 +5', cost: { gold: 70, stone: 60 } },
  { id: 'ammo', name: '精钢弹药', icon: '🎯', desc: '防御塔伤害 +12%、精度 +3%', cost: { gold: 40, wood: 40, stone: 40 } },
];
const SMITHY_MAX_PER_LVL = 2; // 铁匠铺每级允许的升级等级上限（1级铺→2，2级→4，3级→6）
const TRAIN_MAX = 5;          // 兵种训练最高等级

// ---------- 每波结束的肉鸽天赋 ----------
// 作用于 G.s（全局）或 G.ls（领主）
const BOONS = [
  { id: 'harvest', name: '丰收', icon: '🌾', desc: '主城、伐木场、采石场的材料产量 <b>+30%</b>', apply: s => s.matProd += 0.3 },
  { id: 'prosper', name: '繁荣', icon: '💰', desc: '民居、金矿场金币产量 <b>+35%</b>', apply: s => s.goldProd += 0.35 },
  { id: 'fortress', name: '坚城', icon: '🧱', desc: '所有建筑生命 <b>+30%</b>', apply: s => s.bldHp += 0.3, rehp: true },
  { id: 'marksman', name: '神射', icon: '🎯', desc: '防御塔伤害 <b>+20%</b>', apply: s => s.towerDmg += 0.2 },
  { id: 'rapid', name: '速射机关', icon: '⚙️', desc: '防御塔攻速 <b>+15%</b>', apply: s => s.towerSpd += 0.15 },
  { id: 'elite', name: '精兵', icon: '⚔️', desc: '士兵和英雄的物理、魔法攻击 <b>+15%</b>', apply: s => s.unitDmg += 0.15 },
  { id: 'iron', name: '铁卫', icon: '🛡️', desc: '士兵和英雄生命 <b>+20%</b>', apply: s => s.unitHp += 0.2 },
  { id: 'steel', name: '钢铁意志', icon: '🪨', desc: '所有友军物理防御 <b>+15</b>', apply: s => s.pdef += 15 },
  { id: 'ward', name: '魔法护盾', icon: '🔰', desc: '所有友军魔法防御 <b>+20</b>', apply: s => s.mdef += 20 },
  { id: 'vamp', name: '吸血鬼之牙', icon: '🧛', desc: '所有友军吸血 <b>+8%</b>', apply: s => s.ls += 0.08 },
  { id: 'spring', name: '生命之泉', icon: '⛲', desc: '所有友军每秒回血 <b>+2</b>', apply: s => s.regen += 2 },
  { id: 'hawkeye', name: '鹰眼', icon: '🦅', desc: '所有友军和防御塔精度 <b>+10%</b>、弹速 <b>+20%</b>', apply: s => { s.acc += 0.1; s.pspd += 0.2; } },
  { id: 'haste', name: '疾风', icon: '💨', desc: '所有友军攻速 <b>+12%</b>', apply: s => s.aspd += 0.12 },
  { id: 'levy', name: '征召令', icon: '📜', desc: '招募和召唤价格 <b>-15%</b>', apply: s => s.unitCost -= 0.15 },
  { id: 'granary', name: '丰饶粮仓', icon: '🌽', desc: '粮食产量 <b>+40%</b>，并立即获得 <b>150 粮食</b>', apply: s => s.foodProd += 0.4, res: { food: 150 } },
  { id: 'magnet', name: '磁石', icon: '🧲', desc: '领主拾取范围 <b>+70</b>', apply: s => s.pickup += 70 },
  { id: 'heroic', name: '领主之力', icon: '💪', desc: '领主攻击 <b>+25%</b>', apply: s => s.lordDmg += 0.25 },
  { id: 'loot', name: '战利品', icon: '🪙', desc: '敌人掉落金币 <b>+25%</b>', apply: s => s.loot += 0.25 },
  { id: 'recycle', name: '回收工坊', icon: '♻️', desc: '金币转材料比例 <b>+15%</b>', apply: s => s.recycle += 0.15 },
  { id: 'architect', name: '建筑学', icon: '📐', desc: '建造与升级花费 <b>-15%</b>', apply: s => s.bldCost -= 0.15 },
  { id: 'reinforce', name: '天降援军', icon: '🎺', desc: '立即获得 <b>4 名剑士</b>', grant: ['swordsman', 4] },
  { id: 'dragonpact', name: '幼龙契约', icon: '🐉', desc: '一只 <b>幼龙</b> 永久加入', grant: ['dragon', 1] },
  { id: 'golem', name: '魔像核心', icon: '🗿', desc: '一只 <b>岩石魔像</b> 永久加入', grant: ['golem', 1] },
  { id: 'wolves', name: '狼群', icon: '🐺', desc: '<b>3 只霜狼</b> 永久加入', grant: ['wolf', 3] },
  { id: 'warchest', name: '战争宝箱', icon: '🎁', desc: '立即获得 <b>150 金币、150 木材、150 石材、100 粮食</b>', res: { gold: 150, wood: 150, stone: 150, food: 100 } },
];

// ---------- 敌人 ----------
// siege: 对建筑伤害倍率；fly: 飞行（无视城墙和悬崖，投石炮打不到）；big: 长枪兵克制；regen: 每秒回血
// 每过一波，敌人物防、魔防各 +1.5
const ENEMIES = {
  goblin: { name: '哥布林', icon: '👺', hp: 30, spd: 95, patk: 7, pdef: 5, mdef: 0, r: 13, gold: 2, color: '#6aa53e' },
  wolfrider: { name: '座狼骑手', icon: '🐗', hp: 45, spd: 150, patk: 9, pdef: 10, mdef: 5, r: 15, gold: 3, color: '#8a6a4a', onhit: { st: 'bleed', chance: 0.2, pow: 0.3, dur: 3 } },
  skeleton: { name: '骷髅兵', icon: '💀', hp: 45, spd: 80, patk: 10, pdef: 40, mdef: 0, r: 14, gold: 2, color: '#d8d2c0' },
  bat: { name: '吸血蝙蝠', icon: '🦇', hp: 28, spd: 140, patk: 6, pdef: 0, mdef: 0, r: 12, gold: 2, color: '#6a3c80', fly: true, ls: 0.5 },
  orc: { name: '兽人攻城兵', icon: '👹', hp: 140, spd: 70, patk: 16, pdef: 30, mdef: 5, r: 20, gold: 5, color: '#b03a2a', siege: 2.5, big: true, onhit: { st: 'bleed', chance: 0.3, pow: 0.3, dur: 3 } },
  ghost: { name: '怨灵', icon: '👻', hp: 50, spd: 65, matk: 8, pdef: 100, mdef: 10, r: 15, gold: 4, color: '#a8c8ff', ranged: { range: 300, cd: 2.2, pspd: 230, acc: 0.75 }, onhit: { st: 'chill', chance: 0.5, dur: 2 } },
  zombie: { name: '腐尸', icon: '🧟', hp: 200, spd: 55, patk: 18, pdef: 10, mdef: 10, r: 18, gold: 5, color: '#5f8a5a', big: true, regen: 3, onhit: { st: 'poison', chance: 0.5, pow: 0.4, dur: 4 } },
  ogre: { name: '食人魔', icon: '👿', hp: 450, spd: 55, patk: 34, pdef: 40, mdef: 20, r: 26, gold: 12, color: '#7a5a3a', siege: 4, big: true, onhit: { st: 'stun', chance: 0.25, dur: 0.8 } },
  wraith: { name: '暗影术士', icon: '🧙‍♀️', hp: 100, spd: 85, matk: 12, pdef: 10, mdef: 80, r: 15, gold: 6, color: '#7040a0', ranged: { range: 340, cd: 1.8, pspd: 280, acc: 0.8, n: 3 }, onhit: { st: 'burn', chance: 0.4, pow: 0.4, dur: 3 } },
  wyvern: { name: '双足飞龙', icon: '🦎', hp: 260, spd: 105, patk: 22, pdef: 30, mdef: 30, r: 20, gold: 10, color: '#4a8a5a', fly: true, siege: 2, big: true, onhit: { st: 'poison', chance: 0.4, pow: 0.4, dur: 4 } },
  // 首领
  troll: { name: '山岭巨魔', icon: '👹', hp: 3000, spd: 70, patk: 40, pdef: 40, mdef: 20, r: 48, gold: 120, color: '#8a4a2a', boss: true, big: true, siege: 3, regen: 20, abilities: ['slam', 'summon'], onhit: { st: 'stun', chance: 0.3, dur: 1 } },
  demon: { name: '深渊恶魔', icon: '😈', hp: 9000, spd: 80, patk: 30, matk: 30, pdef: 50, mdef: 50, r: 50, gold: 220, color: '#c02a40', boss: true, big: true, siege: 3, ls: 0.2, abilities: ['burst', 'dash', 'burst'], onhit: { st: 'burn', chance: 0.5, pow: 0.3, dur: 3 } },
  lich: { name: '巫妖王', icon: '💀', hp: 18000, spd: 70, matk: 55, pdef: 60, mdef: 120, r: 46, gold: 350, color: '#60c0ff', boss: true, big: true, siege: 3, abilities: ['summon', 'burst', 'slam'], onhit: { st: 'chill', chance: 0.6, dur: 2 } },
  dragon: { name: '远古黑龙', icon: '🐲', hp: 40000, spd: 85, patk: 45, matk: 35, pdef: 90, mdef: 90, r: 64, gold: 600, color: '#3a2a50', boss: true, big: true, fly: true, siege: 4, abilities: ['burst', 'dash', 'slam', 'summon'], onhit: { st: 'burn', chance: 0.6, pow: 0.3, dur: 3 } },
};
// ---------- 精英词条：精英怪 1~3 个，后期普通怪和首领也会带。每个词条 +40% 金币和经验 ----------
// from：从第几波开始出现；boss: false 表示首领不会带
const AFFIXES = {
  haste: { name: '疾行', icon: '💨', from: 1, desc: '移速 +45%，攻速 +30%' },
  armored: { name: '坚甲', icon: '🪨', from: 1, desc: '物防、魔防各 +60' },
  shield: { name: '护盾', icon: '🔰', from: 3, desc: '护盾吸收 40% 生命的伤害，5 秒没受伤会重新充满' },
  vampiric: { name: '嗜血', icon: '🧛', from: 3, desc: '35% 吸血' },
  split: { name: '分裂', icon: '🧬', from: 4, boss: false, desc: '死亡时分裂成两个小怪' },
  regen: { name: '再生', icon: '💚', from: 5, desc: '每秒回复 2% 最大生命' },
  thorns: { name: '荆棘', icon: '🌵', from: 6, desc: '近身攻击它会反弹 25% 伤害' },
  explode: { name: '自爆', icon: '💥', from: 6, desc: '死亡时爆炸，伤害周围的单位和建筑' },
  summon: { name: '召唤', icon: '💀', from: 8, desc: '每 7 秒召唤两只骷髅兵' },
  enrage: { name: '狂怒', icon: '😡', from: 8, desc: '生命低于 40% 时伤害 ×1.8、移速 ×1.3' },
  frost: { name: '寒霜', icon: '🧊', from: 10, desc: '冻结周围的友军，使其减速' },
};
const ENEMY_POOL = [
  { type: 'goblin', from: 1, w: 10 },
  { type: 'skeleton', from: 2, w: 7 },
  { type: 'wolfrider', from: 3, w: 5 },
  { type: 'bat', from: 4, w: 4 },
  { type: 'orc', from: 6, w: 4 },
  { type: 'ghost', from: 7, w: 3 },
  { type: 'zombie', from: 9, w: 4 },
  { type: 'ogre', from: 11, w: 2 },
  { type: 'wraith', from: 12, w: 3 },
  { type: 'wyvern', from: 14, w: 2 },
];

// ---------- 敌方据点（进攻玩法） ----------
// 地图上靠近刷怪口的敌人营地。每波都从这里派出额外的增援（extra = 本波敌人数的比例），营地周围有守卫。
// 选中军队左键点过去就会进攻；摧毁后获得奖励，那个方向以后不再有增援。
// hp：第 1 波的生命，每波 +CAMP.grow；每个准备阶段回复 CAMP.regen；守卫按 nGuard [起始, 上限] 每两波 +1 并在准备阶段补满
const CAMP = { grow: 0.15, regen: 0.25, keepAway: 260 };
const CAMPS = {
  goblin: { name: '哥布林营地', icon: '⛺', hp: 1500, pdef: 20, mdef: 10, r: 44, color: '#6aa53e', guards: ['goblin', 'goblin', 'wolfrider'], nGuard: [4, 10],
    extra: 0.15, shoot: { patk: 10, range: 260, cd: 1.3, pspd: 600, acc: 0.85 }, reward: { gold: 200, wood: 140, stone: 140 } },
  orc: { name: '兽人战帐', icon: '🏕️', hp: 3000, pdef: 40, mdef: 20, r: 50, color: '#8a5a3a', guards: ['goblin', 'wolfrider', 'orc'], nGuard: [5, 12],
    extra: 0.2, shoot: { patk: 16, range: 280, cd: 1.1, pspd: 650, acc: 0.85 }, reward: { gold: 350, wood: 220, stone: 220 } },
  undead: { name: '亡灵墓穴', icon: '🪦', hp: 5000, pdef: 60, mdef: 40, r: 54, color: '#8a7aa8', guards: ['skeleton', 'skeleton', 'zombie', 'ghost'], nGuard: [6, 14],
    extra: 0.25, shoot: { matk: 20, range: 300, cd: 1.2, pspd: 520, acc: 0.9 }, reward: { gold: 500, wood: 300, stone: 300 } },
};

// ---------- 建筑联动 ----------
// 两座建筑挨着（中间最多隔 1 格）就生效。a 是受益的建筑，b 是它旁边需要有的建筑
// stat：prod 产量 / dmg 防御塔伤害 / spd 防御塔攻速 / train 招募速度 / lvl 新兵等级；per：每座相邻建筑的加成；max：上限
const SYNERGY = [
  { a: 'farm', b: 'farm', stat: 'prod', per: 0.1, max: 0.3, text: '农田连片：粮食 +10%/块' },
  { a: 'house', b: 'farm', stat: 'prod', per: 0.15, max: 0.3, text: '靠近农田：金币 +15%/块' },
  { a: 'house', b: 'house', stat: 'prod', per: 0.08, max: 0.24, text: '街区：金币 +8%/座' },
  { a: 'mine', b: 'quarry', stat: 'prod', per: 0.2, max: 0.2, text: '矿工协作：金币 +20%' },
  { a: 'quarry', b: 'mine', stat: 'prod', per: 0.2, max: 0.2, text: '矿工协作：石材 +20%' },
  { a: 'lumber', b: 'smithy', stat: 'prod', per: 0.25, max: 0.25, text: '工具供应：木材 +25%' },
  { a: 'arrow', b: 'arrow', stat: 'spd', per: 0.1, max: 0.3, text: '箭塔群：攻速 +10%/座' },
  { a: 'arrow', b: 'wall', stat: 'dmg', per: 0.03, max: 0.15, text: '城墙掩护：伤害 +3%/段' },
  { a: 'cannon', b: 'smithy', stat: 'dmg', per: 0.25, max: 0.25, text: '铁匠供弹：伤害 +25%' },
  { a: 'cannon', b: 'quarry', stat: 'spd', per: 0.2, max: 0.2, text: '石料充足：攻速 +20%' },
  { a: 'magic', b: 'magic', stat: 'dmg', per: 0.12, max: 0.24, text: '法阵共鸣：伤害 +12%/座' },
  { a: 'magic', b: 'altar', stat: 'dmg', per: 0.2, max: 0.2, text: '祭坛之力：伤害 +20%' },
  { a: 'barracks', b: 'smithy', stat: 'train', per: 0.3, max: 0.3, text: '装备齐全：招募速度 +30%' },
  { a: 'barracks', b: 'training', stat: 'lvl', per: 1, max: 1, text: '新兵受训：招募的士兵 +1 级' },
];

// ---------- 随机事件 ----------
// 每波结束选完天赋后，有 EVENT_CHANCE 的几率遇到一个事件（从第 EVENT_FROM 波起）
// 选项：cost 花费、gain 获得、fx 特殊效果（见 game.js 的 EVENT_FX），什么都没有就是“离开”
const EVENT_CHANCE = 0.5, EVENT_FROM = 2;
const EVENTS = [
  { id: 'caravan', icon: '🐫', name: '流浪商队', text: '一支商队在要塞外扎营，商人愿意和你做点买卖。', opts: [
    { label: '买材料', cost: { gold: 100 }, gain: { wood: 160, stone: 160 } },
    { label: '卖材料', cost: { wood: 120, stone: 120 }, gain: { gold: 150 } },
    { label: '神秘货物', cost: { gold: 180 }, fx: 'boon', desc: '随机获得一项天赋' },
    { label: '离开' }] },
  { id: 'mercs', icon: '⚔️', name: '流浪佣兵', text: '一队打完仗的佣兵正在找活干，只要给钱就跟你走。', opts: [
    { label: '雇佣', cost: { gold: 150 }, fx: 'mercs', desc: '获得 3 名随机士兵（3 级）' },
    { label: '离开' }] },
  { id: 'curse', icon: '💀', name: '诅咒祭坛', text: '荒野里出现一座冒着黑烟的祭坛，低语声许诺财富，代价是更强的敌人。', opts: [
    { label: '接受诅咒', fx: 'curse', desc: '下一波敌人生命 +30%，但掉落金币 ×2' },
    { label: '献祭粮食', cost: { food: 60 }, fx: 'xpAll', desc: '所有士兵获得大量经验' },
    { label: '离开' }] },
  { id: 'refugee', icon: '🏚️', name: '难民', text: '一群逃难的村民来到城下，请求收留。他们会种地和做工。', opts: [
    { label: '收留', cost: { food: 70 }, fx: 'refugee', desc: '金币、材料、粮食产量永久 +8%' },
    { label: '拒绝' }] },
  { id: 'ruins', icon: '🏛️', name: '古代遗迹', text: '斥候在附近发现一处遗迹，里面可能有宝藏，也可能有沉睡的守卫。', opts: [
    { label: '探索', fx: 'ruins', desc: '60%：🪙250 🪵120 🪨120；40%：一只精英怪出现在主城附近' },
    { label: '离开' }] },
  { id: 'drill', icon: '📯', name: '老兵教官', text: '一位退役的老兵愿意花几天时间操练你的部队。', opts: [
    { label: '请他操练', cost: { gold: 130 }, fx: 'xpAll', desc: '所有士兵获得大量经验' },
    { label: '离开' }] },
  { id: 'spring', icon: '⛲', name: '圣泉', text: '工匠在城内挖出一眼泉水，泉水有治愈的力量。', opts: [
    { label: '修缮要塞', fx: 'repair', desc: '所有建筑恢复满生命' },
    { label: '装瓶出售', gain: { gold: 120 } }] },
  { id: 'spy', icon: '🕵️', name: '敌营内讧', need: 'camp', text: '探子回报：敌方营地里为分赃吵了起来。', opts: [
    { label: '派人煽动', cost: { gold: 80 }, fx: 'spy', desc: '随机一座敌方据点损失 50% 生命，守卫减半' },
    { label: '无视' }] },
  { id: 'fair', icon: '🌾', name: '丰收节', text: '今年收成不错，村民们想办一场庆典。', opts: [
    { label: '储存粮食', gain: { food: 90 } },
    { label: '拿去集市卖', gain: { gold: 110 } }] },
];

// ================= 征服大陆模式 =================
// 一整块大陆（160×160 格），玩家从西南角的 1 级主城开始发展，摧毁三个敌国的王城即称霸大陆。
// 敌国有自己的资源和经济：王城和资源建筑产出资源，资源用来盖新建筑、造兵；攒够兵就按玩家的实力决定怎么进攻。
const CONQ = {
  tick: 1,                 // 敌国 AI 每隔几秒做一次决策
  eraTime: 150,            // 每过多少秒敌人强度（相当于守城模式的波次）+1，最高 20
  upkeep: 90,              // 每隔多少秒士兵和英雄吃一次饭（和守城模式每波开战吃饭相同）
  grace: [240, 360, 480],  // 三个敌国（按离玩家由近到远）最早多少秒后开始进攻
  attackCd: [70, 120],     // 两次进攻之间的间隔（秒）
  keepAway: 7,             // 玩家建筑离敌国建筑至少几格
  // 策略：玩家实力 / 敌国实力 的比值
  defendAt: 1.6,           // 高于此值：龟缩防守，多造塔，攒满大军才出击
  raidAt: 0.7,             // 低于此值：频繁派小队骚扰玩家的经济建筑
  lvl0: [3, 4, 5],         // 三个敌国士兵的开局等级（玩家士兵从 1 级起步），之后每升一级科技 +1
  lvlHp: 0.15, lvlDmg: 0.08, lvlDef: 2,  // 敌国士兵每级：生命 +15%、伤害 +8%、双防 +2
  army0: [8, 10, 12],      // 三个敌国开局的军队人数
  kingShield: 0.3,         // 国王活着时，王城只受到 30% 的伤害
};
// 敌国国王：守在王城旁边的首领。base 是借用美术和技能的首领原型；hp/patk/matk 会随敌国科技 +15%/级成长
const KINGS = {
  goblin: { name: '哥布林大王·格鲁克', base: 'troll', hp: 9000, patk: 60, pdef: 45, mdef: 30, spd: 75, r: 52, regen: 35, gold: 400,
    abilities: ['slam', 'summon'], onhit: { st: 'stun', chance: 0.3, dur: 1 } },
  orc: { name: '兽人督军·格罗姆', base: 'demon', hp: 14000, patk: 80, pdef: 60, mdef: 40, spd: 85, r: 54, regen: 40, ls: 0.15, gold: 600,
    abilities: ['dash', 'slam', 'summon'], onhit: { st: 'bleed', chance: 0.5, pow: 0.3, dur: 3 } },
  undead: { name: '巫妖王·克尔苏加德', base: 'lich', hp: 16000, matk: 75, pdef: 55, mdef: 120, spd: 70, r: 50, regen: 45, gold: 800,
    abilities: ['burst', 'summon', 'slam'], onhit: { st: 'chill', chance: 0.6, dur: 2 } },
};
// 中立野怪巢穴：散布在大陆上，守卫打光后获得奖励（boon：额外送一个随机天赋）
const LAIRS = {
  bats: { name: '蝙蝠洞', icon: '🦇', lvl: 2, units: [['bat', 6]], loot: { gold: 160, wood: 60 } },
  wolves: { name: '狼骑营地', icon: '🐺', lvl: 3, units: [['wolfrider', 4], ['goblin', 3]], loot: { gold: 220, wood: 120 } },
  crypt: { name: '荒芜古墓', icon: '⚰️', lvl: 4, units: [['skeleton', 5], ['ghost', 2]], loot: { gold: 260, stone: 200 } },
  ogres: { name: '食人魔洞窟', icon: '🪨', lvl: 5, units: [['ogre', 3], ['orc', 3]], loot: { gold: 420, stone: 160 }, boon: true },
  troll: { name: '巨魔石桥', icon: '🌉', lvl: 5, units: [['troll', 1], ['goblin', 4]], loot: { gold: 600, wood: 200, stone: 200 }, boon: true },
  wyverns: { name: '飞龙之巢', icon: '🐉', lvl: 7, units: [['wyvern', 3], ['wraith', 2]], loot: { gold: 900, wood: 300, stone: 300 }, boon: true },
};
// 宝物：领主走过去就能拾取
const RELICS = {
  chest: { name: '宝箱', icon: '📦', loot: { gold: [80, 160], wood: [40, 100], stone: [40, 100] } },
  shrine: { name: '古代神龛', icon: '🗿', boon: true },
  well: { name: '生命之泉', icon: '⛲', xp: 120, heal: true },
};
// 敌国：units 是 [兵种, 从第几科技开始]；敌国科技 = 1 + 王城存活时间 / 180 秒（最高 8）
const FACTIONS = {
  goblin: { name: '哥布林部落', icon: '👺', color: '#8ad04a', hue: 60, units: [['goblin', 1], ['wolfrider', 1], ['bat', 2], ['orc', 3], ['ogre', 5]],
    res: { gold: 200, wood: 200, stone: 200 }, income: 1, desc: '离你最近，发育快、爱骚扰' },
  orc: { name: '兽人氏族', icon: '👹', color: '#e06a3a', hue: 0, units: [['orc', 1], ['wolfrider', 1], ['goblin', 1], ['ogre', 3], ['wyvern', 5]],
    res: { gold: 300, wood: 300, stone: 300 }, income: 1.15, desc: '兵强马壮，攻城凶猛' },
  undead: { name: '亡灵王国', icon: '💀', color: '#a88ae0', hue: 250, units: [['skeleton', 1], ['zombie', 1], ['ghost', 2], ['bat', 2], ['wraith', 4]],
    res: { gold: 400, wood: 400, stone: 400 }, income: 1.3, desc: '最远也最强，大军压境' },
};
// 敌国建筑（借用玩家建筑的美术，画面上会染成敌国颜色）
// prod：每秒产出；shoot：会射击靠近的单位；cost：敌国建造花费；loot：被摧毁时玩家获得的资源
const EBLD = {
  hq: { name: '王城', art: 'castle', icon: '🏯', size: 4, hp: 7000, prod: { gold: 2.2, wood: 1.6, stone: 1.6 }, shoot: { patk: 24, range: 340, cd: 0.8, pspd: 800, acc: 0.9 }, loot: { gold: 800, wood: 500, stone: 500 } },
  barracks: { name: '兵营', art: 'barracks', icon: '⛺', size: 3, hp: 1600, cost: { wood: 160, stone: 120 }, loot: { gold: 120, wood: 80, stone: 60 } },
  tower: { name: '箭塔', art: 'arrow', icon: '🗼', size: 2, hp: 1000, cost: { wood: 110, stone: 90 }, shoot: { patk: 18, range: 300, cd: 0.75, pspd: 850, acc: 0.88 }, loot: { gold: 60, wood: 50, stone: 40 } },
  mine: { name: '金矿', art: 'mine', icon: '💰', size: 2, hp: 700, cost: { wood: 90, stone: 60 }, prod: { gold: 1.4 }, loot: { gold: 150 } },
  lumber: { name: '伐木场', art: 'lumber', icon: '🪓', size: 2, hp: 600, cost: { wood: 40, stone: 60 }, prod: { wood: 1.4 }, loot: { wood: 120 } },
  quarry: { name: '采石场', art: 'quarry', icon: '⛏️', size: 2, hp: 600, cost: { wood: 70, stone: 30 }, prod: { stone: 1.4 }, loot: { stone: 120 } },
};
// 敌国造一个兵的金币 = 怪物的金币掉落 × 这个倍数
const EUNIT_COST = 14;

// 大陆地图：按固定种子生成（每局一样）。
// 布局：一条大河自西向东把大陆分成南北两半，只有 4 处浅滩可以过河；道路连接主城、各国王城和浅滩；
// 野怪巢穴离你越远越强，巨魔守在中间的浅滩上；部分宝物藏在巢穴旁边
function makeContinent() {
  let s = 20261029;
  const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648, R = (a, b) => a + r() * (b - a);
  const SZ = 160, castle = [12, 142];
  const cities = [{ fac: 'goblin', at: [140, 138] }, { fac: 'orc', at: [16, 16] }, { fac: 'undead', at: [140, 14] }];
  const P = [castle[0] + 2, castle[1] + 2], C = cities.map(c => [c.at[0] + 2, c.at[1] + 2]);
  const keep = [P, ...C];
  // 线段距离（单位：格）
  const segD = (x, y, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)); return Math.hypot(x - ax - t * dx, y - ay - t * dy); };
  const lineD = (x, y, pts) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segD(x, y, pts[i - 1], pts[i])); return d; };
  // 大河
  const riverAt = t => [-2 + t * 164, 104 - t * 30 + Math.sin(t * 6.5) * 7];
  const river = []; for (let k = 0; k <= 60; k++) river.push(riverAt(k / 60));
  const fordT = [0.18, 0.42, 0.63, 0.85], fords = fordT.map(riverAt);
  const lakes = [];
  for (let k = 0; k <= 200; k++) { const t = k / 200; if (fordT.some(f => Math.abs(t - f) < 0.022)) continue; const [x, y] = riverAt(t), rr = R(70, 92); lakes.push([x * 40, y * 40, rr, rr * R(0.85, 1)]); }
  // 道路：先定几个路口，再在中间加一点弯曲
  const wig = (pts, amp) => { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 12)), nx = -(by - ay), ny = bx - ax, l = Math.hypot(nx, ny) || 1;
    for (let k = 1; k <= n; k++) { const q = k / n, w = k < n ? Math.sin(q * Math.PI) * R(-amp, amp) : 0; out.push([ax + (bx - ax) * q + nx / l * w, ay + (by - ay) * q + ny / l * w]); } } return out; };
  const south = [80, 128], north = [80, 30];
  const roadsT = [
    wig([P, [46, 136], south, [112, 140], C[0]], 3),      // 主城 → 哥布林
    wig([P, [22, 122], fords[0], [20, 60], C[1]], 3),      // 主城 → 浅滩 → 兽人
    wig([C[0], [136, 104], fords[3], [140, 44], C[2]], 3), // 哥布林 → 浅滩 → 亡灵
    wig([C[1], [50, 24], north, [112, 20], C[2]], 3),     // 兽人 → 亡灵
    wig([south, [70, 112], fords[1], [70, 60], north], 2), // 中央大道
    wig([[112, 140], [104, 110], fords[2], [100, 56], [112, 20]], 2),
  ];
  const nearRoad = (x, y, d) => roadsT.some(rd => lineD(x, y, rd) < d);
  const far = (tx, ty, d) => keep.every(([kx, ky]) => Math.hypot(tx - kx, ty - ky) > d) && tx > 6 && ty > 6 && tx < SZ - 6 && ty < SZ - 6;
  const wet = (tx, ty, pad) => lineD(tx, ty, river) < pad || lakes.some(l => Math.hypot(tx - l[0] / 40, ty - l[1] / 40) < l[2] / 40 + pad - 2);
  const spot = (d, ok) => { for (let k = 0; k < 400; k++) { const tx = R(8, SZ - 8), ty = R(8, SZ - 8); if (far(tx, ty, d) && (!ok || ok(tx, ty))) return [tx, ty]; } return null; };
  // 高地：远离河和路
  const plateaus = [], ramps = [];
  for (let k = 0; k < 200 && plateaus.length < 6; k++) {
    const rx = Math.round(R(7, 11)), ry = Math.round(R(6, 9)), p = spot(24, (x, y) => !wet(x, y, Math.max(rx, ry) + 5) && !nearRoad(x, y, Math.max(rx, ry) + 3));
    if (!p) continue; const x = Math.round(p[0]), y = Math.round(p[1]);
    if (plateaus.some(q => Math.hypot(q.e[0] - x, q.e[1] - y) < q.e[2] + rx + 10)) continue;
    plateaus.push({ e: [x, y, rx, ry] });
    ramps.push([x - 2, y - ry - 2, 4, 4], [x - 2, y + ry - 2, 4, 4], [x - rx - 2, y - 2, 4, 4], [x + rx - 2, y - 2, 4, 4]);
  }
  const onPlateau = (tx, ty, pad) => plateaus.some(p => ((tx - p.e[0]) / (p.e[2] + pad)) ** 2 + ((ty - p.e[1]) / (p.e[3] + pad)) ** 2 < 1);
  const open = pad => (x, y) => !wet(x, y, pad) && !onPlateau(x, y, pad) && !nearRoad(x, y, pad);
  // 池塘
  for (let k = 0; k < 6; k++) { const p = spot(20, open(10)); if (p) lakes.push([p[0] * 40, p[1] * 40, R(120, 200), R(90, 150)]); }
  // 成片的森林、岩石山脊、金矿脉（离道路远一点）
  const forests = [], rocks = [], veins = [];
  for (let i = 0; i < 24; i++) { const p = spot(12, open(4)); if (p) forests.push([p[0] * 40, p[1] * 40, R(170, 260), Math.round(R(40, 62))]); }
  for (let i = 0; i < 7; i++) { const p = spot(14, open(5)); if (!p) continue; const a = R(0, Math.PI); for (let k = -2; k <= 2; k++) rocks.push([(p[0] + Math.cos(a) * k * 4) * 40, (p[1] + Math.sin(a) * k * 4) * 40, 90, 7]); }
  for (let i = 0; i < 10; i++) { const p = spot(14, open(3)); if (p) veins.push([p[0] * 40, p[1] * 40, 90, 6]); }
  // 每座城旁边都有树林、石头和金矿
  for (const [cx, cy] of keep) {
    const dx = Math.sign(SZ / 2 - cx), dy = Math.sign(SZ / 2 - cy);
    forests.push([(cx + dx * 14) * 40, (cy - dy * 3) * 40, 200, 34]);
    rocks.push([(cx - dx * 2) * 40, (cy + dy * 13) * 40, 120, 12]);
    veins.push([(cx + dx * 13) * 40, (cy + dy * 13) * 40, 90, 6]);
  }
  // 野怪巢穴：按离主城的远近排强弱；巨魔守在中央下游的浅滩
  const lairs = [], used = [];
  const lairOk = (x, y) => !wet(x, y, 5) && !onPlateau(x, y, 3) && !nearRoad(x, y, 3) && Math.hypot(x - P[0], y - P[1]) > 26 && used.every(([ux, uy]) => Math.hypot(ux - x, uy - y) > 18);
  lairs.push({ kind: 'troll', at: [Math.round(fords[2][0]) + 1, Math.round(fords[2][1]) + 5] }); used.push(lairs[0].at);
  const spots = [];
  for (let k = 0; k < 10; k++) { const p = spot(22, lairOk); if (p) { used.push(p); spots.push(p); } }
  spots.sort((a, b) => Math.hypot(a[0] - P[0], a[1] - P[1]) - Math.hypot(b[0] - P[0], b[1] - P[1]));
  const kinds = ['bats', 'bats', 'wolves', 'wolves', 'crypt', 'crypt', 'ogres', 'ogres', 'wyverns', 'wyverns'];
  spots.forEach((p, i) => lairs.push({ kind: kinds[i], at: p.map(Math.round) }));
  // 宝物：一半藏在巢穴旁（打下巢穴顺便拿），一半散在野外
  const relics = [], rk = ['chest', 'chest', 'chest', 'chest', 'chest', 'chest', 'chest', 'chest', 'shrine', 'shrine', 'shrine', 'well', 'well', 'well'];
  rk.forEach((kind, i) => {
    let p = null;
    if (i % 2 === 0 && lairs[i >> 1]) { const [lx, ly] = lairs[i >> 1].at; p = [lx + 3, ly - 2]; }
    else p = spot(16, (x, y) => open(3)(x, y) && used.every(([ux, uy]) => Math.hypot(ux - x, uy - y) > 9));
    if (p) { used.push(p); relics.push({ kind, at: p.map(Math.round) }); }
  });
  return {
    id: 'continent', conquest: true, size: SZ, tiles: 'vale', name: '征服大陆', icon: '👑', color: '#ffd76a',
    desc: '征服模式：没有波次，从一座小城开始发展，三个敌国也在发育并按你的实力派兵进攻。一条大河把大陆分成南北两半，只有几处浅滩可以通过。摧毁所有敌国王城即称霸大陆。',
    tags: ['征服模式', '3 个敌国', '大陆地图'],
    ground: ['#3b5f33', '#3a5e31', '#2e4a28', '#43703a', '#4f6a30', '#35552c'], high: '#5c7a3e', ramp: '#8a7650',
    castle, cities, plateaus, ramps, portals: [], lairs, relics, lakes, forests, rocks, veins,
    roads: roadsT.map(rd => rd.map(([x, y]) => [x * 40, y * 40])), fords: fords.map(([x, y]) => [x * 40, y * 40]),
    graves: [(140 + 2) * 40, (14 + 12) * 40, 300],
    res: { gold: 1, wood: 1.1, stone: 1.1 }, castleProd: { wood: [3, 5, 8], stone: [2.5, 4.5, 7], gold: [0.8, 1.5, 2.5], food: [1.2, 2, 3] },
  };
}
MAPS.push(makeContinent());

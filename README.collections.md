# 内容与栏目维护

当前维护方式已改为单份中文 + 按需机器翻译，详见 `README.i18n.md`。旧译文仅作历史存档。

## 内容

- 音乐：Coffee — beabadoobee、time machine (feat. aren park) — mj apanay / aren park；保留 phonekisses 和 nop，共四首。
- 随笔：DDoS、SQL 注入、日语学习各一篇，安排在 2026-08-16、2026-09-06、2026-09-24，均在首篇文章与本次更新之间。`updated` 记录本次整理日期 2026-10-01。这是按要求编排的日记时间，不代表发生过真实攻击。
- 三篇旧随笔已改成笔记口吻，另加 2026-10-02 的 LAN、以太网、CSMA/CD 与 PoE 笔记；保留原来的 hello world 正文。
- 图片：六幅壁纸，其中两幅沿用网站已有图片，四幅从个人图库复制。
- 放映室：两段雨夜动态壁纸，点击才播放；播放一段时暂停另一段，播放视频也会暂停音乐。

## 栏目设计

| 原地址 | 当前展示 |
| --- | --- |
| `/music/` | 唱片式介绍、封面歌单和点播按钮 |
| `/Gallery/` | 宽幅画廊、天空/冬日/纯白筛选、原图入口 |
| `/movies/` | 深蓝放映卡片、原生视频控制器 |
| `/link/` | 邻站邀请和独立的常用资源卡片 |
| `/about/` | 个人名片、阅读入口和小站时间线 |
| `/tags/` | 关键词标签卡片 |
| `/categories/` | 笔记分类卡片与文章计数 |

只编辑中文 source 目录。每个栏目的源 Markdown 保留标题和页面类型；`aside: false` 与 `top_img: false` 给独立栏目布局让出空间。正文是中文栏目导语。文章页不经过此栏目渲染器。

`tools/i18n/sections.cjs` 在构建期间为上述七页生成栏目结构；`source/css/sections.css` 负责布局，`source/js/sections.js` 只负责筛选和视频互斥。保留语言回退提示、原生标签/分类链接，以及折叠的评论区域。未来 Butterfly 升级时应重点预览这些页面。

## 添加音乐

1. 将新音频放进 `source/music/`，建议使用稳定的 ASCII 文件名。
2. 在 `source/data/collections.json` 的 `tracks` 数组追加一条：

```json
{
  "id": "stable-song-id",
  "name": "歌曲名",
  "artist": "表演者",
  "url": "/music/stable-song-id.mp3",
  "cover": "/img/cover.jpg"
}
```

`id` 必须唯一。音乐页面和全站浮动播放器共享这份清单，无需再编辑主题中的内联脚本。顺序由数组决定；沿用 APlayer 原有的随机播放设置。点播会打开播放器，收起面板后音乐继续播放。站内普通链接通过 PJAX 切页，音乐保持连续；切换阅读语言也不会刷新播放器。

APlayer 沿用原项目的 CDN，未引入新的播放器插件。如果脚本未能加载，歌曲卡片仍链接到本地 MP3，浏览器可以直接打开音频。

## 添加壁纸或动态壁纸

静态图片放进 `source/img/gallery/`，在清单 `images` 数组登记 `id`、`url`、`group`、`title.zh-CN` 和实际像素 `width`/`height`。现有分组为 `sky`、`snow`、`white`；新增分组需同时调整渲染器的筛选项和 `i18n/sections.json`。

图片保留原文件，列表以 16:9 裁切预览，点击可看原图。`loading="lazy"` 延迟加载屏幕以外的图片。不启用 JavaScript 时仍展示全部图片，筛选栏不会出现。

动态壁纸放进 `source/videos/`，在 `videos` 数组登记唯一 `id`、`url` 和`title.zh-CN`。浏览器使用原生 `<video>`，不自动播放。标题是整理时起的展示名称，不是原作品官方名称。

本次媒体来自这些现有本地文件，只复制使用，未修改源文件：

| 博客资源 | 个人收藏原文件 |
| --- | --- |
| `music/coffee.mp3` | `Music/song/coffee.mp3` |
| `music/timemachine.mp3` | `Music/song/timemachine.mp3` |
| `img/gallery/blue-evening.jpg` | `【哲风壁纸】下雪-二次元-冬季.jpg` |
| `img/gallery/white-wings.jpg` | `【哲风壁纸】二次元-坐姿-天使.jpg` |
| `img/gallery/winter-shrine.jpg` | `【哲风壁纸】下雪-冬日-动漫少女.jpg` |
| `img/gallery/cloud-door.png` | `【哲风壁纸】云-安逸-时空之门.png` |
| `videos/rainy-reading.mp4` | `【哲风壁纸】下雨-书籍-台灯.mp4` |
| `videos/city-lights.mp4` | `【哲风壁纸】城市夜景-城市灯光.mp4` |

## 修改栏目文字与文章

- 页面导语：`source/<栏目>/index.md`。
- 栏目标题、副标题、按钮、关于页时间线：`i18n/sections.json` 的 `zh-CN` 部分。
- 原生菜单、主题文字：`_config.butterfly.yml`、`i18n/locales.json` 的中文部分。
- 友链：`source/_data/link.yml`，遵循 Butterfly 原结构；已有真实友链会保留在栏目中。
- 文章：只维护 `source/_posts/`，新增方法见 `README.i18n.md`。`locales/` 里的旧译文不再构建。
- 标签、分类：中文名称与固定 slug 在 `i18n/taxonomies.json`，已发布地址不要随意更名。

## 构建、预览和部署

```sh
npm test
npm run build
npm run preview
```

预览 `http://127.0.0.1:4000/`，以及 `/zh-tw/`、`/ja/`、`/en/`。改完后需要重新构建；若 Windows 因媒体连接占用文件而无法替换输出，先停预览再构建。

构建会检查站内页面和资源、语言关联、canonical、hreflang、sitemap，以及播放器清单。测试还会验证评论保留、画廊翻译和音视频 HTTP 分段读取。原来的文章 URL 和七个导航入口保留。

部署沿用 `.github/workflows/pages.yml`：提交源码并推送 main 后，GitHub Actions 运行测试和构建，再发布整个 `public/`。不要手动提交 `public/` 或 `work/`。本地修改不会自行执行推送或远程部署。

媒体现在只生成一份，不再复制到三个语言目录。以后收录大量媒体时可单独评估存储方式。

任务开始前的源码快照保存在 `work/backups/before-content-20261001/project-4ede804.zip`，构建器继续保留上次生成结果。没有删除原有文章、图片或音乐。

## 历史验收（2026-10-01，四语言版本）

- 正式四语言构建成功，共 88 个 HTML 页面；站内链接、必需路由、语言隔离、canonical、hreflang 和 sitemap 检查通过。
- 自动化测试两项通过，独立的 84 页样例覆盖缺译文、空语言站、草稿、标签分类、技术片段保护和媒体请求。
- 最新正式输出的 88 个页面、四首音乐、两段视频、六张壁纸与原有文章 URL 均通过本地 HTTP 检查；音视频分段响应和内容类型正确。
- 浏览器检查涵盖 1366px 桌面、390px 手机、日夜模式、点播、壁纸筛选、视频互斥、标签进入文章、文章语言切换和评论快捷展开。
- 修正了点播后浮层立即关闭、折叠评论无法通过快捷入口展开，以及主题随机标签背景与蓝灰配色冲突的问题。
- 未修改原有 hello world 正文或旧音乐；没有删除已存在的源码文件，没有新增依赖。本次没有执行远程推送或部署。

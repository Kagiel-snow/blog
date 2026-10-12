# 内容与栏目维护

当前维护方式已改为单份中文 + 按需机器翻译，详见 `README.i18n.md`。旧译文仅作历史存档。

## 内容

- 音乐：网易云在线歌单与搜索点播，默认热歌榜；全站共用一个 APlayer。原有四首本地音频保留为历史文件，不再作为播放音源。
- 随笔：DDoS、SQL 注入、日语学习各一篇，安排在 2026-08-16、2026-09-06、2026-09-24，均在首篇文章与本次更新之间。`updated` 记录本次整理日期 2026-10-01。这是按要求编排的日记时间，不代表发生过真实攻击。
- 三篇旧随笔已改成笔记口吻，另加 2026-10-02 的 LAN、以太网、CSMA/CD 与 PoE 笔记；保留原来的 hello world 正文。
- 图片：六幅壁纸，其中两幅沿用网站已有图片，四幅从个人图库复制。
- 放映室：两段雨夜动态壁纸，点击才播放；播放一段时暂停另一段，播放视频也会暂停音乐。

## 栏目设计

| 原地址 | 当前展示 |
| --- | --- |
| `/music/` | 网易云歌单、歌曲与歌手搜索、封面点播、歌单切换 |
| `/Gallery/` | 宽幅画廊、天空/冬日/纯白筛选、原图入口 |
| `/movies/` | 深蓝放映卡片、原生视频控制器 |
| `/link/` | 邻站邀请和独立的常用资源卡片 |
| `/about/` | 个人名片、阅读入口和小站时间线 |
| `/tags/` | 关键词标签卡片 |
| `/categories/` | 笔记分类卡片与文章计数 |

只编辑中文 source 目录。每个栏目的源 Markdown 保留标题和页面类型；`aside: false` 与 `top_img: false` 给独立栏目布局让出空间。正文是中文栏目导语。文章页不经过此栏目渲染器。

`tools/i18n/sections.cjs` 在构建期间为上述七页生成栏目结构；`source/css/sections.css` 负责布局，`source/js/sections.js` 只负责筛选和视频互斥。保留语言回退提示、原生标签/分类链接，以及折叠的评论区域。未来 Butterfly 升级时应重点预览这些页面。

## 添加音乐

在音乐页搜索歌曲或歌手，点播会把歌曲加入全站播放器。展开“换一个网易云歌单”，粘贴公开歌单链接或数字 ID 即可载入；成功后浏览器记住这个 ID。换歌单只更新浏览列表，当前播放保持连续。

全站默认歌单在 `source/data/music.json` 配置：`playlistId`、`playlistName` 是歌单 ID 和展示名称，`endpoint` 是兼容 Meting 的 HTTPS 接口。默认 `3778678` 为网易云热歌榜，接口为 `https://api.i-meto.com/meting/api`。`collections.json` 的旧 `tracks` 现在为空，不再登记本地 MP3。

`source/js/music-source.js` 负责远程请求、格式检查、超时及取消；`source/js/music.js` 负责搜索、歌单浏览与共享播放器。只在进入音乐页或展开播放器时加载歌单，不自动播放。歌单最多显示接口返回的 200 首，搜索展示接口返回的结果（目前通常 30 首）；“显示更多”仅展开已经获取的列表。

保持 API 返回的签名音频地址，播放时由第三方重定向到当前音源；不要把会过期的最终 CDN 地址写入清单。接口目前支持跨域，使用浏览器 GET，不需要网站新增服务器或密钥。更换接口须同时支持网易云 `playlist`、`search` 和 `{title,author,url,pic}` 数组格式。参考 [MetingJS 文档](https://github.com/metowolf/MetingJS) 和 [Meting-API 实现](https://github.com/metowolf/Meting-API)。APlayer 的脚本仍由本站现有 vendor 提供。

点播会展开播放器，收起后继续播放；普通站内链接通过 PJAX 切页，音乐与播放进度保留。播放失败会暂停并显示重试、网易云原曲入口，避免自动跳过大量失效曲目。接口不可用时可以重试或直接进入原歌单；不启用 JavaScript 时保留原歌单链接。歌名和歌手不参与页面机器翻译。

第三方接口与音频平台的开放范围并不相同，曲目可能受地区、下架、登录或会员权限限制。本实现不提交账号 Cookie，不解密本地会员文件，也不提供下载或权限绕过。公共接口没有可用性保证，后续如果需要服务承诺，可将 `endpoint` 换成自己的兼容服务。

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

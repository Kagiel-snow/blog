# 内容与栏目维护

当前维护方式已改为单份中文 + 按需机器翻译，详见 `README.i18n.md`。旧译文仅作历史存档。

## 内容

- 音乐：导入「記憶」等网易云歌单目录，优先播放 Audius、SoundCloud 同曲音频，未找到时补用网易云官方公开原曲；可手动选择 B 站视频版本。全站共用播放器和可搜索的播放列表浮窗，原有四首本地音频不再作为播放音源。
- 随笔：DDoS、SQL 注入、日语学习各一篇，安排在 2026-08-16、2026-09-06、2026-09-24，均在首篇文章与本次更新之间。`updated` 记录本次整理日期 2026-10-01。这是按要求编排的日记时间，不代表发生过真实攻击。
- 三篇旧随笔已改成笔记口吻，另加 2026-10-02 的 LAN、以太网、CSMA/CD 与 PoE 笔记；保留原来的 hello world 正文。
- 图片：六幅壁纸，其中两幅沿用网站已有图片，四幅从个人图库复制。
- 放映室：两段雨夜动态壁纸，点击才播放；播放一段时暂停另一段，播放视频也会暂停音乐。

## 栏目设计

| 原地址 | 当前展示 |
| --- | --- |
| `/music/` | 默认歌单、音频与视频版本搜索、点播、歌单切换、视频链接播放 |
| `/Gallery/` | 宽幅画廊、天空/冬日/纯白筛选、原图入口 |
| `/movies/` | 深蓝放映卡片、原生视频控制器 |
| `/link/` | 邻站邀请和独立的常用资源卡片 |
| `/about/` | 个人名片、阅读入口和小站时间线 |
| `/tags/` | 关键词标签卡片 |
| `/categories/` | 笔记分类卡片与文章计数 |

只编辑中文 source 目录。每个栏目的源 Markdown 保留标题和页面类型；`aside: false` 与 `top_img: false` 给独立栏目布局让出空间。正文是中文栏目导语。文章页不经过此栏目渲染器。

`tools/i18n/sections.cjs` 在构建期间为上述七页生成栏目结构；`source/css/sections.css` 负责布局，`source/js/sections.js` 只负责筛选和视频互斥。保留语言回退提示、原生标签/分类链接，以及折叠的评论区域。未来 Butterfly 升级时应重点预览这些页面。

## 添加音乐

点击任意页面左下角“音乐”打开播放列表浮窗，直接搜索、选歌、暂停和切歌，无需跳转音乐页；再次点击、关闭按钮、Escape 或点击外部即可收起，音乐继续播放。音乐页仍保留完整内嵌界面。展开“换一个网易云歌单”，粘贴公开歌单链接、分享文本或数字 ID 即可载入；成功后浏览器记住这个 ID。换歌单保留当前正在播放的歌曲和进度。

全站默认歌单在 `source/data/music.json` 配置：`playlistId`、`playlistName` 是歌单 ID 和展示名称，`endpoint` 是兼容 Meting 的 HTTPS 接口。默认歌单为 `13512426282`「記憶」，接口为 `https://api.i-meto.com/meting/api`。`collections.json` 的旧 `tracks` 现在为空，不再登记本地 MP3。新版浏览器记录同时保存当前默认歌单 ID；网站更改默认歌单时忽略旧默认对应的记录，不会恢复成原来的热歌榜。

完整链接支持网易云 `/playlist`、`/#/playlist` 和手机版 `/m/playlist`，也可以粘贴含链接的整段分享文字。`playlistAliases` 登记已核实的短链接映射，当前包含 `https://163cn.tv/birPYWIu`。网易云短链接没有浏览器跨域许可，纯静态页面无法自动解析所有未知短链接；遇到未知短链接时保留输入、显示明确提示和“打开分享链接”入口，打开后复制完整链接或数字 ID 即可，不通过额外代理传递分享信息。

`source/js/music-source.js` 负责网易云目录和官方嵌入来源；`music-audius.js` 连接 Audius 公开接口；`music-catalog.js` 负责独立目录队列、第三方搜索、同曲解析与共享播放器，`music.js` 按配置启动它。进入音乐页时加载歌单，不自动播放。歌单最多显示接口返回的 1000 首，曲目数量以导入时的平台结果为准；“显示更多”仅展开已经获取的列表，每次显示 20 首。

当前 `catalogOnly: true`：网易云客户端只允许 `playlist`，拒绝 Meting 搜索和单曲请求；目录只保留 ID、歌名、歌手、封面及原页面链接。Meting 返回 URL 时仅从中读取歌曲 ID，随后删除播放地址。导入目录不触发音频播放。`allowPublicNeteaseFallback: true` 单独允许在第三方无唯一可信匹配时，按目录 ID 构造固定的网易云官方公开外链，交给原生音频播放器加载；不使用接口返回的媒体地址、会员账号或代理下载。公开源 8 秒内未实际播放或报错即停止，保留原歌曲入口和显式重试，不循环请求或自动跳过。

播放器、搜索和播放列表常驻于 PJAX 替换区域之外。`music-layout.js` 在音乐页对齐预留区域，浮窗打开时只切换位置与大小，不移动或重建 iframe；其他页面收起浮窗后保留页尾播放器。关闭浮窗不暂停、不清空搜索词和播放进度。首页在首次打开浮窗前不请求歌单。统一“播放／暂停”按钮与同首列表按钮均可暂停、继续。目录歌曲优先使用已核对的来源，否则匹配完整歌名、主歌手和版本；第三方无唯一匹配时按配置尝试网易云公开原曲。普通搜索结果仍由访客选择，自动接歌保留正在输入的搜索词和结果。歌名和歌手不参与页面机器翻译。

默认第三方搜索源是 [Audius 开源平台](https://github.com/AudiusProject/apps/tree/main/packages/sdk)，本站适配器调用它的 [官方公开 API](https://docs.audius.co/api/)，无需另建搜索服务器。只接纳明确公开、可播放、未删除且未受付费、门槛或私人授权约束的歌曲；播放地址固定为官方 `/v1/tracks/ID/stream`，由 APlayer 正常播放。每次搜索最多 20 首，限时 8 秒，缓存 10 分钟。`audiusApiKey` 可填写自己申请的公开 API Key；当前留空，匿名入口已实测可用，后续平台规则变化可能要求 Key。接口可用不等于能够覆盖所有商业歌曲。

SoundCloud 使用公开的 `show_comments=false` 关闭时间评论。官方播放器可能在首次暂停后显示平台推荐提示；[官方说明](https://help.soundcloud.com/hc/en-us/articles/115003566828-The-Visual-embedded-player)未提供对任意第三方曲目都有效的公开关闭方法，因此不承诺播放器内部完全没有平台提示。

GitHub 提供连接代码与开源平台实现，歌曲仍由各平台提供。已核查 [Listen1](https://github.com/listen1/listen1_chrome_extension) 与 [MusicFree](https://github.com/maotoumao/MusicFree)：前者是需要扩展跨站权限的播放器，后者是插件框架，二者不等同于可直接放进静态网站的免费全曲库。当前使用固定、可核验的平台适配器；公共来源仍可能受地区、下架或平台供给影响。

## 跨平台音频与视频版本

`audioAlternatives` 保存确认过的同曲公开来源，目录点播时优先选择。2026-10-15 核对当前歌单前八首的公开元数据，确认 Coffee、time machine、inside、Bittersweet Chocolate 四条的原作者页面与目录时长一致；各登记包含 `trackId` 和目录 `durationMs`，播放前重新校验链接、歌曲标识、歌名、作者及完整时长。报告在被 Git 忽略的 `work/music/2026-10-15-version-audit.json`；这是元数据核验，不是音频指纹或永久可播保证。`inside` 的完整作者尾署名由保守匹配器处理；`Bittersweet Chocolate` 的 `(now on spotify)` 只作为该固定条目的登记标题，不通用删除括号。播放仍使用可见的 [SoundCloud 官方播放器](https://developers.soundcloud.com/docs/api/html5-widget)，Widget 的真实 PLAY/PAUSE/ERROR 事件驱动状态；SoundCloud 在 READY 后核对实际播放器时长，再决定是否自动播放；未经登记的未知状态链接不自动播放。

「SoundCloud 音频」搜索通过 `tools/music/open-audio.mjs` 读取正常公开搜索页与单曲页中的 JSON 元数据，不使用账号、内部应用令牌或媒体直链。仅接纳公开、允许嵌入、可播放且时长接近完整长度的候选。每次最多读取 7 页、详情最多并发 3 个，整体限时 8 秒，缓存 10 分钟。游客按标题、作者和时长明确选择，也可粘贴公开单曲链接；私密或受限来源不做降级绕行。

视频选定后只检查该视频的公开元数据，拒绝已删除、付费、仅预览、充电专属、禁止分享或缺失分集的版本；检查正常不等于实际播放成功。完整视频链接中的 `?p=2` 会保留，对应 CID 传给 [Bilibili 官方外链播放器](https://player.bilibili.com/)。元数据暂时无法检查时明确提示未知状态，并保留由平台决定权限的官方播放器。可手动重新加载或换一个版本，不自动反复请求。两类外部播放器和 APlayer 互斥，均常驻 PJAX 范围之外；短链接须先打开再复制完整链接。

本地 `npm run preview` 提供 `/api/music/videos`、`/api/music/video`、`/api/music/audio` 和 `/api/music/audio/track`。网关只查询固定平台地址，包含输入校验、响应大小上限、超时、缓存与请求合并；拒绝响应会冷却或终止发现。平台没有承诺第三方搜索的可用性，B 站实测曾返回 412，此时保留官方搜索链接与手动入口。

静态网站上线时不会运行 Node 预览路由。Audius 搜索直接使用官方跨域接口；若需要站内 SoundCloud 或 B 站搜索，须部署自己的 HTTPS 服务：

1. 在 Cloudflare Workers 中使用 `tools/music/gateway.mjs`；复制同目录的 `wrangler.example.toml` 为自己的配置，保留 `ALLOWED_ORIGINS = "https://kagiel.top"`，如有其他正式域名则用逗号追加。该设置只控制浏览器来源，不是账号认证；需配合 Cloudflare 请求配额或限流。
2. 取得部署地址后，将 `videoEndpoint` 设为 `https://你的Worker域名/api/music/videos`，`openAudioEndpoint` 设为 `https://你的Worker域名/api/music/audio`，再构建发布。Worker 已提供受限跨域响应，站点不保存密钥；部署时保留相邻的 `open-audio.mjs` 模块。
3. 当前两个服务地址留空，表示线上尚未部署这两个搜索服务。歌单导入、Audius 搜索和播放、已知 SoundCloud 单曲的公开 oEmbed 元数据、官方平台搜索和手动嵌入仍可使用。oEmbed 只证明有嵌入信息，不宣称完整可播；实际由官方播放器决定。

默认歌单所有原版能否完整播放仍由平台供给决定。视频候选可能是现场或翻唱，须由访客选择；这次实现没有核实整个歌单的全部来源覆盖情况，也没有部署 Worker 或网站。

`tools/music/index-playlist.mjs --limit 12` 可做有界目录核查，仅比较公开完整音频的标题与主歌手，不修改配置，也不请求音频。标题规范化只处理大小写、空白、标点和 feat/ft，保留翻唱、现场、混音与版本标记。本次排除已登记的两首后检查默认歌单前 12 首，没有新增精确匹配；报告保存在被 Git 忽略的 `work/music/default-audio-audit.json`。每次最多 12 次搜索，依次间隔至少 1.5 秒，平台拒绝即结束。

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

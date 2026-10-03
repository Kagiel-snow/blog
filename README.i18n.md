# 文章与语言维护

现在只维护一份简体中文原文。读者通过导航里的「语言」选择繁体、日语或英语，页面按需调用外部机器翻译。无需再写四份文章，也无需安装翻译插件或填写密钥。

## 日常写文章

```sh
npm run post:new -- my-note --title "我的笔记"
```

编辑生成的 `source/_posts/my-note.md`，写完后把 `published: false` 改成 `true`。保留稳定的 `translation_key` 和 `permalink`：它们用于旧链接、评论和文章标识，不需要另外创建译文。修改正文时更新 `updated`，保留原来的 `date`。

文章风格以 `source/_posts/hello world.md` 为参考：直接记概念、步骤和没弄明白的地方，不编造做过的实验或经历，少用比喻和刻意的励志收尾。2026-10-02 的 Network 笔记覆盖 LAN 拓扑、以太网、CSMA/CD 与 PoE，并附官方资料。

## 修改栏目

- 正文与导语：`source/_posts/`、`source/<栏目>/index.md`。
- 栏目标题、按钮与简介：`i18n/sections.json` 的 `zh-CN` 部分。
- 菜单与站点文字：`_config.butterfly.yml`、`i18n/locales.json` 的 `zh-CN` 部分。
- 壁纸和视频名称：`source/data/collections.json` 的 `title.zh-CN`，其他语言字段不再需要补齐。
- 标签分类：文章中直接写中文即可；需要固定英文 URL 时，在 `i18n/taxonomies.json` 增加中文名称和 slug。

`locales/zh-TW`、`locales/ja`、`locales/en` 和旧语言文案作为历史资料保留，**不再参与构建，也不要求同步修改**。

## 翻译行为

`source/js/translation.js` 负责翻译菜单、原文恢复、缓存、请求和页面切换。使用 Microsoft Edge 当前网页翻译接口；接口格式核对自 [translate.js 的 client.edge 实现](https://github.com/xnx3/translate/blob/d0dc1c73adf951b029fb6244d8b97d0ef2040075/translate.js/translate.js)。本站直接请求文本接口，没有加载远程翻译脚本，也没有在前端保存私密 API 密钥。

- 默认展示中文。读者选择语言后记住偏好；`?lang=ja`、`?lang=en`、`?lang=zh-TW` 可指定阅读语言，`?lang=zh-CN` 返回中文。
- 仅把页面公开文字发给翻译服务。代码块、行内代码、公式节点、评论区域、输入框、播放器和歌曲名不参与翻译。链接地址和 DOM 结构不改动。
- 译文按「原文内容 + 语言」缓存于当前浏览器会话，原文更新后不会误用旧译文；缓存有数量上限。
- 切语言、站内翻页时取消过期请求，保留原文，避免旧响应覆盖新页面。可随时点「查看原文」。
- 单次请求 15 秒超时，失败显示提示和重试，不一直转圈。外部接口的可用性和译文质量不由本站保证；它不是带 SLA 的正式 Azure Translator 订阅。
- 搜索仍查中文原文索引，评论保持访客写下的原文。机器翻译不等于独立出版的外语文章，搜索引擎收录的是中文源页面。

如服务方将来调整接口，只修改这个独立脚本的 `request()`，不用重写文章。不要把收费服务的私密密钥直接写进浏览器脚本；若改用正式 API，需要通过服务端转发。

## 地址、评论和连续播放

中文已发布地址保持不变，包括 `/2026/08/03/hello%20world/`。以前的 `/ja/posts/hello-blog/` 等语言地址由 `i18n/legacy-language-routes.json` 对应到原文，生成带语言选择的静态跳转，保留锚点。新文章也自动生成语言前缀兼容入口。

跳转页标记 noindex，canonical 指向中文；sitemap 只列正文，不把浏览器译文包装成独立的多语言 SEO 页面。过去的四份文章不会重复出现在首页或搜索中。

站内普通链接使用 PJAX，播放器保持同一实例；切语言直接改文字，音乐继续播放。刷新、关闭页面或打开新标签不属于连续播放的范围。评论仍使用原文路径；切语言不重新挂载评论框。统计失败时显示「暂不可用」和重试，不伪造访客数。

## 构建、检查、预览

```sh
npm ci
npm test
npm run build
npm run preview
```

使用 Node.js 24。预览地址为 `http://127.0.0.1:4000/`。修改源码后重新构建并刷新；预览服务不自动监听。`npm run check` 检查现有输出。正式构建仍使用 `npm run build`，保留原有主题和 GitHub Pages 工作流，不要改成直接运行 `hexo generate`，否则会漏掉播放器、评论、翻译菜单和旧地址处理。

输出只有一份中文 Hexo 站点，以及兼容跳转页。每次构建先在 `work/i18n/` 检查，通过后替换 `public/`，旧输出保留为 `previous-public/`。Windows 若提示目录占用，先停止预览再构建。

测试覆盖单份内容构建、过期译文不影响发布、草稿排除、旧 URL、脚本语法、代码与公式保留、评论路径、统计超时和重试、音乐及视频分段响应。浏览器还应检查原文恢复、连续切换语言、站内导航、手机菜单和音乐连续播放。

本地构建和预览不代表已经部署到线上。

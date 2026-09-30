# Kagiel 博客：四语言维护说明

本项目保留 Hexo 8.1.2 和 Butterfly 5.6.1。简体中文原站继续使用域名根目录，繁体中文、日语、英语分别使用 `/zh-tw/`、`/ja/`、`/en/`。

## 常用命令

使用 Node.js 24（与 GitHub Actions 一致），在项目根目录执行：

```sh
npm ci
npm test
npm run build
npm run preview
```

打开 `http://127.0.0.1:4000/`。`npm run server` 会先完整构建再启动预览；`npm run preview` 只预览已有 `public/`。修改文章后重新运行 `npm run build` 并刷新页面，不会自动监听。

`npm run check` 单独检查已有输出。四语言正式构建入口是 **`npm run build`**；直接 `hexo generate` 或 `hexo server` 只了解根目录中文配置，不能用来发布完整四语言站点。

每次构建使用新的 `work/i18n/<运行编号>/`，独立生成四份 Hexo 数据库与输出。全部检查通过后才将完整站点放入 `public/`；原有输出保留为该运行目录的 `previous-public/`。构建失败时当前 `public/` 不变，因此日常无需 `hexo clean`。`work/` 是本地生成缓存和旧输出，不提交；长期使用会积累空间，可在确认不需要旧输出时自行清理该目录。

## 内容与 URL

```text
source/                              # 原有中文内容及共享静态资源
  _posts/hello world.md               # 原文保持原文件名、正文、日期
  tags/index.md                      # type: tags
  categories/index.md                # type: categories
  link/index.md                      # type: link
  about/index.md
  music/index.md
  Gallery/index.md                    # 大写 G 是已有 URL 的一部分
  movies/index.md
  img/, music/, css/                 # 原有图片、音频、样式
locales/
  zh-TW/source/                      # 独立繁体中文内容
  ja/source/                         # 独立日语内容
  en/source/                         # 独立英语内容
    _posts/hello-blog.md
    tags/index.md, ...               # 与中文同类型的页面
i18n/
  locales.json                       # 语言前缀及站点自定义 UI 文案
  taxonomies.json                    # 标签、分类的跨语言概念映射
  legacy-routes.json                 # 已知旧 URL 的兼容跳转
tools/i18n/                          # 构建、检查、预览、新建文章和测试
```

语言路径固定使用 ASCII 小写前缀，HTML 的 `lang` 使用 `zh-CN`、`zh-TW`、`ja`、`en`。没有另外生成 `/zh/`，避免搬迁整个中文站点和制造一套重复地址。

现有中文文章的已发布 URL 固定为 `/2026/08/03/hello%20world/`。曾在本地出现的 `/2026/08/04/hello%20world/` 保留为兼容跳转。旧日期路径差异来自本地与 CI 的进程时区；构建进程现在固定为 Asia/Tokyo，旧文章同时明确设置 `permalink`。

新文章推荐 `/posts/<稳定标识>/`，译文为 `/<语言>/posts/<稳定标识>/`。标题、文件名和语言正文都可以不同；关联依靠 `translation_key`，不能在发布后随意改动这个标识或 permalink。

## 新建文章与添加译文

```sh
npm run post:new -- my-first-post --title "我的新文章"
npm run post:new -- my-first-post --lang zh-TW --title "我的新文章"
npm run post:new -- my-first-post --lang ja --title "はじめての記事"
npm run post:new -- my-first-post --lang en --title "My first post"
```

新文件默认 `published: false`。工具不会覆盖同名文件或同语言的同一篇文章。译文草稿复制原始正文作为编辑起点，同时保留技术片段，**不会调用翻译 API，也不会假装已经翻译完成**。

先写好中文原文，再为需要的语言创建草稿。按目标读者重新组织表达，审核标题、段落、技术术语、图片说明及分类，最后设置 `published: true`（或移除此字段）。可以先发布中文，稍后发布其他语言，缺译文不妨碍部署。

```yaml
---
title: A natural English title
lang: en
translation_key: my-first-post
permalink: posts/my-first-post/
date: '2026-09-30T18:00:00+09:00'
updated: '2026-09-30T18:00:00+09:00'
published: false
tags: []
categories: []
source_revision: 'sha256:由新建工具记录的原文正文摘要'
---
```

`date` 是该语言版本的发布日期，`updated` 在修改该版本时手动更新。工具使用明确时区，避免文件修改时间造成每次部署的更新时间变化。旧文章不要为增加译文而改掉原始日期。

修改原文后，带 `source_revision: sha256:...` 的旧译文会在构建时提示需要复核。完成复核后，使用当前原文正文 SHA-256 更新该字段；未更新只是警告，不会自动改动译文或发布日期。已有三份译文已记录当前原文摘要。

代码块、行内代码、常见数学公式、链接目标和 Hexo 标签在构建前会比较。允许段落重排和自然改写，技术片段不同会阻止构建。确有必要改变技术示例时，先人工审核，再在该译文添加 `technical_changes_reviewed: true`；此开关绕过整篇译文的片段比较，不能用来掩盖未检查的翻译。比较器是保守的常用 Markdown 语法检查，不是完整的语义证明；复杂嵌套语法仍需预览。

资源继续优先使用 `/img/...`、`/music/...` 等已有地址。不要把图片名、URL、命令或代码中的中文标识当成正文翻译。源文件本身不会被构建器改写。当前 `post_asset_folder: false` 保持不变。

## 页面与标签、分类

普通页面按相同相对路径关联，例如四份 `about/index.md`。若译文页面需要不同路径，在对应页面 front matter 中设置相同的 `translation_key`。标签总览必须有 `type: tags`，分类总览有 `type: categories`，友链有 `type: link`。

当前原文没有标签和分类，因此各语言显示明确的空状态。以后每种语言使用本语言的 tags/categories，Hexo 会各自生成列表；不会把四种语言混成四倍文章数。

如需让一个具体标签或分类切换到它的翻译名称，在 `i18n/taxonomies.json` 中登记稳定概念标识：

```json
{
  "tags": {
    "security": {
      "names": {"zh-CN":"网络安全","zh-TW":"資訊安全","ja":"情報セキュリティ","en":"Security"},
      "slugs": {"zh-CN":"网络安全","zh-TW":"security","ja":"security","en":"security"}
    }
  },
  "categories": {}
}
```

既有中文标签的 slug 应保持原值；**不要为了翻译显示文字而改掉已发布地址**。分类层级遵循 Hexo 原有结构，父、子分类分别登记概念。多条分类路径使用 Hexo 的数组嵌套语法。未登记概念时仍能生成标签/分类，切换语言回到目标语言总览，并提示没有对应列表。

友链文本可在各语言自己的 `source/_data/link.yml` 维护；当前没有真实友链数据，所以没有伪造站点、图片集或动画条目。

## UI、语言切换与 SEO

- Butterfly 自带的四份语言字典负责日期、目录、版权、搜索、侧栏等主题文字。
- `i18n/locales.json` 负责菜单、描述、公告、关注、打赏、分享、空状态等自定义文案。
- 菜单的路径、顺序、图标继续读取 `_config.butterfly.yml`。添加新菜单后，可在各语言对象中增加 `menuLabels`（原菜单名称到译名的映射）；没有译名的自定义菜单仍会保留，不会被构建器删除。
- 每次构建按语言覆盖这些文本，背景、头像、布局、原有 CSS、播放器和 Live2D 配置继续来自原主题配置。
- 桌面与移动菜单都有静态语言链接，不依赖浏览器翻译或在线翻译服务。原 `translate.enable` 字符转换器已关闭，防止改写代码和专有名称。
- 有译文时直接跳到对应版本；没有时跳到该语言首页，标签/分类/归档则回到相应总览，展示缺译提示及已有版本链接。回退提示同时支持 JS 与 URL fragment/CSS；禁用 JS 后语言链接仍有效。
- URL 本身决定语言，不根据浏览器语言强制跳转，不把同一路径的内容随 cookie 改变。普通分页回退到首页；日历归档有同年月页时进入该页，没有则回到归档总览。
- 每个真实页面有正确的 `lang`、唯一的自身 canonical；沿用原站 `trailing_index: true` 的 canonical 形式。
- `hreflang` 只关联已发布的真实对应页，并双向输出；中文是 `x-default`。缺译文首页不能冒充文章译文。草稿、404 和兼容跳转不会进入正常 hreflang 集合。
- `/sitemap.xml` 是总索引，引用 `/sitemap-zh-CN.xml`、`/zh-tw/sitemap.xml`、`/ja/sitemap.xml`、`/en/sitemap.xml`。`robots.txt` 指向总索引。404 与兼容跳转不收录。
- Twikoo 使用当前语言，评论仍按 URL 隔离；中文原地址保留，所以原有中文评论路径保留。切换语言不会将评论翻译，也不合并不同版本评论。

## 构建实现与依赖

`build.cjs` 组织四个独立 Hexo 进程；`worker.cjs` 调用原生 Hexo API 和原来的生成器；`html.cjs` 在构建时增加语言菜单、回退提示和 SEO 关联；`check.cjs` 检查输出。没有修改 `node_modules` 或复制整套 Butterfly 模板。

新增 `hexo-generator-sitemap` 3.0.1 生成基础 sitemap；显式声明 `js-yaml` 4.3.1、`hexo-front-matter` 4.2.1 和 `cheerio` 1.1.2，分别处理配置、front matter 与生成的 HTML。没有额外 i18n 插件、浏览器翻译脚本、付费 API 或复杂前端框架。安装版本由 `package-lock.json` 固定。

使用生成后的 HTML 做小范围扩展，是为了避开 Butterfly 缓存的导航片段中放入“每篇文章不同的译文链接”的问题。检查器验证桌面/移动两个菜单挂载点及语言链接数量，主题将来升级若改变 DOM，构建会明确失败，不会悄悄发布缺菜单的站点。

## 验证范围

`npm run build` 自带检查：所有生成 HTML 的站内 href/src、懒加载图像、srcset、行内样式、CSS 资源、已有播放器资源、必须存在的页面、搜索语言隔离、canonical、hreflang、sitemap、旧文章地址。

`npm test` 在忽略的 `work/` 中建立独立样例，测试：缺译文、某语言零文章、草稿排除、双文章链接不被主题缓存串用、标签和嵌套分类映射、代码/公式保留、语言不一致的技术片段被拒绝、HTTP 页面访问、未知地址真实 404、MP3 分段读取。样例不会改动或发布真实个人内容。

浏览器手动重点查看：四种语言菜单、文章互相切换、搜索结果、手机侧栏、音乐列表、`/Gallery/` 的大小写、标签/分类空状态及友链/关于页面。

## GitHub Pages 部署

保留已有 `.github/workflows/pages.yml` 工作流。现在使用 Node.js 24、`npm ci`、测试、四语言构建，然后把整个 `public/` 上传给 GitHub Pages；main 分支 push 自动触发，也支持 Actions 手动运行。

审阅并提交源文件后，推送到当前 origin 的 main 分支即可触发。不要提交 `node_modules/`、`public/`、`work/`，不要仅上传中文构建。GitHub 仓库 Settings → Pages 的 Source 应为 GitHub Actions，自定义域名保持 `kagiel.top`。部署后检查 Actions 两个 job 成功，并访问域名根目录及 `/zh-tw/`、`/ja/`、`/en/`。

项目当前使用自定义域名根路径，播放器等历史资源也使用根绝对地址。直接迁到 `用户名.github.io/blog/` 子目录需要单独调整部署根路径，构建器会拒绝这种未经迁移的配置；不能只改 `url` 就假定所有资源仍正确。

## 已知边界

- 新文章不会自动获得高质量译文；草稿生成只是编辑起点，发布前需人工本地化和审核。
- 图片、动画、友链目前没有用户提供的真实清单，页面会诚实显示空状态，功能入口不再 404。
- 当前项目没有启用数学渲染引擎。此次保留公式内容和配置，并测试文本不损坏；新增复杂数学文章时仍需按 Butterfly 文档配置 KaTeX 或 MathJax 及匹配的 Markdown 渲染器。
- 外部 CDN、评论后端、访问统计、中文名言服务的持续可用性不由静态构建保证；没有替换这些现有服务。中文名言服务仅保留在中文站，其他语言使用本地文案。
- GitHub Pages 自定义 404 使用根目录的 `404.html`，提供四语言返回链接；本地预览另外支持按路径前缀显示对应语言 404。真正不存在的 URL 仍应返回 404，而不是伪装成 200。
- 旧地址兼容使用静态页面的 meta refresh 和 canonical；GitHub Pages 静态托管不能在此代码中配置 HTTP 301。正文实际地址保持原已发布 URL。
- 资源为保证旧路径和主题 `url_for` 的兼容性，在各语言输出目录中镜像；原始文件只维护一份，发布体积会增加。
- 同一文章的语言版本发布时间可以不同，因此年月归档与文章排序不必完全相同。

官方参考：[Hexo 国际化](https://hexo.io/docs/internationalization)、[Butterfly 主题配置](https://butterfly.js.org/posts/4aa8abbe/)、[Hexo sitemap 生成器](https://github.com/hexojs/hexo-generator-sitemap)。

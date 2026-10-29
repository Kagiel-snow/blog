# 工程

菜单里的「工程」是 `/projects/`，放自己在做的东西。页面正文在 `source/projects/index.md`，卡片样式在 `source/css/projects.css`。新增一个工程就在 `site-projects` 里照样加一张 `project-card`。

## 军团之王：要塞

- 地址 `/projects/legion/`，文件在 `source/projects/legion/`，封面 `source/projects/legion-cover.jpg`。
- 游戏在单独的文件夹里开发。改完后在博客根目录运行：

```sh
npm run game:sync -- C:\Users\cxin1\projects\games\rouge
```

脚本只复制 `index.html`、`style.css`、`data.js`、`game.js` 和 `assets/`，不会带上旧版本目录和截图。之后照常提交并推送 `main`，GitHub Actions 会重新构建发布。

`_config.yml` 的 `skip_render` 让这个目录原样复制，不套博客主题；`tools/i18n/worker.cjs` 也会跳过这些文件，不把它们当成站点页面加菜单和翻译。游戏的 `index.html` 里 `?v=` 版本号随每次更新递增，读者就不会拿到缓存的旧脚本。

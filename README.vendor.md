# 本地前端依赖

2026-10-04 保存现有固定版本，避免外部 CDN 阻塞搜索初始化、站内导航和播放器。文件未经修改，许可证与各自资源放在一起。

| 依赖 | 来源 | 许可证 |
| --- | --- | --- |
| APlayer 1.10.1 | https://unpkg.com/aplayer@1.10.1/dist/ | MIT |
| Pjax 0.2.8 | https://cdn.jsdelivr.net/npm/pjax@0.2.8/ | MIT |
| node-snackbar 0.1.16 | https://cdn.jsdelivr.net/npm/node-snackbar@0.1.16/dist/ | MIT |
| SoundCloud Widget API（仅点击音频版本后加载） | https://w.soundcloud.com/player/api.js | 官方 Widget API 使用方式见 https://developers.soundcloud.com/docs/api/html5-widget |

升级时同时检查许可证，替换整个版本目录并更新 `_config.butterfly.yml`，然后运行测试和本地浏览器检查。不直接修改压缩文件。

Audius 接入使用本站的 `source/js/music-audius.js` 适配器，调用官方公开 REST API；未打包其完整 SDK。开源实现参考 [Audius apps/SDK](https://github.com/AudiusProject/apps/tree/main/packages/sdk)，协议为 [Apache-2.0](https://github.com/AudiusProject/apps/blob/main/LICENSE)，接口见 [官方文档](https://docs.audius.co/api/)。GitHub 代码的开源协议与平台曲目的播放范围分别由各自发布方决定。

关于页的像素字使用 Pixelify Sans 5.3.0（来自 https://www.npmjs.com/package/@fontsource/pixelify-sans ，只保留 latin 400/700 两个 woff2），协议为 SIL OFL 1.1，许可证见 `source/vendor/pixelify-sans-5.3.0/LICENSE`。

站点的 HUD 小标题、代码与数字使用 JetBrains Mono 5.2.8（来自 https://www.npmjs.com/package/@fontsource/jetbrains-mono ，只保留 latin 400/600 两个 woff2），协议为 SIL OFL 1.1，许可证见 `source/vendor/jetbrains-mono-5.2.8/LICENSE`。中文继续使用系统字体，不打包中文字库。

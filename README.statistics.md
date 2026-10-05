# 网站运行天数与传输流量

首页下方的「网站统计」默认展开，显示文章数、运行天数、累计访客数（UV）、累计访问量（PV）和独立的传输流量。

## 运行天数

上线时间由用户确认为 **2026-08-04**，配置在 `_config.butterfly.yml` 的 `aside.card_webinfo.runtime_date`，使用日本时区的当天零点。

页面显示「本站已安全运行：N 天」，按完整的 24 小时向下取整。2026-10-05 为 62 天。构建时输出可直接阅读的数字，浏览器加载及站内切页时由主题更新，不需要每日重新发布才能更新天数。「安全运行」是建站时长文案，不代表接入了故障或安全事件监控。

## 流量的统计范围

PV、UV 继续使用现有 Vercount 服务。MB／GB 是单独从 Cloudflare 的 `httpRequestsAdaptiveGroups.sum.edgeResponseBytes` 读取的传输字节量，不由 PV 估算。

- 仅查询 `kagiel.top` 经过 Cloudflare 的访客请求（`requestSource: eyeball`），不合并其他子域名。
- 查询截止最近完整 UTC 小时的前 24 小时，页面以日本时间明确显示起止区间和更新时间。
- 采用十进制单位：1 MB = 1,000,000 B；1 GB = 1,000,000,000 B。
- 数据遵循 Cloudflare 的统计及采样口径，不等于精确逐请求日志、用户设备总耗流量或源站账单。其他域名的图片、评论服务、绕过 Cloudflare 的请求不在该统计内。
- **这是构建时的统计快照。** 每次 GitHub Pages 工作流运行时更新，不是每次访客打开网页就重新查询，也没有新增定时部署任务。页面始终显示实际统计区间；发布新快照前，旧区间不会冒充当前实时数据。
- 没有配置时显示「暂未接入」；访问权限、套餐、网络或接口异常时显示「暂不可用」，不会编造 0 MB。可用性需要配置凭据后实际验证，不保证所有套餐都能访问该数据集。

查询实现依据：[Cloudflare 按主机名查询 HTTP 流量的官方说明](https://developers.cloudflare.com/analytics/graphql-api/tutorials/end-customer-analytics/)。

## 第一步获取 Zone ID

登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，打开 `kagiel.top` 的概述页面，找到并复制 **Zone ID（区域 ID）**。不要使用 Account ID（账户 ID）。Zone ID 通常为 32 位十六进制字符串。

## 第二步创建只读统计 Token

进入 [个人 API Tokens 页面](https://dash.cloudflare.com/profile/api-tokens)，选择创建自定义 Token：

1. 名称可写为 `Kagiel traffic read`。
2. 对当前的区域统计查询，选择 **Zone → Analytics → Read（区域 → 分析 → 读取）**，资源范围限定为 **kagiel.top**。
3. 不授予 DNS 修改、区域编辑等权限，也不使用 Global API Key。
4. 创建后将 Token 直接保存到下一步的 GitHub Secret，不粘贴到文章、仓库文件或聊天中。

Cloudflare 不同界面的账户级统计入口可能显示 Account Analytics 权限；不要因此直接开放全部账户和区域。先按本区域查询的最小权限配置并测试；若接口拒绝访问，检查资源范围、有效期、数据集和套餐。可参照 [Analytics Token 官方说明](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)与[接口权限错误说明](https://developers.cloudflare.com/analytics/graphql-api/errors/)。

## 第三步保存到 GitHub

打开 [blog 仓库的 Actions Secrets 设置](https://github.com/Kagiel-snow/blog/settings/secrets/actions)，通过 **New repository secret** 新增两项：

| Secret 名称 | 内容 |
| --- | --- |
| `CLOUDFLARE_ANALYTICS_TOKEN` | 上一步创建的只读 Token |
| `CLOUDFLARE_ZONE_ID` | kagiel.top 的 Zone ID |

两项名称必须与表格完全一致。工作流仅在「Read Cloudflare transfer statistics」步骤注入凭据。统计脚本写入公开文件的只有主机名、字节总量、统计区间和状态，Token 和 Zone ID 不会写入站点输出或日志。

## 第四步首次验证

这些本地代码改动需要提交并发布后才会生效；仅保存 Secrets 不会修改线上网站，也不会自动运行工作流。

代码发布后，在仓库 **Actions → Pages → Run workflow** 手动运行一次，或者使用后续正常发布流程。注意，Pages 工作流会部署网站，运行前应确认工作区改动是准备发布的版本。

查看「Read Cloudflare transfer statistics」步骤：

- `ok`：本次已读取到真实统计快照；发布后网站统计中出现 MB／GB 和实际统计区间。
- `not_configured`：两项 Secret 尚未配置。
- `unavailable`：检查 Token 权限、有效期、Zone ID 或 Cloudflare 数据集是否对当前套餐开放；站点仍可构建，但不会显示伪造数值。

当前尚未配置 Token，真实接口读取和线上数据均未验证。本地自动检查覆盖查询范围、统计周期、单位换算、接口失败与无权限时不显示假零值。

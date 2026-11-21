# OpenClaw Lark

公开维护的 OpenClaw 飞书 / Lark 插件，基于飞书官方插件与社区兼容版，补齐 OpenClaw 2026.10.6 的工具注册和 OAuth 自动续跑兼容性。

这是 Cogine 维护的独立分支，采用 MIT 许可证，任何人都可以安装、使用和贡献；并非飞书官方发行版。

- GitHub：<https://github.com/cogine-ai/openclaw-lark>
- npm 包名：`@cogineai/openclaw-lark`
- 发布版本：`2026.10.10-cogine.6`，当前稳定版见 [npm `latest`](https://registry.npmjs.org/@cogineai%2Fopenclaw-lark/latest)
- 验证环境为 Node.js `24.22.1`。OpenClaw `2026.10.6` 通过自动测试，`2026.11.4` 在 macOS 上通过飞书 OAuth 自动续跑试点验收。

## 本分支的改动

1. 在插件清单声明 39 个工具，满足核心的 `contracts.tools` 注册要求。
2. OAuth 轮询和续跑使用核心公开 SDK 跟踪 Gateway 后台工作，服务关闭时取消并回收轮询。Core 11.4 上还使用公开的插件后台上下文，使授权续跑可以在原工具调用结束后执行。
3. 更新包名、版本识别、构建与公开发布流程。保留插件 ID `openclaw-lark`、渠道 `feishu` 和配置路径，迁移时不需要另建机器人。
4. 移除社区版过宽的命令提前拒收，避免图片下载后的本地路径被当作系统命令；保留聊天准入、核心命令授权和 OAuth Owner 校验。
5. 支持 `message.send` 的飞书回调按钮。WebSocket 模式下需在飞书开放平台为应用订阅「卡片回传交互」`card.action.trigger`，选择「使用长连接接收回调」并发布应用版本。已在 macOS + OpenClaw 2026.11.5 上验证点击只触发一次，回复送回原私聊。

继承消息收发、流式卡片、OAuth、文档、日历、任务、云盘、知识库、表格等工具。工具的可用性仍取决于应用权限和用户授权；并非所有办公操作都完成了真实环境验收。

## 安装

npm 稳定版已公开，任何用户都可以安装：

```sh
openclaw plugins install @cogineai/openclaw-lark
```

也可以从源码构建本地包：

```sh
git clone https://github.com/cogine-ai/openclaw-lark.git
cd openclaw-lark
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm pack
# 使用生成的 .tgz 的绝对路径
openclaw plugins install npm-pack:/absolute/path/to/cogineai-openclaw-lark-2026.10.10-cogine.6.tgz
```

默认安装命令使用 `latest`；需要固定版本时可使用 `@cogineai/openclaw-lark@2026.10.10-cogine.6`。不要把 `pnpm install` / `npm install` 到普通项目目录等同于安装到 OpenClaw；插件由 OpenClaw 插件管理器加载。

### 从其他 Lark 包迁移

先备份当前 OpenClaw 配置和数据，记录原包与核心版本。与官方及社区包使用相同插件 ID，不能同时启用多个副本；已有安装需要通过插件管理器的替换流程（`--force`）。若同时启用了 `@openclaw/feishu`，先选择并停用其中一个渠道实现，避免重复处理事件。

配置继续使用 `channels.feishu`，插件条目继续使用 `plugins.entries.openclaw-lark`。保留 App ID、Secret 引用、配对和授权存储；不要为换包清空这些数据。安装后按主机提示重新加载服务，并检查 `openclaw plugins inspect openclaw-lark --runtime` 与 `openclaw health`。

插件需要的工具必须在主机工具策略中获准，例如在现有 `tools.alsoAllow` 数组中**追加** `openclaw-lark`，保留已有条目。是否直接暴露或通过搜索加载工具，取决于你的 Agent / 执行后端配置。

### 流式回复配置

渠道配置可使用：

```json
{
  "channels": {
    "feishu": {
      "replyMode": "streaming",
      "streaming": { "mode": "partial" }
    }
  },
  "messages": { "visibleReplies": "automatic" }
}
```

这是需要合并到现有配置的片段，并非可直接替换的完整配置。机器人凭据、连接方式与访问策略仍需正常配置。

在本次 Codex 执行插件组合下，默认 `message_tool` 投递会要求 Agent 调用 `message` 工具，绕过原生流式回复通道。`automatic` 让正常回复自动投递；这是**主机配置**，不是本插件强制修改的行为，而且会影响本机其他渠道，除非另有覆盖。

## 验证范围与已知限制

- 运行依赖已更新，生产依赖审计与全新消费者安装结果见 [依赖审计状态](docs/dependency-status.md)。发布流程仍检查运行依赖；固定核心的开发测试依赖另行列出。

- OAuth 自动续跑修复的本机试点包在 macOS + OpenClaw 2026.11.4 上使用增量只读授权验证，飞书工具自动重跑并送达结果卡片。Core 2026.10.6 上的 Cogine.4 试点见 [验收记录](docs/acceptance-2026.10.10-cogine.4.md)。
- 自动测试覆盖成功、过期、身份不匹配，以及身份校验、凭据写入、卡片更新、完成回调期间的关闭/重发；旧流程不能覆盖新令牌或触发过期续跑。
- Windows / Linux 的真实飞书连接、所有办公工具的写操作尚未逐项验收。升级其他机器前先小范围验证。
- 继承的任务清单权限映射可能要求额外写权限；诊断命令对 SecretRef 的处理仍有已知局限。这两项未在此补丁中修复。
- 从旧核心降级不能只换二进制；升级涉及数据库迁移时，需要还原配套的整套备份。

## 开发与维护

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:pack
```

详见 [补丁说明](docs/compatibility.md)、[维护方式](CONTRIBUTING.md) 和 [npm 发布步骤](docs/releasing.md)。不需要真实机器人凭据即可运行自动测试。

## 来源与许可证

- [飞书官方源码](https://github.com/larksuite/openclaw-lark)
- [社区兼容版 v2026.10.10](https://github.com/hotwvpyym/openclaw-lark-compat/tree/v2026.10.10)

保留原 [MIT 许可证](LICENSE) 和 [来源说明](NOTICE)。历史社区更新记录见 [UPSTREAM_CHANGELOG.md](UPSTREAM_CHANGELOG.md)。

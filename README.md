# OpenClaw Lark

公开维护的 OpenClaw 飞书 / Lark 插件，基于飞书官方插件与社区兼容版，补齐 OpenClaw 2026.10.6 的工具注册和 OAuth 自动续跑兼容性。

这是 Cogine 维护的独立分支，采用 MIT 许可证，任何人都可以安装、使用和贡献；并非飞书官方发行版。

- GitHub：<https://github.com/cogine-ai/openclaw-lark>
- npm 包名：`@cogine-ai/openclaw-lark`
- 当前源码版本：`2026.10.8-cogine.1`（预发布；首次 npm 发布尚未执行）
- 目标核心：OpenClaw `2026.10.6`；Node.js `24.22.1`（其他满足核心要求的版本需另行验收）

## 本分支的改动

1. 在插件清单声明 39 个工具，满足核心的 `contracts.tools` 注册要求。
2. OAuth 轮询及完成后的续跑使用核心公开 SDK 建立独立后台工作生命周期，避免工具结束后的取消信号导致会话写入 `AbortError`；服务关闭时取消并回收轮询。
3. 更新包名、版本识别、构建与公开发布流程。保留插件 ID `openclaw-lark`、渠道 `feishu` 和配置路径，迁移时不需要另建机器人。

继承消息收发、流式卡片、OAuth、文档、日历、任务、云盘、知识库、表格等工具。工具的可用性仍取决于应用权限和用户授权；并非所有办公操作都完成了真实环境验收。

## 安装

**npm 首次发布前**，请从源码构建本地包：

```sh
git clone https://github.com/cogine-ai/openclaw-lark.git
cd openclaw-lark
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm pack
# 使用生成的 .tgz 的绝对路径
openclaw plugins install npm-pack:/absolute/path/to/cogine-ai-openclaw-lark-2026.10.8-cogine.1.tgz
```

**发布到 npm 后**，任何用户都可以安装，无须加入 Cogine：

```sh
openclaw plugins install @cogine-ai/openclaw-lark@next
```

首次预发布使用 `next` 标签；稳定发布后再提供默认安装命令。不要把 `pnpm install` / `npm install` 到普通项目目录等同于安装到 OpenClaw；插件由 OpenClaw 插件管理器加载。

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

- 首次 npm 发布前需处理继承依赖的安全告警；生产依赖审计仍有 1 项 critical、21 项 high，详情和证据边界见 [依赖审计状态](docs/dependency-status.md)。发布工作流会检查这些运行依赖。

- macOS + OpenClaw 2026.10.6 的本机试点已通过收发、原生流式输出及新增只读授权后自动续跑；源码仓库版另有自动回归与打包检查，不将试点安装包直接当作源码构建的人工验收。
- 自动测试覆盖成功授权、过期、授权身份不匹配、关闭取消和后台任务生命周期。
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
- [社区兼容版 v2026.10.8](https://github.com/hotwvpyym/openclaw-lark-compat/tree/v2026.10.8)

保留原 [MIT 许可证](LICENSE) 和 [来源说明](NOTICE)。历史社区更新记录见 [UPSTREAM_CHANGELOG.md](UPSTREAM_CHANGELOG.md)。

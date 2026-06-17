# OpenCode Game Dev Agents Pack

这个目录是一个轻量级 OpenCode agent pack，用于在不同工程和机器之间复用通用游戏研发 agents。

它不是 TypeScript OpenCode plugin。OpenCode 的 agents 本身通过 Markdown 文件发现；这个包提供可复制的源文件、manifest、安装脚本、卸载脚本和验证脚本，达到类似插件的分发体验。

## 包内容

- `agents/`：12 个通用游戏研发 agents。
- `manifest.json`：包版本、分组、agent 文件清单和 SHA256。
- `install.ps1`：安装到 OpenCode 全局或指定工程。
- `uninstall.ps1`：从 OpenCode 全局或指定工程卸载本包管理的 agents。
- `validate.ps1`：验证包完整性、安装目标和 OpenCode 发现结果。

## Agent 分组

引擎核心：

- `game-engine-architect`
- `3d-rendering-architect`
- `engine-tooling-asset-pipeline-architect`
- `engine-performance-platform-architect`

团队协作：

- `game-system-designer`
- `quest-narrative-designer`
- `game-data-config-specialist`
- `ui-ux-designer`
- `gameplay-client-engineer`
- `technical-artist`
- `qa-automation-lead`
- `build-release-manager`

## 安装

安装到当前用户的 OpenCode 全局 agents 目录：

```powershell
.\install.ps1
```

安装到指定工程的 `.opencode/agents`：

```powershell
.\install.ps1 -Project D:\path\to\project
```

默认不会覆盖目标目录中已有且内容不同的同名 agent。需要覆盖时显式使用：

```powershell
.\install.ps1 -Force -Backup
```

`-Backup` 会把被覆盖文件保存到目标目录下的 `.backup\game-dev-agents\<timestamp>\`。

## 验证

只验证包内文件和全局安装目标：

```powershell
.\validate.ps1
```

验证某个工程的项目级安装：

```powershell
.\validate.ps1 -Project D:\path\to\project
```

只验证包本身，不检查安装目标：

```powershell
.\validate.ps1 -PackOnly
```

## 卸载

从全局 OpenCode agents 目录卸载：

```powershell
.\uninstall.ps1
```

从指定工程卸载：

```powershell
.\uninstall.ps1 -Project D:\path\to\project
```

如果目标文件被本地修改过，默认会停止并提示冲突。确认要删除时使用：

```powershell
.\uninstall.ps1 -Force -Backup
```

## 跨机器复用

把整个 `game-dev-agents` 目录复制到另一台机器，例如：

```text
C:\Users\<user>\.config\opencode\agent-packs\game-dev-agents
```

然后在该目录运行：

```powershell
.\validate.ps1 -PackOnly
.\install.ps1
.\validate.ps1
```

Linux/macOS 暂未提供 shell 脚本。可以手动把 `agents/*.md` 复制到 `~/.config/opencode/agents/`，再运行 `opencode agent list` 检查。

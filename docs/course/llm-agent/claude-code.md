# Claude Code 安装配置

## 📖 概述

Claude Code 是 Anthropic 官方推出的命令行 AI 编程助手，可以帮助开发者在终端或 VS Code 中直接与 Claude 模型交互，完成代码编写、调试、重构等任务。

## 🔧 安装

### npm 全局安装

使用 npm 全局安装 Claude Code CLI 工具：

```bash
npm install -g @anthropic-ai/claude-code
```

### VS Code 插件安装

在 VS Code 中搜索并安装 **"Claude Code for VS Code"** 插件，即可在编辑器中直接使用 Claude Code 功能。

## ⚙️ 配置

编辑配置文件 `~/.claude/settings.json`，添加以下内容：

```json
{
    "env": {
      "ANTHROPIC_BASE_URL": "http://llmapi.aiphys.cn",
      "ANTHROPIC_AUTH_TOKEN": "xxxxxxxxxxxxxxx",
      "ANTHROPIC_MODEL": "claude-opus-4-5-20251101",
      "ANTHROPIC_SMALL_FAST_MODEL": "claude-haiku-4-5-20251001"
    }
}
```

### 配置说明

| 参数 | 说明 |
|------|------|
| `ANTHROPIC_BASE_URL` | API 服务端点，使用北大物理学院提供的网关地址 |
| `ANTHROPIC_AUTH_TOKEN` | 您的 API Key，请替换为自己的密钥 |
| `ANTHROPIC_MODEL` | 默认使用的主模型 |
| `ANTHROPIC_SMALL_FAST_MODEL` | 用于快速任务的轻量模型 |

> ⚠️ **注意**：请将 `ANTHROPIC_AUTH_TOKEN` 替换为您在 [LLM 网关](http://llmapi.aiphys.cn/) 获取的 API Key。

## 使用

vscode 右上角点击橙色的 claude code 图标，即可开始对话；输入空格+@可以引用文件、git 提交等。

若命令行使用，在项目路径下输入 claude 即可开始对话。

## 🔗 相关资源

- [北大物理学院 LLM 网关](../llm-gateway.md)
- [API 调用基础](./api-basics.md)

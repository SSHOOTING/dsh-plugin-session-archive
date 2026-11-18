# dsh-plugin-session-archive

**一条命令把当前 DSH 会话导出为干净、已脱敏的 Markdown 记录。**

会话原本只存在本地日志里。这个插件把它变成可以贴进 issue、归档或分享的文本，并抹掉看起来像凭据的字符串。它只读：不联网、不写文件、不上传提示词。

## 安装

```powershell
dsh plugin add dsh-plugin-session-archive
```

要求 Node `^22.19.0 || >=24`，DSH `>=0.2.0-rc.2 <0.3.0`。

## 30 秒演示

```text
/session-export
```

```markdown
# Session export

3 exported event(s). Credential-looking strings are redacted.

# Turn 1

## User

How do I rotate the api_key=[redacted]?

## Assistant

Use the console and revoke the old one.

### Tool call: bash

$ echo token=[redacted]
```

`/session-export json` 输出 JSON 行；`/session-export --max-kb=64` 限制输出大小。

## 配置

无需配置，bundle patch 只插入插件行：

```yaml
- id: dsh-plugin-session-archive
  name: dsh-plugin-session-archive
```

| 参数 | 默认值 | 含义 |
|---|---|---|
| `json` | 关闭 | 输出 JSON 行而非 Markdown。 |
| `--max-kb=N` | `128` | 输出上限（限制在 1–512 KB）。 |

## 导出内容

| 事件 | 渲染为 |
|---|---|
| `turn/start` | 轮次标题 |
| `user/message` | 用户文本（技能调用时含技能名） |
| `assistant/message` | 助手文本，附最近观察到的 provider/model |
| `tool/call` | 工具名，以及仅 `command`/`path`/`query` |
| `tool/result` | `tool-result` 的文本块与错误文本 |
| 其他 | 忽略 |

未知字段不会被序列化。所有输出字段都经过凭据脱敏。

## 隐私与安全

- 只读取白名单文本字段，不复制任意事件数据。
- 不发起网络请求、不上报、不写文件；输出只回到命令响应。
- 每个字段在渲染前都经过脱敏。
- 如需不同的脱敏规则，请在本地改 `src/core.ts`——不要关闭脱敏。

## 兼容性

| 组件 | 支持范围 |
|---|---|
| DSH | `>=0.2.0-rc.2 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.0.0` |
| Cordis | `>=4.0.0 <5` |
| 界面 | headless 与 web（只用命令注册表） |

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 找不到 `/session-export` | bundle 行未安装 | 重跑 `dsh plugin add dsh-plugin-session-archive`，重启 DSH。 |
| 导出被截断 | 达到 `--max-kb` 上限 | 调高到最多 512。 |
| 工具参数为空 | 设计上只渲染 `command`/`path`/`query` | 为避免泄露任意数据，这是预期行为。 |
| 助手消息没有路由 | 会话里还没有 `request/*` 事件 | 再聊几轮后导出。 |

## 开发

```powershell
npm install
npm test
npm pack --dry-run
```

测试完全离线，使用合成事件夹具。

## 许可证

[MIT](LICENSE)

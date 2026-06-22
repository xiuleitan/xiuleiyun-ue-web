# xiuleiyun-ue-web

[English](README.en.md)

![Static Web](https://img.shields.io/badge/Static-Web-blue)
![WebRTC](https://img.shields.io/badge/WebRTC-player-green)
![Mobile](https://img.shields.io/badge/Mobile-adapted-blue)

嗅垒云 UE Web 播放器界面，用于浏览器端连接 UE 像素流/实时渲染服务，提供播放、连接状态、全屏、刷新连接、分辨率切换、延迟信息和移动端适配等交互能力。

项目当前是纯静态前端，不依赖打包工具；页面可以直接由静态服务器托管。

## 功能

- WebRTC 播放器页面：通过 `player.html` 加载播放 UI 和 WebRTC 控制逻辑。
- 横竖屏适配：横屏加载 `js/app.js`，竖屏加载 `js/app-phone.js`。
- 移动端体验：竖屏场景使用独立样式 `css/player-phone.css`。
- 播放控制：支持全屏切换、撑满屏幕、连接刷新、信号状态展示。
- 视频流设置：提供分辨率切换和关键帧请求等控制项。
- 延迟与统计：提供延迟信息和 WebRTC 统计信息入口。
- 静态资源：图片、图标和点击音效位于 `images/`、`audio/`。

## 环境要求

- 现代浏览器，推荐 Chrome、Edge 或 Firefox。
- 可访问的 UE Pixel Streaming / WebRTC 信令服务。
- 一个静态文件服务器，用于本地预览或部署。

## 安装与配置

克隆仓库后不需要安装依赖：

```bash
git clone git@github.com:xiuleitan/xiuleiyun-ue-web.git
cd xiuleiyun-ue-web
```

本地预览可以使用 Python 自带的静态服务器：

```bash
python3 -m http.server 8080
```

然后访问：

```text
http://localhost:8080/player.html
```

## 配置项

当前配置直接写在前端脚本中：

| 文件 | 配置 | 说明 |
| --- | --- | --- |
| `js/app.js` | `signalServerPort` | 横屏端 WebRTC 信令端口 |
| `js/app.js` | `appShowUrl` | 横屏端应用展示服务地址 |
| `js/app.js` | `apiServerBase` | 横屏端封面图接口基础地址 |
| `js/app-phone.js` | `signalServerPort` | 竖屏端 WebRTC 信令端口 |
| `js/app-phone.js` | `appShowUrl` | 竖屏端应用展示服务地址 |
| `js/app-phone.js` | `apiServerBase` | 竖屏端封面图接口基础地址 |

页面支持通过查询参数传入：

| 参数 | 说明 |
| --- | --- |
| `appid` | 用于拼接远程封面图地址 |
| `streamerid` | 指定连接的 streamer 标识 |

示例：

```text
http://localhost:8080/player.html?appid=demo&streamerid=demo-streamer
```

## 使用方法

1. 启动或部署 UE Pixel Streaming / WebRTC 服务。
2. 根据部署环境调整 `js/app.js` 和 `js/app-phone.js` 中的服务地址。
3. 使用静态服务器托管本项目。
4. 在浏览器打开 `player.html`。

## 开发

项目没有构建步骤，修改 HTML、CSS、JS 后刷新浏览器即可验证。

建议在提交前运行：

```bash
git diff --check
python3 -m http.server 8080
```

如果只检查语法，可以对脚本执行：

```bash
node --check js/app.js
node --check js/app-phone.js
node --check js/webRtcPlayer.js
```

## 隐私与安全

- 仓库不应提交 `.env`、IDE 工作区状态、日志、缓存或本机临时文件。
- `.idea/`、`.vscode/`、构建目录和日志文件已在 `.gitignore` 中忽略。
- 当前代码中存在部署地址配置，公开发布前请确认这些地址可以公开展示。
- 如果曾经提交过真实密钥、账号、token 或私有服务地址，请立即轮换对应凭据；本次清理不会重写 Git 历史。

## 许可证

仓库中暂未发现许可证文件。公开发布前建议补充明确的开源许可证或内部使用说明。



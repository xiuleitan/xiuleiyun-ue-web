# xiuleiyun-ue-web

[中文](README.md)

![Static Web](https://img.shields.io/badge/Static-Web-blue)
![WebRTC](https://img.shields.io/badge/WebRTC-player-green)
![Mobile](https://img.shields.io/badge/Mobile-adapted-blue)

xiuleiyun-ue-web is a static web player UI for browser-based UE Pixel Streaming / real-time rendering sessions. It provides playback, connection status, fullscreen controls, reconnect actions, resolution switching, latency information, and mobile layout support.

The project is currently a plain static frontend with no build tooling or package manager requirement. It can be served by any static file server.

## Features

- WebRTC player page: `player.html` loads the player UI and WebRTC control logic.
- Orientation adaptation: landscape loads `js/app.js`, while portrait loads `js/app-phone.js`.
- Mobile layout: portrait mode uses `css/player-phone.css`.
- Player controls: fullscreen toggle, fill-screen mode, reconnect action, and connection status display.
- Stream settings: resolution switching and keyframe request controls.
- Latency and stats: UI entries for latency information and WebRTC stats.
- Static assets: images, icons, and click audio are stored in `images/` and `audio/`.

## Requirements

- A modern browser, preferably Chrome, Edge, or Firefox.
- Access to a UE Pixel Streaming / WebRTC signaling service.
- A static file server for local preview or deployment.

## Installation And Configuration

Clone the repository. No dependency installation is required:

```bash
git clone git@github.com:xiuleitan/xiuleiyun-ue-web.git
cd xiuleiyun-ue-web
```

For local preview, you can use Python's built-in static server:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/player.html
```

## Configuration

Runtime configuration is currently defined directly in the frontend scripts:

| File | Setting | Description |
| --- | --- | --- |
| `js/app.js` | `signalServerPort` | WebRTC signaling port for landscape mode |
| `js/app.js` | `appShowUrl` | Application display service URL for landscape mode |
| `js/app.js` | `apiServerBase` | Cover image API base URL for landscape mode |
| `js/app-phone.js` | `signalServerPort` | WebRTC signaling port for portrait mode |
| `js/app-phone.js` | `appShowUrl` | Application display service URL for portrait mode |
| `js/app-phone.js` | `apiServerBase` | Cover image API base URL for portrait mode |

The page also accepts query parameters:

| Parameter | Description |
| --- | --- |
| `appid` | Used to build the remote cover image URL |
| `streamerid` | Selects the streamer identifier to connect to |

Example:

```text
http://localhost:8080/player.html?appid=demo&streamerid=demo-streamer
```

## Usage

1. Start or deploy the UE Pixel Streaming / WebRTC service.
2. Adjust service URLs in `js/app.js` and `js/app-phone.js` for your environment.
3. Serve this repository with a static file server.
4. Open `player.html` in a browser.

## Development

There is no build step. Edit HTML, CSS, or JS files and refresh the browser to verify changes.

Recommended pre-commit checks:

```bash
git diff --check
python3 -m http.server 8080
```

For JavaScript syntax checks:

```bash
node --check js/app.js
node --check js/app-phone.js
node --check js/webRtcPlayer.js
```

## Privacy And Security

- Do not commit `.env` files, IDE workspace state, logs, caches, or local temporary files.
- `.idea/`, `.vscode/`, build output, and log files are ignored by `.gitignore`.
- The current code contains deployment endpoint configuration. Review whether those addresses are safe to publish before making the repository public.
- If real secrets, account data, tokens, or private service endpoints were ever committed, rotate the affected credentials. This cleanup does not rewrite Git history.

## License

No license file was found in this repository. Add an explicit open-source license or internal-use notice before public distribution.

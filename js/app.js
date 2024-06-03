// 类定义
// 待办事项：一旦我们引入了打包工具，就将这些类移动到单独的文件中
class TwoWayMap {
    constructor(map = {}) {
        this.map = map; // 正向映射
        this.reverseMap = new Map(); // 反向映射
        for(const key in map) {
            const value = map[key];
            this.reverseMap[value] = key; // 建立值到键的映射
        }
    }

    // 通过键获取值
    getFromKey(key) { return this.map[key]; }
    // 通过值获取键
    getFromValue(value) { return this.reverseMap[value]; }

     // 添加键值对
    add(key, value) {
        this.map[key] = value;
        this.reverseMap[value] = key;
    }
    // 移除键值对
    remove(key, value) {
        delete this.map[key];
        delete this.reverseMap[value];
    }
}

/**
 * 前端逻辑
 */
// 信令服务器端口
// let signalServerIP = "172.16.1.11"
let signalServerPort = 8187
// 应用展示的url
let appShowUrl = "http://10.1.112.59:8185/"
// 获取图像资源
let apiServerBase = "http://10.1.112.59:8186"
let coverImgUrl = apiServerBase + '/api/txl/imgs/'
let localCoverImgUrl = "images/localCover.jpg"
if (new URLSearchParams(window.location.search).get('appid')) {
    // 获取appid的值, 打印
    let urlParams = new URLSearchParams(window.location.search)
    const appid = urlParams.get('appid')
    coverImgUrl += `${appid}.jpg`
    console.log('打印url的值:',coverImgUrl)
}
let loadingPercentage = 0 // 加载百分比
let streamerid = null // streamerid
if( new URLSearchParams(window.location.search).get('streamerid')) {
    // 获取streamerid的值
    streamerid = new URLSearchParams(window.location.search).get('streamerid')

}

// 游戏手柄连接的窗口事件

let haveEvents = 'GamepadEvent' in window;
let haveWebkitEvents = 'WebKitGamepadEvent' in window;
let controllers = {}; // 控制器
let rAF = window.mozRequestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.requestAnimationFrame; // 动画帧请求

let webRtcPlayerObj = null; // WebRTC播放器对象
let print_stats = false; // 是否打印统计信息
let print_inputs = false; // 是否打印输入信息
let connect_on_load = false; // 是否在加载时连接
let ws; // WebSocket对象
const WS_OPEN_STATE = 1; // WebSocket打开状态码

let inputController = null; // 输入控制器
let autoPlayAudio = true; // 自动播放音频
let qualityController = false; // 质量控制器
let qualityControlOwnershipCheckBox; // 质量控制所有权复选框
let matchViewportResolution; // 匹配视口分辨率
let VideoEncoderQP = "N/A"; // 视频编码器的质量参数
// 待办事项：移除这个 - 由于切换分辨率过快导致UE崩溃的bug的临时解决方案
let lastTimeResized = new Date().getTime(); // 上次调整大小的时间
let resizeTimeout; // 调整大小超时

let responseEventListeners = new Map(); // 响应事件监听器

let freezeFrameOverlay = null; // 冻结帧覆盖层
let shouldShowPlayOverlay = true; // 是否显示播放覆盖层

let isFullscreen = false; // 是否全屏
let isMuted = false; // 是否静音
// 冻结帧是代替视频显示的静态JPEG图像
let freezeFrame = {
    receiving: false, // 是否正在接收
    size: 0, // 大小
    jpeg: undefined, // JPEG数据
    height: 0, // 高度
    width: 0,  // 宽度
    valid: false // 是否有效
};

let file = {
    mimetype: "", // MIME类型
    extension: "", // 扩展名
	receiving: false, // 是否正在接收
    size: 0, // 大小
    data: [], // 数据
    valid: false, // 是否有效
    timestampStart: undefined // 开始时间戳
};

// 可选地检测用户是否未互动（AFK）并断开他们的连接
let afk = {
    enabled: false,   // 是否启用AFK系统
    // enabled: true,   // 是否启用AFK系统
    warnTimeout: 120,   // 警告用户不活动前的时间, 120s之后自动断开连接
    closeTimeout: 10,   // 警告后断开用户的时间

    active: false,   // AFK系统是否正在检测不活动状态
    overlay: undefined,   // 警告用户不活动的UI覆盖层
    warnTimer: undefined,   // 等待显示不活动警告覆盖层的计时器
    countdown: 10,   // 不活动警告覆盖层上的倒计时显示断开连接的时间
    countdownTimer: undefined,   // 用于在不活动警告覆盖层上倒计时的计时器
}

// 如果用户聚焦在一个UE输入小部件上，则我们展示他们一个按钮以打开屏幕键盘
// 由于JavaScript安全性，我们只能在响应用户互动时展示屏幕键盘
let editTextButton = undefined;

// 一个仅用于聚焦和打开屏幕键盘的隐藏输入文本框
let hiddenInput = undefined;

let MaxByteValue = 255; // 最大字节值
// 显示/隐藏冻结帧与停止/开始流之间的延迟
// eg showing freeze frame -> delay -> stop stream OR show stream -> delay -> unshow freeze frame
// 例如 显示冻结帧 -> 延迟 -> 停止流 或 显示流 -> 延迟 -> 隐藏冻结帧
freezeFrameDelay = 50; // ms 延迟

let activeKeys = []; // 激活的键

let toStreamerMessages = new TwoWayMap();
let fromStreamerMessages = new TwoWayMap();

const MessageDirection = {
    // A message sent to the streamer. eg Key presses
    // ie player -> streamer
    ToStreamer: 0,

    // A message recevied from the streamer. eg Freeze frames
    // ie streamer -> player
    FromStreamer: 1
};

let toStreamerHandlers = new Map(); // toStreamerHandlers[message](args..)
let fromStreamerHandlers = new Map(); // fromStreamerHandlers[message](args..)
function populateDefaultProtocol() {
    /*
     * Control Messages. Range = 0..49.
     */
    toStreamerMessages.add("IFrameRequest", {
        "id": 0,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("RequestQualityControl", {
        "id": 1,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("FpsRequest", {
        "id": 2,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("AverageBitrateRequest", {
        "id": 3,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("StartStreaming", {
        "id": 4,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("StopStreaming", {
        "id": 5,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("LatencyTest", {
        "id": 6,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("RequestInitialSettings", {
        "id": 7,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("TestEcho", {
        "id": 8,
        "byteLength": 0,
        "structure": []
    });
    /*
     * Input Messages. Range = 50..89.
     */
    // Generic Input Messages. Range = 50..59.
    toStreamerMessages.add("UIInteraction", {
        "id": 50,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("Command", {
        "id": 51,
        "byteLength": 0,
        "structure": []
    });
    // Keyboard Input Message. Range = 60..69.
    toStreamerMessages.add("KeyDown", {
        "id": 60,
        "byteLength": 2,
        //            keyCode  isRepeat
        "structure": ["uint8", "uint8"]
    });
    toStreamerMessages.add("KeyUp", {
        "id": 61,
        "byteLength": 1,
        //            keyCode
        "structure": ["uint8"]
    });
    toStreamerMessages.add("KeyPress", {
        "id": 62,
        "byteLength": 2,
        //            charcode
        "structure": ["uint16"]
    });
    // Mouse Input Messages. Range = 70..79.
    toStreamerMessages.add("MouseEnter", {
        "id": 70,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("MouseLeave", {
        "id": 71,
        "byteLength": 0,
        "structure": []
    });
    toStreamerMessages.add("MouseDown", {
        "id": 72,
        "byteLength": 5,
        //              button     x         y
        "structure": ["uint8", "uint16", "uint16"]
    });
    toStreamerMessages.add("MouseUp", {
        "id": 73,
        "byteLength": 5,
        //              button     x         y
        "structure": ["uint8", "uint16", "uint16"]
    });
    toStreamerMessages.add("MouseMove", {
        "id": 74,
        "byteLength": 8,
        //              x           y      deltaX    deltaY
        "structure": ["uint16", "uint16", "int16", "int16"]
    });
    toStreamerMessages.add("MouseWheel", {
        "id": 75,
        "byteLength": 6,
        //              delta       x        y
        "structure": ["int16", "uint16", "uint16"]
    });
    toStreamerMessages.add("MouseDouble", {
        "id": 76,
        "byteLength": 5,
        //              button     x         y
        "structure": ["uint8", "uint16", "uint16"]
    });
    // Touch Input Messages. Range = 80..89.
    toStreamerMessages.add("TouchStart", {
        "id": 80,
        "byteLength": 8,
        //          numtouches(1)   x       y        idx     force     valid
        "structure": ["uint8", "uint16", "uint16", "uint8", "uint8", "uint8"]
    });
    toStreamerMessages.add("TouchEnd", {
        "id": 81,
        "byteLength": 8,
        //          numtouches(1)   x       y        idx     force     valid
        "structure": ["uint8", "uint16", "uint16", "uint8", "uint8", "uint8"]
    });
    toStreamerMessages.add("TouchMove", {
        "id": 82,
        "byteLength": 8,
        //          numtouches(1)   x       y       idx      force     valid
        "structure": ["uint8", "uint16", "uint16", "uint8", "uint8", "uint8"]
    });
    // Gamepad Input Messages. Range = 90..99
    toStreamerMessages.add("GamepadButtonPressed", {
        "id": 90,
        "byteLength": 3,
        //            ctrlerId   button  isRepeat
        "structure": ["uint8", "uint8", "uint8"]
    });
    toStreamerMessages.add("GamepadButtonReleased", {
        "id": 91,
        "byteLength": 3,
        //            ctrlerId   button  isRepeat(0)
        "structure": ["uint8", "uint8", "uint8"]
    });
    toStreamerMessages.add("GamepadAnalog", {
        "id": 92,
        "byteLength": 10,
        //            ctrlerId   button  analogValue
        "structure": ["uint8", "uint8", "double"]
    });

    fromStreamerMessages.add("QualityControlOwnership", 0);
    fromStreamerMessages.add("Response", 1);
    fromStreamerMessages.add("Command", 2);
    fromStreamerMessages.add("FreezeFrame", 3);
    fromStreamerMessages.add("UnfreezeFrame", 4);
    fromStreamerMessages.add("VideoEncoderAvgQP", 5);
    fromStreamerMessages.add("LatencyTest", 6);
    fromStreamerMessages.add("InitialSettings", 7);
    fromStreamerMessages.add("FileExtension", 8);
    fromStreamerMessages.add("FileMimeType", 9);
    fromStreamerMessages.add("FileContents", 10);
    fromStreamerMessages.add("TestEcho", 11);
    fromStreamerMessages.add("InputControlOwnership", 12);
    fromStreamerMessages.add("Protocol", 255);
}

// 定义一个函数，用于注册消息处理器
function registerMessageHandlers() {
    // 从UE像素流发出的消息，注册不同类型的消息处理函数
    registerMessageHandler(MessageDirection.FromStreamer, "QualityControlOwnership", onQualityControlOwnership); // 质量控制所有权
    registerMessageHandler(MessageDirection.FromStreamer, "Response", onResponse); // 处理来自ue的响应
    registerMessageHandler(MessageDirection.FromStreamer, "Command", onCommand); // 处理来自ue的命令
    registerMessageHandler(MessageDirection.FromStreamer, "FreezeFrame", onFreezeFrameMessage); // 处理冻结帧消息
    registerMessageHandler(MessageDirection.FromStreamer, "UnfreezeFrame", invalidateFreezeFrameOverlay); // 处理解冻帧消息
    registerMessageHandler(MessageDirection.FromStreamer, "VideoEncoderAvgQP", onVideoEncoderAvgQP); // 处理视频编码器平均量化参数消息
    registerMessageHandler(MessageDirection.FromStreamer, "LatencyTest", onLatencyTestMessage); // 处理延迟测试消息
    registerMessageHandler(MessageDirection.FromStreamer, "InitialSettings", onInitialSettings); // 处理初始设置消息
    registerMessageHandler(MessageDirection.FromStreamer, "FileExtension", onFileExtension); // 处理文件扩展名消息
    registerMessageHandler(MessageDirection.FromStreamer, "FileMimeType", onFileMimeType); // 处理文件MIME类型消息
    registerMessageHandler(MessageDirection.FromStreamer, "FileContents", onFileContents); // 处理文件内容消息
    registerMessageHandler(MessageDirection.FromStreamer, "TestEcho", () => {/* Do nothing */ }); // 处理测试回声消息
    registerMessageHandler(MessageDirection.FromStreamer, "InputControlOwnership", onInputControlOwnership); // 处理输入控制所有权消息
    registerMessageHandler(MessageDirection.FromStreamer, "Protocol", onProtocolMessage); // 处理协议消息

    // 向UE像素流发送的消息，注册消息处理函数以发送消息
    registerMessageHandler(MessageDirection.ToStreamer, "IFrameRequest", sendMessageToStreamer); // 发送I帧请求
    registerMessageHandler(MessageDirection.ToStreamer, "RequestQualityControl", sendMessageToStreamer); // 发送质量控制请求
    registerMessageHandler(MessageDirection.ToStreamer, "FpsRequest", sendMessageToStreamer); // 发送FPS请求
    registerMessageHandler(MessageDirection.ToStreamer, "AverageBitrateRequest", sendMessageToStreamer); // 发送平均比特率请求
    registerMessageHandler(MessageDirection.ToStreamer, "StartStreaming", sendMessageToStreamer); // 发送开始流请求
    registerMessageHandler(MessageDirection.ToStreamer, "StopStreaming", sendMessageToStreamer); // 发送停止流请求
    registerMessageHandler(MessageDirection.ToStreamer, "LatencyTest", sendMessageToStreamer); // 发送延迟测试请求
    registerMessageHandler(MessageDirection.ToStreamer, "RequestInitialSettings", sendMessageToStreamer); // 发送初始设置请求
    registerMessageHandler(MessageDirection.ToStreamer, "TestEcho", () => { /* Do nothing */}); // 发送测试回声请求
    registerMessageHandler(MessageDirection.ToStreamer, "UIInteraction", emitUIInteraction); // 发送UI交互消息
    registerMessageHandler(MessageDirection.ToStreamer, "Command", emitCommand); // 发送命令消息
    registerMessageHandler(MessageDirection.ToStreamer, "KeyDown", sendMessageToStreamer); // 发送按键按下消息
    registerMessageHandler(MessageDirection.ToStreamer, "KeyUp", sendMessageToStreamer); // 发送按键释放消息
    registerMessageHandler(MessageDirection.ToStreamer, "KeyPress", sendMessageToStreamer); // 发送按键按下消息
    registerMessageHandler(MessageDirection.ToStreamer, "MouseEnter", sendMessageToStreamer); // 发送鼠标进入消息
    registerMessageHandler(MessageDirection.ToStreamer, "MouseLeave", sendMessageToStreamer); // 发送鼠标离开消息
    registerMessageHandler(MessageDirection.ToStreamer, "MouseDown", sendMessageToStreamer); // 发送鼠标按下消息
    registerMessageHandler(MessageDirection.ToStreamer, "MouseUp", sendMessageToStreamer); // 发送鼠标释放消息
    registerMessageHandler(MessageDirection.ToStreamer, "MouseMove", sendMessageToStreamer); // 发送鼠标移动消息
    registerMessageHandler(MessageDirection.ToStreamer, "MouseWheel", sendMessageToStreamer); // 发送鼠标滚轮消息
    registerMessageHandler(MessageDirection.ToStreamer, "MouseDouble", sendMessageToStreamer); // 发送鼠标双击消息
    registerMessageHandler(MessageDirection.ToStreamer, "TouchStart", sendMessageToStreamer); // 发送触摸开始消息
    registerMessageHandler(MessageDirection.ToStreamer, "TouchEnd", sendMessageToStreamer); // 发送触摸结束消息
    registerMessageHandler(MessageDirection.ToStreamer, "TouchMove", sendMessageToStreamer); // 发送触摸移动消息
    registerMessageHandler(MessageDirection.ToStreamer, "GamepadButtonPressed", sendMessageToStreamer); // 发送游戏手柄按钮按下消息
    registerMessageHandler(MessageDirection.ToStreamer, "GamepadButtonReleased", sendMessageToStreamer); // 发送游戏手柄按钮释放消息
    registerMessageHandler(MessageDirection.ToStreamer, "GamepadAnalog", sendMessageToStreamer); // 发送游戏手柄模拟消息
}
// 定义一个函数，用于注册特定方向和类型的消息处理器
function registerMessageHandler(messageDirection, messageType, messageHandler) {
    switch (messageDirection) { // 根据消息的方向进行不同的处理
        case MessageDirection.ToStreamer:
            // 如果是向流媒体发送的消息，将处理函数存储在对应的处理器对象中
            toStreamerHandlers[messageType] = messageHandler;
            break;
        case MessageDirection.FromStreamer:
            // 如果是从流媒体接收的消息，将处理函数存储在对应的处理器对象中
            fromStreamerHandlers[messageType] = messageHandler;
            break;
        default:
            // 如果消息方向未知，打印错误信息
            console.log(`Unknown message direction ${messageDirection}`);
    }
}
// 定义一个函数，处理质量控制所有权消息, UE发过来的消息
function onQualityControlOwnership(data) {
    let view = new Uint8Array(data); // 创建一个视图来访问收到的数据
    let ownership = view[1] === 0 ? false : true; // 根据数据判断是否拥有质量控制权
    console.log("Received quality controller message, will control quality: " + ownership); // 打印是否控制质量的消息
    qualityController = ownership; // 设置质量控制器的状态
    // 如果有质量控制复选框，设置其状态
    if (qualityControlOwnershipCheckBox !== null) {
        qualityControlOwnershipCheckBox.disabled = ownership;
        qualityControlOwnershipCheckBox.checked = ownership;
    }
}

// 定义一个函数，处理响应消息, UE发过来的消息
function onResponse(data) {
    // 将数据解码为字符串
    let response = new TextDecoder("utf-16").decode(data.slice(1));
    for (let listener of responseEventListeners.values()) {
        listener(response); // 调用所有响应事件监听器
    }
}

// 定义一个函数，处理命令消息, UE发过来的消息
function onCommand(data) {
    // 解码命令为字符串 
    let commandAsString = new TextDecoder("utf-16").decode(data.slice(1));
     // 打印命令
    console.log(commandAsString);
    let command = JSON.parse(commandAsString); // 解析命令字符串为JSON对象
    if (command.command === 'onScreenKeyboard') { // 处理屏幕键盘命令
        showOnScreenKeyboard(command);
    }
}

// 定义一个函数，处理冻结帧消息, UE发过来的消息
function onFreezeFrameMessage(data) {
    let view = new Uint8Array(data); // 创建一个视图来访问收到的数据
    processFreezeFrameMessage(view); // 处理冻结帧消息
}

// 定义一个函数，处理视频编码器平均量化参数消息, UE发过来的消息
function onVideoEncoderAvgQP(data) {
    // 将数据解码为字符串并设置为全局变量
    VideoEncoderQP = new TextDecoder("utf-16").decode(data.slice(1));
}

// 定义一个函数，处理延迟测试消息
function onLatencyTestMessage(data) {
    // 解码延迟时间为字符串
    let latencyTimingsAsString = new TextDecoder("utf-16").decode(data.slice(1));
    console.log("Got latency timings from UE.");
    console.log(latencyTimingsAsString);
    let latencyTimingsFromUE = JSON.parse(latencyTimingsAsString); // 解析延迟时间字符串为JSON对象
    if (webRtcPlayerObj) { // 如果存在webRtc播放器对象，设置其延迟测试时间
        webRtcPlayerObj.latencyTestTimings.SetUETimings(latencyTimingsFromUE);
    }
}

// 定义一个函数，处理初始设置消息, UE发过来的消息
function onInitialSettings(data) {
    // 解码设置数据为字符串
    let settingsString = new TextDecoder("utf-16").decode(data.slice(1));
    let settingsJSON = JSON.parse(settingsString); // 解析设置字符串为JSON对象

    if (settingsJSON.PixelStreaming) { // 处理像素流设置
        // 根据设置禁用或启用控制台命令
        let allowConsoleCommands = settingsJSON.PixelStreaming.AllowPixelStreamingCommands;
        if (allowConsoleCommands === false) {
            console.warn("-AllowPixelStreamingCommands=false, sending arbitray console commands from browser to UE is disabled.");
        }
        // 根据设置禁用或启用延迟测试
        let disableLatencyTest = settingsJSON.PixelStreaming.DisableLatencyTest;
        if (disableLatencyTest) {
            document.getElementById("test-latency-button").disabled = true;
            document.getElementById("test-latency-button").title = "Disabled by -PixelStreamingDisableLatencyTester=true";
            console.warn("-PixelStreamingDisableLatencyTester=true, requesting latency report from the the browser to UE is disabled.");
        }
    }
    // 处理编码器设置
    if (settingsJSON.Encoder) {
        document.getElementById('encoder-min-qp-text').value = settingsJSON.Encoder.MinQP;
        document.getElementById('encoder-max-qp-text').value = settingsJSON.Encoder.MaxQP;
    }
    // 处理WebRTC设置
    if (settingsJSON.WebRTC) {
        document.getElementById("webrtc-fps-text").value = settingsJSON.WebRTC.FPS;
        // 将比特率从bps转换为kbps显示
        document.getElementById("webrtc-min-bitrate-text").value = settingsJSON.WebRTC.MinBitrate / 1000;
        document.getElementById("webrtc-max-bitrate-text").value = settingsJSON.WebRTC.MaxBitrate / 1000;
    }
}

function onFileExtension(data) {
    let view = new Uint8Array(data);
    processFileExtension(view);
}

function onFileMimeType(data) {
    let view = new Uint8Array(data);
    processFileMimeType(view);
}

function onFileContents(data) {
    let view = new Uint8Array(data);
    processFileContents(view);
}

function onInputControlOwnership(data) {
    let view = new Uint8Array(data);
    let ownership = view[1] === 0 ? false : true;
    console.log("Received input controller message - will your input control the stream: " + ownership);
    inputController = ownership;
}

function onProtocolMessage(data) {
    try {
        let protocolString = new TextDecoder("utf-16").decode(data.slice(1));
        let protocolJSON = JSON.parse(protocolString);
        if (!protocolJSON.hasOwnProperty("Direction")) {
            throw new Error('Malformed protocol received. Ensure the protocol message contains a direction');
        }
        let direction = protocolJSON.Direction;
        delete protocolJSON.Direction;
        console.log(`Received new ${ direction == MessageDirection.FromStreamer ? "FromStreamer" : "ToStreamer" } protocol. Updating existing protocol...`);
        Object.keys(protocolJSON).forEach((messageType) => {
            let message = protocolJSON[messageType];
            switch (direction) {
                case MessageDirection.ToStreamer:
                    // Check that the message contains all the relevant params
                    if (!message.hasOwnProperty("id") || !message.hasOwnProperty("byteLength")) {
                        console.error(`ToStreamer->${messageType} protocol definition was malformed as it didn't contain at least an id and a byteLength\n
                                       Definition was: ${JSON.stringify(message, null, 2)}`);
                        // return in a forEach is equivalent to a continue in a normal for loop
                        return;
                    }
                    if(message.byteLength > 0 && !message.hasOwnProperty("structure")) {
                        // If we specify a bytelength, will must have a corresponding structure
                        console.error(`ToStreamer->${messageType} protocol definition was malformed as it specified a byteLength but no accompanying structure`);
                        // return in a forEach is equivalent to a continue in a normal for loop
                        return;
                    }

					if(messageType === "GamepadAnalog") {
						// We don't want to update the GamepadAnalog message type as UE sends it with an incorrect bytelength
						return;
					}

                    if (toStreamerHandlers[messageType]) {
                        // If we've registered a handler for this message type we can add it to our supported messages. ie registerMessageHandler(...)
                        toStreamerMessages.add(messageType, message);
                    } else {
                        console.error(`There was no registered handler for "${messageType}" - try adding one using registerMessageHandler(MessageDirection.ToStreamer, "${messageType}", myHandler)`);
                    }
                    break;
                case MessageDirection.FromStreamer:
                    // Check that the message contains all the relevant params
                    if (!message.hasOwnProperty("id")) {
                        console.error(`FromStreamer->${messageType} protocol definition was malformed as it didn't contain at least an id\n
                        Definition was: ${JSON.stringify(message, null, 2)}`);
                        // return in a forEach is equivalent to a continue in a normal for loop
                        return;
                    }
                    if (fromStreamerHandlers[messageType]) {
                        // If we've registered a handler for this message type. ie registerMessageHandler(...)
                        fromStreamerMessages.add(messageType, message.id);
                    } else {
                        console.error(`There was no registered handler for "${message}" - try adding one using registerMessageHandler(MessageDirection.FromStreamer, "${messageType}", myHandler)`);
                    }
                    break;
                default:
                    throw new Error(`Unknown direction: ${direction}`);
            }
        });

        // Once the protocol has been received, we can send our control messages
        requestInitialSettings();
        requestQualityControl();
    } catch (e) {
        console.log(e);
    }
}

// https://w3c.github.io/gamepad/#remapping
const gamepadLayout = {
    // Buttons
    RightClusterBottomButton: 0,
    RightClusterRightButton: 1,
    RightClusterLeftButton: 2,
    RightClusterTopButton: 3,
    LeftShoulder: 4,
    RightShoulder: 5,
    LeftTrigger: 6,
    RightTrigger: 7,
    SelectOrBack: 8,
    StartOrForward: 9,
    LeftAnalogPress: 10,
    RightAnalogPress: 11,
    LeftClusterTopButton: 12,
    LeftClusterBottomButton: 13,
    LeftClusterLeftButton: 14,
    LeftClusterRightButton: 15,
    CentreButton: 16,
    // Axes
    LeftStickHorizontal: 0,
    LeftStickVertical: 1,
    RightStickHorizontal: 2,
    RightStickVertical: 3
};

function scanGamepads() {
    let gamepads = navigator.getGamepads ? navigator.getGamepads() : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : []);
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && (gamepads[i].index in controllers)) {
            controllers[gamepads[i].index].currentState = gamepads[i];
        }
    }
}

function updateStatus() {
    scanGamepads();
    // Iterate over multiple controllers in the case the mutiple gamepads are connected
    for (let j in controllers) {
        let controller = controllers[j];
        let currentState = controller.currentState;
        let prevState = controller.prevState;
        // Iterate over buttons
        for (let i = 0; i < currentState.buttons.length; i++) {
            let currButton = currentState.buttons[i];
            let prevButton = prevState.buttons[i];
            if (currButton.pressed) {
                // press
                if (i == gamepadLayout.LeftTrigger) {
                    //                       UEs left analog has a button index of 5
                    toStreamerHandlers.GamepadAnalog("GamepadAnalog", [j, 5, currButton.value]);
                } else if (i == gamepadLayout.RightTrigger) {
                    //                       UEs right analog has a button index of 6
                    toStreamerHandlers.GamepadAnalog("GamepadAnalog", [j, 6, currButton.value]);
                } else {
                    toStreamerHandlers.GamepadButtonPressed("GamepadButtonPressed", [j, i, prevButton.pressed]);
                }
            } else if (!currButton.pressed && prevButton.pressed) {
                // release
                if (i == gamepadLayout.LeftTrigger) {
                    //                       UEs left analog has a button index of 5
                    toStreamerHandlers.GamepadAnalog("GamepadAnalog", [j, 5, 0]);
                } else if (i == gamepadLayout.RightTrigger) {
                    //                       UEs right analog has a button index of 6
                    toStreamerHandlers.GamepadAnalog("GamepadAnalog", [j, 6, 0]);
                } else {
                    toStreamerHandlers.GamepadButtonReleased("GamepadButtonReleased", [j, i]);
                }
            }
        }
        // Iterate over gamepad axes (we will increment in lots of 2 as there is 2 axes per stick)
        for (let i = 0; i < currentState.axes.length; i += 2) {
            // Horizontal axes are even numbered
            let x = parseFloat(currentState.axes[i].toFixed(4));

            // Vertical axes are odd numbered
            // https://w3c.github.io/gamepad/#remapping Gamepad browser side standard mapping has positive down, negative up. This is downright disgusting. So we fix it.
            let y = -parseFloat(currentState.axes[i + 1].toFixed(4));

            // UE's analog axes follow the same order as the browsers, but start at index 1 so we will offset as such
            toStreamerHandlers.GamepadAnalog("GamepadAnalog", [j, i + 1, x]); // Horizontal axes, only offset by 1
            toStreamerHandlers.GamepadAnalog("GamepadAnalog", [j, i + 2, y]); // Vertical axes, offset by two (1 to match UEs axes convention and then another 1 for the vertical axes)
        }
        controllers[j].prevState = currentState;
    }
    rAF(updateStatus);
}

function gamepadConnectHandler(e) {
    console.log("Gamepad connect handler");
    gamepad = e.gamepad;
    controllers[gamepad.index] = {};
    controllers[gamepad.index].currentState = gamepad;
    controllers[gamepad.index].prevState = gamepad;
    console.log("Gamepad: " + gamepad.id + " connected");
    rAF(updateStatus);
}

function gamepadDisconnectHandler(e) {
    console.log("Gamepad disconnect handler");
    console.log("Gamepad: " + e.gamepad.id + " disconnected");
    delete controllers[e.gamepad.index];
}


function fullscreen() {
    // if already full screen; exit
  // else go fullscreen
  if (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  ) {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  } else {
    let element;
    //HTML elements controls
    if(!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
        // Chrome and FireFox on iOS can only fullscreen a <video>
        element = document.getElementById("streamingVideo");
    } else {
        // Everywhere else can fullscreen a <div>
        element = document.getElementById("playerUI");
    }
    if(!element) {
        return;
    }
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    } else if (element.webkitEnterFullscreen) {
      element.webkitEnterFullscreen(); //for iphone this code worked
    }
  }
  onFullscreenChange()
}

function onFullscreenChange() {
	isFullscreen = (document.webkitIsFullScreen 
		|| document.mozFullScreen 
		|| (document.msFullscreenElement && document.msFullscreenElement !== null) 
		|| (document.fullscreenElement && document.fullscreenElement !== null));

	let minimize = document.getElementById('minimize');
    let maximize = document.getElementById('maximize');
	if(minimize && maximize){
        if(isFullscreen) {
            minimize.style.display = 'inline';
            maximize.style.display = 'none';
        } else {
            minimize.style.display = 'none';
            maximize.style.display = 'inline';
        }
	}
}

// 定义一个解析URL参数的函数
function parseURLParams() {
    let urlParams = new URLSearchParams(window.location.search); // 创建一个URLSearchParams对象，用于处理URL中的查询字符串
    // 根据URL参数设置控制方案，如果有'hoveringMouse'参数，则使用HoveringMouse，否则使用LockedMouse
    inputOptions.controlScheme = (urlParams.has('hoveringMouse') ? ControlSchemeType.HoveringMouse : ControlSchemeType.LockedMouse); 
    // 获取显示控制方案的元素(切换键)
    let schemeToggle = document.getElementById("control-scheme-text");
    // 根据控制方案的不同，更改元素的显示内容
    switch (inputOptions.controlScheme) {
        // 如果控制方案是HoveringMouse, // 更改元素内容为"Control Scheme: Hovering Mouse"
        case ControlSchemeType.HoveringMouse:
            schemeToggle.innerHTML = "Control Scheme: Hovering Mouse";
            break;
        case ControlSchemeType.LockedMouse: // 如果控制方案是LockedMouse
            schemeToggle.innerHTML = "Control Scheme: Locked Mouse"; // 更改元素内容为"Control Scheme: Locked Mouse"
            break;
        default: // 如果控制方案既不是HoveringMouse也不是LockedMouse
            schemeToggle.innerHTML = "Control Scheme: Locked Mouse"; // 默认设置为"Control Scheme: Locked Mouse"
            console.log(`ERROR: Unknown control scheme ${inputOptions.controlScheme}, defaulting to Locked Mouse`); // 控制台输出错误信息
            break;
    }
    // 如果URL参数中有'noWatermark' 隐藏水印
    if(urlParams.has('noWatermark')) {
        let watermark = document.getElementById("unrealengine"); // 获取水印元素
        watermark.style.display = 'none'; // 隐藏水印
    }
    // 如果URL参数中有'hideBrowserCursor', 就隐藏浏览器的光标
    inputOptions.hideBrowserCursor = (urlParams.has('hideBrowserCursor') ?  true : false);
}

function playClickAudio() {
    // 获取音效元素
    const clickSound = document.getElementById('click-sound');
    // 克隆音效元素
    const newSound = clickSound.cloneNode(true);
    // 播放音效
    newSound.play();
    // 在音效播放完毕后，从文档中移除音效元素
    newSound.addEventListener('ended', () => {
        newSound.remove();
    });
}


let refreshBtnRotate = 0;
// 定义一个函数，用于设置HTML元素的事件
function setupHtmlEvents() {
    //Window events 监听浏览器窗口的大小变化。当窗口的大小发生变化时，会自动调用resizePlayerStyle函数。这通常用于响应式设计，确保页面的布局和内容能够根据浏览器窗口的大小自适应调整
    window.addEventListener('resize', resizePlayerStyle, true); // 监听窗口大小变化事件，调用resizePlayerStyle函数
    window.addEventListener('orientationchange', onOrientationChange); // 监听屏幕旋转事件，调用onOrientationChange函数

    //Gamepad events
    if (haveEvents) { // 如果支持gamepad事件
        window.addEventListener("gamepadconnected", gamepadConnectHandler); // 监听游戏手柄连接事件
        window.addEventListener("gamepaddisconnected", gamepadDisconnectHandler); // 监听游戏手柄断开连接事件
    } else if (haveWebkitEvents) { // 如果支持webkit前缀的gamepad事件
        window.addEventListener("webkitgamepadconnected", gamepadConnectHandler); // 监听游戏手柄连接事件
        window.addEventListener("webkitgamepaddisconnected", gamepadDisconnectHandler); // 监听游戏手柄断开连接事件
    }
    // 监听全屏变化事件，兼容不同浏览器
    document.addEventListener('webkitfullscreenchange', onFullscreenChange, false);
    document.addEventListener('mozfullscreenchange', onFullscreenChange, false);
    document.addEventListener('fullscreenchange', onFullscreenChange, false);
    document.addEventListener('MSFullscreenChange', onFullscreenChange, false);

    // 设置按钮点击事件
    let settingsBtn = document.getElementById('settingsBtn'); // 获取设置按钮
    settingsBtn.addEventListener('click', settingsClicked); // 点击设置按钮调用settingsClicked函数, 打开或隐藏设置面板

    let statsBtn = document.getElementById('statsBtn'); // 获取统计信息按钮
    statsBtn.addEventListener('click', statsClicked); // 点击统计信息按钮调用statsClicked函数,  打开或隐藏统计面板

    let controlBtn = document.getElementById('control-tgl'); // 获取控制模式切换按钮
    controlBtn.addEventListener('change', toggleControlScheme); // 切换控制模式

    let cursorBtn = document.getElementById('cursor-tgl'); // 获取光标显示切换按钮
    cursorBtn.addEventListener('change', toggleBrowserCursorVisibility); // 切换浏览器光标显示


    // 设置切换全屏
    let fullscreenCheckBox = document.getElementById('txl-full-screen-tgl');
    if (fullscreenCheckBox !== null) {
        fullscreenCheckBox.onchange = function(event) {
            playClickAudio()
            fullscreen(); // 调整播放器样式
        };
    }

    // 设置屏幕尺寸调整复选框
    let resizeCheckBox = document.getElementById('enlarge-display-to-fill-window-tgl');
    if (resizeCheckBox !== null) {
        resizeCheckBox.onchange = function(event) {
            playClickAudio()
            resizePlayerStyle(); // 调整播放器样式
        };
    }
    // 设置质量控制所有权复选框
    qualityControlOwnershipCheckBox = document.getElementById('quality-control-ownership-tgl');
    if (qualityControlOwnershipCheckBox !== null) {
        qualityControlOwnershipCheckBox.onchange = function(event) {
            requestQualityControl(); // 请求质量控制
        };
    }
    // 设置编码器参数提交按钮 (没太必要)
    let encoderParamsSubmit = document.getElementById('encoder-params-submit');
    if (encoderParamsSubmit !== null) {
        encoderParamsSubmit.onclick = function(event) {

            let minQP = document.getElementById('encoder-min-qp-text').value; // 获取最小QP值
            let maxQP = document.getElementById('encoder-max-qp-text').value; // 获取最大QP值

            emitCommand({ "Encoder.MinQP": minQP }); // 发送最小QP命令
            emitCommand({ "Encoder.MaxQP": maxQP }); // 发送最大QP命令
        };
    }

    // 设置WebRTC参数提交按钮
    let webrtcParamsSubmit = document.getElementById('webrtc-params-submit');
    if (webrtcParamsSubmit !== null) {
        webrtcParamsSubmit.onclick = function(event) {
            let FPS = document.getElementById('webrtc-fps-text').value; // 获取FPS值
            let minBitrate = document.getElementById('webrtc-min-bitrate-text').value * 1000; // 获取最小比特率
            let maxBitrate = document.getElementById('webrtc-max-bitrate-text').value * 1000; // 获取最大比特率

            emitCommand({ 'WebRTC.Fps': FPS }); // 发送FPS命令
            emitCommand({ 'WebRTC.MinBitrate': minBitrate }); // 发送最小比特率命令
            emitCommand({ 'WebRTC.MaxBitrate': maxBitrate });// 发送最大比特率命令
        }; 
    }

    // 设置显示FPS按钮
    let showFPSButton = document.getElementById('show-fps-button');
    if (showFPSButton !== null) {
        showFPSButton.onclick = function (event) {
            emitCommand({ "Stat.FPS": '' }); // 发送显示FPS命令
        };
    }

    // 设置请求关键帧按钮
    let requestKeyframeButton = document.getElementById('request-keyframe-button');
    if (requestKeyframeButton !== null) {
        requestKeyframeButton.onclick = function (event) {
            toStreamerHandlers.IFrameRequest("IFrameRequest"); // 发送关键帧请求
        };
    }

     //  设置重启流按钮
    let restartStreamButton = document.getElementById('restart-stream-button');
    if (restartStreamButton !== null) {
        restartStreamButton.onclick = function (event) {
            playClickAudio()
            // 设置样式每点击一次加360度
            restartStreamButton.style.transform = `rotate(${refreshBtnRotate += 360}deg)`;
            restartStream(); // 重启流
        };
    }
    // 设置匹配视口分辨率复选框
    let matchViewportResolutionCheckBox = document.getElementById('match-viewport-res-tgl');
    if (matchViewportResolutionCheckBox !== null) {
        matchViewportResolutionCheckBox.onchange = function (event) {
            matchViewportResolution = matchViewportResolutionCheckBox.checked; // 设置匹配视口分辨率
            updateVideoStreamSize(); // 更新视频流尺寸
        };
    }


    // 根据url参数中的参数character等于master的话就显示"resolution-select-box"这个下拉框, 否则就隐藏
    if (new URLSearchParams(window.location.search).get('character') !== 'master') {

        let selectRenderResolutionSelectBox = document.getElementById('selectRenderResolution');
        if (selectRenderResolutionSelectBox !== null) {
            selectRenderResolutionSelectBox.style.display = "none";
        }

    }
    // 设置切换渲染分辨率的复下拉框
    const formControlBox = document.querySelector('.form-control-box');
    let selectRenderResolutionSelectBox = document.getElementById('resolution-select-box');
    if (selectRenderResolutionSelectBox !== null) {

        // 显示或隐藏下拉框
        formControlBox.addEventListener('click', () => {
            playClickAudio();
            const isDisplayed = selectRenderResolutionSelectBox.style.display === 'block';
            selectRenderResolutionSelectBox.style.display = isDisplayed ? 'none' : 'block';
        });
        // 鼠标移出resolution-select-box时隐藏下拉框
        // formControlBox.addEventListener('mouseleave', () => {
        //     if (selectRenderResolutionSelectBox.style.display === 'block'){
        //
        //     }
        //     selectRenderResolutionSelectBox.style.display = 'none';
        // });

        selectRenderResolutionSelectBox.addEventListener('mouseleave', () => {
            selectRenderResolutionSelectBox.style.display = 'none';
        });

        // 设置下拉框的每个值
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;

        const resolutions = [
            `${screenWidth}x${screenHeight}`,
            `${Math.floor(screenWidth / 2)}x${Math.floor(screenHeight / 2)}`,
            `${Math.floor(screenWidth / 3)}x${Math.floor(screenHeight / 3)}`,
            `${Math.floor(screenWidth / 4)}x${Math.floor(screenHeight / 4)}`
        ];

        // for (let i = 0; i < 4; i++) {
        //     selectRenderResolutionSelectBox.options[i].value = resolutions[i];
        //     selectRenderResolutionSelectBox.options[i].text = resolutions[i] + ` (视口分辨率/${i + 1})`;
        // }

        for (let i = 0; i < 4; i++) {
            selectRenderResolutionSelectBox.children[i].setAttribute('data-value', resolutions[i]);
            selectRenderResolutionSelectBox.children[i].innerText = resolutions[i] + ` (视口分辨率/${i + 1})`;
        }

        // 添加事件监听器，监听选择的值变化
        selectRenderResolutionSelectBox.addEventListener('click', (event) => {
            // playClickAudio()
            // const selectedValue = event.target.value;
            // // 分别获取选择的值的宽和高
            // const [width, height] = selectedValue.split('x').map((value) => parseInt(value));
            // updateVideoStreamSize(width, height); // 更新视频流尺寸
            // console.log(`Selected resolution: ${selectedValue}`);
            //
            // // 将撑满屏幕复选框设置为未选中
            // // 获取控制是否扩大显示以填充窗口的复选框元素
            // let checkBox = document.getElementById('enlarge-display-to-fill-window-tgl');
            // if (checkBox !== null) {
            //     checkBox.checked = false; // 设置为未选中
            // }
            if (event.target.tagName === 'LI') {
                playClickAudio();
                const selectedValue = event.target.getAttribute('data-value');
                formControlBox.innerText = event.target.innerText;
                selectRenderResolutionSelectBox.style.display = 'none'; // 选择后隐藏下拉框
                // 分别获取选择的值的宽和高
                const [width, height] = selectedValue.split('x').map((value) => parseInt(value));
                updateVideoStreamSize(width, height); // 更新视频流尺寸
                console.log(`Selected resolution: ${selectedValue}`);

                // 将撑满屏幕复选框设置为未选中
                let checkBox = document.getElementById('enlarge-display-to-fill-window-tgl');
                if (checkBox !== null) {
                    checkBox.checked = false; // 设置为未选中
                }
            }
        });
    }

    // 设置显示统计信息复选框
    let statsCheckBox = document.getElementById('show-stats-tgl');
    if (statsCheckBox !== null) {
        statsCheckBox.onchange = function(event) {
            let stats = document.getElementById('statsContainer');
            stats.style.display = event.target.checked ? "block" : "none";
        };
    }
    // 设置延迟测试按钮
    let latencyButton = document.getElementById('test-latency-button');
    if (latencyButton) {
        latencyButton.onclick = () => {
            playClickAudio()
            sendStartLatencyTest(); // 发送开始延迟测试命令
        };
    }

    // 使用URL参数设置一些切换选项
    setupToggleWithUrlParams("prefer-sfu-tgl", "preferSFU");
    setupToggleWithUrlParams("use-mic-tgl", "useMic");
    setupToggleWithUrlParams("force-turn-tgl", "ForceTURN");
    setupToggleWithUrlParams("force-mono-tgl", "ForceMonoAudio");
    setupToggleWithUrlParams("control-tgl", "hoveringMouse");
    setupToggleWithUrlParams("cursor-tgl", "hideBrowserCursor");
    setupToggleWithUrlParams("offer-receive-tgl", "offerToReceive");

    // 设置流选择器和轨道选择器
    var streamSelector = document.getElementById('stream-select'); // 获取流选择器
    var trackSelector = document.getElementById('track-select'); // 获取轨道选择器
    if (streamSelector) {
        streamSelector.onchange = function(event) {
            const stream = webRtcPlayerObj.availableVideoStreams.get(streamSelector.value); // 获取选择的流
            webRtcPlayerObj.video.srcObject = stream; // 设置视频源
            streamTrackSource = stream; // 设置流跟踪源
            webRtcPlayerObj.video.play(); // 播放视频
            updateTrackList(); // 更新轨道列表
        }

        if (trackSelector) {
            trackSelector.onchange = function(event) {
                if (!streamTrackSource) {
                    streamTrackSource = webRtcPlayerObj.availableVideoStreams.get(streamSelector.value); // 获取流跟踪源
                }
                if (streamTrackSource) {
                    for (const track of streamTrackSource.getVideoTracks()) { // 遍历视频轨道
                        if (track.id == trackSelector.value) { // 匹配轨道ID
                            webRtcPlayerObj.video.srcObject = new MediaStream([track]); // 设置视频源为选中的轨道
                            webRtcPlayerObj.video.play(); // 播放视频
                            streamSelector.value = ""; // 重置流选择器
                            break;
                        }
                    }
                }
            }
        }
    }
}
// 定义一个函数，接收一个切换元素的 ID 和一个 URL 参数的键名
function setupToggleWithUrlParams(toggleId, urlParameterKey) {
    // 根据 ID 获取对应的开关元素
    let toggleElem = document.getElementById(toggleId);
    if (toggleElem) {
        // 设置开关的状态，根据 URL 参数中是否存在指定的键名
        toggleElem.checked = new URLSearchParams(window.location.search).has(urlParameterKey);
        // 给开关元素添加一个事件监听器，监听状态变化
        toggleElem.addEventListener('change', (event) => {
            const urlParams = new URLSearchParams(window.location.search);  // 创建 URL 参数对象
            if (event.currentTarget.checked) {
                urlParams.set(urlParameterKey, "true"); // 如果开关被激活，设置 URL 参数的键名为"true"
            } else {
                urlParams.delete(urlParameterKey); // 如果开关被关闭，从 URL 参数中删除该键名
            }
            // 更新浏览器的 URL，如果 URL 参数非空则添加参数，否则仅显示路径
            window.history.replaceState({}, '', urlParams.toString() !== "" ? `${location.pathname}?${urlParams}` : `${location.pathname}`);
        });
    }
}

function UrlParamsCheck(urlParameterKey) {
    return new URLSearchParams(window.location.search).has(urlParameterKey);
}

var streamTrackSource = null;

function updateStreamList() {
    const streamSelector = document.getElementById('stream-select');
    for (let i = streamSelector.options.length - 1; i >= 0; i--) {
        streamSelector.remove(i);
    }
    streamSelector.value = null;
    for (const [streamId, stream] of webRtcPlayerObj.availableVideoStreams) {
        var opt = document.createElement('option');
        opt.value = streamId;
        opt.innerHTML = streamId;
        streamSelector.appendChild(opt);
        if (streamSelector.value == null) {
            streamSelector.value = streamId;
        }
    }

    updateTrackList();
}

function updateTrackList() {
    const streamSelector = document.getElementById('stream-select');
    const trackSelector = document.getElementById('track-select');
    const stream = webRtcPlayerObj.availableVideoStreams.get(streamSelector.value);
    for (let i = trackSelector.options.length - 1; i >= 0; i--) {
        trackSelector.remove(i);
    }
    trackSelector.value = null;
    for (const track of stream.getVideoTracks()) {
        var opt = document.createElement('option');
        opt.value = track.id;
        opt.innerHTML = track.label;
        trackSelector.appendChild(opt);
        if (track.selected) {
            trackSelector.value = track.id;
        }
    }
}

// 定义一个函数，用于发送开始延迟测试的指令
function sendStartLatencyTest() {
    // 我们需要 WebRTC 处于活动状态才能进行延迟测试。
    if (!webRtcPlayerObj) { // 如果 webRtcPlayerObj 对象不存在，则返回，不执行任何操作
        return;
    }
    // 定义一个函数，该函数将在测试开始时被调用，参数 StartTimeMs 是测试开始的时间（毫秒）
    let onTestStarted = function(StartTimeMs) { 
        let descriptor = { // 创建一个描述符对象，包含测试开始时间
            StartTime: StartTimeMs 
        };
        emitDescriptor("LatencyTest", descriptor); // 发出描述符事件，事件类型为 "LatencyTest"，包含描述符数据
    };
    // 调用 webRtcPlayerObj 对象的 startLatencyTest 方法，传入 onTestStarted 函数作为参数
    webRtcPlayerObj.startLatencyTest(onTestStarted);
}

// 用于在视频播放器上设置一个覆盖层。这个覆盖层可以通过点击事件进行交互
function setOverlay(htmlClass, htmlElement, onClickFunction) {
    // 尝试获取id为'videoPlayOverlay'的DOM元素
    let videoPlayOverlay = document.getElementById('videoPlayOverlay');
    if (!videoPlayOverlay) { // 如果该元素不存在，则创建一个新的div元素作为覆盖层，并将其添加到播放器中
        let playerDiv = document.getElementById('player');
        videoPlayOverlay = document.createElement('div');
        videoPlayOverlay.id = 'videoPlayOverlay';
        playerDiv.appendChild(videoPlayOverlay);
    }

    // 移除覆盖层中现有的HTML子元素，为添加新元素做准备
    while (videoPlayOverlay.lastChild) {
        videoPlayOverlay.removeChild(videoPlayOverlay.lastChild);
    }
    // 如果提供了htmlElement参数，则将其作为子元素添加到覆盖层中
    if (htmlElement)
            videoPlayOverlay.appendChild(htmlElement);
    // 如果提供了onClickFunction参数，则为覆盖层添加点击事件监听器
    if (onClickFunction) {
        videoPlayOverlay.addEventListener('click', function onOverlayClick(event) {
            onClickFunction(event);
            if ( htmlElement.id === 'playButton' ) {
                htmlElement.innerHTML = '嗨';
            }
            // 事件触发后移除监听器，避免重复触发
            videoPlayOverlay.removeEventListener('click', onOverlayClick);
        });
    }

    // 移除覆盖层现有的HTML类，为设置新类做准备
    let cl = videoPlayOverlay.classList;
    for (let i = cl.length - 1; i >= 0; i--) {
        cl.remove(cl[i]);
    }
    // 添加新的HTML类到覆盖层
    videoPlayOverlay.classList.add(htmlClass);
}

function showConnectOverlay() {
    // 获取封面img元素
    let coverImgHtml = document.getElementById("loading-cover-img")
    // console.log('元素是:', coverImgHtml)
    // 创建一个新的Image对象来检查远程图片是否可用
    let img = new Image();
    img.onload = function() {
        // 如果img加载成功, 就用远程图片
        coverImgHtml.src = coverImgUrl;
    };
    img.onerror = function() {
        // 远程图片加载失败，使用本地图片
        coverImgHtml.src = localCoverImgUrl;
    };
    // 开启img加载, 尝试加载远程图片
    img.src = coverImgUrl;


    // 获取进度条标签
    let progressHtml = document.getElementById("progressHtml")
    // console.log('progressHtml是:', progressHtml)
    // 创建一个 Proxy 来监听 loadingPercentage 的变化, 显示加载封面的进度条
    const loadingProxy = new Proxy({ value: loadingPercentage }, {
        set(target, property, value) {
            if (property === 'value') {
                target[property] = value;
                // 更新 progress 元素的宽度
                progressHtml.style.width = value + '%';
                // 如果到了100%就开始显示"点击开始", 并隐藏封面加载图
                if (value === 100){
                    connect();
                    startAfkWarningTimer();
                    // let startText = document.createElement('div');
                    // startText.id = 'playButton';
                    // startText.innerHTML = '点击开始';
                    //
                    // setOverlay('clickableState', startText, event => {
                    //     connect();
                    //     startAfkWarningTimer();
                    // });
                    // 隔.5s隐藏封面元素
                    setTimeout(() => {
                        let loadingCoverHtml = document.getElementById("loadingOverlay")
                        if (loadingCoverHtml!==null){
                            loadingCoverHtml.style.display = "none" // 隐藏
                        }
                    }, 700)

                }
                return true;
            }
            return false;
        }
    });
    if ( streamerid){
        // 不断请求服务器查看UE是否启动完成
        let requestUEStatusTimes = 8 // 请求失败超过5次就跳转页面
        let checkUEStatus = setInterval(() => {
            try{
                // 通过axios发送POST请求, data为streamerid
                axios.post(apiServerBase + '/api/txl/pixelok', {streamerID: streamerid})
                    .then((res) => {
                        console.log('res是:', res)
                        if ( res.data.data.pixelOk === null){ // 如果返回的数据为null, 说明不存在该streamerID对象多次未返回数据, 就跳转页面
                            console.log('不存在该streamerID对象')
                            if( loadingProxy.value < 80){
                                loadingProxy.value += 10
                            }
                            requestUEStatusTimes--
                            if(requestUEStatusTimes <= 0){
                                clearInterval(checkUEStatus)
                                // 跳转页面到appShowUrl
                                window.location.href = appShowUrl;
                            }
                        }else if (res.data.data.pixelOk === true) {
                            console.log('UE启动完成')
                            loadingProxy.value = 100
                            clearInterval(checkUEStatus) //清除定时器
                        }else if(res.data.data.pixelOk === false){
                            // 否则打印UE启动中
                            console.log('UE启动中')
                            if( loadingProxy.value < 80){
                                // 如果加载百分比小于90, 加10
                                loadingProxy.value += 19
                            }
                        }
                    })
                    .catch((err) => {
                        console.error('请求失败:' + err)
                        requestUEStatusTimes--
                        if(requestUEStatusTimes <= 0){
                            clearInterval(checkUEStatus)
                            // 跳转页面到appShowUrl
                            window.location.href = appShowUrl;
                        }
                    })
            }catch (error){
                console.error('请求streamerid加载状态失败:' + error)
                clearInterval(checkUEStatus)
            }

        }, 1000)

    }
    // let startText = document.createElement('div');
    // startText.id = 'playButton';
    // startText.innerHTML = '点击开始';
    //
    // setOverlay('clickableState', startText, event => {
    //     connect();
    //     startAfkWarningTimer();
    // });
}

function showTextOverlay(text) {
    let textOverlay = document.createElement('div');
    textOverlay.id = 'messageOverlay';
    textOverlay.innerHTML = text ? text : '';
    setOverlay('textDisplayState', textOverlay);
}

function playStream() {
    if(webRtcPlayerObj && webRtcPlayerObj.video) {
        if(webRtcPlayerObj.audio.srcObject && autoPlayAudio) {
            // Video and Audio are seperate tracks
            webRtcPlayerObj.audio.play().then(() => {
                // audio play has succeeded, start playing video
                playVideo();
            }).catch((onRejectedReason) => {
                console.error(onRejectedReason);
                console.log("Browser does not support autoplaying audio without interaction - to resolve this we are going to show the play button overlay.")
                showPlayOverlay();
            });
        } else {
            // Video and audio are combined in the video element
            playVideo();
        }
        showFreezeFrameOverlay();
        hideOverlay();
    }
}

function playVideo() {
    webRtcPlayerObj.video.play().catch((onRejectedReason) => {
        if(webRtcPlayerObj.audio.srcObject) {
            webRtcPlayerObj.audio.stop();
        }
        console.error(onRejectedReason);
        console.log("Browser does not support autoplaying video without interaction - to resolve this we are going to show the play button overlay.")
        showPlayOverlay();
    });
}

function showPlayOverlay() {
    let img = document.createElement('img');
    img.id = 'playButton';
    img.src = 'images/play-bai-512.png';
    img.alt = 'Start Streaming';
    setOverlay('clickableState', img, event => {
        playStream();
    });
    shouldShowPlayOverlay = false;
}

function updateAfkOverlayText() {
    afk.overlay.innerHTML = '<center>不活动!<br>将在 ' + afk.countdown + 's 后自动断开<br>点击继续<br></center>';
}

// 主要用于在用户长时间无操作时显示一个覆盖层，提示用户他们即将因为无活动而被断开连接
function showAfkOverlay() {
    // 用户正在查看不活动警告覆盖层时，暂停计时器
    stopAfkWarningTimer();

    // 创建并显示不活动警告的覆盖层
    afk.overlay = document.createElement('div');
    afk.overlay.id = 'afkOverlay';

    setOverlay('clickableState', afk.overlay, event => {
        // 用户点击后，重新启动计时器并继续
        hideOverlay();
        clearInterval(afk.countdownTimer);
        startAfkWarningTimer();
    });
    // 初始化倒计时时间
    afk.countdown = afk.closeTimeout;
    updateAfkOverlayText(); // 更新AFK覆盖层上的文本

    // 如果当前控制方案是锁定鼠标，并且文档允许解除鼠标锁定，则解除锁定
    if (inputOptions.controlScheme == ControlSchemeType.LockedMouse && document.exitPointerLock) {
        document.exitPointerLock();
    }

     // 设置一个计时器，每秒更新一次倒计时，并在倒计时结束时关闭WebSocket连接
    afk.countdownTimer = setInterval(function() {
        afk.countdown--;
        if (afk.countdown == 0) {
            // 用户未点击，断开连接
            hideOverlay();
            ws.close(); // 关闭websocket连接
        } else {
            // 更新倒计时信息
            updateAfkOverlayText();
        }
    }, 1000);
}

function hideOverlay() {
    setOverlay('hiddenState');
}

// Start a timer which when elapsed will warn the user they are inactive.
function startAfkWarningTimer() {
    afk.active = afk.enabled;
    resetAfkWarningTimer();
}

// 用于停止AFK（Away From Keyboard，离开键盘）警告计时器
function stopAfkWarningTimer() {
    afk.active = false; // 设置afk.active为false，表示非活动警告计时器不再活跃
}

// 用于重置“离开键盘”(AFK - Away From Keyboard)的警告计时器。
// 如果用户进行了任何交互，这个函数将被调用以重新计算用户无活动的时间
function resetAfkWarningTimer() {
    // 如果当前AFK功能处于激活状态
    if (afk.active) {
        // 清除当前的警告计时器
        clearTimeout(afk.warnTimer);
        // 重新设置警告计时器，在指定的afk.warnTimeout秒数后显示AFK覆盖层
        afk.warnTimer = setTimeout(function () {
            showAfkOverlay();
        }, afk.warnTimeout * 1000);
    }
}

function createWebRtcOffer() {
    if (webRtcPlayerObj) {
        console.log('Creating offer');
        showTextOverlay('Starting connection to server, please wait');
        webRtcPlayerObj.createOffer();
    } else {
        console.log('WebRTC player not setup, cannot create offer');
        showTextOverlay('Unable to setup video');
    }
}

// 用于通过WebRTC发送数据
function sendInputData(data) {
    // 检查webRtcPlayerObj对象是否存在
    if (webRtcPlayerObj) { 
        resetAfkWarningTimer(); // 如果存在，则重置用户无操作的警告计时器
        webRtcPlayerObj.send(data); // 调用webRtcPlayerObj对象的send方法，将data数据发送出去
    }
}

function addResponseEventListener(name, listener) {
    responseEventListeners.set(name, listener);
}

function removeResponseEventListener(name) {
    responseEventListeners.delete(name);
}

// 定义一个函数，用于显示冻结帧
function showFreezeFrame() {
    // 将冻结帧数据转换为 Base64 编码的字符串
    let base64 = btoa(freezeFrame.jpeg.reduce((data, byte) => data + String.fromCharCode(byte), ''));
    // 获取显示冻结帧的图片元素
    let freezeFrameImage = document.getElementById("freezeFrameOverlay").childNodes[0];
    freezeFrameImage.src = 'data:image/jpeg;base64,' + base64; // 设置图片源为冻结帧的 Base64 编码
    // 图片加载完成后的处理
    freezeFrameImage.onload = function () {
        // 设置冻结帧的高度和宽度
        freezeFrame.height = freezeFrameImage.naturalHeight;
        freezeFrame.width = freezeFrameImage.naturalWidth;
        resizeFreezeFrameOverlay();// 调整冻结帧覆盖层的大小
        if (shouldShowPlayOverlay) { // 根据条件显示播放覆盖层或冻结帧覆盖层
            showPlayOverlay();
            resizePlayerStyle();
        } else {
            showFreezeFrameOverlay();
        }
        setTimeout(() => { // 设定一个延迟来禁用视频播放
            webRtcPlayerObj.setVideoEnabled(false);
        }, freezeFrameDelay);
    };
}
// 定义一个函数，处理文件扩展名消息
function processFileExtension(view) {
    // 如果还未开始接收文件，初始化文件接收状态
    if (!file.receiving) {
        file.mimetype = "";
        file.extension = "";
        file.receiving = true;
        file.valid = false;
        file.size = 0;
        file.data = [];
        file.timestampStart = (new Date()).getTime();
        console.log('Received first chunk of file');
    }
    // 解码文件扩展名
    let extensionAsString = new TextDecoder("utf-16").decode(view.slice(1));
    console.log(extensionAsString);
    file.extension = extensionAsString;
}

// 定义一个函数，处理文件MIME类型消息
function processFileMimeType(view) {
    // 如果还未开始接收文件，初始化文件接收状态
    if (!file.receiving) {
        file.mimetype = "";
        file.extension = "";
        file.receiving = true;
        file.valid = false;
        file.size = 0;
        file.data = [];
        file.timestampStart = (new Date()).getTime();
        console.log('Received first chunk of file');
    }

    // 解码MIME类型
    let mimeAsString = new TextDecoder("utf-16").decode(view.slice(1));
    console.log(mimeAsString);
    file.mimetype = mimeAsString;
}

// 定义一个函数，处理文件内容消息
function processFileContents(view) {
    // 如果还未开始接收文件，则直接返回
    if (!file.receiving) return;

    // 从消息中提取文件总大小
    file.size = Math.ceil((new DataView(view.slice(1, 5).buffer)).getInt32(0, true) / 16379 /* The maximum number of payload bits per message*/);

    // 获取文件内容的片段
    let fileBytes = view.slice(1 + 4);

    // 将片段添加到文件数据中
    file.data.push(fileBytes);

    // Uncomment for debug
    console.log(`Received file chunk: ${file.data.length}/${file.size}`);

    // 如果收到了全部文件片段
    if (file.data.length === file.size) {
        file.receiving = false;
        file.valid = true;
        console.log("Received complete file");
        // 计算文件传输的平均比特率
        const transferDuration = ((new Date()).getTime() - file.timestampStart);
        const transferBitrate = Math.round(file.size * 16 * 1024 / transferDuration);
        console.log(`Average transfer bitrate: ${transferBitrate}kb/s over ${transferDuration / 1000} seconds`);

        // 文件重构和下载链接创建
        var received = new Blob(file.data, { type: file.mimetype });
        var a = document.createElement('a');
        a.setAttribute('href', URL.createObjectURL(received));
        a.setAttribute('download', `transfer.${file.extension}`);
        document.body.append(a);
        // if you are so inclined to make it auto-download, do something like: a.click();
        a.remove(); // 删除链接元素
    }
    else if (file.data.length > file.size) { // 如果接收到的文件比预期的还大（这是一个错误）
        file.receiving = false;
        console.error(`Received bigger file than advertised: ${file.data.length}/${file.size}`);
    }
}

function processFreezeFrameMessage(view) {
    // 如果收到冻结帧消息并且还未开始“接收”，则重置冻结帧信息
    if (!freezeFrame.receiving) {
        freezeFrame.receiving = true; // 设置正在接收状态为真
        freezeFrame.valid = false; // 设置冻结帧有效性为假
        freezeFrame.size = 0; // 冻结帧大小重置为0
        freezeFrame.jpeg = undefined; // 清除冻结帧的 JPEG 数据
    }

    // 提取冻结帧的总大小（跨所有块）
    freezeFrame.size = (new DataView(view.slice(1, 5).buffer)).getInt32(0, true);

    // 获取负载中的 JPEG 部分
    let jpegBytes = view.slice(1 + 4); // 从第六个字节开始提取 JPEG 数据

    // 如果已有 JPEG 数据，则向其中追加新的 JPEG 块
    if (freezeFrame.jpeg) {
        let jpeg = new Uint8Array(freezeFrame.jpeg.length + jpegBytes.length); // 创建新的 Uint8Array 以合并旧的和新的 JPEG 数据
        jpeg.set(freezeFrame.jpeg, 0); // 设置原有 JPEG 数据
        jpeg.set(jpegBytes, freezeFrame.jpeg.length); // 在原有数据后追加新的 JPEG 块
        freezeFrame.jpeg = jpeg; // 更新冻结帧的 JPEG 数据
    }
    // 如果没有现有的冻结帧 JPEG，创建一个
    else {
        freezeFrame.jpeg = jpegBytes; // 设置冻结帧的 JPEG 数据
        freezeFrame.receiving = true; // 确认正在接收数据
        console.log(`received first chunk of freeze frame: ${freezeFrame.jpeg.length}/${freezeFrame.size}`);
    }

    // 调试信息，已注释
    //console.log(`Received freeze frame chunk: ${freezeFrame.jpeg.length}/${freezeFrame.size}`);

    // 如果冻结帧接收完毕，可以显示
    if (freezeFrame.jpeg.length === freezeFrame.size) {
        freezeFrame.receiving = false; // 设置接收状态为假
        freezeFrame.valid = true; // 设置冻结帧为有效
        console.log(`received complete freeze frame ${freezeFrame.size}`);
        showFreezeFrame(); // 调用显示冻结帧的函数
    }
    // 如果接收到的数据超过了消息指示的冻结帧负载大小（这是一个错误）
    else if (freezeFrame.jpeg.length > freezeFrame.size) {
        console.error(`received bigger freeze frame than advertised: ${freezeFrame.jpeg.length}/${freezeFrame.size}`);
        freezeFrame.jpeg = undefined; // 清除冻结帧的 JPEG 数据
        freezeFrame.receiving = false; // 设置接收状态为假
    }
}

// 创建webrtc播放器
function setupWebRtcPlayer(htmlElement, config) {
    webRtcPlayerObj = new webRtcPlayer(config);
    autoPlayAudio = typeof config.autoPlayAudio !== 'undefined' ? config.autoPlayAudio : true;
    htmlElement.appendChild(webRtcPlayerObj.video);
    htmlElement.appendChild(webRtcPlayerObj.audio);
    htmlElement.appendChild(freezeFrameOverlay);

    webRtcPlayerObj.onWebRtcOffer = function(offer) {
        if (ws && ws.readyState === WS_OPEN_STATE) {
            let offerStr = JSON.stringify(offer);
            console.log("%c[Outbound SS message (offer)]", "background: lightgreen; color: black", offer);
            ws.send(offerStr);
        }
    };

    webRtcPlayerObj.onWebRtcCandidate = function(candidate) {
        if (ws && ws.readyState === WS_OPEN_STATE) {
            ws.send(JSON.stringify({
                type: 'iceCandidate',
                candidate: candidate
            }));
        }
    };

    webRtcPlayerObj.onWebRtcAnswer = function (answer) {
        if (ws && ws.readyState === WS_OPEN_STATE) {
            let answerStr = JSON.stringify(answer);
            console.log("%c[Outbound SS message (answer)]", "background: lightgreen; color: black", answer);
            ws.send(answerStr);

            if (webRtcPlayerObj.sfu) {
                // Send data channel setup request to the SFU
                const requestMsg = { type: "dataChannelRequest" };
                console.log("%c[Outbound SS message (dataChannelRequest)]", "background: lightgreen; color: black", requestMsg);
                ws.send(JSON.stringify(requestMsg));
            }
        }
    };

    webRtcPlayerObj.onSFURecvDataChannelReady = function() {
        if (webRtcPlayerObj.sfu) {
            // Send SFU a message to let it know browser data channels are ready
            const requestMsg = { type: "peerDataChannelsReady" };
            console.log("%c[Outbound SS message (peerDataChannelsReady)]", "background: lightgreen; color: black", requestMsg);
            ws.send(JSON.stringify(requestMsg));
        }
    }

    webRtcPlayerObj.onVideoInitialised = function() {
        if (ws && ws.readyState === WS_OPEN_STATE) {
            if (shouldShowPlayOverlay) {
                showPlayOverlay();
                resizePlayerStyle();
            }
            else {
                resizePlayerStyle();
                playStream();
            }
        }
    };

    webRtcPlayerObj.onNewVideoTrack = function (streams) {
        if (webRtcPlayerObj.video && webRtcPlayerObj.video.srcObject && webRtcPlayerObj.onVideoInitialised) {
            webRtcPlayerObj.onVideoInitialised();
        }
        updateStreamList();
    }

    webRtcPlayerObj.onDataChannelMessage = function(data) {
        let view = new Uint8Array(data);
        try {
            let messageType = fromStreamerMessages.getFromValue(view[0]);
            fromStreamerHandlers[messageType](data);
        } catch (e) {
            console.error(`Custom data channel message with message type that is unknown to the Pixel Streaming protocol. Does your PixelStreamingProtocol need updating? The message type was: ${view[0]}`);
        }
    };

    registerInputs(webRtcPlayerObj.video);

    // On a touch device we will need special ways to show the on-screen keyboard.
    if ('ontouchstart' in document.documentElement) {
        createOnScreenKeyboardHelpers(htmlElement);
    }

    if (UrlParamsCheck('offerToReceive')) {
        createWebRtcOffer();
    }

    return webRtcPlayerObj.video;
}

function setupStats(){
    webRtcPlayerObj.aggregateStats(1 * 1000 /*Check every 1 second*/ );

    let printInterval = 5 * 60 * 1000; /*Print every 5 minutes*/
    let nextPrintDuration = printInterval;

    webRtcPlayerObj.onAggregatedStats = (aggregatedStats) => {
        let numberFormat = new Intl.NumberFormat(window.navigator.language, {
            maximumFractionDigits: 0
        });
        let timeFormat = new Intl.NumberFormat(window.navigator.language, {
            maximumFractionDigits: 0,
            minimumIntegerDigits: 2
        });

        // Calculate duration of run
        let runTime = (aggregatedStats.timestamp - aggregatedStats.timestampStart) / 1000;
        let timeValues = [];
        let timeDurations = [60, 60];
        for (let timeIndex = 0; timeIndex < timeDurations.length; timeIndex++) {
            timeValues.push(runTime % timeDurations[timeIndex]);
            runTime = runTime / timeDurations[timeIndex];
        }
        timeValues.push(runTime);

        let runTimeSeconds = timeValues[0];
        let runTimeMinutes = Math.floor(timeValues[1]);
        let runTimeHours = Math.floor([timeValues[2]]);

        receivedBytesMeasurement = 'B';
        receivedBytes = aggregatedStats.hasOwnProperty('bytesReceived') ? aggregatedStats.bytesReceived : 0;
        let dataMeasurements = ['kB', 'MB', 'GB'];
        for (let index = 0; index < dataMeasurements.length; index++) {
            if (receivedBytes < 100 * 1000)
                break;
            receivedBytes = receivedBytes / 1000;
            receivedBytesMeasurement = dataMeasurements[index];
        }

        let qualityStatus = document.getElementById("connectionStrength");
        // "blinks" quality status element for 1 sec by making it transparent, speed = number of blinks
        let blinkQualityStatus = function(speed) {
            let iter = speed;
            let opacity = 1; // [0..1]
            let tickId = setInterval(
                function() {
                    opacity -= 0.1;
                    // map `opacity` to [-0.5..0.5] range, decrement by 0.2 per step and take `abs` to make it blink: 1 -> 0 -> 1
                    qualityStatus.style.opacity =  `${Math.abs((opacity - 0.5) * 2)}`;
                    if (opacity <= 0.1) {
                        if (--iter == 0) {
                            clearInterval(tickId);
                        } else { // next blink
                            opacity = 1;
                        }
                    }
                },
                100 / speed // msecs
            );
        };

        const orangeQP = 26;
        const redQP = 35;

        let statsText = '';
        let qualityTip = document.getElementById("qualityText");
        let color;

        // Wifi strength elements
        let outer = document.getElementById("outer");
        let middle = document.getElementById("middle");
        let inner = document.getElementById("inner");
        let dot = document.getElementById("dot");

        if (VideoEncoderQP > redQP) {
            color = "red";
            blinkQualityStatus(2);
            statsText += `<div style="color: ${color}">编码质量差</div>`;
            outer.style.fill = "#3c3b40";
            middle.style.fill = "#3c3b40";
            inner.style.fill = color;
            dot.style.fill = color;

        } else if (VideoEncoderQP > orangeQP) {
            color = "orange";
            blinkQualityStatus(1);
            statsText += `<div style="color: ${color}">编码质量良</div>`;
            outer.style.fill = "#3c3b40";
            middle.style.fill = color;
            inner.style.fill = color;
            dot.style.fill = color;
        } else {
            color = "lime";
            qualityStatus.style.opacity = '1';
            statsText += `<div style="color: ${color}">编码质量不错</div>`;
            outer.style.fill = color;
            middle.style.fill = color;
            inner.style.fill = color;
            dot.style.fill = color;
        }
        qualityTip.innerHTML = statsText;

        statsText += `<div>运行时间: ${timeFormat.format(runTimeHours)}:${timeFormat.format(runTimeMinutes)}:${timeFormat.format(runTimeSeconds)}</div>`;
        statsText += `<div>是否控制流的输入: ${inputController === null ? "Not sent yet" : (inputController ? "true" : "false")}</div>`;
        statsText += `<div>音频编码器: ${aggregatedStats.hasOwnProperty('audioCodec') ? aggregatedStats.audioCodec : "Not set" }</div>`;
        statsText += `<div>视频编码器: ${aggregatedStats.hasOwnProperty('videoCodec') ? aggregatedStats.videoCodec : "Not set" }</div>`;
        statsText += `<div>视频分辨率: ${
            aggregatedStats.hasOwnProperty('frameWidth') && aggregatedStats.frameWidth && aggregatedStats.hasOwnProperty('frameHeight') && aggregatedStats.frameHeight ?
                aggregatedStats.frameWidth + 'x' + aggregatedStats.frameHeight : 'Chrome only'
            }</div>`;
        statsText += `<div>已接收字节流 (${receivedBytesMeasurement}): ${numberFormat.format(receivedBytes)}</div>`;
        statsText += `<div>帧解码: ${aggregatedStats.hasOwnProperty('framesDecoded') ? numberFormat.format(aggregatedStats.framesDecoded) : 'Chrome only'}</div>`;
        statsText += `<div>包丢失: ${aggregatedStats.hasOwnProperty('packetsLost') ? numberFormat.format(aggregatedStats.packetsLost) : 'Chrome only'}</div>`;
        statsText += `<div>帧率: ${aggregatedStats.hasOwnProperty('framerate') ? numberFormat.format(aggregatedStats.framerate) : 'Chrome only'}</div>`;
        statsText += `<div>舍弃帧: ${aggregatedStats.hasOwnProperty('framesDropped') ? numberFormat.format(aggregatedStats.framesDropped) : 'Chrome only'}</div>`;
        statsText += `<div>网络RTT (ms): ${aggregatedStats.hasOwnProperty('currentRoundTripTime') ? numberFormat.format(aggregatedStats.currentRoundTripTime * 1000) : 'Can\'t calculate'}</div>`;
        statsText += `<div>浏览器接收处理 (ms): ${aggregatedStats.hasOwnProperty('receiveToCompositeMs') ? numberFormat.format(aggregatedStats.receiveToCompositeMs) : 'Chrome only'}</div>`;
        statsText += `<div style="color: ${color}">音频码率 (kbps): ${aggregatedStats.hasOwnProperty('audioBitrate') ? numberFormat.format(aggregatedStats.audioBitrate) : 'Chrome only'}</div>`;
        statsText += `<div style="color: ${color}">视频码率 (kbps): ${aggregatedStats.hasOwnProperty('bitrate') ? numberFormat.format(aggregatedStats.bitrate) : 'Chrome only'}</div>`;
        statsText += `<div style="color: ${color}">视频量化参数QP: ${VideoEncoderQP}</div>`;

        let statsDiv = document.getElementById("stats");
        statsDiv.innerHTML = statsText;

        if (print_stats) {
            if (aggregatedStats.timestampStart) {
                if ((aggregatedStats.timestamp - aggregatedStats.timestampStart) > nextPrintDuration) {
                    if (ws && ws.readyState === WS_OPEN_STATE) {
                        console.log(`-> SS: stats\n${JSON.stringify(aggregatedStats)}`);
                        ws.send(JSON.stringify({
                            type: 'stats',
                            data: aggregatedStats
                        }));
                    }
                    nextPrintDuration += printInterval;
                }
            }
        }
    };

    webRtcPlayerObj.latencyTestTimings.OnAllLatencyTimingsReady = function(timings) {

        if (!timings.BrowserReceiptTimeMs) {
            return;
        }

        let latencyExcludingDecode = timings.BrowserReceiptTimeMs - timings.TestStartTimeMs;
        let encodeLatency = timings.UEEncodeMs;
        let uePixelStreamLatency = timings.UECaptureToSendMs;
        let ueTestDuration = timings.UETransmissionTimeMs - timings.UEReceiptTimeMs;
        let networkLatency = latencyExcludingDecode - ueTestDuration;

        //these ones depend on FrameDisplayDeltaTimeMs
        let endToEndLatency = null;
        let browserSideLatency = null;

        if (timings.FrameDisplayDeltaTimeMs && timings.BrowserReceiptTimeMs) {
            endToEndLatency = timings.FrameDisplayDeltaTimeMs + networkLatency + (typeof uePixelStreamLatency === "string" ? 0 : uePixelStreamLatency);
            browserSideLatency = timings.FrameDisplayDeltaTimeMs + (latencyExcludingDecode - networkLatency - ueTestDuration);
        }

        let latencyStatsInnerHTML = '';
        latencyStatsInnerHTML += `<div>网络延迟RTT (ms): ${networkLatency.toFixed(2)}</div>`;
        latencyStatsInnerHTML += `<div>UE编码 (ms): ${(typeof encodeLatency === "string" ? encodeLatency : encodeLatency.toFixed(2))}</div>`;
        latencyStatsInnerHTML += `<div>UE发送到capture (ms): ${(typeof uePixelStreamLatency === "string" ? uePixelStreamLatency : uePixelStreamLatency.toFixed(2))}</div>`;
        latencyStatsInnerHTML += `<div>UE probe 时间 (ms): ${ueTestDuration.toFixed(2)}</div>`;
        latencyStatsInnerHTML += timings.FrameDisplayDeltaTimeMs && timings.BrowserReceiptTimeMs ? `<div>浏览器处理延迟 (ms): ${timings.FrameDisplayDeltaTimeMs.toFixed(2)}</div>` : "";
        latencyStatsInnerHTML += browserSideLatency ? `<div>浏览器总延迟 (ms): ${browserSideLatency.toFixed(2)}</div>` : "";
        latencyStatsInnerHTML += endToEndLatency ? `<div>总延迟  (ms): ${endToEndLatency.toFixed(2)}</div>` : "";
        document.getElementById("LatencyStats").innerHTML = latencyStatsInnerHTML;
    }
}

function onWebRtcOffer(webRTCData) {
    webRtcPlayerObj.receiveOffer(webRTCData);
    setupStats();
}

function onWebRtcAnswer(webRTCData) {
    webRtcPlayerObj.receiveAnswer(webRTCData);
    setupStats();
}

function onWebRtcSFUPeerDatachannels(webRTCData) {
    webRtcPlayerObj.receiveSFUPeerDataChannelRequest(webRTCData);
}

function onWebRtcIce(iceCandidate) {
    if (webRtcPlayerObj){
        webRtcPlayerObj.handleCandidateFromServer(iceCandidate);
    }
}

let styleWidth;
let styleHeight;
let styleTop;
let styleLeft;
let styleCursor = 'default';
let styleAdditional;

// 定义一个对象，用于表示控制方案的类型
const ControlSchemeType = {
    // 当鼠标锁定在WebRTC播放器内时，用户可以通过移动鼠标来控制相机的方向。
    // 用户按下Escape键可以解锁鼠标。
    LockedMouse: 0, // 锁定鼠标模式

    // 鼠标可以悬停在WebRTC播放器上，用户需要点击并拖拽来控制相机的方向。
    HoveringMouse: 1 // 悬停鼠标模式
};
// 定义一个对象，用于存储输入选项
let inputOptions = {
    // 控制方案控制鼠标与WebRTC播放器交互时的行为。
    controlScheme: ControlSchemeType.LockedMouse, // // 控制方案，默认为LockedMouse锁定鼠标模式0

    // 浏览器按键是通常由浏览器界面使用的按键。我们通常希望抑制这些按键，
    // 以允许例如使用F5键显示UE的着色器复杂性，而不是刷新网页。
    suppressBrowserKeys: true, // 抑制浏览器按键，默认为true

    // UE有一个faketouches选项，当用户用鼠标拖动时，它可以模拟单指触摸。
    // 我们可以执行相反的操作；将单指触摸转换为UE端的鼠标拖动。
    // 这允许非触摸应用部分通过触摸设备控制。
    fakeMouseWithTouches: false, // 使用触摸模拟鼠标，默认为false

    // 隐藏浏览器光标可以启用UE内置的软件光标，而不显示浏览器上的光标
    hideBrowserCursor: false // 隐藏浏览器光标，默认为false
};
// 将播放器尺寸调整为填满窗口
function resizePlayerStyleToFillWindow(playerElement) {
    let videoElement = playerElement.getElementsByTagName("VIDEO");

    // Fill the player display in window, keeping picture's aspect ratio.
    let windowAspectRatio = window.innerHeight / window.innerWidth;
    let playerAspectRatio = playerElement.clientHeight / playerElement.clientWidth;
    // We want to keep the video ratio correct for the video stream
    let videoAspectRatio = videoElement.videoHeight / videoElement.videoWidth;
    if (isNaN(videoAspectRatio)) {
        //Video is not initialised yet so set playerElement to size of window
        styleWidth = window.innerWidth;
        styleHeight = window.innerHeight;
        styleTop = 0;
        styleLeft = 0;
        playerElement.style = "top: " + styleTop + "px; left: " + styleLeft + "px; width: " + styleWidth + "px; height: " + styleHeight + "px; cursor: " + styleCursor + "; " + styleAdditional;
    } else if (windowAspectRatio < playerAspectRatio) {
        // Window height is the constraining factor so to keep aspect ratio change width appropriately
        styleWidth = Math.floor(window.innerHeight / videoAspectRatio);
        styleHeight = window.innerHeight;
        styleTop = 0;
        styleLeft = Math.floor((window.innerWidth - styleWidth) * 0.5);
        //Video is now 100% of the playerElement, so set the playerElement style
        playerElement.style = "top: " + styleTop + "px; left: " + styleLeft + "px; width: " + styleWidth + "px; height: " + styleHeight + "px; cursor: " + styleCursor + "; " + styleAdditional;
    } else {
        // Window width is the constraining factor so to keep aspect ratio change height appropriately
        styleWidth = window.innerWidth;
        styleHeight = Math.floor(window.innerWidth * videoAspectRatio);
        styleTop = Math.floor((window.innerHeight - styleHeight) * 0.5);
        styleLeft = 0;
        //Video is now 100% of the playerElement, so set the playerElement style
        playerElement.style = "top: " + styleTop + "px; left: " + styleLeft + "px; width: " + styleWidth + "px; height: " + styleHeight + "px; cursor: " + styleCursor + "; " + styleAdditional;
    }
}
// 将播放器尺寸调整为实际大小
function resizePlayerStyleToActualSize(playerElement) {
    let videoElement = playerElement.getElementsByTagName("VIDEO");

    if (videoElement.length > 0) {
        // Display image in its actual size
        styleWidth = videoElement[0].videoWidth;
        styleHeight = videoElement[0].videoHeight;
        let Top = Math.floor((window.innerHeight - styleHeight) * 0.5);
        let Left = Math.floor((window.innerWidth - styleWidth) * 0.5);
        styleTop = (Top > 0) ? Top : 0;
        styleLeft = (Left > 0) ? Left : 0;
        //Video is now 100% of the playerElement, so set the playerElement style
        playerElement.style = "top: " + styleTop + "px; left: " + styleLeft + "px; width: " + styleWidth + "px; height: " + styleHeight + "px; cursor: " + styleCursor + "; " + styleAdditional;
    }
}
// 将播放器尺寸调整为任意大小
function resizePlayerStyleToArbitrarySize(playerElement) {
    let videoElement = playerElement.getElementsByTagName("VIDEO");
    //Video is now 100% of the playerElement, so set the playerElement style
    playerElement.style = "top: 0px; left: 0px; width: " + styleWidth + "px; height: " + styleHeight + "px; cursor: " + styleCursor + "; " + styleAdditional;
}

function setupFreezeFrameOverlay() {
    freezeFrameOverlay = document.createElement('div');
    freezeFrameOverlay.id = 'freezeFrameOverlay';
    freezeFrameOverlay.style.display = 'none';
    freezeFrameOverlay.style.pointerEvents = 'none';
    freezeFrameOverlay.style.position = 'absolute';
    freezeFrameOverlay.style.zIndex = '20';

    let freezeFrameImage = document.createElement('img');
    freezeFrameImage.style.position = 'absolute';
    freezeFrameOverlay.appendChild(freezeFrameImage);
}

function showFreezeFrameOverlay() {
    if (freezeFrame.valid) {
        freezeFrameOverlay.classList.add("freezeframeBackground");
        freezeFrameOverlay.style.display = 'block';
    }
}

function invalidateFreezeFrameOverlay() {
    setTimeout(() => {
        freezeFrameOverlay.style.display = 'none';
        freezeFrame.valid = false;
        freezeFrameOverlay.classList.remove("freezeframeBackground");
    }, freezeFrameDelay);
    
    if (webRtcPlayerObj) {
        webRtcPlayerObj.setVideoEnabled(true);
    }
}

function resizeFreezeFrameOverlay() {
    if (freezeFrame.width !== 0 && freezeFrame.height !== 0) {
        let displayWidth = 0;
        let displayHeight = 0;
        let displayTop = 0;
        let displayLeft = 0;
        let checkBox = document.getElementById('enlarge-display-to-fill-window-tgl');
        let playerElement = document.getElementById('player');
        if (checkBox !== null && checkBox.checked) {
            // We are fitting video to screen, we care about the screen (window) size
            let windowAspectRatio = window.innerWidth / window.innerHeight;
            let videoAspectRatio = freezeFrame.width / freezeFrame.height;
            if (windowAspectRatio < videoAspectRatio) {
                displayWidth = window.innerWidth;
                displayHeight = Math.floor(window.innerWidth / videoAspectRatio);
                displayTop = Math.floor((window.innerHeight - displayHeight) * 0.5);
                displayLeft = 0;
            } else {
                displayWidth = Math.floor(window.innerHeight * videoAspectRatio);
                displayHeight = window.innerHeight;
                displayTop = 0;
                displayLeft = Math.floor((window.innerWidth - displayWidth) * 0.5);
            }
        } else {
            // Video is coming in at native resolution, we care more about the player size
            let playerAspectRatio = playerElement.offsetWidth / playerElement.offsetHeight;
            let videoAspectRatio = freezeFrame.width / freezeFrame.height;
            if (playerAspectRatio < videoAspectRatio) {
                displayWidth = playerElement.offsetWidth;
                displayHeight = Math.floor(playerElement.offsetWidth / videoAspectRatio);
                displayTop = Math.floor((playerElement.offsetHeight - displayHeight) * 0.5);
                displayLeft = 0;
            } else {
                displayWidth = Math.floor(playerElement.offsetHeight * videoAspectRatio);
                displayHeight = playerElement.offsetHeight;
                displayTop = 0;
                displayLeft = Math.floor((playerElement.offsetWidth - displayWidth) * 0.5);
            }
        }
        let freezeFrameImage = document.getElementById("freezeFrameOverlay").childNodes[0];
        freezeFrameOverlay.style.width = playerElement.offsetWidth + 'px';
        freezeFrameOverlay.style.height = playerElement.offsetHeight + 'px';
        freezeFrameOverlay.style.left = 0 + 'px';
        freezeFrameOverlay.style.top = 0 + 'px';

        freezeFrameImage.style.width = displayWidth + 'px';
        freezeFrameImage.style.height = displayHeight + 'px';
        freezeFrameImage.style.left = displayLeft + 'px';
        freezeFrameImage.style.top = displayTop + 'px';
    }
}

// 根据不同条件调整播放器的尺寸和样式
function resizePlayerStyle(event) {
    let playerElement = document.getElementById('player'); // 通过id获取播放器的DOM元素

    if (!playerElement) // 如果没有找到播放器元素，则返回，不执行后续代码
        return;

    // 将播放器的尺寸调整为填满窗口
    // updateVideoStreamSize(playerElement.clientWidth, playerElement.clientHeight); // 调用updateVideoStreamSize函数，更新视频流的大小, webrtc发送视频流的大小给UE

    // 检查播放器元素是否包含'fixed-size'这个类，如果是，则设置鼠标和冻结帧，然后返回
    if (playerElement.classList.contains('fixed-size')) {
        setupMouseAndFreezeFrame(playerElement) // 给这个标签设置鼠标和冻结帧
        return;
    }

    // 获取控制是否扩大显示以填充窗口的复选框元素
    let checkBox = document.getElementById('enlarge-display-to-fill-window-tgl');
    // 判断窗口尺寸是否小于播放器视频尺寸
    let windowSmallerThanPlayer = window.innerWidth < playerElement.videoWidth || window.innerHeight < playerElement.videoHeight;
    // 检查复选框是否不为null（存在）
    if (checkBox !== null) {
         // 如果复选框被选中，或窗口比播放器小，则将播放器尺寸调整为填满窗口
        if (checkBox.checked || windowSmallerThanPlayer) {
            resizePlayerStyleToFillWindow(playerElement);
        } else { // 否则，将播放器尺寸调整为实际大小
            resizePlayerStyleToActualSize(playerElement);
            // resizePlayerStyleToFillWindow(playerElement); // 默认填满窗口
        }
    } else { // 如果没有复选框，则将播放器尺寸调整为任意大小
        resizePlayerStyleToArbitrarySize(playerElement);
    }
    // 设置鼠标和冻结帧
    setupMouseAndFreezeFrame(playerElement)
}

// 设置鼠标事件处理和冻结帧的相关配置
function setupMouseAndFreezeFrame(playerElement) {
    // 计算并标准化位置，这依赖于播放器的宽度和高度
    playerElementClientRect = playerElement.getBoundingClientRect();
    setupNormalizeAndQuantize(); // 调用 setupNormalizeAndQuantize 函数，用于设置位置的标准化和量化
    resizeFreezeFrameOverlay(); // 调用 resizeFreezeFrameOverlay 函数，用于调整冻结帧覆盖层的大小
}

// 更新视频流的大小。它会根据特定的条件来决定是否更新尺寸，并有一个防抖动的机制来避免太频繁的更新
function updateVideoStreamSize( streamWidth=null, streamHeight=null, matchViewportResolution = true) {
    if (!matchViewportResolution) { // 如果不匹配视口分辨率，则直接返回
        return;
    }

    let now = new Date().getTime(); // 获取当前时间戳
    // 如果当前时间和上次调整尺寸的时间差超过1000毫秒，则执行下面的代码
    if (now - lastTimeResized > 1000) {
        let playerElement = document.getElementById('player'); // 获取播放器元素
        if (!playerElement) // 如果播放器元素不存在，则返回
            return;
        // 创建一个描述符对象，包含播放器的宽和高
        let descriptor = {
            "Resolution.Width": streamWidth,
            "Resolution.Height": streamHeight
        };

        // 发出一个带有描述符的命令
        emitCommand(descriptor); 

        console.log(descriptor);  // 在控制台打印描述符
        lastTimeResized = new Date().getTime(); // 更新lastTimeResized为当前时间
    } else { // 如果更新太频繁，则打印日志，并重置定时器
        alert('调整太频繁 - 忽略');
        // clearTimeout(resizeTimeout);
        // resizeTimeout = setTimeout(updateVideoStreamSize(streamWidth,streamHeight), 2000);
    }
}

// Fix for bug in iOS where windowsize is not correct at instance or orientation change
// https://github.com/dimsemenov/PhotoSwipe/issues/1315
let _orientationChangeTimeout;

// 处理设备方向变化时触发的事件
// 设置延时来避免因快速连续的方向变化导致的频繁调用resizePlayerStyle函数
function onOrientationChange(event) {
    // 清除之前设置的_timeout变量所指向的延时函数，避免重复执行
    clearTimeout(_orientationChangeTimeout);
    // 设置一个延时函数，在500毫秒后执行，以便处理连续快速的方向变化
    _orientationChangeTimeout = setTimeout(function() {
        resizePlayerStyle(); // 调用resizePlayerStyle函数，根据新的设备方向调整播放器样式
    }, 500);
}

// 用于向流媒体服务器发送具有特定类型和数据的消息。
// 该函数根据消息类型确定消息格式，然后将数据打包成一个字节流，并通过sendInputData函数发送出去
function sendMessageToStreamer(messageType, indata = []) {
    // 从toStreamerMessages获取对应messageType的消息格式
    messageFormat = toStreamerMessages.getFromKey(messageType);
    if(messageFormat === undefined) { // 如果未定义消息格式，输出错误信息并返回
        console.error(`Attempted to send a message to the streamer with message type: ${messageType}, but the frontend hasn't been configured to send such a message. Check you've added the message type in your cpp`);
        return;
    }
    // console.log(`Calculate size: ${new Blob(JSON.stringify(indata)).size}, Specified size: ${messageFormat.byteLength}`);
    // 创建一个新的DataView对象来存储即将发送的数据
    data = new DataView(new ArrayBuffer(messageFormat.byteLength + 1));

    // 设置消息格式的ID
    data.setUint8(0, messageFormat.id);
    byteOffset = 1;

    // 遍历传入的数据，根据格式将数据写入DataView
    indata.forEach((element, idx) => {
        type = messageFormat.structure[idx];
        switch (type) {
            case "uint8":
                data.setUint8(byteOffset, element);
                byteOffset += 1;
                break;

            case "uint16":
                data.setUint16(byteOffset, element, true);
                byteOffset += 2;
                break;

            case "int16":
                data.setInt16(byteOffset, element, true);
                byteOffset += 2;
                break;

            case "double":
                data.setFloat64(byteOffset, element, true);
                byteOffset += 8;
                break;
        }
    });
    // 调用sendInputData将数据发送出去
    sendInputData(data.buffer);
}

// 定义一个名为emitDescriptor的函数，接收消息类型和描述符作为参数
function emitDescriptor(messageType, descriptor) {
    // 将描述符对象转换为JSON字符串
    let descriptorAsString = JSON.stringify(descriptor);
    // 从toStreamerMessages中根据消息类型获取消息格式
    let messageFormat = toStreamerMessages.getFromKey(messageType);
    if(messageFormat === undefined) { // 如果消息格式未定义，输出错误日志
        console.error(`Attempted to emit descriptor with message type: ${messageType}, but the frontend hasn't been configured to send such a message. Check you've added the message type in your cpp`);
    }
    // 初始化一个字节缓冲区来存放JSON字符串，按两个字节一组进行存储
    let data = new DataView(new ArrayBuffer(1 + 2 + 2 * descriptorAsString.length));
    let byteIdx = 0; // 在数据的第0个位置设置消息格式的ID
    data.setUint8(byteIdx, messageFormat.id);
    byteIdx++;
    // 在数据的第1和2个位置设置JSON字符串的长度
    data.setUint16(byteIdx, descriptorAsString.length, true);
    byteIdx += 2;
    // 循环遍历JSON字符串的每个字符，将其转换为字节并存储
    for (let i = 0; i < descriptorAsString.length; i++) {
        data.setUint16(byteIdx, descriptorAsString.charCodeAt(i), true);
        byteIdx += 2;
    }
    // 发送填充好的字节缓冲区
    sendInputData(data.buffer);
}

// A built-in command can be sent to UE client. The commands are defined by a
// JSON descriptor and will be executed automatically.
// The currently supported commands are:
//
// 1. A command to run any console command:
//    "{ ConsoleCommand: <string> }"
//
// 2. A command to change the resolution to the given width and height.
//    "{ Resolution.Width: <value>, Resolution.Height: <value> } }"
//
function emitCommand(descriptor) {
    emitDescriptor("Command", descriptor);
}

// A UI interation will occur when the user presses a button powered by
// JavaScript as opposed to pressing a button which is part of the pixel
// streamed UI from the UE client.
function emitUIInteraction(descriptor) {
    emitDescriptor("UIInteraction", descriptor);
}

function requestInitialSettings() {
    sendMessageToStreamer("RequestInitialSettings");
}

// 用于请求视频流的质量控制。如果当前没有质量控制器（qualityController），则向流媒体服务器发送一个请求以获得质量控制权限
// 函数通常用于交互式视频流场景，其中客户端可以请求对视频质量的控制权，以便根据需求调整视频质量，例如改变分辨率或码率，
// 以适应不同的网络条件或用户偏好
function requestQualityControl() {
    if (!qualityController) { // 检查是否已存在质量控制器
        sendMessageToStreamer("RequestQualityControl"); // 如果不存在质量控制器，向流媒体服务器发送“RequestQualityControl”消息
    }
}

let playerElementClientRect = undefined;
let normalizeAndQuantizeUnsigned = undefined;
let normalizeAndQuantizeSigned = undefined;
let unquantizeAndDenormalizeUnsigned = undefined;

function setupNormalizeAndQuantize() {
    let playerElement = document.getElementById('player');
    let videoElement = playerElement.getElementsByTagName("video");

    if (playerElement && videoElement.length > 0) {
        let playerAspectRatio = playerElement.clientHeight / playerElement.clientWidth;
        let videoAspectRatio = videoElement[0].videoHeight / videoElement[0].videoWidth;

        // Unsigned XY positions are the ratio (0.0..1.0) along a viewport axis,
        // quantized into an uint16 (0..65536).
        // Signed XY deltas are the ratio (-1.0..1.0) along a viewport axis,
        // quantized into an int16 (-32767..32767).
        // This allows the browser viewport and client viewport to have a different
        // size.
        // Hack: Currently we set an out-of-range position to an extreme (65535)
        // as we can't yet accurately detect mouse enter and leave events
        // precisely inside a video with an aspect ratio which causes mattes.
        if (playerAspectRatio > videoAspectRatio) {
            if (print_inputs) {
                console.log('Setup Normalize and Quantize for playerAspectRatio > videoAspectRatio');
            }
            let ratio = playerAspectRatio / videoAspectRatio;
            // Unsigned.
            normalizeAndQuantizeUnsigned = (x, y) => {
                let normalizedX = x / playerElement.clientWidth;
                let normalizedY = ratio * (y / playerElement.clientHeight - 0.5) + 0.5;
                if (normalizedX < 0.0 || normalizedX > 1.0 || normalizedY < 0.0 || normalizedY > 1.0) {
                    return {
                        inRange: false,
                        x: 65535,
                        y: 65535
                    };
                } else {
                    return {
                        inRange: true,
                        x: normalizedX * 65536,
                        y: normalizedY * 65536
                    };
                }
            };
            unquantizeAndDenormalizeUnsigned = (x, y) => {
                let normalizedX = x / 65536;
                let normalizedY = (y / 65536 - 0.5) / ratio + 0.5;
                return {
                    x: normalizedX * playerElement.clientWidth,
                    y: normalizedY * playerElement.clientHeight
                };
            };
            // Signed.
            normalizeAndQuantizeSigned = (x, y) => {
                let normalizedX = x / (0.5 * playerElement.clientWidth);
                let normalizedY = (ratio * y) / (0.5 * playerElement.clientHeight);
                return {
                    x: normalizedX * 32767,
                    y: normalizedY * 32767
                };
            };
        } else {
            if (print_inputs) {
                console.log('Setup Normalize and Quantize for playerAspectRatio <= videoAspectRatio');
            }
            let ratio = videoAspectRatio / playerAspectRatio;
            // Unsigned.
            normalizeAndQuantizeUnsigned = (x, y) => {
                let normalizedX = ratio * (x / playerElement.clientWidth - 0.5) + 0.5;
                let normalizedY = y / playerElement.clientHeight;
                if (normalizedX < 0.0 || normalizedX > 1.0 || normalizedY < 0.0 || normalizedY > 1.0) {
                    return {
                        inRange: false,
                        x: 65535,
                        y: 65535
                    };
                } else {
                    return {
                        inRange: true,
                        x: normalizedX * 65536,
                        y: normalizedY * 65536
                    };
                }
            };
            unquantizeAndDenormalizeUnsigned = (x, y) => {
                let normalizedX = (x / 65536 - 0.5) / ratio + 0.5;
                let normalizedY = y / 65536;
                return {
                    x: normalizedX * playerElement.clientWidth,
                    y: normalizedY * playerElement.clientHeight
                };
            };
            // Signed.
            normalizeAndQuantizeSigned = (x, y) => {
                let normalizedX = (ratio * x) / (0.5 * playerElement.clientWidth);
                let normalizedY = y / (0.5 * playerElement.clientHeight);
                return {
                    x: normalizedX * 32767,
                    y: normalizedY * 32767
                };
            };
        }
    }
}

// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
const MouseButton = {
    MainButton: 0, // Left button.
    AuxiliaryButton: 1, // Wheel button.
    SecondaryButton: 2, // Right button.
    FourthButton: 3, // Browser Back button.
    FifthButton: 4 // Browser Forward button.
};

// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
const MouseButtonsMask = {
    PrimaryButton: 1, // Left button.
    SecondaryButton: 2, // Right button.
    AuxiliaryButton: 4, // Wheel button.
    FourthButton: 8, // Browser Back button.
    FifthButton: 16 // Browser Forward button.
};

// If the user has any mouse buttons pressed then release them.
function releaseMouseButtons(buttons, x, y) {
    let coord = normalizeAndQuantizeUnsigned(x, y);
    if (buttons & MouseButtonsMask.PrimaryButton) {
        toStreamerHandlers.MouseUp("MouseUp", [MouseButton.MainButton, coord.x, coord.y]);
    }
    if (buttons & MouseButtonsMask.SecondaryButton) {
        toStreamerHandlers.MouseUp("MouseUp", [MouseButton.SecondaryButton, coord.x, coord.y]);
    }
    if (buttons & MouseButtonsMask.AuxiliaryButton) {
        toStreamerHandlers.MouseUp("MouseUp", [MouseButton.AuxiliaryButton, coord.x, coord.y]);
    }
    if (buttons & MouseButtonsMask.FourthButton) {
        toStreamerHandlers.MouseUp("MouseUp", [MouseButton.FourthButton, coord.x, coord.y]);
    }
    if (buttons & MouseButtonsMask.FifthButton) {
        toStreamerHandlers.MouseUp("MouseUp", [MouseButton.FifthButton, coord.x, coord.y]);
    }
}

// If the user has any Mouse buttons pressed then press them again.
function pressMouseButtons(buttons, x, y) {
    let coord = normalizeAndQuantizeUnsigned(x, y);
    if (buttons & MouseButtonsMask.PrimaryButton) {
        toStreamerHandlers.MouseDown("MouseDown", [MouseButton.MainButton, coord.x, coord.y]);
    }
    if (buttons & MouseButtonsMask.SecondaryButton) {
        toStreamerHandlers.MouseDown("MouseDown", [MouseButton.SecondaryButton, coord.x, coord.y]);
    }
    if (buttons & MouseButtonsMask.AuxiliaryButton) {
        toStreamerHandlers.MouseDown("MouseDown", [MouseButton.AuxiliaryButton, coord.x, coord.y]);
    }
    if (buttons & MouseButtonsMask.FourthButton) {
        toStreamerHandlers.MouseDown("MouseDown", [MouseButton.FourthButton, coord.x, coord.y]);
    }
    if (buttons & MouseButtonsMask.FifthButton) {
        toStreamerHandlers.MouseDown("MouseDown", [MouseButton.FifthButton, coord.x, coord.y]);
    }
}

function registerInputs(playerElement) {
    if (!playerElement)
        return;

    registerMouseEnterAndLeaveEvents(playerElement);
    registerTouchEvents(playerElement);
}

function createOnScreenKeyboardHelpers(htmlElement) {
    if (document.getElementById('hiddenInput') === null) {
        hiddenInput = document.createElement('input');
        hiddenInput.id = 'hiddenInput';
        hiddenInput.maxLength = 0;
        htmlElement.appendChild(hiddenInput);
    }

    if (document.getElementById('editTextButton') === null) {
        editTextButton = document.createElement('button');
        editTextButton.id = 'editTextButton';
        editTextButton.innerHTML = 'edit text';
        htmlElement.appendChild(editTextButton);

        // Hide the 'edit text' button.
        editTextButton.classList.add('hiddenState');

        editTextButton.addEventListener('click', function() {
            // Show the on-screen keyboard.
            hiddenInput.focus();
        });
    }
}

// 检查传入的 command 参数是否要求显示屏幕键盘
function showOnScreenKeyboard(command) {
    if (command.showOnScreenKeyboard) { // 如果要求显示屏幕键盘
        // 显示 '编辑文本' 按钮。
        editTextButton.classList.remove('hiddenState');
        // 计算并定位 '编辑文本' 按钮，靠近 UE 输入小部件。
        let pos = unquantizeAndDenormalizeUnsigned(command.x, command.y);
        editTextButton.style.top = pos.y.toString() + 'px'; // 设置按钮的顶部位置
        editTextButton.style.left = (pos.x - 40).toString() + 'px'; // 设置按钮的左侧位置，减去40像素以便对齐
    } else {
        // 如果不显示屏幕键盘，则隐藏 '编辑文本' 按钮。
        editTextButton.classList.add('hiddenState');
        // 让屏幕键盘失去焦点，从而隐藏它。
        hiddenInput.blur();
    }
}

function registerMouseEnterAndLeaveEvents(playerElement) {
    playerElement.onmouseenter = function(e) {
        if (print_inputs) {
            console.log('mouse enter');
        }
        toStreamerHandlers.MouseEnter("MouseEnter");
        playerElement.pressMouseButtons(e);
    };

    playerElement.onmouseleave = function(e) {
        if (print_inputs) {
            console.log('mouse leave');
        }
        toStreamerHandlers.MouseLeave("MouseLeave");
        playerElement.releaseMouseButtons(e);
    };
}

// A locked mouse works by the user clicking in the browser player and the
// cursor disappears and is locked. The user moves the cursor and the camera
// moves, for example. The user presses escape to free the mouse.
// 锁定鼠标通过用户在浏览器播放器中点击，鼠标光标消失并被锁定。用户移动鼠标，相机移动，例如。用户按下Escape键释放鼠标
function registerLockedMouseEvents(playerElement) {
    styleCursor = (inputOptions.hideBrowserCursor ? 'none' : 'default');
    let x = playerElement.width / 2;
    let y = playerElement.height / 2;
    let coord = normalizeAndQuantizeUnsigned(x, y);

    playerElement.requestPointerLock = playerElement.requestPointerLock || playerElement.mozRequestPointerLock;
    document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;

    playerElement.onclick = function() {
        playerElement.requestPointerLock();
    };

    // Respond to lock state change events
    document.addEventListener('pointerlockchange', lockStateChange, false);
    document.addEventListener('mozpointerlockchange', lockStateChange, false);

    function lockStateChange() {
        if (document.pointerLockElement === playerElement ||
            document.mozPointerLockElement === playerElement) {
            console.log('Pointer locked');
            document.addEventListener("mousemove", updatePosition, false);
        } else {
            console.log('The pointer lock status is now unlocked');
            document.removeEventListener("mousemove", updatePosition, false);

            // If mouse loses focus, send a key up for all of the currently held-down keys
            // This is necessary as when the mouse loses focus, the windows stops listening for events and as such
            // the keyup listener won't get fired
            [...new Set(activeKeys)].forEach((uniqueKeycode) => {
                toStreamerHandlers.KeyUp("KeyUp", [uniqueKeycode]);
            });
            // Reset the active keys back to nothing
            activeKeys = [];
        }
    }

    function updatePosition(e) {
        x += e.movementX;
        y += e.movementY;
        if (x > styleWidth) {
            x -= styleWidth;
        }
        if (y > styleHeight) {
            y -= styleHeight;
        }
        if (x < 0) {
            x = styleWidth + x;
        }
        if (y < 0) {
            y = styleHeight - y;
        }

        let coord = normalizeAndQuantizeUnsigned(x, y);
        let delta = normalizeAndQuantizeSigned(e.movementX, e.movementY);
        toStreamerHandlers.MouseMove("MouseMove", [coord.x, coord.y, delta.x, delta.y]);
    }


    playerElement.onmousedown = function (e) {
        toStreamerHandlers.MouseDown("MouseDown", [e.button, coord.x, coord.y]);
    };

    playerElement.onmouseup = function (e) {
        toStreamerHandlers.MouseUp("MouseUp", [e.button, coord.x, coord.y]);
    };

    playerElement.onwheel = function (e) {
        toStreamerHandlers.MouseWheel("MouseWheel", [e.wheelDelta, coord.x, coord.y]);
    };

    playerElement.ondblclick = function (e) {
        toStreamerHandlers.MouseDown("MouseDouble", [e.button, coord.x, coord.y]);
    };

    playerElement.pressMouseButtons = function(e) {
        pressMouseButtons(e.buttons, x, y);
    };

    playerElement.releaseMouseButtons = function(e) {
        releaseMouseButtons(e.buttons, x, y);
    };
}

// A hovering mouse works by the user clicking the mouse button when they want
// the cursor to have an effect over the video. Otherwise the cursor just
// passes over the browser.
// 悬停鼠标通过用户在希望光标对视频产生影响时点击鼠标按钮来工作。否则，光标只是在浏览器上移动。
function registerHoveringMouseEvents(playerElement) {
    styleCursor = (inputOptions.hideBrowserCursor ? 'none' : 'default');

    playerElement.onmousemove = function (e) {
        let coord = normalizeAndQuantizeUnsigned(e.offsetX, e.offsetY);
        let delta = normalizeAndQuantizeSigned(e.movementX, e.movementY);
        toStreamerHandlers.MouseMove("MouseMove", [coord.x, coord.y, delta.x, delta.y]);
        e.preventDefault();
    };

    playerElement.onmousedown = function (e) {
        let coord = normalizeAndQuantizeUnsigned(e.offsetX, e.offsetY);
        toStreamerHandlers.MouseDown("MouseDown", [e.button, coord.x, coord.y]);
        e.preventDefault();
    };

    playerElement.onmouseup = function (e) {
        let coord = normalizeAndQuantizeUnsigned(e.offsetX, e.offsetY);
        toStreamerHandlers.MouseUp("MouseUp", [e.button, coord.x, coord.y]);
        e.preventDefault();
    };

    // When the context menu is shown then it is safest to release the button
    // which was pressed when the event happened. This will guarantee we will
    // get at least one mouse up corresponding to a mouse down event. Otherwise
    // the mouse can get stuck.
    // https://github.com/facebook/react/issues/5531
    playerElement.oncontextmenu = function (e) {
        let coord = normalizeAndQuantizeUnsigned(e.offsetX, e.offsetY);
        toStreamerHandlers.MouseUp("MouseUp", [e.button, coord.x, coord.y]);
        e.preventDefault();
    };

    playerElement.onwheel = function (e) {
        let coord = normalizeAndQuantizeUnsigned(e.offsetX, e.offsetY);
        toStreamerHandlers.MouseWheel("MouseWheel", [e.wheelDelta, coord.x, coord.y]);
        e.preventDefault();
    };

    playerElement.ondblclick = function (e) {
        let coord = normalizeAndQuantizeUnsigned(e.offsetX, e.offsetY);
        toStreamerHandlers.MouseDown("MouseDouble", [e.button, coord.x, coord.y]);
    };

    playerElement.pressMouseButtons = function(e) {
        pressMouseButtons(e.buttons, e.offsetX, e.offsetY);
    };

    playerElement.releaseMouseButtons = function(e) {
        releaseMouseButtons(e.buttons, e.offsetX, e.offsetY);
    };
}

function registerTouchEvents(playerElement) {
    // We need to assign a unique identifier to each finger.
    // We do this by mapping each Touch object to the identifier.
    let fingers = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    let fingerIds = {};

    function rememberTouch(touch) {
        let finger = fingers.pop();
        if (finger === undefined) {
            console.log('exhausted touch indentifiers');
        }
        fingerIds[touch.identifier] = finger;
    }

    function forgetTouch(touch) {
        fingers.push(fingerIds[touch.identifier]);
        // Sort array back into descending order. This means if finger '1' were to lift after finger '0', we would ensure that 0 will be the first index to pop
        fingers.sort(function(a, b){return b - a});
        delete fingerIds[touch.identifier];
    }

    function emitTouchData(type, touches) {
        for (let t = 0; t < touches.length; t++) {
            let numTouches = 1; // the number of touches to be sent this message
            let touch = touches[t];
            let x = touch.clientX - playerElement.offsetLeft;
            let y = touch.clientY - playerElement.offsetTop;
            if (print_inputs) {
                console.log(`F${fingerIds[touch.identifier]}=(${x}, ${y})`);
            }
            let coord = normalizeAndQuantizeUnsigned(x, y);
            
            switch(type) {
                case "TouchStart":
                    toStreamerHandlers.TouchStart("TouchStart", [numTouches, coord.x, coord.y, fingerIds[touch.identifier], MaxByteValue * touch.force, coord.inRange ? 1 : 0]);
                    break;
                case "TouchEnd":
                    toStreamerHandlers.TouchStart("TouchEnd", [numTouches, coord.x, coord.y, fingerIds[touch.identifier], MaxByteValue * touch.force, coord.inRange ? 1 : 0]);
                    break;
                case "TouchMove":
                    toStreamerHandlers.TouchStart("TouchMove", [numTouches, coord.x, coord.y, fingerIds[touch.identifier], MaxByteValue * touch.force, coord.inRange ? 1 : 0]);
                    break;
            }
        }
    }

    if (inputOptions.fakeMouseWithTouches) {

        let finger = undefined;

        playerElement.ontouchstart = function(e) {
            if (finger === undefined) {
                let firstTouch = e.changedTouches[0];
                finger = {
                    id: firstTouch.identifier,
                    x: firstTouch.clientX - playerElementClientRect.left,
                    y: firstTouch.clientY - playerElementClientRect.top
                };
                // Hack: Mouse events require an enter and leave so we just
                // enter and leave manually with each touch as this event
                // is not fired with a touch device.
                playerElement.onmouseenter(e);
                let coord = normalizeAndQuantizeUnsigned(finger.x, finger.y);
                toStreamerHandlers.MouseDown("MouseDown", [MouseButton.MainButton, coord.x, coord.y]);
            }
            e.preventDefault();
        };

        playerElement.ontouchend = function(e) {
            for (let t = 0; t < e.changedTouches.length; t++) {
                let touch = e.changedTouches[t];
                if (touch.identifier === finger.id) {
                    let x = touch.clientX - playerElementClientRect.left;
                    let y = touch.clientY - playerElementClientRect.top;
                    let coord = normalizeAndQuantizeUnsigned(x, y);
                    toStreamerHandlers.MouseUp("MouseUp", [MouseButton.MainButton, coord.x, coord.y]);
                    // Hack: Manual mouse leave event.
                    playerElement.onmouseleave(e);
                    finger = undefined;
                    break;
                }
            }
            e.preventDefault();
        };

        playerElement.ontouchmove = function(e) {
            for (let t = 0; t < e.touches.length; t++) {
                let touch = e.touches[t];
                if (touch.identifier === finger.id) {
                    let x = touch.clientX - playerElementClientRect.left;
                    let y = touch.clientY - playerElementClientRect.top;
                    let coord = normalizeAndQuantizeUnsigned(x, y);
                    let delta = normalizeAndQuantizeSigned(x - finger.x, y - finger.y);
                    toStreamerHandlers.MouseMove("MouseMove", [coord.x, coord.y, delta.x, delta.y]);
                    finger.x = x;
                    finger.y = y;
                    break;
                }
            }
            e.preventDefault();
        };
    } else {
        playerElement.ontouchstart = function(e) {
            // Assign a unique identifier to each touch.
            for (let t = 0; t < e.changedTouches.length; t++) {
                rememberTouch(e.changedTouches[t]);
            }

            if (print_inputs) {
                console.log('touch start');
            }
            emitTouchData("TouchStart", e.changedTouches);
            e.preventDefault();
        };

        playerElement.ontouchend = function(e) {
            if (print_inputs) {
                console.log('touch end');
            }
            emitTouchData("TouchEnd", e.changedTouches);

            // Re-cycle unique identifiers previously assigned to each touch.
            for (let t = 0; t < e.changedTouches.length; t++) {
                forgetTouch(e.changedTouches[t]);
            }
            e.preventDefault();
        };

        playerElement.ontouchmove = function(e) {
            if (print_inputs) {
                console.log('touch move');
            }
            emitTouchData("TouchMove", e.touches);
            e.preventDefault();
        };
    }
}

// Browser keys do not have a charCode so we only need to test keyCode.
function isKeyCodeBrowserKey(keyCode) {
    // Function keys or tab key.
    return keyCode >= 112 && keyCode <= 123 || keyCode === 9;
}

// Must be kept in sync with JavaScriptKeyCodeToFKey C++ array. The index of the
// entry in the array is the special key code given below.
const SpecialKeyCodes = {
    BackSpace: 8,
    Shift: 16,
    Control: 17,
    Alt: 18,
    RightShift: 253,
    RightControl: 254,
    RightAlt: 255
};

// We want to be able to differentiate between left and right versions of some
// keys.
function getKeyCode(e) {
    if (e.keyCode === SpecialKeyCodes.Shift && e.code === 'ShiftRight') return SpecialKeyCodes.RightShift;
    else if (e.keyCode === SpecialKeyCodes.Control && e.code === 'ControlRight') return SpecialKeyCodes.RightControl;
    else if (e.keyCode === SpecialKeyCodes.Alt && e.code === 'AltRight') return SpecialKeyCodes.RightAlt;
    else return e.keyCode;
}

// 定义一个函数，用于注册键盘事件
function registerKeyboardEvents() {
    // 处理按键按下事件
    document.onkeydown = function(e) {
        if (print_inputs) { // 如果启用了输入打印，打印按键信息
            console.log(`key down ${e.keyCode}, repeat = ${e.repeat}`);
        }
        // 调用向流媒体发送按键按下的处理函数，传入按键码和是否重复
        toStreamerHandlers.KeyDown("KeyDown", [getKeyCode(e), e.repeat]);
        // 将按键代码加入活动按键列表
        activeKeys.push(getKeyCode(e));
        // 处理回退键，因为它在 JavaScript 中不被视为一个keypress事件
        if (e.keyCode === SpecialKeyCodes.BackSpace) {
            document.onkeypress({ // 模拟一个keypress事件以删除文本
                charCode: SpecialKeyCodes.BackSpace
            });
        }
        // 如果需要，阻止浏览器默认的按键功能
        if (inputOptions.suppressBrowserKeys && isKeyCodeBrowserKey(e.keyCode)) {
            e.preventDefault();
        }
    };

    // 处理按键释放事件
    document.onkeyup = function(e) {
        if (print_inputs) {
            // 如果启用了输入打印，打印按键信息
            console.log(`key up ${e.keyCode}`);
        }
        // 调用向流媒体发送按键释放的处理函数
        toStreamerHandlers.KeyUp("KeyUp", [getKeyCode(e), e.repeat]);
        // 如果需要，阻止浏览器默认的按键功能
        if (inputOptions.suppressBrowserKeys && isKeyCodeBrowserKey(e.keyCode)) {
            e.preventDefault();
        }
    };
    // 处理keypress事件
    document.onkeypress = function(e) {
        if (print_inputs) { // 如果启用了输入打印，打印按键信息
            console.log(`key press ${e.charCode}`);
        }
        // 调用向流媒体发送按键的处理函数
        toStreamerHandlers.KeyPress("KeyPress", [e.charCode]);
    };
}

// 处理设置按钮的点击事件。当设置按钮被点击时，此函数将切换设置面板的可见状态
function settingsClicked( /* e */ ) {
    playClickAudio()
    /**
     * 切换设置面板的可见状态。如果统计面板已经打开，先关闭它，然后打开设置面板
     */
    // 获取设置面板元素
    let settings = document.getElementById('settings-panel');
    // 获取统计面板元素
    // let stats = document.getElementById('stats-panel');

    // 如果统计面板当前是可见的
    // if(stats.classList.contains("panel-wrap-visible"))
    // {
    //     stats.classList.toggle("panel-wrap-visible"); // 切换统计面板的可见状态，即隐藏它
    // }

    settings.classList.toggle("panel-wrap-visible"); // 切换设置面板的可见状态，如果是隐藏的则显示，如果是显示的则隐藏
}

// 处理统计按钮的点击事件。当统计按钮被点击时，此函数会切换统计面板的可见性
function statsClicked( /* e */ ) {
    /**
     * 切换统计面板的可见状态。如果设置面板已经打开，先关闭它，然后打开统计面板
     */
    let settings = document.getElementById('settings-panel'); // 获取设置面板的DOM元素
    let stats = document.getElementById('stats-panel'); // 获取统计面板的DOM元素

    if(settings.classList.contains("panel-wrap-visible")) // 如果设置面板当前是可见的
    {
        settings.classList.toggle("panel-wrap-visible"); // 切换设置面板的可见状态，即隐藏它
    }

    stats.classList.toggle("panel-wrap-visible"); // 切换统计面板的可见状态，如果是隐藏的则显示，如果是显示的则隐藏
}


// 初始化或重新连接流媒体传输。函数根据是否是重新连接以及其他条件来更新用户界面和状态，
// 并决定是否直接开始连接或显示连接覆盖层
function start(isReconnection) {
    // 更新"quality status"的显示状态为"disconnected"
    let qualityStatus = document.getElementById("qualityStatus");
    if (qualityStatus) {
        qualityStatus.className = "grey-status";
    }

    // 获取显示统计信息的元素，并更新其内容为"Not connected"
    let statsDiv = document.getElementById("stats");
    if (statsDiv) {
        statsDiv.innerHTML = '未连接';
    }

    // 如果不是页面加载时自动连接或者是重新连接的情况
    if (!connect_on_load || isReconnection) {
        showConnectOverlay(); // 显示连接的覆盖层
        invalidateFreezeFrameOverlay(); // 使冻结帧覆盖层无效
        shouldShowPlayOverlay = true; // 设置应显示播放覆盖层的标志
        resizePlayerStyle(); // 调整播放器样式
    } else { // 如果不符合上述条件，则直接开始连接
        connect();
    }
}

// 用于创建WebSocket连接, 建立与流媒体服务器的WebSocket连接，并设置了该连接的一系列事件处理器，用于处理不同类型的消息和连接状态
function connect() {
    "use strict";

    // 确保浏览器支持WebSocket
    window.WebSocket = window.WebSocket || window.MozWebSocket;

    // 如果浏览器不支持WebSocket，则显示警告
    if (!window.WebSocket) {
        alert('Your browser doesn\'t support WebSocket');
        return;
    }

    // 将当前页面的URL从http或https协议转换为相应的WebSocket协议
    // let connectionUrl = window.location.href.replace('http://', 'ws://').replace('https://', 'wss://');
    // console.log(`Creating a websocket connection to: ${connectionUrl}`);
    // 创建WebSocket连接
    let baseUrl = window.location.href.replace('http://', 'ws://').replace('https://', 'wss://');

    // 在URL中插入端口8889
    // let host = window.location.host; // 获取主机名和可能存在的端口号
    // let hostname = window.location.hostname; // 获取主机名（不包含端口号）
    let host = window.location.host; // 获取主机名和可能存在的端口号
    let hostname = window.location.hostname; // 获取主机名（不包含端口号）

    // 替换原有的host（可能包含旧的端口号）为hostname加上新的端口号
    // let connectionUrl = baseUrl.replace(host, signalServerIP + signalServerPort);
    let connectionUrl = baseUrl.replace(host, `${hostname}:${signalServerPort}`);

    // const wsURL = `ws://${signalServerIP}:${signalServerPort}`;
    // let connectionUrl = "ws://localhost:8889";
    // console.log(`Creating a websocket connection to: ${connectionUrl}`);
    ws = new WebSocket(connectionUrl);

    // 设置标志，指示是否尝试重新连接
    ws.attemptStreamReconnection = true;
    // 为WebSocket的二进制消息设置处理函数
    ws.onmessagebinary = function(event) {
        if(!event || !event.data) { return; }
        // 将二进制数据转换为文本，并将其重新传入onmessage处理
        event.data.text().then(function(messageString){
            // send the new stringified event back into `onmessage`
            ws.onmessage({ data: messageString });
        }).catch(function(error){
            console.error(`Failed to parse binary blob from websocket, reason: ${error}`);
        });
    }
    // 设置WebSocket的消息处理函数
    ws.onmessage = function(event) {

        // 如果消息是二进制的，则使用特定的处理函数
        if(event.data && event.data instanceof Blob) {
            ws.onmessagebinary(event);
            return;
        }
        // 解析消息内容，并根据消息类型调用相应的处理函数
        let msg = JSON.parse(event.data);
        if (msg.type === 'config') {
            console.log("%c[Inbound SS (config)]", "background: lightblue; color: black", msg);
            onConfig(msg);
        } else if (msg.type === 'playerCount') {
            console.log("%c[Inbound SS (playerCount)]", "background: lightblue; color: black", msg);
        } else if (msg.type === 'offer') {
            console.log("%c[Inbound SS (offer)]", "background: lightblue; color: black", msg);
            if (!UrlParamsCheck('offerToReceive')) {
                onWebRtcOffer(msg);
            }
        } else if (msg.type === 'answer') {
            console.log("%c[Inbound SS (answer)]", "background: lightblue; color: black", msg);
            onWebRtcAnswer(msg);
        } else if (msg.type === 'iceCandidate') {
            onWebRtcIce(msg.candidate);
        } else if(msg.type === 'warning' && msg.warning) {
            console.warn(msg.warning);
        } else if (msg.type === 'peerDataChannels') {
            onWebRtcSFUPeerDatachannels(msg);
        } else {
            console.error("Invalid SS message type", msg.type);
        }
    };
    // 设置WebSocket的错误处理函数
    ws.onerror = function(event) {
        console.log(`WS error: ${JSON.stringify(event)}`);
    };
    // 设置WebSocket的关闭处理函数
    ws.onclose = function(event) {
        // 关闭流媒体传输
        closeStream();

        // 如果需要尝试重新连接
        if(ws.attemptStreamReconnection === true){
            console.log(`WS closed: ${JSON.stringify(event.code)} - ${event.reason}`);
            if(event.reason !== "")
            {
                showTextOverlay(`未连接 ${event.reason.toUpperCase()}`);
                // showTextOverlay(`请稍等...`);
            }
            else
            {
                // showTextOverlay(`DISCONNECTED`);
                showTextOverlay(`连接已断开`);
                // 跳转页面到appShowUrl
                window.location.href = appShowUrl;
            }
            
            // 设置延时，尝试重新启动连接
            let reclickToStart = setTimeout(function(){
                start(true)
            }, 4000);
        }

        ws = undefined;
    };
}

// Config data received from WebRTC sender via the Cirrus web server
function onConfig(config) {
    let playerDiv = document.getElementById('player');
    let playerElement = setupWebRtcPlayer(playerDiv, config);
    resizePlayerStyle();
    registerMouse(playerElement);
}

// 根据当前的控制方案为播放器元素注册相应的鼠标事件。这有助于根据不同的用户交互需求调整鼠标控制行为
function registerMouse(playerElement) {
    clearMouseEvents(playerElement); // 清除播放器元素上可能已经注册的鼠标事件

    switch (inputOptions.controlScheme) {
        case ControlSchemeType.HoveringMouse:
            // 如果控制方案是HoveringMouse，注册悬停鼠标的事件处理器
            registerHoveringMouseEvents(playerElement);
            break;
        case ControlSchemeType.LockedMouse:
            // 如果控制方案是LockedMouse，注册锁定鼠标的事件处理器
            registerLockedMouseEvents(playerElement);
            break;
        default:// 默认情况下，注册锁定鼠标的事件处理器
            registerLockedMouseEvents(playerElement);
            break;
    }
    // 获取id为"player"的DOM元素，并设置其光标样式
    let player = document.getElementById("player");
    player.style.cursor = styleCursor;
}

// 清除指定播放器元素上所有的鼠标事件监听器。这是通过将各种鼠标事件的处理函数设置为null来实现的
function clearMouseEvents(playerElement) {
    playerElement.onclick = null;     // 清除元素上的点击事件监听器
    playerElement.onmousedown = null; // 清除元素上的鼠标按下事件监听器
    playerElement.onmouseup = null;   // 清除元素上的鼠标释放事件监听器
    playerElement.onwheel = null;     // 清除元素上的鼠标滚轮事件监听器
    playerElement.onmousemove = null;  // 清除元素上的鼠标移动事件监听器
    playerElement.oncontextmenu = null; // 清除元素上的右键菜单事件监听器
}
// 用于在两种控制方案之间切换：悬停鼠标（Hovering Mouse）和锁定鼠标（Locked Mouse）。
// 这个函数根据当前的控制方案设置来切换到另一种方案，并更新页面上显示的控制方案信息
function toggleControlScheme() {
    // 获取显示控制方案文本的DOM元素
    let schemeToggle = document.getElementById("control-scheme-text");
    
    // 根据当前的控制方案设置，切换到另一种控制方案
    switch (inputOptions.controlScheme) {
        case ControlSchemeType.HoveringMouse: 
            // 如果当前方案是HoveringMouse，切换到LockedMouse
            inputOptions.controlScheme = ControlSchemeType.LockedMouse;
            schemeToggle.innerHTML = "Control Scheme: Locked Mouse";
            break;
        case ControlSchemeType.LockedMouse:
            // 如果当前方案是LockedMouse，切换到HoveringMouse
            inputOptions.controlScheme = ControlSchemeType.HoveringMouse;
            schemeToggle.innerHTML = "Control Scheme: Hovering Mouse";
            break;
        default: // 如果当前方案未知，设置为LockedMouse并在控制台输出错误信息
            inputOptions.controlScheme = ControlSchemeType.LockedMouse;
            schemeToggle.innerHTML = "Control Scheme: Locked Mouse";
            console.log(`ERROR: Unknown control scheme ${inputOptions.controlScheme}, defaulting to Locked Mouse`);
            break;
    }

    // 在控制台输出当前的控制方案
    console.log(`Updating control scheme to: ${inputOptions.controlScheme ? "Hovering Mouse" : "Locked Mouse"}`)
    if(webRtcPlayerObj && webRtcPlayerObj.video) // 如果webRtcPlayerObj和其video属性存在，注册鼠标控制
    {
        registerMouse(webRtcPlayerObj.video); // 注册鼠标控制
    }
}

// 用于切换浏览器中播放器上鼠标光标的可见性。如果光标被隐藏，此函数会显示它；如果光标是可见的，此函数会隐藏它
function toggleBrowserCursorVisibility() {
    // 切换inputOptions对象中hideBrowserCursor属性的布尔值
    inputOptions.hideBrowserCursor = !inputOptions.hideBrowserCursor;
    // 根据hideBrowserCursor的值设置styleCursor变量，决定光标是隐藏还是默认显示
    styleCursor = (inputOptions.hideBrowserCursor ? 'none' : 'default');
    let player = document.getElementById("player"); // 获取id为"player"的DOM元素
    player.style.cursor = styleCursor; // 设置播放器的光标样式
}

// 用于重新启动流媒体传输。当需要重启与流媒体服务器的连接时，此函数会关闭现有的WebSocket连接，
// 并通过修改onclose处理程序来初始化新的连接过程, 通过关闭WebSocket连接并在连接关闭时触发新的连接逻辑，
// 实现了流媒体传输的重新启动。这对于处理流媒体传输中断或需要重置连接的情况非常有用
function restartStream() {
    if(!ws){ // 如果WebSocket对象不存在，直接返回
        return;
    }
    ws.attemptStreamReconnection = false; // 设置WebSocket对象的attemptStreamReconnection属性为false

    let existingOnClose = ws.onclose; // 保存WebSocket的现有onclose事件处理函数

    // 重写WebSocket的onclose事件处理函数
    ws.onclose = function(event) {
        existingOnClose(event); // 调用原有的onclose处理函数
        // 重启流媒体的逻辑，设置connect_on_load为true并调用start函数
        connect_on_load = true; 
        start(false);
    }

    // 关闭WebSocket连接，这将关闭与信令服务器的连接，终止对等连接，并关闭客户端流
    ws.close();
}

function closeStream() {
    console.log("----------------------Closing stream----------------------")
    if (webRtcPlayerObj) {
        // Remove video element from the page.
        let playerDiv = document.getElementById('player');
        if(playerDiv){
            playerDiv.removeChild(webRtcPlayerObj.video);
        }
        let outer = document.getElementById("outer");
        let middle = document.getElementById("middle");
        let inner = document.getElementById("inner");
        let dot = document.getElementById("dot");

        outer.style.fill = middle.style.fill = inner.style.fill = dot.style.fill = "#3c3b40";
        let qualityText = document.getElementById("qualityText");
        qualityText.innerHTML = '未连接';
        // Close the peer connection and associated webrtc machinery.
        webRtcPlayerObj.close();
        webRtcPlayerObj = undefined;
    }
}

function hideSettingBtn() {
    playClickAudio()
    let settingBtn = document.getElementById("settingsBtn");
    // 如果当前设置按钮是可见的，则隐藏它
    if (settingBtn.style.display !== "none") {
        settingBtn.style.display = "none";
    }
    // 如果当前设置按钮是隐藏的，则显示它
    else {
        settingBtn.style.display = "block";
    }

    // 隐藏connection显示
    let connectionStatus = document.getElementById("connection");
    if (connectionStatus.style.display !== "none") {
        connectionStatus.style.display = "none";
    }
    else {
        connectionStatus.style.display = "block";
    }

}

function load() {
    parseURLParams(); // 解析URL参数, 根据参数设置inputOptions控制值
    setupHtmlEvents(); // 设置HTML元素的事件处理函数
    registerMessageHandlers(); // 注册消息处理函数
    populateDefaultProtocol(); // 填充默认的协议
    setupFreezeFrameOverlay(); // 设置冻结帧覆盖层
    registerKeyboardEvents(); // 注册键盘事件处理函数
    // Example response event listener that logs to console

    addResponseEventListener('logListener', (response) => {console.log(`Received response message from streamer: "${response}"`)}) // 添加响应事件监听器
    start(false); // 启动流媒体传输
}
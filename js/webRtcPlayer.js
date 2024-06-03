// 定义webRtcPlayer函数，用于初始化WebRTC播放器
function webRtcPlayer(parOptions) {
    // 如果传入的参数未定义，则初始化为空对象
    parOptions = typeof parOptions !== 'undefined' ? parOptions : {};
    
    var self = this; // 保存当前对象的引用
    const urlParams = new URLSearchParams(window.location.search); // 解析URL中的查询参数

    // 配置设置
    // 初始化WebRTC的配置对象
    this.cfg = typeof parOptions.peerConnectionOptions !== 'undefined' ? parOptions.peerConnectionOptions : {};
    this.cfg.sdpSemantics = 'unified-plan'; // 设置SDP语义为'unified-plan'

    // 在Chrome 89+中，如果这个选项为true，则会发送与UE Pixel Streaming 4.26及以下版本不兼容的SDP
    // 但4.27及以上版本不需要将其设置为false，因为它支持`offerExtmapAllowMixed`
    this.cfg.offerExtmapAllowMixed = false;

    // 强制使用TURN服务器
    this.forceTURN = urlParams.has('ForceTURN');
    if(this.forceTURN)
    {
        console.log("通过设置ICE传输策略为relay来强制使用TURN服务器。");
        this.cfg.iceTransportPolicy = "relay";
    }

    this.cfg.bundlePolicy = "balanced";
    // 强制最大绑定策略
    this.forceMaxBundle = urlParams.has('ForceMaxBundle');
    if(this.forceMaxBundle)
    {
        this.cfg.bundlePolicy = "max-bundle";
    }

    //**********************
    // 变量初始化
    //**********************
    this.pcClient = null; // PeerConnection客户端
    this.dcClient = null; // DataChannel客户端
    this.tnClient = null;  // Turn服务器客户端
    this.sfu = false; // 是否使用SFU

    // SDP约束条件
    this.sdpConstraints = {
      offerToReceiveAudio: 1, // 提示: 如果不需要音频，关闭此项可以改善延迟
      offerToReceiveVideo: 1,
      voiceActivityDetection: false // 禁用声音活动检测
    };

    // See https://www.w3.org/TR/webrtc/#dom-rtcdatachannelinit for values (this is needed for Firefox to be consistent with Chrome.)
    // 数据通道选项（对Firefox浏览器保持与Chrome一致）
    this.dataChannelOptions = {ordered: true};

    // 如果需要视频/音频自动播放（无用户输入），这很有用，因为浏览器不允许未经用户交互的音频自动播放
    this.startVideoMuted = typeof parOptions.startVideoMuted !== 'undefined' ? parOptions.startVideoMuted : false;
    this.autoPlayAudio = typeof parOptions.autoPlayAudio !== 'undefined' ? parOptions.autoPlayAudio : true;

    // 强制WebRTC音频单声道播放
    this.forceMonoAudio = urlParams.has('ForceMonoAudio');
    if(this.forceMonoAudio){
        console.log("尝试通过在浏览器中修改SDP来强制音频单声道。")
    }

    // 启用麦克风使用需要SSL/localhost，并在查询字符串中添加?useMic
    this.useMic = urlParams.has('useMic');
    if(!this.useMic){
        console.log("麦克风访问未启用。在URL中添加?useMic来启用。");
    }

    // 检查SSL或localhost以启用麦克风
    let isLocalhostConnection = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    let isHttpsConnection = location.protocol === 'https:';
    if(this.useMic && !isLocalhostConnection && !isHttpsConnection)
    {
        this.useMic = false;
        console.error("如果不是在HTTPS或localhost上，浏览器中的麦克风访问将不起作用。禁用麦克风访问。");
        console.error("在Chrome中进行测试时，可以通过访问chrome://flags/并启用'不安全地将不安全的来源视为安全'来启用HTTP麦克风访问。");
    }

    // 优先使用SFU或P2P连接
    this.preferSFU = urlParams.has('preferSFU');
    console.log(this.preferSFU ? 
        "浏览器将表示它更倾向于使用SFU连接。从URL中移除?preferSFU来表示使用P2P。" :
        "浏览器将表示它更倾向于使用P2P连接。在URL中添加?preferSFU来表示使用SFU。");

    // 延迟测试
    this.latencyTestTimings = 
    {
        TestStartTimeMs: null,
        UEReceiptTimeMs: null,
        UEEncodeMs: null,
        UECaptureToSendMs: null,
        UETransmissionTimeMs: null,
        BrowserReceiptTimeMs: null,
        FrameDisplayDeltaTimeMs: null,
        Reset: function()  // 重置测试时间
        {
            this.TestStartTimeMs = null;
            this.UEReceiptTimeMs = null;
            this.UEEncodeMs = null,
            this.UECaptureToSendMs = null,
            this.UETransmissionTimeMs = null;
            this.BrowserReceiptTimeMs = null;
            this.FrameDisplayDeltaTimeMs = null;
        },
        SetUETimings: function(UETimings) // 设置UE侧的时间
        {
            this.UEReceiptTimeMs = UETimings.ReceiptTimeMs;
            this.UEEncodeMs = UETimings.EncodeMs,
            this.UECaptureToSendMs = UETimings.CaptureToSendMs,
            this.UETransmissionTimeMs = UETimings.TransmissionTimeMs;
            this.BrowserReceiptTimeMs = Date.now();
            this.OnAllLatencyTimingsReady(this);
        },
        SetFrameDisplayDeltaTime: function(DeltaTimeMs) // 设置帧显示时间差
        {
            if(this.FrameDisplayDeltaTimeMs == null)
            {
                this.FrameDisplayDeltaTimeMs = Math.round(DeltaTimeMs);
                this.OnAllLatencyTimingsReady(this);
            }
        },
        OnAllLatencyTimingsReady: function(Timings){}
    }

    //**********************
    // 函数定义
    //**********************

    // 创建视频元素并作为参数暴露出去
    this.createWebRtcVideo = function() {
        var video = document.createElement('video'); // 创建video元素

        video.id = "streamingVideo"; // 设置video元素的ID
        video.playsInline = true; // 允许内联播放
        video.webkitPlaysinline = true
        video.x5VideoPlayerType="h5"
        video.disablePictureInPicture = true; // 禁用画中画功能
        video.muted = self.startVideoMuted;; // 根据配置决定是否静音
        
        // 当视频的元数据加载完成时触发
        video.addEventListener('loadedmetadata', function(e){
            if(self.onVideoInitialised){
                self.onVideoInitialised(); // 如果有初始化视频的回调，则调用
            }
        }, true);

        // 防止视频被暂停
        video.addEventListener('pause', function(e) {
            video.play();
        })
        
        // 检查是否支持请求视频帧回调
        if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
            // The API is supported! 
            // 计算接收到呈现的时间差
            const onVideoFrameReady = (now, metadata) => {
                
                if(metadata.receiveTime && metadata.expectedDisplayTime)
                {
                    const receiveToCompositeMs = metadata.presentationTime - metadata.receiveTime;
                    self.aggregatedStats.receiveToCompositeMs = receiveToCompositeMs;
                }
                
              
                // 重新注册回调，以便通知下一帧
                video.requestVideoFrameCallback(onVideoFrameReady);
            };
            
            // 初始注册回调，以便通知第一帧
            video.requestVideoFrameCallback(onVideoFrameReady);
        }
        
        return video; // 返回创建的video元素
    }

    // 创建音频元素
    this.createWebRtcAudio = function() {
        var audio = document.createElement('audio'); // 创建audio元素
        audio.id = 'streamingAudio'; // 设置audio元素的ID

        return audio; // 返回创建的audio元素
    }

    // 初始化视频和音频元素
    this.video = this.createWebRtcVideo();
    this.audio = this.createWebRtcAudio();
    this.availableVideoStreams = new Map(); // 可用的视频流

    // WebRTC信号状态变化时的处理函数
    onsignalingstatechange = function(state) {
        console.info('Signaling state change. |', state.srcElement.signalingState, "|")
    };

    // ICE连接状态变化时的处理函数
    oniceconnectionstatechange = function(state) {
        console.info('Browser ICE connection |', state.srcElement.iceConnectionState, '|')
    };

    // ICE收集状态变化时的处理函数
    onicegatheringstatechange = function(state) {
        console.info('Browser ICE gathering |', state.srcElement.iceGatheringState, '|')
    };

    // 处理WebRTC的轨道事件
    handleOnTrack = function(e) {
        if (e.track)
        {
            console.log('Got track. | Kind=' + e.track.kind + ' | Id=' + e.track.id + ' | readyState=' + e.track.readyState + ' |'); 
        }
        
        if(e.track.kind == "audio")
        {
            handleOnAudioTrack(e.streams[0]); // 处理音频轨道
            return;
        }
        else (e.track.kind == "video") // 处理视频轨道
        {
            for (const s of e.streams) {
                if (!self.availableVideoStreams.has(s.id)) {
                    self.availableVideoStreams.set(s.id, s);
                }
            }

            self.video.srcObject = e.streams[0];

            // 当轨道取消静音时更新视频源
            e.track.onunmute = () => {
                self.video.srcObject = e.streams[0];
                self.onNewVideoTrack(e.streams);
            }
        }
    };

    // 处理音频轨道
    handleOnAudioTrack = function(audioMediaStream)
    {
        // 如果视频元素的媒体流与这个音频轨道相同，则不做任何操作
        if(self.video.srcObject == audioMediaStream)
        {
            return;
        }
        // 如果视频元素有其他媒体流，则更新音频源
        else if(self.video.srcObject && self.video.srcObject !== audioMediaStream)
        {
           self.audio.srcObject = audioMediaStream;
        }

    }
    // 数据通道事件处理
    onDataChannel = function(dataChannelEvent){
        // This is the primary data channel code path when we are "receiving"
        console.log("由浏览器为接收方创建的数据通道。");
        self.dcClient = dataChannelEvent.channel; // 设置数据通道客户端
        setupDataChannelCallbacks(self.dcClient); // 设置数据通道回调
    }
    // 创建数据通道
    createDataChannel = function(pc, label, options){
        // This is the primary data channel code path when we are "offering"
        let datachannel = pc.createDataChannel(label, options);
        console.log(`创建数据通道(${label})`);
        setupDataChannelCallbacks(datachannel); // 设置数据通道回调
        return datachannel;
    }
    // 设置数据通道回调
    setupDataChannelCallbacks = function(datachannel) {
        try {
            // Inform browser we would like binary data as an ArrayBuffer (FF chooses Blob by default!)
            datachannel.binaryType = "arraybuffer"; // 设置二进制数据类型为ArrayBuffer

            // 数据通道打开时的回调
            datachannel.addEventListener('open', e => {
                console.log(`数据通道已连接: ${datachannel.label}(${datachannel.id})`);
                if(self.onDataChannelConnected){
                    self.onDataChannelConnected();
                }
            });
            // 数据通道关闭时的回调
            datachannel.addEventListener('close', e => {
                console.log(`数据通道已断开: ${datachannel.label}(${datachannel.id}`, e);
            });

            // 数据通道接收消息时的回调
            datachannel.addEventListener('message', e => {
                if (self.onDataChannelMessage){
                    self.onDataChannelMessage(e.data);
                }
            });

            // 数据通道发生错误时的回调
            datachannel.addEventListener('error', e => {
                console.error(`数据通道错误: ${datachannel.label}(${datachannel.id}`, e);
            });

            return datachannel;
        } catch (e) { 
            console.warn('设置数据通道时发生异常: ', e);
            return null;
        }
    }

    // 当有新的ICE候选人时的处理函数
    onicecandidate = function (e) {
        let candidate = e.candidate; 
        if (candidate && candidate.candidate) { // 确保候选人信息存在
            console.log("%c[Browser ICE candidate]", "background: violet; color: black", "| Type=", candidate.type, "| Protocol=", candidate.protocol, "| Address=", candidate.address, "| Port=", candidate.port, "|");
            self.onWebRtcCandidate(candidate);
        }
    };

    // 处理创建WebRTC offer的函数
    handleCreateOffer = function (pc) {
        // 根据SDP约束创建offer
        pc.createOffer(self.sdpConstraints).then(function (offer) {

            // 对SDP进行修改，以设置浏览器WebRTC API未暴露的参数，称为SDP munging
            mungeSDP(offer);

            // 在本地对等连接上设置修改后的SDP
            pc.setLocalDescription(offer);
            // 如果存在对应的回调函数，传递offer信息
            if (self.onWebRtcOffer) {
                self.onWebRtcOffer(offer);
            }
        },
        function () { console.warn("无法创建offer") });
    }

    // 修改SDP的函数
    mungeSDP = function (offer) {

        let audioSDP = '';

        // 设置Opus支持的最高比特率
        audioSDP += 'maxaveragebitrate=510000;';

        if(self.useMic){
            // 如果使用麦克风，设置最大采样率为48kHz以发送高质量音频
            audioSDP += 'sprop-maxcapturerate=48000;';
        }

        // 根据是否传递?forceMono来强制音频为单声道或立体声
        audioSDP += self.forceMonoAudio ? 'stereo=0;' : 'stereo=1;';

        // 为Opus音频启用带内前向错误纠正
        audioSDP += 'useinbandfec=1';

        // 使用'useinbandfec=1'行（Opus使用）设置Opus特定的音频参数
        offer.sdp = offer.sdp.replace('useinbandfec=1', audioSDP);
    }
    
    // 设置对等连接的函数
    setupPeerConnection = function (pc) {
        // 设置对等连接的事件处理函数
        pc.onsignalingstatechange = onsignalingstatechange; // 信号状态变化时的处理函数
        pc.oniceconnectionstatechange = oniceconnectionstatechange; // ICE连接状态变化时
        pc.onicegatheringstatechange = onicegatheringstatechange; // ICE收集状态变化时

        pc.ontrack = handleOnTrack; // 处理媒体轨道事件
        pc.onicecandidate = onicecandidate; // 处理ICE候选人事件
        pc.ondatachannel = onDataChannel; // 处理数据通道事件
    };

    // 生成聚合统计数据的函数
    generateAggregatedStatsFunction = function(){
        if(!self.aggregatedStats) // 如果之前没有聚合统计数据，则初始化为空对象
            self.aggregatedStats = {};

        // 返回一个处理统计数据的函数
        return function(stats){
            
            let newStat = {}; // 新的统计数据对象

            // 存储每种编解码器的统计信息
            newStat.codecs = {};

            // 遍历所有统计信息
            stats.forEach(stat => {

                 // 获取视频的入站 RTP 统计信息
                if (stat.type === 'inbound-rtp' 
                    && !stat.isRemote 
                    && (stat.mediaType === 'video' || stat.id.toLowerCase().includes('video'))) {

                    newStat.timestamp = stat.timestamp; // 时间戳
                    newStat.bytesReceived = stat.bytesReceived; // 接收到的字节数
                    newStat.framesDecoded = stat.framesDecoded; // 解码的帧数
                    newStat.packetsLost = stat.packetsLost; // 丢失的包数
                    newStat.frameHeight = stat.frameHeight; // 帧高
                    newStat.frameWidth = stat.frameWidth; // 帧宽
                    newStat.framesDropped = stat.framesDropped; // 丢弃的帧数

                    // 计算起始统计数据，用于计算平均值
                    newStat.bytesReceivedStart = self.aggregatedStats && self.aggregatedStats.bytesReceivedStart ? self.aggregatedStats.bytesReceivedStart : stat.bytesReceived;
                    newStat.framesDecodedStart = self.aggregatedStats && self.aggregatedStats.framesDecodedStart ? self.aggregatedStats.framesDecodedStart : stat.framesDecoded;
                    newStat.timestampStart = self.aggregatedStats && self.aggregatedStats.timestampStart ? self.aggregatedStats.timestampStart : stat.timestamp;
                    
                    // 计算比特率和帧率
                    if(self.aggregatedStats && self.aggregatedStats.timestamp){

                        // 获取视频编解码器类型
                        if(stat.codecId && self.aggregatedStats.codecs && self.aggregatedStats.codecs.hasOwnProperty(stat.codecId)){
                            newStat.videoCodec = self.aggregatedStats.codecs[stat.codecId];
                        }
                        // 计算比特率
                        if(self.aggregatedStats.bytesReceived){
                            // bitrate = bits received since last time / number of ms since last time
                            //This is automatically in kbits (where k=1000) since time is in ms and stat we want is in seconds (so a '* 1000' then a '/ 1000' would negate each other)
                            newStat.bitrate = 8 * (newStat.bytesReceived - self.aggregatedStats.bytesReceived) / (newStat.timestamp - self.aggregatedStats.timestamp);
                            newStat.bitrate = Math.floor(newStat.bitrate);
                            newStat.lowBitrate = self.aggregatedStats.lowBitrate && self.aggregatedStats.lowBitrate < newStat.bitrate ? self.aggregatedStats.lowBitrate : newStat.bitrate
                            newStat.highBitrate = self.aggregatedStats.highBitrate && self.aggregatedStats.highBitrate > newStat.bitrate ? self.aggregatedStats.highBitrate : newStat.bitrate
                        }
                        // 计算平均比特率
                        if(self.aggregatedStats.bytesReceivedStart){
                            newStat.avgBitrate = 8 * (newStat.bytesReceived - self.aggregatedStats.bytesReceivedStart) / (newStat.timestamp - self.aggregatedStats.timestampStart);
                            newStat.avgBitrate = Math.floor(newStat.avgBitrate);
                        }
                        // 计算帧率
                        if(self.aggregatedStats.framesDecoded){
                            // framerate = frames decoded since last time / number of seconds since last time
                            newStat.framerate = (newStat.framesDecoded - self.aggregatedStats.framesDecoded) / ((newStat.timestamp - self.aggregatedStats.timestamp) / 1000);
                            newStat.framerate = Math.floor(newStat.framerate);
                            newStat.lowFramerate = self.aggregatedStats.lowFramerate && self.aggregatedStats.lowFramerate < newStat.framerate ? self.aggregatedStats.lowFramerate : newStat.framerate
                            newStat.highFramerate = self.aggregatedStats.highFramerate && self.aggregatedStats.highFramerate > newStat.framerate ? self.aggregatedStats.highFramerate : newStat.framerate
                        }
                        // 计算平均帧率
                        if(self.aggregatedStats.framesDecodedStart){
                            newStat.avgframerate = (newStat.framesDecoded - self.aggregatedStats.framesDecodedStart) / ((newStat.timestamp - self.aggregatedStats.timestampStart) / 1000);
                            newStat.avgframerate = Math.floor(newStat.avgframerate);
                        }
                    }
                }

                // 获取音频的入站 RTP 统计信息
                if (stat.type === 'inbound-rtp' 
                    && !stat.isRemote 
                    && (stat.mediaType === 'audio' || stat.id.toLowerCase().includes('audio'))) {

                    // 获取接收到的音频字节数
                    if(stat.bytesReceived){
                        newStat.audioBytesReceived = stat.bytesReceived;
                    }

                    // 计算音频比特率
                    if(self.aggregatedStats && self.aggregatedStats.timestamp){

                        // Get the mimetype of the audio codec being used
                        if(stat.codecId && self.aggregatedStats.codecs && self.aggregatedStats.codecs.hasOwnProperty(stat.codecId)){
                            newStat.audioCodec = self.aggregatedStats.codecs[stat.codecId];
                        }

                        // Determine audio bitrate delta over the time period
                        if(self.aggregatedStats.audioBytesReceived){
                            newStat.audioBitrate = 8 * (newStat.audioBytesReceived - self.aggregatedStats.audioBytesReceived) / (stat.timestamp - self.aggregatedStats.timestamp);
                            newStat.audioBitrate = Math.floor(newStat.audioBitrate);
                        }
                    }
                }

                // 读取视频轨道统计信息
                if(stat.type === 'track' && (stat.trackIdentifier === 'video_label' || stat.kind === 'video')) {
                    newStat.framesDropped = stat.framesDropped;
                    newStat.framesReceived = stat.framesReceived;
                    newStat.framesDroppedPercentage = stat.framesDropped / stat.framesReceived * 100;
                    newStat.frameHeight = stat.frameHeight;
                    newStat.frameWidth = stat.frameWidth;
                    newStat.frameHeightStart = self.aggregatedStats && self.aggregatedStats.frameHeightStart ? self.aggregatedStats.frameHeightStart : stat.frameHeight;
                    newStat.frameWidthStart = self.aggregatedStats && self.aggregatedStats.frameWidthStart ? self.aggregatedStats.frameWidthStart : stat.frameWidth;
                }
                // 获取候选对的统计信息
                if(stat.type ==='candidate-pair' && stat.hasOwnProperty('currentRoundTripTime') && stat.currentRoundTripTime != 0){
                    newStat.currentRoundTripTime = stat.currentRoundTripTime;
                }

                // 存储每种编解码器的类型
                if(newStat.hasOwnProperty('codecs') && stat.type === 'codec' && stat.mimeType && stat.id){
                    const codecId = stat.id;
                    const codecType = stat.mimeType.replace("video/", "").replace("audio/", "");
                    newStat.codecs[codecId] = codecType;
                }

            });
            // 如果有接收到合成时间，则更新统计信息
            if(self.aggregatedStats.receiveToCompositeMs)
            {
                newStat.receiveToCompositeMs = self.aggregatedStats.receiveToCompositeMs;
                self.latencyTestTimings.SetFrameDisplayDeltaTime(self.aggregatedStats.receiveToCompositeMs);
            }
            // 更新聚合统计数据
            self.aggregatedStats = newStat;
            // 如果存在对应的回调函数，则传递新的聚合统计数据
            if(self.onAggregatedStats)
                self.onAggregatedStats(newStat)
        }
    };

    // 异步设置收发器的函数
    // 用于在WebRTC的对等连接（PeerConnection）上设置收发器（Transceivers），以便于接收视频和音频流，以及发送音频流
    setupTransceiversAsync = async function(pc){
        // 检查是否已经有收发器存在
        let hasTransceivers = pc.getTransceivers().length > 0;

        // 获取窗口的宽度和高度的一半
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const halfWidth = Math.floor(screenWidth / 2);
        const halfHeight = Math.floor(screenHeight / 2);
        console.log("屏幕宽度: ", screenWidth, "屏幕高度: ", screenHeight, "一半宽度: ", halfWidth, "一半高度: ", halfHeight);
        // 为接收UE（虚幻引擎）视频设置一个收发器
        pc.addTransceiver("video", {
            direction: "recvonly",
            // sendEncodings: [
            //     {
            //         width: halfWidth,
            //         height: halfHeight
            //     }
            // ]
        });

        // 如果不使用麦克风，只添加一个用于接收音频的收发器
        if(!self.useMic)
        {
            pc.addTransceiver("audio", { direction: "recvonly" });
        }
        else // 如果使用麦克风，则设置音频发送选项
        {
            let audioSendOptions = self.useMic ? 
            {
                autoGainControl: false, // 自动增益控制
                channelCount: 1,         // 通道数量
                echoCancellation: false, // 回声消除
                latency: 0,              // 延迟
                noiseSuppression: false, // 噪声抑制
                sampleRate: 48000,       // 采样率
                sampleSize: 16,          // 采样大小
                volume: 1.0              // 音量
            } : false;

            // 获取用户媒体流（仅音频）
            const stream = await navigator.mediaDevices.getUserMedia({video: false, audio: audioSendOptions});
            if(stream) // 如果获取到了媒体流
            {
                if(hasTransceivers){ // 如果已经有收发器，更新现有的音频收发器
                    for(let transceiver of pc.getTransceivers()){
                        if(transceiver && transceiver.receiver && transceiver.receiver.track && transceiver.receiver.track.kind === "audio")
                        {
                            for (const track of stream.getTracks()) {
                                if(track.kind && track.kind == "audio")
                                {
                                    transceiver.sender.replaceTrack(track);
                                    transceiver.direction = "sendrecv";
                                }
                            }
                        }
                    }
                }
                else // 如果没有收发器，为每个音频轨道添加一个收发器
                {
                    for (const track of stream.getTracks()) {
                        if(track.kind && track.kind == "audio")
                        {
                            pc.addTransceiver(track, { direction: "sendrecv" });
                        }
                    }
                }
            }
            else // 如果没有获取到媒体流，添加一个仅接收音频的收发器
            {
                pc.addTransceiver("audio", { direction: "recvonly" });
            }
        }
    };


    //**********************
    // 公共函数
    // 这些函数为WebRTC连接提供了外部控制接口，包括管理视频流的启用状态、执行延迟测试、处理ICE候选人、
    // 创建和接收Offer / Answer、管理数据通道以及收集和聚合统计信息。这些功能是实现高效和可靠的WebRTC通信的关键
    //**********************

    // 设置视频启用/禁用
    this.setVideoEnabled = function(enabled) {
        self.video.srcObject.getTracks().forEach(track => track.enabled = enabled);
    }

    // 开始延迟测试
    this.startLatencyTest = function(onTestStarted) {
        // Can't start latency test without a video element
        if(!self.video)
        {
            return;
        }

        self.latencyTestTimings.Reset();
        self.latencyTestTimings.TestStartTimeMs = Date.now();
        onTestStarted(self.latencyTestTimings.TestStartTimeMs);            
    }

    // 处理从服务器接收到的单个ICE候选人
    this.handleCandidateFromServer = function(iceCandidate) {
        let candidate = new RTCIceCandidate(iceCandidate);

        console.log("%c[Unreal ICE candidate]", "background: pink; color: black" ,"| Type=", candidate.type, "| Protocol=", candidate.protocol, "| Address=", candidate.address, "| Port=", candidate.port, "|");

        // if forcing TURN, reject any candidates not relay
        if(self.forceTURN)
        {
            // check if no relay address is found, if so, we are assuming it means no TURN server
            if(candidate.candidate.indexOf("relay") < 0) { 
                console.warn("Dropping candidate because it was not TURN relay.", "| Type=", candidate.type, "| Protocol=", candidate.protocol, "| Address=", candidate.address, "| Port=", candidate.port, "|")
                return;
            }
        }

        self.pcClient.addIceCandidate(candidate).catch(function(e){
            console.error("Failed to add ICE candidate", e);
        });
    };

    // 创建Offer
    this.createOffer = function() {
        if(self.pcClient){
            console.log("Closing existing PeerConnection")
            self.pcClient.close();
            self.pcClient = null;
        }
        self.pcClient = new RTCPeerConnection(self.cfg);
        setupPeerConnection(self.pcClient);

        setupTransceiversAsync(self.pcClient).finally(function()
        {
            self.dcClient = createDataChannel(self.pcClient, 'cirrus', self.dataChannelOptions);
            handleCreateOffer(self.pcClient);
        });

    };

    // 接收Offer
    this.receiveOffer = function(offer) {
        if (offer.sfu) {
            this.sfu = true;
            delete offer.sfu;
        }

        if (!self.pcClient){
            console.log("Creating a new PeerConnection in the browser.")
            self.pcClient = new RTCPeerConnection(self.cfg);
            setupPeerConnection(self.pcClient);

            // Put things here that happen post transceiver setup
            self.pcClient.setRemoteDescription(offer)
            .then(() => 
            {
                setupTransceiversAsync(self.pcClient).finally(function(){
                self.pcClient.createAnswer()
                .then(answer => {
                    mungeSDP(answer);
                    return self.pcClient.setLocalDescription(answer);
                })
                .then(() => {
                    if (self.onWebRtcAnswer) {
                        self.onWebRtcAnswer(self.pcClient.currentLocalDescription);
                    }
                })
                .then(()=> {
                    let receivers = self.pcClient.getReceivers();
                    for(let receiver of receivers)
                    {
                        receiver.playoutDelayHint = 0;
                    }
                })
                .catch((error) => console.error("createAnswer() failed:", error));
                });
            });
        }
    };

    // 接收Answer
    this.receiveAnswer = function(answer) {
        self.pcClient.setRemoteDescription(answer);
    };

    // 接收SFU数据通道请求
    this.receiveSFUPeerDataChannelRequest = function (channelData) {
        // 配置发送选项
        const sendOptions = {
            ordered: true,
            negotiated: true,
            id: channelData.sendStreamId
        };
        const unidirectional = channelData.sendStreamId != channelData.recvStreamId;
        const sendDataChannel = self.pcClient.createDataChannel(unidirectional ? 'send-datachannel' : 'datachannel', sendOptions);
        setupDataChannelCallbacks(sendDataChannel);

        if (unidirectional) {
            const recvOptions = {
                ordered: true,
                negotiated: true,
                id: channelData.recvStreamId
            };
            const recvDataChannel = self.pcClient.createDataChannel('recv-datachannel', recvOptions);

            // 当接收数据通道打开时通知SFU
            recvDataChannel.addEventListener('open', e => {
                if(self.onSFURecvDataChannelReady) {
                    self.onSFURecvDataChannelReady();
                }
            });

            setupDataChannelCallbacks(recvDataChannel);
        }
        this.dcClient = sendDataChannel;
    }
    // 关闭连接和统计信息收集
    this.close = function(){
        if(self.pcClient){
            console.log("Closing existing peerClient")
            self.pcClient.close();
            self.pcClient = null;
        }
        if(self.aggregateStatsIntervalId){
            clearInterval(self.aggregateStatsIntervalId);
        }
    }

    // 通过数据通道发送数据
    this.send = function(data){
        if(self.dcClient && self.dcClient.readyState == 'open'){
            //console.log('Sending data on dataconnection', self.dcClient)
            self.dcClient.send(data);
        }
    };

    // 获取统计信息
    this.getStats = function(onStats){
        if(self.pcClient && onStats){
            self.pcClient.getStats(null).then((stats) => { 
                onStats(stats); 
            });
        }
    }
    // 聚合统计信息
    this.aggregateStats = function(checkInterval){
        let calcAggregatedStats = generateAggregatedStatsFunction();
        let printAggregatedStats = () => { self.getStats(calcAggregatedStats); }
        self.aggregateStatsIntervalId = setInterval(printAggregatedStats, checkInterval);
    }
}

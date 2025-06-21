class P2PVideoCall {
    constructor() {
        this.socket = null;
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.dataChannel = null;
        this.roomId = null;
        this.isInitiator = false;
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        this.connectionStartTime = null;
        this.statsInterval = null;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.initializeMedia();
        this.connectToServer();
    }

    setupEventListeners() {
        // Main controls
        document.getElementById('joinBtn').onclick = () => this.joinRoom();
        document.getElementById('callBtn').onclick = () => this.startCall();
        document.getElementById('hangupBtn').onclick = () => this.hangUp();
        
        // Media controls
        document.getElementById('toggleVideo').onclick = () => this.toggleVideo();
        document.getElementById('toggleAudio').onclick = () => this.toggleAudio();
        
        // Chat
        document.getElementById('sendBtn').onclick = () => this.sendMessage();
        document.getElementById('messageInput').onkeypress = (e) => {
            if (e.key === 'Enter') this.sendMessage();
        };
        
        // UI controls
        document.getElementById('toggleChat').onclick = () => this.toggleChat();
        document.getElementById('closeError').onclick = () => this.hideError();

        // Handle beforeunload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    async initializeMedia() {
        try {
            this.showLoading('Initializing camera and microphone...');
            
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            document.getElementById('localVideo').srcObject = this.localStream;
            this.hideLoading();
            
        } catch (error) {
            this.hideLoading();
            console.error('Error accessing media devices:', error);
            this.showError('Failed to access camera/microphone. Please check permissions and try again.');
        }
    }

    connectToServer() {
        // Auto-connect to server on same host
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const serverUrl = `${protocol}//${window.location.host}`;
        
        try {
            this.socket = new WebSocket(serverUrl);
            
            this.socket.onopen = () => {
                this.updateStatus('Connected to server', 'connected');
                this.updateNetworkInfo(`Server: ${window.location.host}`);
                document.getElementById('joinBtn').disabled = false;
            };

            this.socket.onclose = () => {
                this.updateStatus('Connection lost - Reconnecting...', 'disconnected');
                this.resetUI();
                // Auto-reconnect after 3 seconds
                setTimeout(() => this.connectToServer(), 3000);
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateStatus('Connection error', 'disconnected');
            };

            this.socket.onmessage = (event) => {
                this.handleSignalingMessage(JSON.parse(event.data));
            };
            
        } catch (error) {
            console.error('Failed to connect:', error);
            this.updateStatus('Failed to connect to server', 'disconnected');
        }
    }

    joinRoom() {
        this.roomId = document.getElementById('roomId').value.trim();
        if (!this.roomId) {
            this.showError('Please enter a room ID');
            return;
        }

        this.socket.send(JSON.stringify({
            type: 'join',
            room: this.roomId
        }));

        document.getElementById('joinBtn').disabled = true;
        document.getElementById('callBtn').disabled = false;
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendBtn').disabled = false;
        
        this.updateRoomInfo(`Room: ${this.roomId}`);
    }

    async startCall() {
        this.isInitiator = true;
        this.connectionStartTime = Date.now();
        await this.createPeerConnection();
        
        const offer = await this.peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await this.peerConnection.setLocalDescription(offer);
        
        this.socket.send(JSON.stringify({
            type: 'offer',
            room: this.roomId,
            offer: offer
        }));

        document.getElementById('callBtn').disabled = true;
        document.getElementById('hangupBtn').disabled = false;
        this.updateConnectionStatus('Calling...');
    }

    async createPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);

        // Add local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            document.getElementById('remoteVideo').srcObject = this.remoteStream;
            this.updateConnectionStatus('Connected');
            this.startStatsMonitoring();
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.send(JSON.stringify({
                    type: 'ice-candidate',
                    room: this.roomId,
                    candidate: event.candidate
                }));
            }
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            this.updateConnectionStatus(state);
            
            if (state === 'connected') {
                this.updateStatus('Call connected', 'connected');
            } else if (state === 'disconnected' || state === 'failed') {
                this.updateStatus('Call disconnected', 'disconnected');
                this.hangUp();
            }
        };

        // Create data channel for chat
        if (this.isInitiator) {
            this.dataChannel = this.peerConnection.createDataChannel('chat', {
                ordered: true
            });
            this.setupDataChannel(this.dataChannel);
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.setupDataChannel(this.dataChannel);
            };
        }
    }

    setupDataChannel(channel) {
        channel.onopen = () => {
            console.log('Data channel opened');
        };

        channel.onmessage = (event) => {
            this.displayMessage(event.data, false);
        };

        channel.onerror = (error) => {
            console.error('Data channel error:', error);
        };
    }

    async handleSignalingMessage(message) {
        switch (message.type) {
            case 'connected':
                console.log('Connected to server with client ID:', message.clientId);
                break;

            case 'joined':
                this.updateRoomInfo(`Room: ${message.room} (${message.participants}/2)`);
                break;

            case 'offer':
                if (!this.peerConnection) {
                    this.connectionStartTime = Date.now();
                    await this.createPeerConnection();
                }
                await this.peerConnection.setRemoteDescription(message.offer);
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                
                this.socket.send(JSON.stringify({
                    type: 'answer',
                    room: this.roomId,
                    answer: answer
                }));

                document.getElementById('callBtn').disabled = true;
                document.getElementById('hangupBtn').disabled = false;
                this.updateConnectionStatus('Answering...');
                break;

            case 'answer':
                await this.peerConnection.setRemoteDescription(message.answer);
                break;

            case 'ice-candidate':
                try {
                    await this.peerConnection.addIceCandidate(message.candidate);
                } catch (error) {
                    console.error('Error adding ICE candidate:', error);
                }
                break;

            case 'user-joined':
                this.updateRoomInfo(`Room: ${message.room} (${message.participants}/2)`);
                if (message.participants === 2) {
                    this.updateStatus('Ready to call', 'connected');
                }
                break;

            case 'user-left':
                this.updateRoomInfo(`Room: ${message.room} (${message.participants}/2)`);
                this.updateStatus('Remote user left', 'connected');
                this.hangUp();
                break;

            case 'error':
                this.showError(message.message);
                break;
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                this.isVideoEnabled = !this.isVideoEnabled;
                videoTrack.enabled = this.isVideoEnabled;
                
                const btn = document.getElementById('toggleVideo');
                btn.textContent = this.isVideoEnabled ? '📹' : '📹❌';
                btn.style.opacity = this.isVideoEnabled ? '1' : '0.5';
            }
        }
    }

    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                this.isAudioEnabled = !this.isAudioEnabled;
                audioTrack.enabled = this.isAudioEnabled;
                
                const btn = document.getElementById('toggleAudio');
                btn.textContent = this.isAudioEnabled ? '🎤' : '🎤❌';
                btn.style.opacity = this.isAudioEnabled ? '1' : '0.5';
            }
        }
    }

    hangUp() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }

        document.getElementById('remoteVideo').srcObject = null;
        document.getElementById('callBtn').disabled = false;
        document.getElementById('hangupBtn').disabled = true;
        
        this.updateConnectionStatus('Disconnected');
        this.clearVideoStats();

        if (this.socket && this.roomId) {
            this.socket.send(JSON.stringify({
                type: 'leave',
                room: this.roomId
            }));
        }
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (message && this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(message);
            this.displayMessage(message, true);
            input.value = '';
        } else if (message) {
            this.showError('Chat is not available. Please establish a call first.');
        }
    }

    displayMessage(message, isLocal) {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isLocal ? 'local' : 'remote'}`;
        
        const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        messageDiv.innerHTML = `<small>${timestamp}</small><br>${this.escapeHtml(message)}`;
        
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    toggleChat() {
        const chatContent = document.getElementById('chatContent');
        const toggleBtn = document.getElementById('toggleChat');
        
        if (chatContent.classList.contains('collapsed')) {
            chatContent.classList.remove('collapsed');
            toggleBtn.textContent = '−';
        } else {
            chatContent.classList.add('collapsed');
            toggleBtn.textContent = '+';
        }
    }

    startStatsMonitoring() {
        if (this.statsInterval) return;
        
        this.statsInterval = setInterval(async () => {
            if (this.peerConnection) {
                try {
                    const stats = await this.peerConnection.getStats();
                    this.updateVideoStats(stats);
                } catch (error) {
                    console.error('Error getting stats:', error);
                }
            }
        }, 2000);
    }

    updateVideoStats(stats) {
        let inboundVideo = null;
        let outboundVideo = null;
        
        stats.forEach(report => {
            if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
                inboundVideo = report;
            } else if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
                outboundVideo = report;
            }
        });

        const statsDiv = document.getElementById('videoStats');
        let statsText = '';
        
        if (inboundVideo) {
            const fps = inboundVideo.framesPerSecond || 0;
            const resolution = `${inboundVideo.frameWidth || 0}x${inboundVideo.frameHeight || 0}`;
            statsText += `📥 ${resolution} @${fps}fps\n`;
        }
        
        if (outboundVideo) {
            const fps = outboundVideo.framesPerSecond || 0;
            const resolution = `${outboundVideo.frameWidth || 0}x${outboundVideo.frameHeight || 0}`;
            statsText += `📤 ${resolution} @${fps}fps`;
        }
        
        statsDiv.textContent = statsText;
    }

    clearVideoStats() {
        document.getElementById('videoStats').textContent = '';
    }

    updateStatus(message, type) {
        const statusEl = document.getElementById('status');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
    }

    updateConnectionStatus(status) {
        document.getElementById('connectionStatus').textContent = status;
    }

    updateRoomInfo(info) {
        document.getElementById('roomInfo').textContent = info;
    }

    updateNetworkInfo(info) {
        document.getElementById('networkInfo').textContent = info;
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorModal').classList.remove('hidden');
    }

    hideError() {
        document.getElementById('errorModal').classList.add('hidden');
    }

    showLoading(message) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.querySelector('p').textContent = message;
        overlay.classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    resetUI() {
        document.getElementById('joinBtn').disabled = true;
        document.getElementById('callBtn').disabled = true;
        document.getElementById('hangupBtn').disabled = true;
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendBtn').disabled = true;
        
        this.updateRoomInfo('Not in a room');
        this.updateNetworkInfo('Server: Disconnected');
        this.updateConnectionStatus('Disconnected');
    }

    cleanup() {
        if (this.socket) {
            this.socket.close();
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        this.hangUp();
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new P2PVideoCall();
});
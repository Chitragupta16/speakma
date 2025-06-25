
# SpeakMa - WebRTC P2P Video Calling Application

A lightweight, peer-to-peer video calling application built with WebRTC for local area network (LAN) communication. SpeakMa enables real-time video calls between browsers without requiring external servers or cloud services.

## Features

- **Real-time Video Calling**: High-quality video and audio communication  
- **Peer-to-Peer Connection**: Direct browser-to-browser communication using WebRTC  
- **LAN Support**: Optimized for local network usage  
- **Text Chat**: Built-in chat functionality during video calls  
- **Media Controls**: Toggle video/audio on/off during calls  
- **Room-based System**: Join rooms using simple room IDs  
- **Connection Statistics**: Real-time video quality metrics  
- **Auto-reconnection**: Automatic server reconnection on network issues  

## Technology Stack

### Frontend
- **HTML5**: Structure and video elements  
- **CSS3**: Modern styling with gradients, animations, and responsive design  
- **Vanilla JavaScript**: Client-side WebRTC implementation  
- **WebRTC API**: Peer-to-peer communication  
- **WebSocket**: Real-time signaling communication  

### Backend
- **Node.js**: Server runtime  
- **WebSocket (ws)**: Signaling server implementation  
- **HTTP Server**: Static file serving and health checks  

### WebRTC Components Used
- **RTCPeerConnection**: Main WebRTC connection management  
- **MediaDevices API**: Camera and microphone access  
- **RTCDataChannel**: Text chat functionality  
- **ICE Candidates**: Network connectivity establishment  
- **STUN Servers**: NAT traversal (Google's public STUN servers)  

## Architecture

The application follows a client-server architecture where:

1. **Signaling Server**: Facilitates initial connection setup and room management  
2. **WebRTC Peers**: Direct browser-to-browser communication for media  
3. **Data Channels**: Peer-to-peer text messaging  

```
Client A  <---> Signaling Server <---> Client B
    |                                    |
    +------------ WebRTC P2P ------------+
```

## Prerequisites

- Node.js (version 14.0.0 or higher)  
- Modern web browser with WebRTC support  
- Network connectivity between devices (LAN or internet)  

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd speakma
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on port `8080` by default. You can specify a different port using the `PORT` environment variable:

```bash
PORT=3000 npm start
```

## Usage

1. **Start the server** using one of the commands above  
2. **Access the application**:
   - Open your browser and navigate to `http://localhost:8080`
   - Or use your local IP address (displayed in console) to connect from other devices  
3. **Join a room**:
   - Enter a room ID (e.g., `room123`)
   - Click **Join Room**
   - Share the same room ID with other participants  
4. **Start a call**:
   - Click **Start Call** to initiate the connection
   - Allow camera and microphone permissions when prompted
   - Wait for other participants to join  
5. **During the call**:
   - Use video/audio toggle buttons to control media  
   - Send text messages using the chat feature  
   - View connection statistics in the bottom-right corner  

## Network Configuration

### LAN Usage
The application automatically displays available network interfaces. Connect devices to the same network and use the displayed IP addresses.

### Firewall Considerations
Ensure the following ports are accessible:
- **8080** (or your chosen port): WebSocket signaling  
- **WebRTC ports**: Usually handled automatically by the browser  

## Project Structure

```
speakma/
├── client/
│   ├── index.html          # Main HTML interface
│   ├── script.js           # WebRTC client implementation
│   └── styles.css          # CSS styling
├── server/
│   └── server.js           # WebSocket signaling server
├── package.json            # Node.js dependencies and scripts
└── README.md               # This file
```

## API Endpoints

### HTTP Endpoints
- `GET /` - Main application interface  
- `GET /health` - Server health check and statistics  

### WebSocket Messages
- `join` - Join a room  
- `leave` - Leave current room  
- `offer` - WebRTC offer signal  
- `answer` - WebRTC answer signal  
- `ice-candidate` - ICE candidate exchange  

## Configuration Options

### Media Settings
The application requests high-quality media by default:
- **Video**: 1280x720 at 30fps  
- **Audio**: Echo cancellation, noise suppression, auto gain control  

### WebRTC Configuration
Uses Google's public STUN servers:
- `stun:stun.l.google.com:19302`  
- `stun:stun1.l.google.com:19302`  

## Troubleshooting

### Common Issues

1. **Camera/Microphone not working**  
   - Check browser permissions  
   - Ensure HTTPS is used for production (required for `getUserMedia`)  
   - Verify devices are not being used by other applications  

2. **Connection fails**  
   - Check network connectivity  
   - Verify both devices can reach the signaling server  
   - Ensure firewall allows WebRTC traffic
     
3. **Poor video quality**  
   - Check network bandwidth  
   - Reduce video quality in browser settings if needed  


## Development

### Adding Features
The modular design makes it easy to extend:
- Modify `client/script.js` for client-side features  
- Update `server/server.js` for server-side functionality  
- Enhance `client/styles.css` for UI improvements  

### Testing
Currently I have used only basic console logging. To add comprehensive testing:
```bash
npm test
```

## Security Considerations

- The application is designed for trusted LAN environments  
- For production use, implement:
  - HTTPS/WSS encryption  
  - User authentication  
  - Room access controls  
  - Rate limiting  



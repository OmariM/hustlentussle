# Cross-Device Battle Sessions - Setup Guide

This guide explains how to set up and use the new cross-device functionality in Hustle n' Tussle, allowing you to start a battle on one device (like your computer) and join it from another device (like your phone) with real-time synchronization.

## 🚀 Quick Start

### Prerequisites

Make sure you have the updated dependencies installed:

```bash
pip install -r requirements.txt
```

New dependencies added:
- `flask-socketio>=5.3.0` - For real-time WebSocket communication
- `qrcode>=7.4.2` - For generating QR codes
- `pillow>=10.0.0` - For QR code image processing

### Starting the Application

Run the application as usual:

```bash
python web/app.py
```

The app now supports WebSocket connections for real-time synchronization.

## 📱 How to Use Cross-Device Functionality

### Method 1: QR Code (Recommended)

1. **Start a battle** on your primary device (computer)
2. **Click "📱 Share Battle"** button on the battle screen
3. **Scan the QR code** with your phone's camera
4. **Your phone will automatically join** the battle session
5. **Both devices stay synced** in real-time!

### Method 2: Share Code

1. **Start a battle** on your primary device
2. **Click "📱 Share Battle"** button
3. **Share the 6-digit code** (e.g., "ABC123") with others
4. **On the other device**, click "Join Battle" from the home screen
5. **Enter the share code** and click "Join Battle"

### Method 3: Direct Link

1. **Start a battle** on your primary device
2. **Click "📱 Share Battle"** button
3. **Copy the direct link** and send it to others
4. **Open the link** on any device to automatically join

## ✨ Features

### Real-Time Synchronization

- **Live score updates** across all connected devices
- **Voting results** appear instantly on all devices
- **Round progression** syncs automatically
- **Battle state** stays consistent everywhere

### User-Friendly Sharing

- **QR codes** for easy mobile access
- **6-digit codes** for manual entry
- **Direct links** for sharing via messaging apps
- **One-hour expiration** for security

### Visual Indicators

- **Sync indicator** in top-right corner shows connection status
- **"Synced (Joined)"** appears on joined devices
- **Real-time notifications** for important events

## 🔧 Technical Details

### Architecture

The cross-device functionality uses:

- **Flask-SocketIO** for real-time WebSocket communication
- **Session sharing codes** that map to active battle sessions
- **QR code generation** for easy mobile access
- **Device ID tracking** for managing multiple connections

### Security Features

- **Share codes expire** after 1 hour for security
- **Session validation** prevents joining invalid battles
- **Device identification** tracks connected devices
- **Secure code generation** using cryptographically strong randomness

### API Endpoints

New endpoints added:

- `POST /api/create_share_code` - Generate sharing code and QR code
- `POST /api/join_session` - Join existing session with share code
- `GET /join/<share_code>` - Direct link for joining sessions
- `GET /api/session_status/<session_id>` - Check session status

### WebSocket Events

Real-time events:

- `game_update` - Broadcasts game state changes
- `scores_update` - Live score synchronization
- `voting_complete` - Voting results distribution
- `next_round` - Round progression updates

## 🛠 Troubleshooting

### Common Issues

**"Failed to create share code"**
- Make sure you have an active battle session running
- Check that the session ID is valid

**"Invalid or expired share code"**
- Share codes expire after 1 hour
- Generate a new share code from the host device
- Ensure the code is entered correctly (6 characters)

**"Connection issues"**
- Check your internet connection
- Make sure both devices are connected to the internet
- Try refreshing the page and rejoining

**"Sync indicator shows disconnected"**
- This is normal briefly when loading
- If persistent, check your network connection
- The app will automatically reconnect

### Browser Compatibility

- **Desktop**: Chrome, Firefox, Safari, Edge (latest versions)
- **Mobile**: Chrome Mobile, Safari Mobile, Samsung Internet
- **WebSocket support** required (all modern browsers)
- **QR code scanning** works with built-in camera apps

## 🎯 Use Cases

### Perfect For:

- **Multi-judge battles** where judges use their own devices
- **Audience participation** with phones/tablets
- **Large screen displays** while controlling from mobile
- **Backup device access** in case primary device fails
- **Remote judging** from different locations

### Example Scenarios:

1. **Dance Competition**
   - Start battle on laptop connected to projector
   - Judges join from their phones
   - Everyone sees results in real-time

2. **Home Party**
   - Host controls from phone
   - Friends join to vote
   - TV shows live scores

3. **Studio Practice**
   - Instructor starts on tablet
   - Students can follow along on phones
   - Real-time feedback and scoring

## 📋 Best Practices

### For Hosts:

- **Start the battle first** before sharing codes
- **Keep the host device connected** throughout the battle
- **Share QR codes** for fastest joining experience
- **Monitor connected devices** in the share modal

### For Participants:

- **Join as soon as possible** (codes expire in 1 hour)
- **Keep your device connected** to Wi-Fi or mobile data
- **Refresh if you lose connection** - you'll automatically rejoin
- **Use the sync indicator** to check connection status

### Network Requirements:

- **Stable internet connection** for all devices
- **WebSocket support** (enabled by default in modern browsers)
- **HTTPS recommended** for production use
- **Same network not required** - works across different networks

## 🔮 Future Enhancements

Planned improvements:

- **Voice announcements** for battle updates
- **Push notifications** for mobile devices
- **Battle recording** and playback
- **Social media sharing** of results
- **Custom judge roles** and permissions

## 🐛 Reporting Issues

If you encounter any issues:

1. **Check the browser console** for error messages
2. **Note which devices/browsers** you're using
3. **Describe the steps** that led to the issue
4. **Include the session ID** if available
5. **Report on GitHub** with details

## 🎉 Conclusion

The cross-device functionality transforms Hustle n' Tussle from a single-device app into a collaborative, multi-device experience. Whether you're running a competition, practicing with friends, or just having fun, the seamless synchronization makes everyone feel connected to the action!

Happy dancing! 🕺💃
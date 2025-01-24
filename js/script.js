const muteButton = document.getElementById("muteButton");
const iconButton = document.querySelector(".iconButton");
const usersCon = document.getElementById("users");

// آدرس WebSocket سرور خود را قرار دهید
const socket = new WebSocket("wss://soket-app.liara.run/");

let localStream;
let isMuted = false;
let myId;
const peers = {}; // برای مدیریت PeerConnection‌ها

// مدیریت میکروفون
function toggleMute() {
  if (!localStream) {
    console.error("Local stream not loaded!");
    return;
  }

  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) {
    console.error("No audio track found!");
    return;
  }

  audioTrack.enabled = !audioTrack.enabled;
  isMuted = !isMuted;

  iconButton.setAttribute(
    "src",
    audioTrack.enabled
      ? "./images/microphone-solid.png"
      : "./images/microphone-off-solid.png"
  );

  console.log("Audio track enabled:", audioTrack.enabled);
}

// مدیریت اتصال WebSocket
function waitForWebSocketOpen() {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) {
      resolve();
    } else {
      socket.onopen = () => resolve();
      socket.onerror = (error) => reject(error);
    }
  });
}

// ارسال پیام از طریق WebSocket
async function sendMessage(message) {
  try {
    await waitForWebSocketOpen();
    socket.send(JSON.stringify(message));
  } catch (error) {
    console.error("Error during WebSocket communication:", error);
  }
}

// مدیریت پیام‌های دریافتی از WebSocket
socket.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "id":
      myId = data.id;
      console.log(`My ID: ${myId}`);
      break;

    case "offer":
      if (!peers[data.senderId]) {
        peers[data.senderId] = createPeerConnection(data.senderId);
      }
      await peers[data.senderId].setRemoteDescription(
        new RTCSessionDescription(data)
      );
      const answer = await peers[data.senderId].createAnswer();
      await peers[data.senderId].setLocalDescription(answer);
      sendMessage({
        type: "answer",
        sdp: peers[data.senderId].localDescription.sdp,
        senderId: myId,
        receiverId: data.senderId,
      });
      break;

    case "answer":
      if (peers[data.senderId]) {
        await peers[data.senderId].setRemoteDescription(
          new RTCSessionDescription(data)
        );
      }
      break;

    case "candidate":
      if (peers[data.senderId]) {
        await peers[data.senderId].addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      }
      break;

    case "newUser":
      if (!peers[data.senderId]) {
        const peer = createPeerConnection(data.senderId);
        peers[data.senderId] = peer;
        startSignaling(peer, data.senderId);
      }
      break;

    case "userDisconnected":
      if (peers[data.senderId]) {
        peers[data.senderId].close();
        delete peers[data.senderId];
        console.log(`User ${data.senderId} disconnected`);
      }
      break;

    default:
      console.log("Unknown message type:", data);
  }
};

// ایجاد یک PeerConnection جدید
function createPeerConnection(userId) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      sendMessage({
        type: "candidate",
        candidate: event.candidate,
        senderId: myId,
        receiverId: userId,
      });
    }
  };

  peer.ontrack = (event) => {
    const remoteAudio = new Audio();
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play();
  };

  localStream.getTracks().forEach((track) => {
    peer.addTrack(track, localStream);
  });

  return peer;
}

// شروع استریم محلی
const connectToWebRTC = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    console.log("Local stream initialized");
  } catch (err) {
    console.error("Failed to access user media", err);
    setTimeout(connectToWebRTC, 1000);
  }
};

// شروع ایجاد Offer برای یک کاربر
async function startSignaling(peer, userId) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  sendMessage({
    type: "offer",
    sdp: peer.localDescription.sdp,
    senderId: myId,
    receiverId: userId,
  });
}

// مدیریت کلیک دکمه میوت
muteButton.addEventListener("click", toggleMute);

// شروع کار هنگام بارگذاری صفحه
window.onload = async () => {
  await connectToWebRTC();
};

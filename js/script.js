const muteButton = document.getElementById("muteButton");
const iconButton = document.querySelector(".iconButton");
const usersCon = document.querySelector(".users");

const socket = new WebSocket("wss://soket-app.liara.run/"); // آدرس WebSocket شما
const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }], // سرور STUN گوگل
});

let localStream;
let isMuted = false;

// مدیریت تغییرات دکمه میوت
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

  // تغییر وضعیت میوت
  audioTrack.enabled = !audioTrack.enabled;
  isMuted = !isMuted;

  // تغییر آیکون دکمه
  iconButton.setAttribute(
    "src",
    audioTrack.enabled
      ? "./images/microphone-solid.png"
      : "./images/microphone-off-solid.png"
  );

  console.log("Audio track enabled:", audioTrack.enabled);
}

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

async function sendMessage(message) {
  try {
    // منتظر بمانید تا WebSocket متصل شود
    await waitForWebSocketOpen();
    socket.send(JSON.stringify(message));
  } catch (error) {
    console.error("Error during WebSocket communication:", error);
  }
}

muteButton.addEventListener("click", toggleMute);

// پیام‌های WebSocket
socket.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "offer":
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data)
      );
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.send(JSON.stringify(peerConnection.localDescription));
      break;

    case "answer":
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data)
      );
      break;

    case "candidate":
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      break;

    case "clientsList":
      const date = new Date().toLocaleTimeString();
      usersCon.innerHTML = "";
      for (let user of data.clientIds) {
        usersCon.insertAdjacentHTML(
          "beforeend",
          `<div class="user">
              <div class="">
              <p class="id">${user}</p>
              <p class="time">${date}</p>
              </div>
              <img
              class="avatar"
              width="50px"
              src="images/user-circle-solid.png"
              alt=""/>
              </div>`
        );
      }
      break;

    case "newUser":
      console.log("A new user has joined");
      await connectToWebRTC(); // وقتی کاربر جدید می‌آید اتصال WebRTC برقرار می‌شود
      break;

    default:
      console.log("Unknown message type:", data);
  }
};

peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    socket.send(
      JSON.stringify({ type: "candidate", candidate: event.candidate })
    );
  }
};

// ارسال و دریافت استریم صوتی
peerConnection.ontrack = (event) => {
  const remoteAudio = new Audio();
  remoteAudio.srcObject = event.streams[0];
  remoteAudio.play();
};

// شروع تماس WebRTC
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

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    startSignaling();
  } catch (err) {
    console.error("Failed to access user media", err);
    setTimeout(connectToWebRTC, 1000); // تلاش مجدد در صورت خطا
  }
};

// ایجاد Offer برای شروع تماس
async function startSignaling() {
  try {
    // منتظر بمانید تا WebSocket متصل شود
    await waitForWebSocketOpen();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // حالا که WebSocket آماده است، پیام را ارسال کنید
    socket.send(JSON.stringify(peerConnection.localDescription));
  } catch (error) {
    console.error("Error during WebSocket communication:", error);
  }
}

// زمانی که صفحه لود می‌شود، اتصال WebRTC برقرار می‌شود
window.onload = connectToWebRTC

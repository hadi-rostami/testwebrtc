const muteButton = document.getElementById("muteButton");
const iconButton = document.querySelector(".iconButton");
const usersCon = document.querySelector(".users");

const socket = new WebSocket("wss://soket-app.liara.run/");

let peerConnections = {};
let localStream;
let isMuted = false;
let myID;

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case "id":
      myID = message.id;

      console.log("Your client ID:", message.id);
      break;

    case "newUser":
    case "userDisconnected":
      updateUsersList(message.clientIds);
      break;

    case "offer":
      handleOffer(message);
      break;

    case "answer":
      handleAnswer(message);
      break;

    case "candidate":
      handleCandidate(message);
      break;

    default:
      console.log("Unknown message type:", message.type);
  }
};

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
    await waitForWebSocketOpen();
    socket.send(JSON.stringify(message));
  } catch (error) {
    console.error("Error during WebSocket communication:", error);
  }
}

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

function createPeerConnection(userId, type = undefined) {
  const peerConnection = new RTCPeerConnection();
  peerConnections[userId] = peerConnection;
  localStream
    .getTracks()
    .forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendMessage({ type: "candidate", candidate: event.candidate });
    }
  };

  peerConnection.ontrack = (event) => {
    const remoteAudio = new Audio();
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play();
  };
  if (type === "offer")
    return peerConnection.createOffer().then((offer) => {
      return offer;
    });
  return peerConnection;
}

///
function updateUsersList(clientIds) {
  const date = new Date().toLocaleTimeString();
  usersCon.innerHTML = "";
  for (let user of clientIds) {
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
}

async function handleOffer(message) {
  console.log(message);

  let peerConnection = peerConnections[message.senderId];

  if (!peerConnection) {
    peerConnection = createPeerConnection(message.senderId);
  }

  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(message.offer)
  );

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  sendMessage({ type: "answer", answer: peerConnection.localDescription });
}

function handleAnswer(message) {
  console.log(peerConnections);

  const peerConnection = peerConnections[message.senderId];
  peerConnection.setRemoteDescription(
    new RTCSessionDescription(message.answer)
  );
}

function handleCandidate(message) {
  console.log(message, peerConnections);

  const peerConnection = peerConnections[message.senderId];
  peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
}

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

    sendMessage({
      type: "offer",
      offer: await createPeerConnection(myID, "offer"),
    });
  } catch (err) {
    console.error("Failed to access user media", err);
    setTimeout(connectToWebRTC, 1000);
  }
};

muteButton.addEventListener("click", toggleMute);
window.onload = connectToWebRTC;

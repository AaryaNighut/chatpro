export const getLocalStream = async () => {
  return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
};

export const createPeerConnection = (onIceCandidate, onTrackCallback) => {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  });

  pc.onicecandidate = (event) => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(event.candidate);
    }
  };

  pc.ontrack = (event) => {
    const [remoteStream] = event.streams;
    if (onTrackCallback) onTrackCallback(remoteStream);
  };

  return pc;
};

export const addLocalTracks = (pc, stream) => {
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });
};

export const createOffer = async (pc) => {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
};

export const createAnswer = async (pc) => {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
};

export const handleOffer = async (pc, offer) => {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
};

export const handleAnswer = async (pc, answer) => {
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
};

export const handleICECandidate = async (pc, candidate) => {
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error('Error adding received ice candidate', err);
  }
};

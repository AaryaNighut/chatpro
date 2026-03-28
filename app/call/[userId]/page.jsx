'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import socket from '@/lib/socket';

import {
  getLocalStream,
  createPeerConnection,
  addLocalTracks,
  createOffer,
  handleAnswer,
  handleICECandidate,
  handleOffer,
  createAnswer,
} from '@/lib/webrtc';

export default function CallPage() {
  const params = useParams();
  const userId = decodeURIComponent(params.userId);
  const [targetUser, setTargetUser] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');

  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const isRemoteDescriptionSet = useRef(false);
  const candidateQueueRef = useRef([]);
  const callTimerRef = useRef(null);
  const targetUserRef = useRef('');
  const isInitializedRef = useRef(false);

  const [users, setUsers] = useState([
    { id: 'user1@example.com', name: 'John Doe', email: 'user1@example.com', status: 'online', avatar: 'JD', lastSeen: 'Active now' },
    { id: 'user2@example.com', name: 'Jane Smith', email: 'user2@example.com', status: 'online', avatar: 'JS', lastSeen: 'Active 5m ago' },
    { id: 'user3@example.com', name: 'Mike Johnson', email: 'user3@example.com', status: 'away', avatar: 'MJ', lastSeen: 'Active 1h ago' },
    { id: 'user4@example.com', name: 'Sarah Wilson', email: 'user4@example.com', status: 'offline', avatar: 'SW', lastSeen: 'Active 2d ago' },
    { id: 'user5@example.com', name: 'Alex Brown', email: 'user5@example.com', status: 'online', avatar: 'AB', lastSeen: 'Active now' }
  ]);

  const [incomingCall, setIncomingCall] = useState(null);

  const generateAvatar = (name) => {
    const words = name.trim().split(' ');
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const addNewUser = () => {
    if (!newUserEmail.trim() || !newUserName.trim()) { alert('Please enter both email and name'); return; }
    if (users.some(user => user.email.toLowerCase() === newUserEmail.toLowerCase())) { alert('User with this email already exists'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail)) { alert('Please enter a valid email address'); return; }
    const newUser = {
      id: newUserEmail.toLowerCase(), name: newUserName.trim(), email: newUserEmail.toLowerCase(),
      status: 'offline', avatar: generateAvatar(newUserName), lastSeen: 'Never'
    };
    setUsers(prev => [...prev, newUser]);
    setNewUserEmail(''); setNewUserName(''); setShowAddUserModal(false);
  };

  useEffect(() => {
    if (isCallActive) {
      callTimerRef.current = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    } else {
      if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
      setCallDuration(0);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [isCallActive]);

  useEffect(() => {
    initCall();
    return () => {
      socket.off('offer'); socket.off('answer'); socket.off('ice-candidate'); socket.off('call-ended');
      socket.disconnect();
      if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      setIsCallActive(true);
    }
  }, [remoteStream]);

  useEffect(() => { targetUserRef.current = targetUser; }, [targetUser]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ✅ KEY FIX: wrap socket.connect() in a Promise so register
  // is only emitted AFTER the connection is truly established
  const connectSocket = () => {
    return new Promise((resolve) => {
      if (socket.connected) {
        resolve();
        return;
      }
      socket.once('connect', () => {
        console.log('[Socket] Connected:', socket.id);
        resolve();
      });
      socket.connect();
    });
  };

  const initCall = async () => {
    try {
      // ✅ Wait for real connection before doing anything
      await connectSocket();

      // ✅ Register only after socket is truly connected
      socket.emit('register', userId);
      console.log('[Socket] Registered:', userId);

      const stream = await getLocalStream();
      console.log('[Media] Got local stream');
      setLocalStream(stream);

      const peer = createPeerConnection(
        (candidate) => {
          if (isRemoteDescriptionSet.current) {
            socket.emit('ice-candidate', {
              to: targetUserRef.current,
              candidate,
              from: userId,
            });
            console.log('[ICE] Candidate sent to', targetUserRef.current);
          } else {
            candidateQueueRef.current.push(candidate);
            console.log('[ICE] Candidate queued (remote not ready)');
          }
        },
        (remote) => {
          console.log('[Peer] Remote stream received');
          setRemoteStream(remote);
        }
      );

      peerRef.current = peer;
      addLocalTracks(peer, stream);

      // ✅ Remove any old listeners before adding new ones (prevents duplicates on re-render)
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('call-ended');

      socket.on('offer', async (data) => {
        console.log('[Socket] Offer received from:', data.from);
        setIncomingCall({ from: data.from, offer: data.offer });
      });

      socket.on('answer', async (data) => {
        console.log('[Socket] Answer received');
        await handleAnswer(peerRef.current, data.answer);
        // ✅ Set remote description flag here too (caller side)
        isRemoteDescriptionSet.current = true;
        // ✅ Flush any queued ICE candidates now that remote description is set
        for (const c of candidateQueueRef.current) {
          try {
            await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
            console.log('[ICE] Flushed queued candidate after answer');
          } catch (e) {
            console.error('[ICE] Failed to flush queued candidate:', e);
          }
        }
        candidateQueueRef.current = [];
      });

      socket.on('ice-candidate', async (data) => {
        if (!isRemoteDescriptionSet.current) {
          candidateQueueRef.current.push(data.candidate);
          console.log('[ICE] Queued incoming candidate');
        } else {
          try {
            await handleICECandidate(peerRef.current, data.candidate);
            console.log('[ICE] Candidate added');
          } catch (e) {
            console.error('[ICE] Error adding candidate:', e);
          }
        }
      });

      socket.on('call-ended', () => {
        console.log('[Socket] Call ended by remote');
        stopCall();
      });

      isInitializedRef.current = true;
      console.log('[Init] Ready for calls');

    } catch (err) {
      console.error('[Init] Error:', err);
      alert('Microphone or camera access is required.');
    }
  };

  const stopCall = () => {
    try {
      if (localStream) localStream.getTracks().forEach(track => track.stop());
      if (remoteStream) remoteStream.getTracks().forEach(track => track.stop());
      if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
      if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }

      socket.emit('call-ended', { to: targetUserRef.current, from: userId });

      setIsCallActive(false);
      setCallDuration(0);
      setLocalStream(null);
      setRemoteStream(null);
      setTargetUser('');
      targetUserRef.current = '';
      isRemoteDescriptionSet.current = false;
      candidateQueueRef.current = [];

      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      console.error('[StopCall] Error:', err);
      window.location.reload();
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) { videoTrack.enabled = !videoTrack.enabled; setIsVideoEnabled(videoTrack.enabled); }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setIsAudioEnabled(audioTrack.enabled); }
    }
  };

  const acceptCall = async () => {
    if (!incomingCall || !peerRef.current) return;
    try {
      await handleOffer(peerRef.current, incomingCall.offer);
      isRemoteDescriptionSet.current = true;

      for (const c of candidateQueueRef.current) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
          console.log('[ICE] Queued candidate added');
        } catch (e) {
          console.error('[ICE] Failed queued candidate:', e);
        }
      }
      candidateQueueRef.current = [];

      const answer = await createAnswer(peerRef.current);
      socket.emit('answer', { to: incomingCall.from, answer, from: userId });
      console.log('[Socket] Answer sent to', incomingCall.from);

      setTargetUser(incomingCall.from);
      targetUserRef.current = incomingCall.from;
    } catch (err) {
      console.error('[AcceptCall] Error:', err);
    }
    setIncomingCall(null);
  };

  const rejectCall = () => {
    socket.emit('call-rejected', { to: incomingCall.from, from: userId });
    setIncomingCall(null);
  };

  const startCall = async (userToCall) => {
    if (!peerRef.current || !isInitializedRef.current) {
      console.warn('[StartCall] Not ready yet');
      return;
    }
    setTargetUser(userToCall);
    targetUserRef.current = userToCall;

    const offer = await createOffer(peerRef.current);
    socket.emit('offer', { to: userToCall, offer, from: userId });
    console.log('[Socket] Offer sent to', userToCall);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  };

  const getSelectedUser = () => users.find(user => user.id === targetUser);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-80 bg-white shadow-lg border-r border-gray-200 flex flex-col">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
            <h1 className="text-xl font-bold text-white mb-1">Video Calls</h1>
            <p className="text-blue-100 text-sm">Connected as: {userId}</p>
          </div>

          <div className="p-4 border-b border-gray-200">
            <button
              onClick={() => setShowAddUserModal(true)}
              className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-2 px-4 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add New Contact
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Contacts ({users.filter(u => u.id !== userId).length})
              </h2>
              <div className="space-y-2">
                {users.filter(user => user.id !== userId).map((user) => (
                  <div
                    key={user.id}
                    className={`p-4 rounded-xl transition-all duration-200 cursor-pointer border-2 ${
                      targetUser === user.id ? 'bg-blue-50 border-blue-200 shadow-md' : 'bg-gray-50 border-transparent hover:bg-gray-100 hover:shadow-sm'
                    }`}
                    onClick={() => !isCallActive && setTargetUser(user.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                            {user.avatar}
                          </div>
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${getStatusColor(user.status)}`}></div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{user.name}</p>
                          <p className="text-sm text-gray-500 truncate">{user.email}</p>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.status === 'online' ? 'bg-green-100 text-green-800' :
                        user.status === 'away' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {user.status}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500 truncate">{user.lastSeen}</p>
                      {!isCallActive && targetUser === user.id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); startCall(user.id); }}
                          className="bg-gradient-to-r from-green-500 to-green-600 text-white p-2 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-md hover:shadow-lg"
                          title="Start video call"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          <div className="bg-white shadow-sm border-b border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {getSelectedUser() ? (
                  <>
                    <div className="relative">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                        {getSelectedUser().avatar}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(getSelectedUser().status)}`}></div>
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-800">{getSelectedUser().name}</h2>
                      <p className="text-sm text-gray-500">{getSelectedUser().email}</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <h2 className="text-xl font-semibold text-gray-800">Select a contact to call</h2>
                    <p className="text-sm text-gray-500">Choose someone from the sidebar to start a video call</p>
                  </div>
                )}
              </div>
              {isCallActive && (
                <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                  {formatTime(callDuration)}
                </span>
              )}
            </div>
          </div>

          {(isCallActive || localStream) && (
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex justify-center items-center gap-4 flex-wrap">
                <button onClick={toggleVideo} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${isVideoEnabled ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isVideoEnabled
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />}
                  </svg>
                  {isVideoEnabled ? 'Camera On' : 'Camera Off'}
                </button>

                <button onClick={toggleAudio} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${isAudioEnabled ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isAudioEnabled
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />}
                  </svg>
                  {isAudioEnabled ? 'Mic On' : 'Mic Off'}
                </button>

                <button onClick={stopCall} className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 text-white px-8 py-3 rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-md hover:shadow-lg font-medium">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l1.664 1.664M21 21l-1.5-1.5M21 21l-18-18" />
                  </svg>
                  End Call
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 p-6">
            {localStream ? (
              <div className="grid lg:grid-cols-2 gap-6 h-full">
                <div className="bg-white rounded-xl shadow-lg overflow-hidden h-full">
                  <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-4">
                    <h3 className="text-lg font-semibold text-white flex items-center">
                      <div className="w-3 h-3 bg-green-300 rounded-full mr-3 animate-pulse"></div>
                      You (Local)
                      {!isVideoEnabled && <span className="ml-2 text-sm bg-red-500 bg-opacity-30 px-2 py-1 rounded">Camera Off</span>}
                      {!isAudioEnabled && <span className="ml-2 text-sm bg-red-500 bg-opacity-30 px-2 py-1 rounded">Muted</span>}
                    </h3>
                  </div>
                  <div className="p-6 h-full">
                    <div className="relative h-full">
                      <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover bg-gray-900 rounded-lg shadow-inner" />
                      {!isVideoEnabled && localStream && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-lg">
                          <div className="text-white text-center">
                            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                            </div>
                            <p>Camera is off</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg overflow-hidden h-full">
                  <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4">
                    <h3 className="text-lg font-semibold text-white flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${remoteStream ? 'bg-purple-300 animate-pulse' : 'bg-gray-400'}`}></div>
                      {getSelectedUser() ? getSelectedUser().name : 'Remote User'}
                    </h3>
                  </div>
                  <div className="p-6 h-full">
                    <div className="relative h-full">
                      <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover bg-gray-900 rounded-lg shadow-inner" />
                      {!remoteStream && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-lg">
                          <div className="text-gray-400 text-center">
                            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                            </div>
                            <p>Waiting for remote user...</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 text-lg">Setting up your camera and microphone...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Add New Contact</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input type="text" value={newUserName} onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter full name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter email address" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowAddUserModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
              <button onClick={addNewUser} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg">Add Contact</button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xl mx-auto mb-4">
                {users.find(u => u.id === incomingCall.from)?.avatar || 'U'}
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Incoming Call</h3>
              <p className="text-gray-600 mb-6">
                {users.find(u => u.id === incomingCall.from)?.name || incomingCall.from} is calling you
              </p>
              <div className="flex justify-center space-x-4">
                <button onClick={rejectCall} className="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-3 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l1.664 1.664M21 21l-1.5-1.5M21 21l-18-18" />
                  </svg>
                  Decline
                </button>
                <button onClick={acceptCall} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import socket from "@/lib/socket";
import { Search, Plus, Send, Users, Settings, MoreVertical, Trash2, Archive, X } from "lucide-react";

const initialUsers = [
  "aaruser2@gmail.com",
  "aaruser1@gmail.com",
  "waghlucky63@gmail.com",
];

export default function ChatPage() {
  const { userId } = useParams();
  const currentUser = decodeURIComponent(userId);
  const chatEndRef = useRef(null);
  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [chats, setChats] = useState({});
  const [availableUsers, setAvailableUsers] = useState(initialUsers);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [addUserError, setAddUserError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [isTyping, setIsTyping] = useState(false);

  // Load data from localStorage on mount
  useEffect(() => {
    if (!currentUser) return;

    const savedChats = localStorage.getItem(`chats_${currentUser}`);
    const savedUsers = localStorage.getItem(`users_${currentUser}`);

    if (savedChats) {
      try {
        setChats(JSON.parse(savedChats));
      } catch (e) {
        console.error("Error loading chats:", e);
      }
    }

    if (savedUsers) {
      try {
        const parsed = JSON.parse(savedUsers);
        setAvailableUsers([...new Set([...initialUsers, ...parsed])]);
      } catch (e) {
        console.error("Error loading users:", e);
      }
    }
  }, [currentUser]);

  // Save chats to localStorage whenever they change
  useEffect(() => {
    if (!currentUser || Object.keys(chats).length === 0) return;
    localStorage.setItem(`chats_${currentUser}`, JSON.stringify(chats));
  }, [chats, currentUser]);

  // Save users to localStorage whenever they change
  useEffect(() => {
    if (!currentUser) return;
    const customUsers = availableUsers.filter(u => !initialUsers.includes(u));
    localStorage.setItem(`users_${currentUser}`, JSON.stringify(customUsers));
  }, [availableUsers, currentUser]);

  // Socket setup
  useEffect(() => {
    if (!currentUser) return;

    socket.connect();
    socket.emit("register", currentUser);

    socket.on("receive-message", (data) => {
      setChats((prev) => ({
        ...prev,
        [data.from]: [
          ...(prev[data.from] || []),
          { text: data.message, type: 'received', from: data.from, timestamp: Date.now(), read: false }
        ]
      }));
      
      // Show typing indicator briefly
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 1000);
    });

    return () => {
      socket.disconnect();
    };
  }, [currentUser]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, selectedRecipient]);

  // Mark messages as read when opening a chat
  useEffect(() => {
    if (selectedRecipient && chats[selectedRecipient]) {
      setChats(prev => ({
        ...prev,
        [selectedRecipient]: prev[selectedRecipient].map(msg => ({ ...msg, read: true }))
      }));
    }
  }, [selectedRecipient]);

  // Default recipient selection
  useEffect(() => {
    const otherUsers = availableUsers.filter((u) => u !== currentUser);
    if (!selectedRecipient && otherUsers.length > 0) {
      setSelectedRecipient(otherUsers[0]);
    }
  }, [currentUser, availableUsers, selectedRecipient]);

  const sendMessage = () => {
    if (!message.trim() || !selectedRecipient) return;

    socket.emit("send-message", {
      to: selectedRecipient,
      message,
    });

    setChats((prev) => ({
      ...prev,
      [selectedRecipient]: [
        ...(prev[selectedRecipient] || []),
        { text: message, type: 'sent', to: selectedRecipient, timestamp: Date.now(), read: true }
      ]
    }));

    setMessage("");
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleAddUser = () => {
    setAddUserError("");
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail)) {
      setAddUserError("Please enter a valid email address");
      return;
    }

    if (availableUsers.includes(newUserEmail)) {
      setAddUserError("User already exists in your contacts");
      return;
    }

    if (newUserEmail === currentUser) {
      setAddUserError("You cannot add yourself as a contact");
      return;
    }

    setAvailableUsers(prev => [...prev, newUserEmail]);
    setNewUserEmail("");
    setShowAddUser(false);
    setAddUserError("");
  };

  const handleDeleteChat = (user) => {
    setChats(prev => {
      const newChats = { ...prev };
      delete newChats[user];
      return newChats;
    });
    setShowDeleteConfirm(null);
    if (selectedRecipient === user) {
      const otherUsers = availableUsers.filter(u => u !== currentUser && u !== user);
      setSelectedRecipient(otherUsers[0] || "");
    }
  };

  const handleRemoveContact = (user) => {
    setAvailableUsers(prev => prev.filter(u => u !== user));
    handleDeleteChat(user);
  };

  const clearAllChats = () => {
    if (window.confirm("Are you sure you want to clear all chats? This cannot be undone.")) {
      setChats({});
      localStorage.removeItem(`chats_${currentUser}`);
    }
  };

  const exportChats = () => {
    const dataStr = JSON.stringify(chats, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chat-backup-${Date.now()}.json`;
    link.click();
  };

  const currentChat = chats[selectedRecipient] || [];
  const filteredUsers = availableUsers
    .filter(u => u !== currentUser)
    .filter(u => u.toLowerCase().includes(searchQuery.toLowerCase()));

  const getUnreadCount = (user) => {
    if (!chats[user]) return 0;
    return chats[user].filter(msg => !msg.read && msg.type === 'received').length;
  };

  const totalUnread = availableUsers.reduce((acc, user) => acc + getUnreadCount(user), 0);

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex border border-gray-200">
        
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Sidebar Header */}
          <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center font-semibold text-lg">
                  {currentUser.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Messages</h2>
                  <p className="text-xs text-blue-100">{currentUser.split('@')[0]}</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowAddUser(true)}
                  className="p-2 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all duration-200"
                  title="Add contact"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-2 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all duration-200"
                  title="Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-200" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts..."
                className="w-full pl-10 pr-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
              />
            </div>
          </div>

          {/* Add User Modal */}
          {showAddUser && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800 text-sm">Add New Contact</h3>
                <button onClick={() => { setShowAddUser(false); setNewUserEmail(""); setAddUserError(""); }}>
                  <X className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                </button>
              </div>
              <div className="space-y-2">
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddUser()}
                  placeholder="Enter email address"
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  autoFocus
                />
                {addUserError && (
                  <p className="text-red-500 text-xs flex items-center space-x-1">
                    <span>⚠️</span>
                    <span>{addUserError}</span>
                  </p>
                )}
                <button
                  onClick={handleAddUser}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2.5 px-4 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all text-sm font-medium"
                >
                  Add Contact
                </button>
              </div>
            </div>
          )}

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800 text-sm">Settings</h3>
                <button onClick={() => setShowSettings(false)}>
                  <X className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                </button>
              </div>
              <div className="space-y-2">
                <button
                  onClick={exportChats}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-white rounded-lg transition-colors flex items-center space-x-2"
                >
                  <Archive className="w-4 h-4" />
                  <span>Export Chats</span>
                </button>
                <button
                  onClick={clearAllChats}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear All Chats</span>
                </button>
              </div>
            </div>
          )}

          {/* User List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center space-x-2">
                  <Users className="w-3 h-3" />
                  <span>Contacts ({filteredUsers.length})</span>
                </h3>
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {totalUnread}
                  </span>
                )}
              </div>
              
              {filteredUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm font-medium">No contacts found</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {searchQuery ? "Try a different search" : "Add someone to start chatting"}
                  </p>
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const hasMessages = chats[user]?.length > 0;
                  const lastMessage = hasMessages ? chats[user][chats[user].length - 1] : null;
                  const unreadCount = getUnreadCount(user);
                  
                  return (
                    <div
                      key={user}
                      className={`group relative p-3 rounded-xl cursor-pointer transition-all duration-200 mb-2 ${
                        selectedRecipient === user
                          ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 shadow-sm'
                          : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-3" onClick={() => setSelectedRecipient(user)}>
                        <div className="relative">
                          <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold shadow-md">
                            {user.charAt(0).toUpperCase()}
                          </div>
                          {unreadCount > 0 && (
                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-md">
                              {unreadCount}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {user.split('@')[0]}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {lastMessage ? 
                              <span className={unreadCount > 0 ? 'font-semibold text-gray-700' : ''}>
                                {lastMessage.type === 'sent' ? `You: ${lastMessage.text}` : lastMessage.text}
                              </span>
                              : 'No messages yet'
                            }
                          </p>
                        </div>
                      </div>
                      
                      {/* Context Menu */}
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm(user);
                          }}
                          className="p-1.5 bg-white rounded-lg shadow-md hover:bg-red-50 transition-colors"
                        >
                          <MoreVertical className="w-3.5 h-3.5 text-gray-600" />
                        </button>
                      </div>

                      {/* Delete Confirmation */}
                      {showDeleteConfirm === user && (
                        <div className="absolute inset-0 bg-white rounded-xl border-2 border-red-200 p-3 shadow-lg z-10">
                          <p className="text-xs font-medium text-gray-800 mb-2">Delete this chat?</p>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleDeleteChat(user)}
                              className="flex-1 bg-red-500 text-white py-1.5 px-2 rounded-lg hover:bg-red-600 text-xs font-medium"
                            >
                              Delete Chat
                            </button>
                            <button
                              onClick={() => handleRemoveContact(user)}
                              className="flex-1 bg-red-600 text-white py-1.5 px-2 rounded-lg hover:bg-red-700 text-xs font-medium"
                            >
                              Remove
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(null)}
                              className="px-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {/* Chat Header */}
          {selectedRecipient ? (
            <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold shadow-md">
                    {selectedRecipient.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {selectedRecipient.split('@')[0]}
                    </h2>
                    <p className="text-xs text-gray-500">{selectedRecipient}</p>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {currentChat.length} messages
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-400">Select a conversation</h2>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!selectedRecipient ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Send className="w-12 h-12 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">Welcome to Chat</h3>
                  <p className="text-gray-500 text-sm">Select a contact to start messaging</p>
                </div>
              </div>
            ) : currentChat.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-3xl">💬</span>
                  </div>
                  <p className="text-gray-500 text-sm">
                    No messages with <span className="font-semibold">{selectedRecipient.split('@')[0]}</span> yet
                  </p>
                  <p className="text-gray-400 text-xs mt-1">Send a message to start the conversation</p>
                </div>
              </div>
            ) : (
              <>
                {currentChat.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.type === 'sent' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl shadow-md ${
                        msg.type === 'sent'
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-br-sm'
                          : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                      }`}
                    >
                      <p className="text-sm leading-relaxed break-words">{msg.text}</p>
                      <div className="flex items-center justify-end space-x-1 mt-1">
                        <p className={`text-xs ${msg.type === 'sent' ? 'text-blue-100' : 'text-gray-400'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {msg.type === 'sent' && (
                          <span className="text-blue-100 text-xs">✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-sm shadow-md">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {/* Message Input */}
          <div className="bg-white border-t border-gray-200 p-4">
            <div className="flex space-x-3 items-end">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={selectedRecipient ? "Type a message..." : "Select a contact first..."}
                disabled={!selectedRecipient}
                rows="1"
                className="flex-1 p-3 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed resize-none text-sm"
                style={{ minHeight: '44px', maxHeight: '120px' }}
              />
              <button
                onClick={sendMessage}
                disabled={!message.trim() || !selectedRecipient}
                className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-3 rounded-2xl hover:from-blue-600 hover:to-indigo-700 focus:ring-2 focus:ring-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            {selectedRecipient && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                Press Enter to send • Shift + Enter for new line
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { API_BASE_URL } from '../services/api';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { 
  ArrowLeft, Copy, Check, Send, Image, 
  Volume2, Users, Eye, X, Loader, Trash2, LogOut
} from 'lucide-react';

interface Member {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface TypingUser {
  email: string;
  displayName: string;
}

interface Message {
  senderEmail: string;
  senderName: string;
  senderAvatar: string | null;
  messageType: string; // TEXT, IMAGE, VIDEO, AUDIO
  content: string;
  fileUrl: string | null;
  sentAt: string;
  isPruning?: boolean;
}

interface RoomDetails {
  roomId: string;
  name: string;
  preserveHistory: boolean;
  retentionPolicy: string;
  createdAt: string;
  ownerName: string;
}

const sanitizeFileUrl = (url: string | null): string => {
  if (!url) return '';
  if (url.startsWith('/')) {
    return `${API_BASE_URL}${url}`;
  }
  if (url.includes('localhost:') && !API_BASE_URL.includes('localhost:')) {
    return url.replace(/https?:\/\/localhost:\d+/, API_BASE_URL);
  }
  return url.replace('localhost:8080', 'localhost:8081');
};

export const ChatRoom: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  
  // Connection and Loading State
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Lightbox overlay for images
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const stompClientRef = useRef<Client | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [onlineEmails, setOnlineEmails] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  const isTypingRef = useRef(false);
  const stopTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendStopTyping = () => {
    if (isTypingRef.current && stompClientRef.current && connected) {
      isTypingRef.current = false;
      stompClientRef.current.publish({
        destination: `/app/chat.typing/${roomId}`,
        body: JSON.stringify({ isTyping: false })
      });
    }
    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current);
      stopTypingTimeoutRef.current = null;
    }
  };

  const handleInputChange = (value: string) => {
    setInputText(value);
    
    if (stompClientRef.current && connected) {
      if (!isTypingRef.current && value.trim().length > 0) {
        isTypingRef.current = true;
        stompClientRef.current.publish({
          destination: `/app/chat.typing/${roomId}`,
          body: JSON.stringify({ isTyping: true })
        });
      }
      
      if (stopTypingTimeoutRef.current) {
        clearTimeout(stopTypingTimeoutRef.current);
      }
      
      if (value.trim().length === 0) {
        sendStopTyping();
      } else {
        stopTypingTimeoutRef.current = setTimeout(() => {
          sendStopTyping();
        }, 2500);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (stopTypingTimeoutRef.current) {
        clearTimeout(stopTypingTimeoutRef.current);
      }
    };
  }, []);

  // Fetch initial room, members, and history
  useEffect(() => {
    if (!roomId) return;

    const loadRoomData = async () => {
      try {
        // Try joining the room (handles check for membership)
        const roomRes = await api.post<RoomDetails>(`/api/rooms/join/${roomId}`);
        setRoom(roomRes.data);

        // Fetch members
        const membersRes = await api.get<Member[]>(`/api/rooms/${roomId}/members`);
        setMembers(membersRes.data);

        // Fetch history
        const msgRes = await api.get<Message[]>(`/api/rooms/${roomId}/messages`);
        setMessages(msgRes.data);

        setLoading(false);
      } catch (err) {
        console.error('Failed to load room details or messages', err);
        navigate('/dashboard');
      }
    };

    loadRoomData();
  }, [roomId, navigate]);

  // Connect to Websocket STOMP Broker
  useEffect(() => {
    if (loading || !roomId || !token) return;

    // Create SockJS connection using STOMP client
    const socket = new SockJS(`${API_BASE_URL}/ws`);
    const client = new Client({
      webSocketFactory: () => socket,
      connectHeaders: {
        Authorization: `Bearer ${token}`
      },
      onConnect: () => {
        setConnected(true);
        // Subscribe to real-time broadcasts for the room
        client.subscribe(`/topic/room/${roomId}`, (message) => {
          const payload = JSON.parse(message.body) as Message;
          
          if (payload.messageType === 'JOIN') {
            setMembers((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.email === payload.senderEmail)) {
                return prev;
              }
              return [
                ...prev,
                {
                  id: Date.now(),
                  email: payload.senderEmail,
                  displayName: payload.senderName,
                  avatarUrl: payload.senderAvatar
                }
              ];
            });
          }

          if (payload.messageType === 'LEAVE') {
            setMembers((prev) => prev.filter((m) => m.email !== payload.senderEmail));
          }

          if (payload.messageType === 'KICK') {
            setMembers((prev) => prev.filter((m) => m.email !== payload.senderEmail));
            if (payload.senderEmail === user?.email) {
              alert('You have been kicked from this room by the owner.');
              navigate('/dashboard');
              return;
            }
          }

          if (payload.messageType === 'DELETE') {
            alert('This chat room has been deleted by the owner.');
            navigate('/dashboard');
            return;
          }

          if (payload.messageType === 'PRUNE') {
            const cutoffTime = new Date(payload.content).getTime();
            // 1. Mark expired messages as pruning
            setMessages((prev) => 
              prev.map((m) => 
                new Date(m.sentAt).getTime() < cutoffTime ? { ...m, isPruning: true } : m
              )
            );
            // 2. Actually filter them out of the state after the 500ms CSS animation finishes
            setTimeout(() => {
              setMessages((prev) => prev.filter((m) => !m.isPruning));
            }, 500);
            return;
          }
          
          setMessages((prev) => [...prev, payload]);
        });

        // Subscribe to presence list updates
        client.subscribe(`/topic/room/${roomId}/presence`, (message) => {
          const emails = JSON.parse(message.body) as string[];
          setOnlineEmails(emails);
        });

        // Subscribe to typing updates
        client.subscribe(`/topic/room/${roomId}/typing`, (message) => {
          const payload = JSON.parse(message.body) as {
            roomId: string;
            email: string;
            displayName: string;
            isTyping: boolean;
          };
          
          if (payload.email === user?.email) return;

          setTypingUsers((prev) => {
            if (payload.isTyping) {
              if (prev.some((u) => u.email === payload.email)) return prev;
              return [...prev, { email: payload.email, displayName: payload.displayName }];
            } else {
              return prev.filter((u) => u.email !== payload.email);
            }
          });
        });
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onStompError: (frame) => {
        console.error('Stomp connection error', frame.headers['message']);
      }
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }
    };
  }, [loading, roomId, token, navigate, user?.email]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendTextMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !stompClientRef.current || !connected) return;

    sendStopTyping();

    const payload = {
      messageType: 'TEXT',
      content: inputText.trim(),
      fileUrl: null
    };

    stompClientRef.current.publish({
      destination: `/app/chat.sendMessage/${roomId}`,
      body: JSON.stringify(payload)
    });

    setInputText('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !stompClientRef.current || !connected) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post<{ fileUrl: string }>('/api/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Classify file type
      let type = 'TEXT';
      const fileType = file.type.toLowerCase();
      if (fileType.startsWith('image/')) {
        type = 'IMAGE';
      } else if (fileType.startsWith('video/')) {
        type = 'VIDEO';
      } else if (fileType.startsWith('audio/')) {
        type = 'AUDIO';
      }

      // Send websocket message with attachment URL
      const payload = {
        messageType: type,
        content: file.name,
        fileUrl: response.data.fileUrl
      };

      stompClientRef.current.publish({
        destination: `/app/chat.sendMessage/${roomId}`,
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error('Media upload failed', err);
      alert('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const copyRoomId = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteRoom = async () => {
    if (!roomId) return;
    if (!window.confirm("Are you sure you want to delete this room? This will wipe all message history for all members.")) return;
    
    setActionLoading(true);
    try {
      await api.delete(`/api/rooms/${roomId}`);
      navigate('/dashboard');
    } catch (err) {
      console.error("Failed to delete room", err);
      alert("Failed to delete room. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!roomId) return;
    if (!window.confirm("Are you sure you want to leave this room?")) return;
    
    setActionLoading(true);
    try {
      await api.post(`/api/rooms/leave/${roomId}`);
      navigate('/dashboard');
    } catch (err) {
      console.error("Failed to leave room", err);
      alert("Failed to leave room. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleKickMember = async (memberEmail: string, memberName: string) => {
    if (!roomId) return;
    if (!window.confirm(`Are you sure you want to kick ${memberName} from this room?`)) return;

    setActionLoading(true);
    try {
      await api.post(`/api/rooms/kick/${roomId}?email=${encodeURIComponent(memberEmail)}`);
    } catch (err) {
      console.error("Failed to kick member", err);
      alert("Failed to kick member. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading chat assets...</p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '300px 1fr',
      height: '100vh',
      background: 'var(--bg-main)'
    }}>
      {/* Sidebar - Members & Room policy info */}
      <aside className="glass-panel" style={{
        margin: '16px',
        marginRight: '8px',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px',
        overflowY: 'hidden'
      }}>
        {/* Back and Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <button 
            onClick={() => navigate('/dashboard')} 
            className="btn-secondary" 
            style={{ padding: '8px', borderRadius: '50%' }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '700' }}>{room?.name}</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>by {room?.ownerName}</p>
          </div>
        </div>

        {/* Room Share Info */}
        <div style={{
          background: 'var(--bg-input)',
          padding: '12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-glass)',
          marginBottom: '20px'
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
            Room invite ID
          </span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-secondary)', fontWeight: '600', letterSpacing: '0.5px' }}>
              {roomId}
            </span>
            <button 
              onClick={copyRoomId} 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              {copied ? <Check size={16} color="var(--color-success)" /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        {/* Room Policy Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          color: !room?.preserveHistory
            ? '#fca5a5'
            : room?.retentionPolicy === 'FOREVER'
              ? 'var(--color-success)'
              : 'var(--color-secondary)',
          background: !room?.preserveHistory
            ? 'rgba(239, 68, 68, 0.05)'
            : room?.retentionPolicy === 'FOREVER'
              ? 'rgba(16, 185, 129, 0.05)'
              : 'rgba(0, 240, 255, 0.05)',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          border: !room?.preserveHistory
            ? '1px solid rgba(239,68,68,0.1)'
            : room?.retentionPolicy === 'FOREVER'
              ? '1px solid rgba(16,185,129,0.1)'
              : '1px solid rgba(0,240,255,0.1)',
          marginBottom: '24px'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: !room?.preserveHistory
              ? 'var(--color-danger)'
              : room?.retentionPolicy === 'FOREVER'
                ? 'var(--color-success)'
                : 'var(--color-secondary)',
            boxShadow: room?.preserveHistory && room?.retentionPolicy !== 'FOREVER'
              ? '0 0 8px var(--color-secondary)'
              : 'none'
          }}></div>
          {!room?.preserveHistory
            ? 'Ephemeral chat (no DB logging)'
            : room?.retentionPolicy === 'FOREVER'
              ? 'History logs saved in DB'
              : `Pruning: ${room?.retentionPolicy.replace('ONE_', '').toLowerCase()}`}
        </div>

        {/* Members list header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--text-muted)' }}>
          <Users size={16} />
          <span style={{ fontSize: '13px', fontWeight: '600', textTransform: 'uppercase' }}>
            Members ({members.length})
          </span>
        </div>

        {/* Members list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {members.map((member) => (
            <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px' }}>
              <div style={{ position: 'relative' }}>
                {member.avatarUrl ? (
                  <img 
                    src={sanitizeFileUrl(member.avatarUrl)} 
                    alt={member.displayName} 
                    style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--border-glass)' }}
                  />
                ) : (
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'var(--bg-input)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--border-glass)',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {member.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{
                  position: 'absolute',
                  bottom: '-2px',
                  right: '-2px',
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: onlineEmails.includes(member.email) ? 'var(--color-success)' : 'var(--text-muted)',
                  border: '2px solid var(--bg-main)',
                  boxShadow: onlineEmails.includes(member.email) ? '0 0 6px var(--color-success)' : 'none',
                  transition: 'var(--transition-smooth)'
                }}></div>
              </div>
              <span style={{ fontSize: '14px', fontWeight: '500' }}>{member.displayName}</span>
              {member.displayName === room?.ownerName ? (
                <span style={{ fontSize: '9px', background: 'var(--color-primary)', color: '#fff', padding: '1px 5px', borderRadius: '10px', marginLeft: 'auto' }}>
                  owner
                </span>
              ) : (
                room?.ownerName === user?.displayName && (
                  <button 
                    onClick={() => handleKickMember(member.email, member.displayName)}
                    className="btn-secondary"
                    style={{
                      marginLeft: 'auto',
                      padding: '2px 8px',
                      fontSize: '11px',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      color: '#fca5a5',
                      borderRadius: '4px'
                    }}
                    disabled={actionLoading}
                  >
                    Kick
                  </button>
                )
              )}
            </div>
          ))}
        </div>

        {/* Action Panel for Leaving / Deleting Room */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-glass)' }}>
          {room?.ownerName === user?.displayName ? (
            <button 
              onClick={handleDeleteRoom}
              className="btn-primary"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, var(--color-danger), #b91c1c)',
                boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)',
                padding: '10px',
                fontSize: '14px'
              }}
              disabled={actionLoading}
            >
              <Trash2 size={16} /> Delete Room
            </button>
          ) : (
            <button 
              onClick={handleLeaveRoom}
              className="btn-secondary"
              style={{
                width: '100%',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                padding: '10px',
                fontSize: '14px'
              }}
              disabled={actionLoading}
            >
              <LogOut size={16} /> Leave Room
            </button>
          )}
        </div>
      </aside>

      {/* Main chat window */}
      <main style={{
        margin: '16px',
        marginLeft: '8px',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 32px)',
        overflowY: 'hidden'
      }} className="glass-panel">
        
        {/* Top Connection Banner */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-glass)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '600' }}>Live Chat Session</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: connected ? 'var(--color-success)' : 'var(--color-danger)',
              boxShadow: connected ? '0 0 8px var(--color-success)' : 'none'
            }}></div>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {connected ? 'Connected' : 'Reconnecting...'}
            </span>
          </div>
        </div>

        {/* Message Feeds */}
        <div style={{
          flex: 1,
          padding: '24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {messages.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, flexDirection: 'column' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Beginning of the chat.</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>Send a text or attachment to get started.</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              if (msg.messageType === 'JOIN' || msg.messageType === 'LEAVE' || msg.messageType === 'KICK') {
                const isJoin = msg.messageType === 'JOIN';
                const isLeave = msg.messageType === 'LEAVE';
                const actionText = isJoin ? 'joined' : isLeave ? 'left' : 'was kicked from';

                return (
                  <div 
                    key={index}
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      width: '100%',
                      margin: '8px 0',
                      animation: 'messagePop 0.2s ease-out'
                    }}
                  >
                    <span className="glass-panel" style={{
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <span style={{ color: isJoin ? 'var(--color-secondary)' : '#fca5a5', fontWeight: '600' }}>{msg.senderName}</span> {actionText} the room
                    </span>
                  </div>
                );
              }

              const isSameSenderAndMinuteAsPrevious =
                index > 0 &&
                messages[index - 1].senderEmail === msg.senderEmail &&
                ['TEXT', 'IMAGE', 'AUDIO', 'VIDEO'].includes(messages[index - 1].messageType) &&
                new Date(messages[index - 1].sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ===
                new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              const isSameSenderAndMinuteAsNext =
                index < messages.length - 1 &&
                messages[index + 1].senderEmail === msg.senderEmail &&
                ['TEXT', 'IMAGE', 'AUDIO', 'VIDEO'].includes(messages[index + 1].messageType) &&
                new Date(messages[index + 1].sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ===
                new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              const isMine = msg.senderEmail === user?.email;
              return (
                <div 
                  key={index} 
                  className={msg.isPruning ? 'animate-disappear' : ''}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMine ? 'flex-end' : 'flex-start',
                    maxWidth: '70%',
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    animation: msg.isPruning ? 'none' : 'messagePop 0.25s ease-out',
                    marginBottom: isSameSenderAndMinuteAsNext ? '4px' : '16px'
                  }}
                >
                  {/* Sender Name and Avatar (other users) */}
                  {!isMine && !isSameSenderAndMinuteAsPrevious && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', marginLeft: '4px' }}>
                      {msg.senderAvatar ? (
                        <img 
                          src={sanitizeFileUrl(msg.senderAvatar)} 
                          alt={msg.senderName} 
                          style={{ width: '18px', height: '18px', borderRadius: '50%', border: '1px solid var(--border-glass)' }}
                        />
                      ) : (
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: 'var(--bg-input)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid var(--border-glass)',
                          fontSize: '8px',
                          fontWeight: '600'
                        }}>
                          {msg.senderName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {msg.senderName}
                      </span>
                    </div>
                  )}

                  {/* Render content based on type */}
                  <div style={{
                    padding: msg.messageType === 'IMAGE' ? '6px' : '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: isMine 
                      ? 'linear-gradient(135deg, var(--color-primary), #6a0dad)' 
                      : 'var(--bg-input)',
                    border: isMine ? 'none' : '1px solid var(--border-glass)',
                    color: '#fff',
                    boxShadow: isMine ? '0 4px 10px rgba(138,43,226,0.15)' : 'none'
                  }}>
                    {msg.messageType === 'TEXT' && (
                      <p style={{ fontSize: '15px', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{msg.content}</p>
                    )}

                    {msg.messageType === 'IMAGE' && msg.fileUrl && (
                      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', cursor: 'zoom-in' }} onClick={() => setLightboxImg(sanitizeFileUrl(msg.fileUrl))}>
                        <img 
                           src={sanitizeFileUrl(msg.fileUrl)} 
                          alt="Attachment" 
                          style={{ maxWidth: '300px', maxHeight: '200px', objectFit: 'cover', display: 'block', borderRadius: 'var(--radius-md)' }} 
                        />
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: 'rgba(0,0,0,0.5)',
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11px',
                          backdropFilter: 'blur(2px)'
                        }}>
                          <Eye size={12} /> View Image
                        </div>
                      </div>
                    )}

                    {msg.messageType === 'AUDIO' && msg.fileUrl && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '240px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', opacity: 0.9 }}>
                          <Volume2 size={16} />
                          <span style={{ fontWeight: '500' }}>Audio Attachment</span>
                        </div>
                        <audio controls src={sanitizeFileUrl(msg.fileUrl)} style={{ width: '100%', outline: 'none', height: '36px' }} />
                      </div>
                    )}

                    {msg.messageType === 'VIDEO' && msg.fileUrl && (
                      <div style={{ minWidth: '260px' }}>
                        <video 
                          controls 
                          src={sanitizeFileUrl(msg.fileUrl)} 
                          style={{ width: '100%', maxHeight: '220px', borderRadius: '8px', display: 'block', background: '#000' }} 
                        />
                      </div>
                    )}
                  </div>

                  {/* Sent time */}
                  {!isSameSenderAndMinuteAsNext && (
                    <span style={{ 
                      fontSize: '10px', 
                      color: 'var(--text-muted)', 
                      marginTop: '4px', 
                      marginRight: isMine ? '4px' : '0',
                      marginLeft: !isMine ? '4px' : '0'
                    }}>
                      {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border-glass)',
          background: 'rgba(0,0,0,0.1)'
        }}>
          {/* Typing indicator */}
          {typingUsers.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginBottom: '10px',
              paddingLeft: '4px',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                <div className="typing-dot" style={{ animationDelay: '0ms' }}></div>
                <div className="typing-dot" style={{ animationDelay: '150ms' }}></div>
                <div className="typing-dot" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span>
                {typingUsers.map(u => u.displayName).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
              </span>
            </div>
          )}

          <form onSubmit={handleSendTextMessage} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Attachment Button */}
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload}
              accept="image/*,video/*,audio/*"
            />
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary"
              disabled={uploading}
              style={{ padding: '12px', borderRadius: 'var(--radius-md)' }}
            >
              {uploading ? <Loader size={20} className="animate-spin" /> : <Image size={20} />}
            </button>

            {/* Input field */}
            <input
              type="text"
              className="glass-input"
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={connected ? "Type your message..." : "Connecting to session..."}
              disabled={!connected || uploading}
              style={{ flex: 1 }}
            />

            {/* Send Button */}
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={!connected || !inputText.trim() || uploading}
              style={{ padding: '12px' }}
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </main>

      {/* Fullscreen Image Lightbox */}
      {lightboxImg && (
        <div className="lightbox-overlay" onClick={() => setLightboxImg(null)}>
          <button 
            onClick={() => setLightboxImg(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              padding: '10px',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
          <img 
            src={lightboxImg} 
            alt="Fullscreen view" 
            className="lightbox-content" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { 
  Plus, LogOut, ArrowRight, MessageSquare, 
  User as UserIcon, Shield, Sparkles, MessageCircle, Settings
} from 'lucide-react';

interface Room {
  roomId: string;
  name: string;
  preserveHistory: boolean;
  retentionPolicy: string;
  createdAt: string;
  ownerName: string;
}

export const Dashboard: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  
  // Create Room state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [preserveHistory, setPreserveHistory] = useState(true);
  const [retentionPolicy, setRetentionPolicy] = useState('FOREVER');
  
  // Join Room state
  const [joinRoomId, setJoinRoomId] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Profile settings state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileFileUploading, setProfileFileUploading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileActionLoading, setProfileActionLoading] = useState(false);

  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  const openProfileModal = () => {
    if (user) {
      setProfileDisplayName(user.displayName);
      setProfileAvatarUrl(user.avatarUrl);
      setProfileError(null);
      setProfileSuccess(null);
      setShowProfileModal(true);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProfileFileUploading(true);
    setProfileError(null);
    setProfileSuccess(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post<{ fileUrl: string }>('/api/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setProfileAvatarUrl(response.data.fileUrl);
    } catch (err) {
      console.error('Avatar upload failed', err);
      setProfileError('Failed to upload image.');
    } finally {
      setProfileFileUploading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileDisplayName.trim()) return;
    setProfileActionLoading(true);
    setProfileError(null);
    setProfileSuccess(null);

    try {
      const response = await api.put('/api/users/profile', {
        displayName: profileDisplayName.trim(),
        avatarUrl: profileAvatarUrl
      });
      updateUser(response.data);
      setProfileSuccess('Profile updated successfully!');
      setTimeout(() => setShowProfileModal(false), 1200);
    } catch (err: unknown) {
      console.error(err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyErr = err as any;
      if (anyErr.response && typeof anyErr.response.data === 'string') {
        setProfileError(anyErr.response.data);
      } else if (anyErr.response?.data?.message) {
        setProfileError(anyErr.response.data.message);
      } else {
        setProfileError('Failed to update profile.');
      }
    } finally {
      setProfileActionLoading(false);
    }
  };

  const fetchMyRooms = async () => {
    try {
      const response = await api.get<Room[]>('/api/rooms/my');
      setRooms(response.data);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMyRooms();
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setActionLoading(true);

    try {
      const response = await api.post<Room>('/api/rooms/create', {
        name: newRoomName,
        preserveHistory,
        retentionPolicy
      });
      setNewRoomName('');
      setRetentionPolicy('FOREVER');
      setShowCreateModal(false);
      navigate(`/room/${response.data.roomId}`);
    } catch (err: unknown) {
      console.error(err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyErr = err as any;
      setError(anyErr.response?.data || 'Failed to create room');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomId.trim()) return;
    setError(null);
    setActionLoading(true);

    try {
      const response = await api.post<Room>(`/api/rooms/join/${joinRoomId.trim()}`);
      navigate(`/room/${response.data.roomId}`);
    } catch (err: unknown) {
      console.error(err);
      setError('Room not found or access denied.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header bar */}
      <header className="glass-panel dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MessageCircle size={24} color="var(--color-secondary)" />
          <h1 style={{ fontSize: '20px', fontWeight: '700' }}>AetherChat</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {user?.avatarUrl ? (
              <img 
                src={user.avatarUrl.replace('localhost:8080', 'localhost:8081')} 
                alt={user.displayName} 
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--border-glass)' }} 
              />
            ) : (
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'var(--bg-input)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border-glass)'
              }}>
                <UserIcon size={16} color="var(--text-muted)" />
              </div>
            )}
            <span style={{ fontSize: '15px', fontWeight: '500' }}>{user?.displayName}</span>
          </div>

          <button onClick={openProfileModal} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }}>
            <Settings size={16} /> Profile
          </button>

          <button onClick={handleLogout} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      {/* Main layout */}
      <main style={{ padding: '0 16px 40px 16px' }} className="dashboard-layout animate-fade-in">
        
        {/* Left Side: Actions */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Join card */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Join a Room</h2>
            <form onSubmit={handleJoinRoom} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="glass-input"
                placeholder="Enter Room ID (e.g. cozy-panda-123)"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary" disabled={actionLoading} style={{ padding: '12px' }}>
                <ArrowRight size={20} />
              </button>
            </form>
            {error && (
              <p style={{ color: 'var(--color-danger)', fontSize: '14px', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {error}
              </p>
            )}
          </div>

          {/* Quick Actions / Stats */}
          <div className="glass-panel" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', justifyItems: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Start Chatting</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
                Create a dedicated private or group space. Set whether history logs are persisted in PostgreSQL database or remain entirely ephemeral.
              </p>
            </div>
            
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="btn-primary" 
              style={{ width: '100%', marginTop: 'auto', padding: '14px' }}
            >
              <Plus size={20} /> Create New Room
            </button>
          </div>
        </section>

        {/* Right Side: My Rooms */}
        <section className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>My Active Rooms</h2>
          
          {loadingRooms ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <p style={{ color: 'var(--text-muted)' }}>Loading channels...</p>
            </div>
          ) : rooms.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 1,
              padding: '40px',
              textAlign: 'center'
            }}>
              <MessageSquare size={40} color="var(--text-muted)" style={{ marginBottom: '12px', opacity: 0.5 }} />
              <h3 style={{ fontSize: '16px', color: 'var(--text-main)' }}>No active rooms</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
                Create a room or ask your friends for their Room ID to join!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', maxHeight: '500px' }}>
              {rooms.map((room) => (
                <div 
                  key={room.roomId}
                  onClick={() => navigate(`/room/${room.roomId}`)}
                  className="glass-panel"
                  style={{
                    padding: '16px 20px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-main)' }}>{room.name}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--color-secondary)', marginTop: '4px', letterSpacing: '0.3px' }}>
                      ID: {room.roomId}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {room.preserveHistory ? (
                      room.retentionPolicy === 'FOREVER' ? (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          padding: '4px 8px',
                          borderRadius: '20px',
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          color: 'var(--color-success)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Shield size={10} /> Saved History
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          padding: '4px 8px',
                          borderRadius: '20px',
                          background: 'rgba(0, 240, 255, 0.1)',
                          border: '1px solid rgba(0, 240, 255, 0.2)',
                          color: 'var(--color-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Sparkles size={10} /> Pruned: {room.retentionPolicy.replace('ONE_', '').toLowerCase()}
                        </span>
                      )
                    ) : (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        padding: '4px 8px',
                        borderRadius: '20px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#fca5a5',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Sparkles size={10} /> Ephemeral Room
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100
        }}>
          <div className="glass-panel" style={{
            padding: '32px',
            maxWidth: '450px',
            width: '90%',
            position: 'relative'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px' }}>Create Chat Room</h2>
            <form onSubmit={handleCreateRoom} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Room Name
                </label>
                <input
                  type="text"
                  className="glass-input"
                  placeholder="e.g. Project Discussion"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  required
                />
              </div>

              {/* Policy Toggle */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-glass)'
              }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '600' }}>Preserve History Policy</h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Save chat records and attachments in Postgres.
                  </p>
                </div>
                <input 
                  type="checkbox"
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-secondary)' }}
                  checked={preserveHistory}
                  onChange={(e) => setPreserveHistory(e.target.checked)}
                />
              </div>

              {/* Retention Policy Dropdown (only if history is preserved) */}
              {preserveHistory && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Message Retention Policy
                  </label>
                  <select
                    className="glass-input"
                    value={retentionPolicy}
                    onChange={(e) => setRetentionPolicy(e.target.value)}
                    style={{ background: 'var(--bg-input)', color: '#fff', border: '1px solid var(--border-glass)' }}
                  >
                    <option value="FOREVER" style={{ background: '#0f1224', color: '#fff' }}>Keep Forever</option>
                    <option value="ONE_MINUTE" style={{ background: '#0f1224', color: '#fff' }}>Keep for 1 Minute (Testing)</option>
                    <option value="ONE_HOUR" style={{ background: '#0f1224', color: '#fff' }}>Keep for 1 Hour</option>
                    <option value="ONE_DAY" style={{ background: '#0f1224', color: '#fff' }}>Keep for 24 Hours</option>
                    <option value="ONE_WEEK" style={{ background: '#0f1224', color: '#fff' }}>Keep for 7 Days</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyItems: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setShowCreateModal(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={actionLoading}
                  style={{ flex: 1 }}
                >
                  {actionLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Profile Settings Modal */}
      {showProfileModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100
        }}>
          <div className="glass-panel animate-fade-in" style={{
            padding: '32px',
            maxWidth: '450px',
            width: '90%',
            position: 'relative'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px' }}>Profile Settings</h2>
            
            {profileError && (
              <div className="custom-alert error" style={{ marginBottom: '20px' }}>
                <span>{profileError}</span>
              </div>
            )}
            {profileSuccess && (
              <div className="custom-alert success" style={{ marginBottom: '20px' }}>
                <span>{profileSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Avatar Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <input 
                  type="file" 
                  ref={avatarFileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleAvatarUpload}
                  accept="image/*"
                />
                
                <div 
                  onClick={() => !profileFileUploading && avatarFileInputRef.current?.click()}
                  style={{
                    width: '90px',
                    height: '90px',
                    borderRadius: '50%',
                    background: 'var(--bg-input)',
                    border: '2px dashed var(--border-glass)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    position: 'relative',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  {profileAvatarUrl ? (
                    <img 
                      src={profileAvatarUrl.replace('localhost:8080', 'localhost:8081')} 
                      alt="Avatar Preview" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : (
                    <UserIcon size={32} color="var(--text-muted)" />
                  )}
                  {profileFileUploading && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: '11px', fontWeight: '600' }}>Uploading...</span>
                    </div>
                  )}
                </div>
                <span 
                  onClick={() => !profileFileUploading && avatarFileInputRef.current?.click()}
                  style={{ fontSize: '13px', color: 'var(--color-secondary)', cursor: 'pointer', fontWeight: '500' }}
                >
                  Change Avatar
                </span>
              </div>

              {/* Display Name Input */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Display Name
                </label>
                <input
                  type="text"
                  className="glass-input"
                  placeholder="Enter display name"
                  value={profileDisplayName}
                  onChange={(e) => setProfileDisplayName(e.target.value)}
                  required
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyItems: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setShowProfileModal(false)}
                  style={{ flex: 1 }}
                  disabled={profileActionLoading || profileFileUploading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={profileActionLoading || profileFileUploading || !profileDisplayName.trim()}
                  style={{ flex: 1 }}
                >
                  {profileActionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

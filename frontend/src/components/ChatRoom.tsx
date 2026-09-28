import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { socketService } from '../services/socket.ts';
import { Room, Message, RoomMember } from '../types/index.ts';
import {
  ArrowLeft,
  Users,
  UserPlus,
  Send,
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';

interface ChatRoomProps {
  roomId: string;
  onBack: () => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ roomId, onBack }) => {
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Fetch Room Details & Initial Message History from PostgreSQL
  const loadRoomData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [roomRes, messagesRes] = await Promise.all([
        api.getRoomDetails(roomId),
        api.getRoomMessages(roomId, 100),
      ]);

      setRoom(roomRes.room);
      setMembers(roomRes.room.members || []);
      setMessages(messagesRes.messages || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load chat room data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRoomData();
  }, [roomId]);

  // 2. Setup Real-time WebSocket connection for this room
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    // Join room channel on backend
    socketService.joinRoom(roomId).then((res) => {
      if (!res.success) {
        console.warn('Could not join room channel:', res.error);
      }
    });

    // Event: new_message (delivered via PostgreSQL + Redis Pub/Sub)
    const handleNewMessage = (msg: Message) => {
      if (msg.room_id === roomId) {
        setMessages((prev) => {
          // Prevent duplicates
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };

    // Event: user_presence (ephemeral online/offline state synced via Redis)
    const handlePresence = ({ userId, status }: { userId: string; status: 'online' | 'offline' }) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, online: status === 'online' } : m))
      );
    };

    socket.on('new_message', handleNewMessage);
    socket.on('user_presence', handlePresence);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('user_presence', handlePresence);
      socketService.leaveRoom(roomId);
    };
  }, [roomId]);

  // Auto-scroll when messages update
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input on load
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  // Send Message Handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputContent.trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      const res = await socketService.sendMessage(roomId, text);
      if (res.success && res.message) {
        setInputContent('');
        // Add to state immediately if not already added by broadcast
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message!.id)) return prev;
          return [...prev, res.message!];
        });
      } else {
        setError(res.error || 'Failed to send message');
      }
    } catch (err: any) {
      setError(err.message || 'Error sending message');
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  // Add Member Handler (enforces max 3 members)
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || isAddingMember) return;

    setIsAddingMember(true);
    setAddError(null);
    try {
      await api.addMember(roomId, inviteEmail.trim());
      setIsAddModalOpen(false);
      setInviteEmail('');
      // Reload room details to reflect new member list
      const updated = await api.getRoomDetails(roomId);
      setRoom(updated.room);
      setMembers(updated.room.members || []);
    } catch (err: any) {
      setAddError(err.message || 'Failed to add member to room');
    } finally {
      setIsAddingMember(false);
    }
  };

  const isRoomFull = members.length >= 3;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col h-[calc(100vh-4rem)]">
      {/* Top Room Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4 shadow-lg flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Back Button & Room Title */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {room ? room.name : 'Loading chat room...'}
                </h1>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    isRoomFull
                      ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                      : 'bg-indigo-950/60 text-indigo-300 border-indigo-800'
                  }`}
                >
                  {members.length}/3 Members {isRoomFull && '(Full)'}
                </span>
              </div>
              <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
                <Users className="w-3 h-3 text-slate-500" />
                <span>Max 3 users per room limit</span>
              </div>
            </div>
          </div>

          {/* Members presence pills & Add Member button */}
          <div className="flex items-center space-x-2 flex-wrap">
            {/* Member Badges with Online/Offline Presence Indicators */}
            <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                  title={`${member.name} (${member.email}) - ${member.online ? 'Online' : 'Offline'}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      member.online ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-600'
                    }`}
                  />
                  <span className="text-slate-300 font-medium truncate max-w-[90px]">
                    {member.name.split(' ')[0]}
                  </span>
                  {member.id === user?.id && (
                    <span className="text-[10px] text-slate-500">(You)</span>
                  )}
                </div>
              ))}
            </div>

            {/* Invite / Add Member Button */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              disabled={isRoomFull}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
                isRoomFull
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
              }`}
              title={isRoomFull ? 'Room already has maximum 3 users' : 'Invite another user by email'}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isRoomFull ? 'Room Full' : 'Add Member'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="mb-3 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Message Stream Area */}
      <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 overflow-y-auto shadow-inner flex flex-col space-y-3">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            <span>Loading PostgreSQL message history...</span>
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center mb-3 text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-white text-sm">No messages yet</h3>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Send the first message! It will be saved permanently in PostgreSQL and published via Redis to all members.
            </p>
          </div>
        )}

        {!isLoading &&
          messages.map((msg) => {
            const isMe = msg.user_id === user?.id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[70%] ${
                  isMe ? 'self-end' : 'self-start'
                }`}
              >
                {/* Sender Name (only for other users) */}
                {!isMe && (
                  <div className="text-[11px] font-semibold text-slate-400 mb-1 ml-1 flex items-center space-x-1">
                    <span>{msg.user_name || 'Room Member'}</span>
                    <span className="text-[10px] text-slate-500">({msg.user_email})</span>
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words shadow-sm ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-br-xs shadow-indigo-600/20'
                      : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-xs'
                  }`}
                >
                  {msg.content}
                </div>

                {/* Timestamp */}
                <div className="text-[10px] text-slate-500 mt-1 flex items-center space-x-1 px-1">
                  <Clock className="w-3 h-3 text-slate-600" />
                  <span>
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Composer Bar */}
      <form onSubmit={handleSendMessage} className="mt-4 flex-shrink-0 flex items-center space-x-2">
        <input
          ref={inputRef}
          type="text"
          value={inputContent}
          onChange={(e) => setInputContent(e.target.value)}
          placeholder={`Message in ${room?.name || 'room'}...`}
          maxLength={2000}
          className="flex-1 px-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition shadow-lg"
        />
        <button
          type="submit"
          disabled={!inputContent.trim() || isSending}
          className="p-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-2xl shadow-lg shadow-indigo-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-white text-base">Invite Member to Room</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMember} className="p-5 space-y-4">
              {addError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs">
                  {addError}
                </div>
              )}

              <p className="text-xs text-slate-400">
                Enter the email address of a registered user. MiniChat enforces a maximum room limit of 3 participants. Current participants: {members.length}/3.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  User Email Address
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="e.g. bob@minichat.dev"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              {/* Quick Persona Fill Buttons */}
              <div className="pt-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Quick Select Colleague:
                </span>
                <div className="flex space-x-2">
                  {['alice@minichat.dev', 'bob@minichat.dev', 'charlie@minichat.dev'].map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setInviteEmail(em)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-indigo-300 transition"
                    >
                      {em.split('@')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingMember || !inviteEmail.trim() || isRoomFull}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-md transition disabled:opacity-60"
                >
                  {isAddingMember ? 'Adding...' : 'Add to Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

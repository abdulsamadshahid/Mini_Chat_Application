import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { Room } from '../types/index.ts';
import {
  MessageSquare,
  Plus,
  Users,
  Clock,
  ArrowRight,
  Database,
  Layers,
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface DashboardProps {
  onSelectRoom: (roomId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectRoom }) => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadRooms = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getRooms();
      setRooms(data.rooms || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load rooms');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const res = await api.createRoom(newRoomName.trim());
      setIsModalOpen(false);
      setNewRoomName('');
      // Immediately open newly created room
      if (res.room?.id) {
        onSelectRoom(res.room.id);
      } else {
        await loadRooms();
      }
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Top Banner: Welcome & Quick Stats */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-3xl p-6 sm:p-8 mb-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <Sparkles className="w-4 h-4" />
              <span>Real-Time Clustered Chat</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Welcome, {user?.name}
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Create a chat room or join your existing discussions. MiniChat limits each room to a maximum of 3 users and coordinates live messaging across replicas using Redis Pub/Sub.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-sm flex items-center space-x-2 shadow-lg shadow-indigo-600/30 transition transform hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4" />
              <span>New Chat Room</span>
            </button>
            <button
              onClick={loadRooms}
              className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Refresh room list"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Architecture Badges */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span><strong>PostgreSQL:</strong> Single source of truth for message history</span>
          </div>
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-rose-400" />
            <span><strong>Redis Pub/Sub:</strong> Multi-replica event sync & presence</span>
          </div>
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <span><strong>Strict Rule:</strong> Up to 3 participants per room</span>
          </div>
        </div>
      </div>

      {/* Main Section Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center space-x-2">
          <span>Your Chat Rooms</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {rooms.length}
          </span>
        </h2>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-sm flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse p-6" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && rooms.length === 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <MessageSquare className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-white">No active chat rooms</h3>
          <p className="text-sm text-slate-400 mt-1 mb-6 max-w-sm mx-auto">
            You are not part of any chat room yet. Create a new room to start chatting with up to 2 other peers.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl inline-flex items-center space-x-2 shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Room</span>
          </button>
        </div>
      )}

      {/* Room Grid */}
      {!isLoading && rooms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => {
            const memberCount = room.member_count || 1;
            const isFull = memberCount >= 3;

            return (
              <div
                key={room.id}
                onClick={() => onSelectRoom(room.id)}
                className="group bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 cursor-pointer transition-all duration-200 shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-white text-base group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {room.name}
                    </h3>
                    {/* Member Count Badge */}
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex items-center space-x-1 ${
                        isFull
                          ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                          : 'bg-indigo-950/60 text-indigo-300 border-indigo-800'
                      }`}
                    >
                      <Users className="w-3 h-3 inline mr-1" />
                      {memberCount}/3
                      {isFull && <span className="ml-1 text-[9px] uppercase font-bold text-amber-400">Full</span>}
                    </span>
                  </div>

                  {/* Last message preview */}
                  <p className="text-xs text-slate-400 line-clamp-2 h-8">
                    {room.last_message ? (
                      <span>&ldquo;{room.last_message}&rdquo;</span>
                    ) : (
                      <span className="italic text-slate-500">No messages yet. Say hello!</span>
                    )}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {room.last_message_at
                        ? new Date(room.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : new Date(room.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 text-indigo-400 group-hover:translate-x-1 transition-transform">
                    <span className="font-medium">Open Room</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Room Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-white text-base">Create Chat Room</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="p-5 space-y-4">
              {createError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Room Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={100}
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. SRE Team, Project Alpha, Friends"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-[11px] text-slate-400">
                You will automatically become member #1. You can invite up to 2 other registered colleagues once the room is created.
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newRoomName.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-md transition disabled:opacity-60"
                >
                  {isCreating ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

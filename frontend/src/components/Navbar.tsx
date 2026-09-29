import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { socketService } from '../services/socket.ts';
import { api } from '../services/api.ts';
import { HealthStatus } from '../types/index.ts';
import { MessageSquare, LogOut, Activity, Wifi, ShieldCheck, RefreshCw } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [healthData, setHealthData] = useState<HealthStatus | null>(null);
  const [readyData, setReadyData] = useState<HealthStatus | null>(null);
  const [probing, setProbing] = useState(false);

  // Monitor socket connection state
  useEffect(() => {
    const checkConnection = () => {
      setIsSocketConnected(socketService.isConnected());
    };
    checkConnection();
    const interval = setInterval(checkConnection, 1500);
    return () => clearInterval(interval);
  }, []);

  const fetchProbes = async () => {
    setProbing(true);
    try {
      const [h, r] = await Promise.allSettled([
        api.getHealth(),
        api.getReadiness(),
      ]);
      if (h.status === 'fulfilled') setHealthData(h.value);
      if (r.status === 'fulfilled') setReadyData(r.value);
    } catch (e) {
      console.error('Failed to probe endpoints:', e);
    } finally {
      setProbing(false);
    }
  };

  const handleOpenProbes = () => {
    setShowHealthModal(true);
    fetchProbes();
  };

  return (
    <>
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  MiniChat
                </span>
                <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  DevOps Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                PostgreSQL · Redis Pub/Sub · Horizontal Scaling
              </p>
            </div>
          </div>

          {/* Right Side: Probes + User & Logout */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Live WebSocket Status Pill */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                isSocketConnected
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80'
                  : 'bg-amber-950/60 text-amber-400 border-amber-800/80'
              }`}
              title={isSocketConnected ? 'WebSocket Connected' : 'WebSocket Reconnecting...'}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSocketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <Wifi className="w-3 h-3" />
              <span className="hidden md:inline">{isSocketConnected ? 'Real-time Live' : 'Connecting'}</span>
            </div>

            {/* Kubernetes Probes Inspector */}
            <button
              onClick={handleOpenProbes}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Inspect Kubernetes /health and /ready probes"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Probes</span>
            </button>

            {/* User Profile & Logout */}
            {user && (
              <div className="flex items-center space-x-3 pl-2 border-l border-slate-800">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-white leading-tight">{user.name}</div>
                  <div className="text-[10px] text-slate-400 leading-tight truncate max-w-[140px]">
                    {user.email}
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 border border-slate-700 transition"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Kubernetes Probe Inspection Modal */}
      {showHealthModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-white text-base">Kubernetes Health & Readiness Probes</h3>
              </div>
              <button
                onClick={() => setShowHealthModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              <p className="text-slate-400 text-xs leading-relaxed">
                MiniChat implements separate liveness (<code className="text-indigo-300">/health</code>) and readiness (<code className="text-indigo-300">/ready</code>) endpoints designed for Kubernetes kubelet probes and AWS ALB healthchecks.
              </p>

              {/* Liveness Card */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-mono text-xs font-semibold text-emerald-300">GET /health (Liveness)</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    HTTP 200 OK
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono bg-slate-900 p-2 rounded border border-slate-800/80">
                  {healthData ? JSON.stringify(healthData, null, 2) : 'Loading...'}
                </div>
              </div>

              {/* Readiness Card */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span className="font-mono text-xs font-semibold text-indigo-300">GET /ready (Readiness)</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                    {readyData?.status || 'Probing...'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono bg-slate-900 p-2 rounded border border-slate-800/80">
                  {readyData ? JSON.stringify(readyData, null, 2) : 'Loading...'}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={fetchProbes}
                disabled={probing}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
                <span>Refresh Probes</span>
              </button>
              <button
                onClick={() => setShowHealthModal(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

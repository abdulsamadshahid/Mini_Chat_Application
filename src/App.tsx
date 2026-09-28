/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { AuthPage } from './components/AuthPage.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { ChatRoom } from './components/ChatRoom.tsx';

function MainApp() {
  const { user, loading } = useAuth();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Connecting to MiniChat...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1">
          <AuthPage />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />
      <main className="flex-1">
        {selectedRoomId ? (
          <ChatRoom
            roomId={selectedRoomId}
            onBack={() => setSelectedRoomId(null)}
          />
        ) : (
          <Dashboard onSelectRoom={(roomId) => setSelectedRoomId(roomId)} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

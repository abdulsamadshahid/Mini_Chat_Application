import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { MessageSquare, Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isRegister) {
      if (!name.trim()) {
        setError('Please enter your full name');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      setIsSubmitting(true);
      try {
        await register(name.trim(), email.trim(), password);
      } catch (err: any) {
        setError(err.message || 'Registration failed');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (!email.trim() || !password) {
        setError('Please provide email and password');
        return;
      }

      setIsSubmitting(true);
      try {
        await login(email.trim(), password);
      } catch (err: any) {
        setError(err.message || 'Invalid credentials');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Quick fill helper for DevOps multi-user test sessions
  const fillTestUser = (testName: string, testEmail: string) => {
    setName(testName);
    setEmail(testEmail);
    setPassword('password123');
    setConfirmPassword('password123');
    setError(null);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-slate-950">
      <div className="w-full max-w-md">
        {/* App Banner */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 items-center justify-center shadow-xl shadow-indigo-500/20 mb-3">
            <MessageSquare className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            MiniChat Real-Time Messaging
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isRegister
              ? 'Create a secure account to join rooms'
              : 'Sign in to access your chat rooms'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* Tab Switcher */}
          <div className="flex bg-slate-950 p-1 rounded-xl mb-6 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsRegister(false);
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                !isRegister
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegister(true);
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                isRegister
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start space-x-2">
              <span className="font-bold">Error:</span>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alice Johnson"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alice@minichat.dev"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {isRegister && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-600/25 flex items-center justify-center space-x-2 transition disabled:opacity-60"
            >
              <span>{isSubmitting ? 'Processing...' : isRegister ? 'Create Account' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Test Accounts for instant multi-user verification */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                DevOps Test Personas
              </span>
              <span className="text-[10px] text-slate-500">Quick 1-click fill</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => fillTestUser('Alice Johnson', 'alice@minichat.dev')}
                className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-lg text-left transition"
              >
                <div className="text-xs font-medium text-indigo-300">Alice</div>
                <div className="text-[10px] text-slate-500 truncate">alice@minichat.dev</div>
              </button>
              <button
                type="button"
                onClick={() => fillTestUser('Bob Miller', 'bob@minichat.dev')}
                className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-lg text-left transition"
              >
                <div className="text-xs font-medium text-indigo-300">Bob</div>
                <div className="text-[10px] text-slate-500 truncate">bob@minichat.dev</div>
              </button>
              <button
                type="button"
                onClick={() => fillTestUser('Charlie Davis', 'charlie@minichat.dev')}
                className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-lg text-left transition"
              >
                <div className="text-xs font-medium text-indigo-300">Charlie</div>
                <div className="text-[10px] text-slate-500 truncate">charlie@minichat.dev</div>
              </button>
            </div>
          </div>
        </div>

        {/* Security / Architecture Highlights */}
        <div className="mt-6 flex items-center justify-center space-x-4 text-[11px] text-slate-500">
          <div className="flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Bcrypt Hashed</span>
          </div>
          <span>•</span>
          <div className="flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>JWT Auth Token</span>
          </div>
          <span>•</span>
          <div className="flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Max 3 Members</span>
          </div>
        </div>
      </div>
    </div>
  );
};

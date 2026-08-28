import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import {
  Lock,
  Mail,
  User,
  Phone,
  Globe,
  AlertTriangle,
  Loader2,
  Shield,
  XCircle,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen }) => {
  const { login, register } = useAuth();
  const { loginEnabled, registrationEnabled, maintenanceMode } = useSettings();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('United States');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [require2FA, setRequire2FA] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const isCurrentModeDisabled = mode === 'login' ? !loginEnabled : !registrationEnabled;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCurrentModeDisabled) {
      setError(mode === 'login' ? 'User login is currently disabled by system administrator.' : 'New user registration is currently closed.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        const res = await login(email, password, twoFactorCode);
        if (res?.require2FA) {
          setRequire2FA(true);
        }
      } else {
        await register({
          fullName,
          email,
          phone,
          country,
          password,
          confirmPassword,
        });
      }
    } catch (err) {
      setError((err as Error).message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6 text-xs text-slate-900 dark:text-slate-100">
        {/* Brand Banner */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-600 text-white font-black text-2xl shadow-xl shadow-blue-500/25">
            F
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {mode === 'login' ? 'FINEXJ Sign In' : 'Create Investor Account'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs">
            Institutional Digital Asset & Fund Management Architecture
          </p>
        </div>

        {/* Maintenance Notice if Active */}
        {maintenanceMode && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center space-x-2 font-medium">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>System Maintenance in progress. Operations may be restricted.</span>
          </div>
        )}

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setRequire2FA(false);
            }}
            className={`py-2.5 rounded-lg font-bold text-xs transition cursor-pointer ${
              mode === 'login'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Login {!loginEnabled && '(Disabled)'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`py-2.5 rounded-lg font-bold text-xs transition cursor-pointer ${
              mode === 'register'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Register {!registrationEnabled && '(Closed)'}
          </button>
        </div>

        {/* Dynamic Availability Warnings */}
        {mode === 'login' && !loginEnabled && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-300 flex items-center space-x-2">
            <Lock className="w-4 h-4 flex-shrink-0 text-amber-600" />
            <span className="font-semibold">Investor portal login is temporarily disabled by system administrator.</span>
          </div>
        )}

        {mode === 'register' && !registrationEnabled && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-300 flex items-center space-x-2">
            <Lock className="w-4 h-4 flex-shrink-0 text-amber-600" />
            <span className="font-semibold">New investor registration is currently closed.</span>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-300 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Full Legal Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    disabled={isCurrentModeDisabled}
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      disabled={isCurrentModeDisabled}
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Country</label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      disabled={isCurrentModeDisabled}
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      placeholder="United States"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                disabled={isCurrentModeDisabled}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="investor@finexj.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                disabled={isCurrentModeDisabled}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition disabled:opacity-50"
              />
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  disabled={isCurrentModeDisabled}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {require2FA && (
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
              <label className="block text-blue-900 dark:text-blue-200 font-bold mb-1">6-Digit 2FA Authenticator Code</label>
              <input
                type="text"
                maxLength={6}
                value={twoFactorCode}
                onChange={e => setTwoFactorCode(e.target.value)}
                placeholder="123456"
                className="w-full py-2 px-3 rounded-lg bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-600 text-slate-900 dark:text-white text-xs font-mono tracking-widest text-center font-bold focus:outline-none focus:border-blue-600"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || isCurrentModeDisabled}
            className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition flex items-center justify-center space-x-2 mt-3 cursor-pointer"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{mode === 'login' ? 'Sign In Securely' : 'Complete Registration'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};


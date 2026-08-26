import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { MarketPrice } from '../types';
import {
  Sun,
  Moon,
  WifiOff,
  ShieldCheck,
  Headphones,
  FlaskConical,
  UserCheck,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';

interface HeaderProps {
  marketPrices: MarketPrice | null;
  onOpenSupport: () => void;
  onOpenTests: () => void;
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  marketPrices,
  onOpenSupport,
  onOpenTests,
  currentView,
  onNavigate,
}) => {
  const { user, isOffline, switchDemoAccount } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  const isAdmin = user?.role === 'super_admin' || user?.role === 'finance_admin' || user?.role === 'support_admin';

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 shadow-xs transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & App Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onNavigate('home')}>
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 text-white font-extrabold shadow-lg shadow-emerald-500/20">
              <span className="text-xl tracking-tight font-black">F</span>
              <span className="absolute -bottom-1 -right-1 px-1 py-0.2 text-[9px] font-bold bg-amber-500 text-slate-950 rounded">
                BSC
              </span>
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-base font-extrabold tracking-tight text-slate-100 dark:text-slate-100 text-slate-900">
                  FINEXJ
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full">
                  BEP-20
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-400 text-slate-500">
                Institutional Yield & Management
              </p>
            </div>
          </div>

          {/* Market Tickers (Desktop / Tablet) */}
          {marketPrices && marketPrices.isAvailable && (
            <div className="hidden md:flex items-center space-x-4 px-3 py-1.5 rounded-lg bg-slate-900/60 dark:bg-slate-900/60 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-200 text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-slate-400 dark:text-slate-400 text-slate-500 font-medium">BTC:</span>
                <span className="font-semibold text-slate-200 dark:text-slate-200 text-slate-800">
                  ${marketPrices.btcUsd.toLocaleString()}
                </span>
              </div>
              <div className="h-3 w-px bg-slate-700"></div>
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 dark:text-slate-400 text-slate-500 font-medium">GOLD:</span>
                <span className="font-semibold text-amber-500">
                  ${marketPrices.goldUsd.toLocaleString()}/oz
                </span>
              </div>
            </div>
          )}

          {/* Quick Controls & Account Switcher */}
          <div className="flex items-center space-x-2">
            {/* Offline Status */}
            {isOffline && (
              <div className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full">
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Offline Cache</span>
              </div>
            )}

            {/* Test Suite Runner Button */}
            <button
              onClick={onOpenTests}
              title="Run Automated Rule & Calculation Tests"
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 transition"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Run Tests</span>
            </button>

            {/* Telegram Live Support Button */}
            <button
              onClick={onOpenSupport}
              title="Live Telegram Support"
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 border border-sky-500/30 transition"
            >
              <Headphones className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Live Support</span>
            </button>

            {/* Admin Switch Button if Super Admin */}
            {isAdmin && (
              <button
                onClick={() => onNavigate(currentView === 'admin' ? 'home' : 'admin')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  currentView === 'admin'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                }`}
              >
                {currentView === 'admin' ? 'User Portal' : 'Admin Panel'}
              </button>
            )}

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 dark:text-slate-400 hover:bg-slate-800 dark:hover:bg-slate-800 transition"
              title="Toggle Dark / Light Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            {/* Demo Account Switcher Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                className="flex items-center space-x-2 pl-2 pr-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-900 bg-slate-100 border border-slate-800 dark:border-slate-800 border-slate-300 hover:border-slate-700 text-xs transition"
              >
                <img
                  src={user?.profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.fullName || 'User'}`}
                  alt="Avatar"
                  className="w-6 h-6 rounded-full object-cover border border-emerald-500/40"
                />
                <span className="hidden sm:inline font-medium text-slate-200 dark:text-slate-200 text-slate-800 max-w-[100px] truncate">
                  {user?.fullName?.split(' ')[0] || 'Account'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showAccountDropdown && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-slate-200 shadow-2xl p-2 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-slate-800 dark:border-slate-800 border-slate-100">
                    <p className="font-semibold text-slate-200 dark:text-slate-200 text-slate-900">{user?.fullName}</p>
                    <p className="text-slate-400 dark:text-slate-400 text-slate-500 truncate">{user?.email}</p>
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {user?.role.toUpperCase()}
                    </span>
                  </div>

                  <div className="py-1">
                    <p className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-500">
                      Quick Demo Switcher
                    </p>
                    <button
                      onClick={() => {
                        switchDemoAccount('demo');
                        setShowAccountDropdown(false);
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-800/80 dark:hover:bg-slate-800/80 hover:bg-slate-100 flex items-center justify-between text-slate-300 dark:text-slate-300 text-slate-700"
                    >
                      <div>
                        <p className="font-medium">Demo User (David)</p>
                        <p className="text-[10px] text-emerald-400">45d Old • Eligible to Withdraw</p>
                      </div>
                      {(user?.email === 'demo@finexj.com' || user?.email === 'demo@usdtfund.com') && <UserCheck className="w-4 h-4 text-emerald-400" />}
                    </button>

                    <button
                      onClick={() => {
                        switchDemoAccount('newuser');
                        setShowAccountDropdown(false);
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-800/80 dark:hover:bg-slate-800/80 hover:bg-slate-100 flex items-center justify-between text-slate-300 dark:text-slate-300 text-slate-700"
                    >
                      <div>
                        <p className="font-medium">New User (Elena)</p>
                        <p className="text-[10px] text-amber-400">5d Old • 30-Day Lock Active</p>
                      </div>
                      {(user?.email === 'newuser@finexj.com' || user?.email === 'newuser@usdtfund.com') && <UserCheck className="w-4 h-4 text-amber-400" />}
                    </button>

                    <button
                      onClick={() => {
                        switchDemoAccount('admin');
                        setShowAccountDropdown(false);
                        onNavigate('admin');
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-800/80 dark:hover:bg-slate-800/80 hover:bg-slate-100 flex items-center justify-between text-slate-300 dark:text-slate-300 text-slate-700"
                    >
                      <div>
                        <p className="font-medium text-amber-400">Master Admin Portal</p>
                        <p className="text-[10px] text-slate-400">Full Financial Controls</p>
                      </div>
                      {(user?.email === 'admin@finexj.com' || user?.email === 'admin@usdtfund.com') && <ShieldCheck className="w-4 h-4 text-amber-400" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

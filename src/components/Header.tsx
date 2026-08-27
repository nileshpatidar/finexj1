import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { MarketPrice } from '../types';
import {
  Sun,
  Moon,
  WifiOff,
  Headphones,
  LogOut,
  User,
  Shield,
  ChevronDown,
} from 'lucide-react';

interface HeaderProps {
  marketPrices: MarketPrice | null;
  onOpenSupport: () => void;
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  marketPrices,
  onOpenSupport,
  currentView,
  onNavigate,
}) => {
  const { user, isOffline, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  const isAdmin = user?.role === 'super_admin' || user?.role === 'finance_admin' || user?.role === 'support_admin';

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md border-b border-[#E2E8F0] dark:border-slate-800 shadow-xs transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & App Title */}
          <div
            className="flex items-center space-x-3 cursor-pointer"
            onClick={() => onNavigate(isAdmin ? 'admin' : 'home')}
          >
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-600 text-white font-extrabold shadow-lg shadow-blue-500/20">
              <span className="text-xl tracking-tight font-black">F</span>
              <span className="absolute -bottom-1 -right-1 px-1 py-0.2 text-[8px] font-bold bg-blue-900 text-blue-200 border border-blue-400/30 rounded">
                PRO
              </span>
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                  FINEXJ
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-full">
                  BEP-20
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {isAdmin ? 'Institutional Admin Console' : 'Digital Asset Fund Management'}
              </p>
            </div>
          </div>

          {/* Market Tickers (Desktop / Tablet) */}
          {marketPrices && marketPrices.isAvailable && (
            <div className="hidden md:flex items-center space-x-4 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                <span className="text-slate-500 dark:text-slate-400 font-medium">BTC:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  ${marketPrices.btcUsd.toLocaleString()}
                </span>
              </div>
              <div className="h-3 w-px bg-slate-300 dark:bg-slate-700"></div>
              <div className="flex items-center space-x-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">GOLD:</span>
                <span className="font-semibold text-amber-500">
                  ${marketPrices.goldUsd.toLocaleString()}/oz
                </span>
              </div>
            </div>
          )}

          {/* Quick Controls & Account */}
          <div className="flex items-center space-x-2">
            {/* Offline Status */}
            {isOffline && (
              <div className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full">
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Offline Mode</span>
              </div>
            )}

            {/* Telegram Live Support Button (for users) */}
            {!isAdmin && (
              <button
                onClick={onOpenSupport}
                title="Official Support Desk"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition cursor-pointer"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Support</span>
              </button>
            )}

            {/* Admin Badge */}
            {isAdmin && (
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                <Shield className="w-3.5 h-3.5" />
                <span className="uppercase tracking-wider text-[10px] font-bold">Admin Active</span>
              </div>
            )}

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Toggle Dark / Light Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            {/* User Account Button & Dropdown */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                  className="flex items-center space-x-2 pl-2 pr-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-xs transition cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[11px]">
                    {user.fullName?.charAt(0) || 'U'}
                  </div>
                  <span className="hidden sm:inline font-medium text-slate-800 dark:text-slate-200 max-w-[100px] truncate">
                    {user.fullName?.split(' ')[0] || 'Account'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {showAccountDropdown && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 text-xs">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{user.fullName}</p>
                      <p className="text-slate-500 dark:text-slate-400 truncate text-[11px]">{user.email}</p>
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        {user.role.toUpperCase()}
                      </span>
                    </div>

                    <div className="py-1">
                      {!isAdmin && (
                        <button
                          onClick={() => {
                            onNavigate('profile');
                            setShowAccountDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-2 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <User className="w-4 h-4 text-blue-500" />
                          <span>Investor Profile</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          logout();
                          setShowAccountDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-600 dark:text-red-400 flex items-center space-x-2 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import {
  LayoutDashboard,
  ArrowDownToLine,
  TrendingUp,
  ArrowUpFromLine,
  User,
  History,
  Users,
} from 'lucide-react';

interface BottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate }) => {
  const navItems = [
    { id: 'home', label: 'Home', icon: LayoutDashboard },
    { id: 'deposit', label: 'Deposit', icon: ArrowDownToLine },
    { id: 'earnings', label: 'Earnings', icon: TrendingUp },
    { id: 'referrals', label: 'Referrals', icon: Users },
    { id: 'withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
    { id: 'transactions', label: 'Activity', icon: History },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800/80 py-1.5 px-2 sm:px-3 shadow-lg transition-colors duration-200">
      <div className="max-w-lg mx-auto grid grid-cols-7 gap-0.5 sm:gap-1">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 sm:px-1 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
              <span className="text-[9px] sm:text-[10px] font-medium tracking-tight mt-1 truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

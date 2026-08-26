import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { api } from './services/api';
import { DashboardResponse } from './types';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { HomeView } from './components/HomeView';
import { DepositView } from './components/DepositView';
import { EarningsView } from './components/EarningsView';
import { WithdrawView } from './components/WithdrawView';
import { ProfileView } from './components/ProfileView';
import { TransactionsView } from './components/TransactionsView';
import { AdminDashboard } from './components/AdminDashboard';
import { SupportModal } from './components/SupportModal';
import { AuthModal } from './components/AuthModal';

const AppContent: React.FC = () => {
  const { user, token, isLoading: isAuthLoading } = useAuth();
  const [currentView, setCurrentView] = useState<string>(() => {
    if (window.location.pathname.includes('/admin') || window.location.hash.includes('#admin')) {
      return 'admin';
    }
    return 'home';
  });
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState<boolean>(true);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getDashboard();
      setDashboardData(data);
    } catch (err) {
      console.warn('Dashboard fetch issue:', err);
    } finally {
      setIsLoadingDashboard(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchDashboard();
      // Poll every 30 seconds for live market prices and credited earnings
      const interval = setInterval(fetchDashboard, 30000);
      return () => clearInterval(interval);
    } else {
      setIsLoadingDashboard(false);
    }
  }, [token, fetchDashboard]);

  // Handle URL hash / back navigation
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') {
        setCurrentView('admin');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Handle Android hardware back navigation / view stack
  useEffect(() => {
    const handlePopState = () => {
      if (currentView !== 'home') {
        setCurrentView('home');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentView]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* Header */}
      <Header
        marketPrices={dashboardData?.marketPrices || null}
        onOpenSupport={() => setIsSupportOpen(true)}
        currentView={currentView}
        onNavigate={setCurrentView}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-20 sm:pb-8">
        {currentView === 'home' && (
          <HomeView
            data={dashboardData}
            onNavigate={setCurrentView}
            onOpenSupport={() => setIsSupportOpen(true)}
            isLoading={isLoadingDashboard}
          />
        )}

        {currentView === 'deposit' && (
          <DepositView onDepositConfirmed={fetchDashboard} />
        )}

        {currentView === 'earnings' && <EarningsView />}

        {currentView === 'withdraw' && (
          <WithdrawView onWithdrawalSubmitted={fetchDashboard} />
        )}

        {currentView === 'transactions' && <TransactionsView />}

        {currentView === 'profile' && <ProfileView />}

        {currentView === 'admin' && (
          <AdminDashboard onBackToUser={() => setCurrentView('home')} />
        )}
      </main>

      {/* Mobile-First Bottom Navigation (hidden on admin view) */}
      {currentView !== 'admin' && (
        <BottomNav currentView={currentView} onNavigate={setCurrentView} />
      )}

      {/* Support Modal */}
      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

      {/* Auth Modal if unauthenticated */}
      <AuthModal isOpen={!isAuthLoading && !token} />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

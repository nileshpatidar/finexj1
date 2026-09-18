import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { MarketTickerProvider } from './context/MarketTickerContext';
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
import { ReferralView } from './components/ReferralView';
import { AdminDashboard } from './components/AdminDashboard';
import { SupportModal } from './components/SupportModal';
import { AuthModal } from './components/AuthModal';

const AppContent: React.FC = () => {
  const { user, token, isLoading: isAuthLoading } = useAuth();
  const isAdmin = Boolean(user && user.role !== 'user');

  const [currentView, setCurrentView] = useState<string>(() => {
    if (window.location.pathname.includes('/admin') || window.location.hash.includes('#admin')) {
      return 'admin';
    }
    return 'home';
  });
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState<boolean>(true);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);

  // Synchronize view strictly with user role and purge data on logout
  useEffect(() => {
    if (user) {
      if (user.role !== 'user') {
        setCurrentView('admin');
      } else if (currentView === 'admin') {
        setCurrentView('home');
      }
    } else {
      setDashboardData(null);
    }
  }, [user]);

  const dashboardReqIdRef = useRef(0);
  const prevViewRef = useRef(currentView);

  // Fetch user dashboard ONLY if authenticated as standard user
  const fetchDashboard = useCallback(async () => {
    if (!token || !user || user.role !== 'user' || isAuthLoading) {
      setIsLoadingDashboard(false);
      return;
    }
    const reqId = ++dashboardReqIdRef.current;
    try {
      const data = await api.getDashboard();
      if (reqId === dashboardReqIdRef.current) {
        setDashboardData(data);
      }
    } catch (err) {
      if (reqId === dashboardReqIdRef.current) {
        console.warn('Dashboard fetch issue:', err);
      }
    } finally {
      if (reqId === dashboardReqIdRef.current) {
        setIsLoadingDashboard(false);
      }
    }
  }, [token, user, isAuthLoading]);

  useEffect(() => {
    if (token && user && user.role === 'user' && !isAuthLoading) {
      fetchDashboard();
      // Poll every 30 seconds for live market prices and credited earnings for active user
      const interval = setInterval(fetchDashboard, 30000);
      return () => clearInterval(interval);
    } else {
      setDashboardData(null);
      setIsLoadingDashboard(false);
    }
  }, [token, user, isAuthLoading, fetchDashboard]);

  // Revalidate fresh dashboard balances whenever navigating back to home from another view
  useEffect(() => {
    if (currentView === 'home' && prevViewRef.current !== 'home' && token && user && user.role === 'user') {
      fetchDashboard();
    }
    prevViewRef.current = currentView;
  }, [currentView, token, user, fetchDashboard]);

  // Handle URL hash / back navigation
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin' && isAdmin) {
        setCurrentView('admin');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isAdmin]);

  // Handle Android hardware back navigation / view stack
  useEffect(() => {
    const handlePopState = () => {
      if (isAdmin) {
        setCurrentView('admin');
      } else if (currentView !== 'home') {
        setCurrentView('home');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentView, isAdmin]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* Header */}
      <Header
        marketPrices={dashboardData?.marketPrices || null}
        onOpenSupport={() => setIsSupportOpen(true)}
        currentView={isAdmin ? 'admin' : currentView}
        onNavigate={view => {
          if (isAdmin) {
            setCurrentView('admin');
          } else {
            setCurrentView(view);
          }
        }}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-10">
        {isAdmin ? (
          <AdminDashboard />
        ) : (
          <>
            {currentView === 'home' && (
              <HomeView
                data={dashboardData}
                onNavigate={setCurrentView}
                onOpenSupport={() => setIsSupportOpen(true)}
                isLoading={isLoadingDashboard}
                onRefresh={fetchDashboard}
              />
            )}

            {currentView === 'deposit' && (
              <DepositView onDepositConfirmed={fetchDashboard} />
            )}

            {currentView === 'earnings' && <EarningsView />}

            {currentView === 'withdraw' && (
              <WithdrawView onWithdrawalSubmitted={fetchDashboard} onNavigate={setCurrentView} />
            )}

            {currentView === 'transactions' && <TransactionsView />}

            {currentView === 'referrals' && (
              <ReferralView
                onNavigate={setCurrentView}
                initialSummary={dashboardData?.referralSummary}
              />
            )}

            {currentView === 'profile' && (
              <ProfileView onNavigate={setCurrentView} balance={dashboardData?.balance} />
            )}
          </>
        )}
      </main>

      {/* Mobile-First Bottom Navigation (hidden for administrators) */}
      {!isAdmin && (
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
        <SettingsProvider>
          <MarketTickerProvider>
            <AppContent />
          </MarketTickerProvider>
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

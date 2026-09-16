import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { api } from '../services/api';
import {
  UserReferralSummary,
  PaginatedLevel1ReferralsResponse,
  PaginatedLevel2ReferralsResponse,
} from '../types';
import { HowFinexJWorksModal } from './HowFinexJWorksModal';
import {
  Users,
  Copy,
  Check,
  Share2,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Lock,
  CheckCircle2,
  Info,
  Layers,
  UserCheck,
  ArrowRight,
  X,
} from 'lucide-react';

interface ReferralViewProps {
  onNavigate?: (view: string) => void;
  initialSummary?: UserReferralSummary | null;
}

export const ReferralView: React.FC<ReferralViewProps> = ({ onNavigate, initialSummary }) => {
  const { user, token, isLoading: isAuthLoading } = useAuth();
  const isAuthenticatedUser = Boolean(token && user && user.role === 'user');
  const {
    minimumDepositAmount,
    referralRewardL1Percentage,
    referralRewardL2Percentage,
  } = useSettings();
  const minDeposit = minimumDepositAmount || 300;

  // Summary state (authoritative backend values)
  const [summary, setSummary] = useState<UserReferralSummary | null>(initialSummary || null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(!initialSummary);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Active tab: 'level1' | 'level2'
  const [activeTab, setActiveTab] = useState<'level1' | 'level2'>('level1');

  // Level 1 state (paginated)
  const [level1Data, setLevel1Data] = useState<PaginatedLevel1ReferralsResponse | null>(null);
  const [level1Page, setLevel1Page] = useState(1);
  const [isLoadingLevel1, setIsLoadingLevel1] = useState(false);
  const [level1Error, setLevel1Error] = useState<string | null>(null);

  // Level 2 state (paginated)
  const [level2Data, setLevel2Data] = useState<PaginatedLevel2ReferralsResponse | null>(null);
  const [level2Page, setLevel2Page] = useState(1);
  const [isLoadingLevel2, setIsLoadingLevel2] = useState(false);
  const [level2Error, setLevel2Error] = useState<string | null>(null);
  const [level2FilterL1, setLevel2FilterL1] = useState<{ id: string; name: string } | null>(null);

  // Request ID refs for race protection
  const refReqIdRef = useRef(0);
  const l1ReqIdRef = useRef(0);
  const l2ReqIdRef = useRef(0);

  // Feedback states
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFaqOpen, setIsFaqOpen] = useState(false);

  // 1. Fetch Authoritative Summary from Backend
  const fetchSummary = useCallback(async () => {
    if (!token || !user || user.role !== 'user' || isAuthLoading) {
      setIsLoadingSummary(false);
      setSummary(null);
      return;
    }
    const currentReqId = ++refReqIdRef.current;
    try {
      setSummaryError(null);
      const res = await api.getUserReferralSummary();
      if (currentReqId === refReqIdRef.current) {
        if (res.success && res.summary) {
          setSummary(res.summary);
        } else {
          setSummaryError('Failed to load referral summary.');
        }
      }
    } catch (err: any) {
      if (currentReqId === refReqIdRef.current) {
        setSummaryError(err?.message || 'Network error fetching referral statistics.');
      }
    } finally {
      if (currentReqId === refReqIdRef.current) {
        setIsLoadingSummary(false);
      }
    }
  }, [token, user, isAuthLoading]);

  // 2. Fetch Level 1 Referrals from Backend
  const fetchLevel1 = useCallback(async (page: number) => {
    if (!token || !user || user.role !== 'user' || isAuthLoading) {
      setIsLoadingLevel1(false);
      setLevel1Data(null);
      return;
    }
    const currentReqId = ++l1ReqIdRef.current;
    try {
      setIsLoadingLevel1(true);
      setLevel1Error(null);
      const res = await api.getLevel1Referrals(page, 10);
      if (currentReqId === l1ReqIdRef.current) {
        if (res.success && res.data) {
          setLevel1Data(res.data);
        } else {
          setLevel1Error('Could not retrieve Level 1 referrals.');
        }
      }
    } catch (err: any) {
      if (currentReqId === l1ReqIdRef.current) {
        setLevel1Error(err?.message || 'Error fetching Level 1 referrals.');
      }
    } finally {
      if (currentReqId === l1ReqIdRef.current) {
        setIsLoadingLevel1(false);
      }
    }
  }, [token, user, isAuthLoading]);

  // 3. Fetch Level 2 Referrals from Backend
  const fetchLevel2 = useCallback(async (page: number, level1UserId?: string) => {
    if (!token || !user || user.role !== 'user' || isAuthLoading) {
      setIsLoadingLevel2(false);
      setLevel2Data(null);
      return;
    }
    const currentReqId = ++l2ReqIdRef.current;
    try {
      setIsLoadingLevel2(true);
      setLevel2Error(null);
      const res = await api.getLevel2Referrals({
        level1UserId,
        page,
        limit: 10,
      });
      if (currentReqId === l2ReqIdRef.current) {
        if (res.success && res.data) {
          setLevel2Data(res.data);
        } else {
          setLevel2Error('Could not retrieve Level 2 referrals.');
        }
      }
    } catch (err: any) {
      if (currentReqId === l2ReqIdRef.current) {
        setLevel2Error(err?.message || 'Error fetching Level 2 referrals.');
      }
    } finally {
      if (currentReqId === l2ReqIdRef.current) {
        setIsLoadingLevel2(false);
      }
    }
  }, [token, user, isAuthLoading]);

  // Initial load
  useEffect(() => {
    if (isAuthenticatedUser) {
      if (!initialSummary) {
        fetchSummary();
      }
      fetchLevel1(1);
      fetchLevel2(1);
    } else {
      setSummary(null);
      setLevel1Data(null);
      setLevel2Data(null);
      setIsLoadingSummary(false);
      setIsLoadingLevel1(false);
      setIsLoadingLevel2(false);
    }
  }, [isAuthenticatedUser, fetchSummary, fetchLevel1, fetchLevel2, initialSummary]);

  // Keep summary in sync if parent dashboard refreshes with new referralSummary
  useEffect(() => {
    if (initialSummary) {
      setSummary(initialSummary);
      setIsLoadingSummary(false);
    }
  }, [initialSummary]);

  // Handle page changes
  const handleLevel1PageChange = (newPage: number) => {
    setLevel1Page(newPage);
    fetchLevel1(newPage);
  };

  const handleLevel2PageChange = (newPage: number) => {
    setLevel2Page(newPage);
    fetchLevel2(newPage, level2FilterL1?.id);
  };

  // Filter Level 2 by specific Level 1 member
  const handleFilterLevel2ByL1 = (l1Member: { id: string; name: string; surname: string }) => {
    const fullName = `${l1Member.name} ${l1Member.surname}`.trim();
    setLevel2FilterL1({ id: l1Member.id, name: fullName });
    setLevel2Page(1);
    setActiveTab('level2');
    fetchLevel2(1, l1Member.id);
  };

  const handleClearLevel2Filter = () => {
    setLevel2FilterL1(null);
    setLevel2Page(1);
    fetchLevel2(1);
  };

  // Full manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchSummary(),
      fetchLevel1(level1Page),
      fetchLevel2(level2Page, level2FilterL1?.id),
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Authoritative referral code: strictly from database referral_code.
  // Never generate a fallback referral code from user ID.
  const rawReferralCode = summary?.referralCode || user?.referralCode || '';
  const isReferralActive = Boolean(summary?.isEligible && rawReferralCode);
  const displayReferralCode = isReferralActive ? rawReferralCode : 'Referral code unavailable';

  // Copy referral code
  const handleCopyCode = () => {
    if (!isReferralActive || !rawReferralCode) return;
    navigator.clipboard.writeText(rawReferralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Construct full referral URL using existing structure
  const referralUrl = isReferralActive && rawReferralCode
    ? `${window.location.origin}/register?ref=${encodeURIComponent(rawReferralCode)}`
    : '';

  // Copy referral link
  const handleCopyLink = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Share referral link
  const handleShare = async () => {
    if (!referralUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'FinexJ Referral',
          text: `Join FinexJ using my referral code: ${rawReferralCode}`,
          url: referralUrl,
        });
      } catch {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <span>Referrals</span>
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Two-level referral structure: Level 1 ({referralRewardL1Percentage}%) and Level 2 ({referralRewardL2Percentage}%)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsFaqOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>How It Works</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoadingSummary}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Error alert if summary fails */}
      {summaryError && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{summaryError}</span>
          </div>
          <button
            onClick={fetchSummary}
            className="px-2.5 py-1 bg-red-600 text-white rounded-lg font-semibold text-[11px] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Eligibility / Locked Status Notice */}
      {isLoadingSummary ? (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs animate-pulse space-y-2">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-2/3"></div>
        </div>
      ) : summary && !summary.isEligible ? (
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Referral Program Locked
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 uppercase tracking-wide">
                    Locked
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Maintain at least ${(summary.minimumRequiredPrincipal || minDeposit).toFixed(2)} USDT in eligible funds to unlock your referral code and rewards.
                </p>
              </div>
            </div>

            {onNavigate && (
              <button
                onClick={() => onNavigate('deposit')}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer flex-shrink-0 self-start sm:self-auto"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Deposit to Unlock</span>
              </button>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Current Eligible Deposit: <strong className="text-slate-800 dark:text-slate-200 font-mono">${(summary.maintainedEligiblePrincipal || 0).toFixed(2)}</strong> / ${(summary.minimumRequiredPrincipal || minDeposit).toFixed(2)} USDT
            </span>
          </div>
        </div>
      ) : summary?.isEligible ? (
        <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex-shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                Referral Program Active
              </p>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300/80">
                Your account meets the minimum deposit requirement of ${(summary.minimumRequiredPrincipal || minDeposit).toFixed(2)} USDT.
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white tracking-wide uppercase flex-shrink-0">
            Active
          </span>
        </div>
      ) : null}

      {/* SECTION 1: MY REFERRAL CODE & LINK CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* My Referral Code */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">My Referral Code</span>
            <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-base sm:text-lg font-mono font-bold text-slate-900 dark:text-white tracking-wider truncate">
              {isLoadingSummary ? (
                <span className="text-slate-400 text-sm font-normal">Loading...</span>
              ) : (
                displayReferralCode
              )}
            </span>

            <button
              onClick={handleCopyCode}
              disabled={!isReferralActive}
              className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex-shrink-0 ${
                !isReferralActive
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : copiedCode
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
              }`}
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* My Referral Link */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">My Referral Link</span>
            <Share2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate max-w-[200px] sm:max-w-[230px]">
              {isLoadingSummary
                ? 'Loading link...'
                : referralUrl || 'Referral link unavailable'}
            </span>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleCopyLink}
                disabled={!isReferralActive}
                className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  !isReferralActive
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    : copiedLink
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                }`}
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={handleShare}
                disabled={!isReferralActive}
                title="Share Referral Link"
                className={`p-1.5 rounded-xl transition cursor-pointer ${
                  !isReferralActive
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: REFERRAL METRICS SUMMARY (Existing backend values) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Referral Summary
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Total Referrals: <strong className="text-slate-800 dark:text-slate-200">{summary?.totalReferrals || 0}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Level 1 referrals */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Level 1 Referrals</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Level 1 — {referralRewardL1Percentage}%
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {isLoadingSummary ? '...' : summary?.level1Referrals || 0}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Users you referred directly.
            </p>
          </div>

          {/* Level 2 referrals */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Level 2 Referrals</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Level 2 — {referralRewardL2Percentage}%
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {isLoadingSummary ? '...' : summary?.level2Referrals || 0}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Users referred by your Level 1 referrals.
            </p>
          </div>

          {/* Total Referral Rewards */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs space-y-1.5 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Referral Rewards</span>
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {isLoadingSummary ? (
                '...'
              ) : (
                `${(summary?.totalReferralIncome || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} USDT`
              )}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Combined earnings across both levels
            </p>
          </div>

          {/* Level 1 referral rewards */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Level 1 Referral Rewards</span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{referralRewardL1Percentage}%</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">
              {isLoadingSummary ? (
                '...'
              ) : (
                `${(summary?.level1Income || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} USDT`
              )}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Earned from direct referrals
            </p>
          </div>

          {/* Level 2 referral rewards */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Level 2 Referral Rewards</span>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{referralRewardL2Percentage}%</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400">
              {isLoadingSummary ? (
                '...'
              ) : (
                `${(summary?.level2Income || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} USDT`
              )}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Earned from indirect referrals
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 3: REFERRAL REWARD EXPLANATION (Requirement 5) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 text-xs space-y-2">
        <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-bold">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <span>Referral Reward Program</span>
        </div>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          Referral rewards are separate from investment earnings. Eligible referral rewards are calculated according to the current referral program rules.
        </p>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          Referral rewards do not compound with your investment balance.
        </p>
      </div>

      {/* SECTION 4: REFERRAL ACTIVITY TABS (Level 1 and Level 2) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Referral Activity</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Two levels only: Level 1 direct referrals and Level 2 indirect referrals
            </p>
          </div>

          {/* Tab buttons */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('level1')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'level1'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Level 1 ({summary?.level1Referrals || 0})
            </button>
            <button
              onClick={() => setActiveTab('level2')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'level2'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Level 2 ({summary?.level2Referrals || 0})
            </button>
          </div>
        </div>

        {/* Level 2 Filter Pill (if user filtered by specific Level 1 member) */}
        {activeTab === 'level2' && level2FilterL1 && (
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
            <span>
              Filtered by Level 1 member: <strong>{level2FilterL1.name}</strong>
            </span>
            <button
              onClick={handleClearLevel2Filter}
              className="inline-flex items-center space-x-1 px-2 py-1 rounded-md bg-blue-200/60 dark:bg-blue-900/60 hover:bg-blue-200 text-blue-900 dark:text-blue-100 font-semibold text-[11px] cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Show All Level 2</span>
            </button>
          </div>
        )}

        {/* TAB 1: LEVEL 1 REFERRALS */}
        {activeTab === 'level1' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Users you referred directly. (Level 1 — {referralRewardL1Percentage}%)</span>
              <span>{level1Data?.totalCount || 0} Total</span>
            </div>

            {isLoadingLevel1 && !level1Data ? (
              <div className="p-8 text-center bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse">
                <p className="text-xs text-slate-400">Loading Level 1 referrals...</p>
              </div>
            ) : level1Error ? (
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs flex items-center justify-between">
                <span>{level1Error}</span>
                <button
                  onClick={() => fetchLevel1(level1Page)}
                  className="px-2.5 py-1 bg-red-600 text-white rounded-lg font-semibold text-[11px] cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : !level1Data || level1Data.items.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  No Level 1 referrals yet
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Users you refer directly with your referral link or code will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {level1Data.items.map(l1Member => {
                  const initials = `${l1Member.name.charAt(0)}${l1Member.surname.charAt(0)}`.toUpperCase();
                  const formattedDate = l1Member.joinedAt
                    ? new Date(l1Member.joinedAt).toLocaleDateString()
                    : '';

                  return (
                    <div
                      key={l1Member.id}
                      className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {initials || 'U'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                              {l1Member.name} {l1Member.surname}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                l1Member.status === 'Active'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {l1Member.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-2 mt-0.5">
                            {formattedDate && <span>Joined: {formattedDate}</span>}
                            {formattedDate && <span>•</span>}
                            <span>{l1Member.level2Count} Level 2 referral{l1Member.level2Count === 1 ? '' : 's'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end space-x-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                        <div className="text-right">
                          {l1Member.isQualified ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Qualified</span>
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
                              Pending Deposit
                            </span>
                          )}
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            Reward: +${l1Member.rewardEarned.toFixed(2)} USDT
                          </p>
                        </div>

                        {l1Member.level2Count > 0 && (
                          <button
                            onClick={() => handleFilterLevel2ByL1(l1Member)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
                          >
                            <span>Level 2 ({l1Member.level2Count})</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Pagination Controls */}
                {level1Data.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 px-1">
                    <button
                      disabled={level1Page <= 1}
                      onClick={() => handleLevel1PageChange(level1Page - 1)}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Previous</span>
                    </button>

                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Page {level1Page} of {level1Data.totalPages}
                    </span>

                    <button
                      disabled={level1Page >= level1Data.totalPages}
                      onClick={() => handleLevel1PageChange(level1Page + 1)}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LEVEL 2 REFERRALS */}
        {activeTab === 'level2' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Users referred by your Level 1 referrals. (Level 2 — {referralRewardL2Percentage}%)</span>
              <span>{level2Data?.totalCount || 0} Total</span>
            </div>

            {isLoadingLevel2 && !level2Data ? (
              <div className="p-8 text-center bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse">
                <p className="text-xs text-slate-400">Loading Level 2 referrals...</p>
              </div>
            ) : level2Error ? (
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs flex items-center justify-between">
                <span>{level2Error}</span>
                <button
                  onClick={() => fetchLevel2(level2Page, level2FilterL1?.id)}
                  className="px-2.5 py-1 bg-red-600 text-white rounded-lg font-semibold text-[11px] cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : !level2Data || level2Data.items.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  No Level 2 referrals yet
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  When your Level 1 referrals invite others, those members will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {level2Data.items.map(l2Member => {
                  const initials = `${l2Member.name.charAt(0)}${l2Member.surname.charAt(0)}`.toUpperCase();
                  const formattedDate = l2Member.joinedAt
                    ? new Date(l2Member.joinedAt).toLocaleDateString()
                    : '';

                  return (
                    <div
                      key={l2Member.id}
                      className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {initials || 'U'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                              {l2Member.name} {l2Member.surname}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                l2Member.status === 'Active'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {l2Member.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-2 mt-0.5">
                            {formattedDate && <span>Joined: {formattedDate}</span>}
                            {formattedDate && <span>•</span>}
                            <span>Referred by: {l2Member.level1ReferrerName}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end space-x-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                        <div className="text-right">
                          {l2Member.isQualified ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Qualified</span>
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
                              Pending Deposit
                            </span>
                          )}
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            Reward: +${l2Member.rewardEarned.toFixed(2)} USDT
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Pagination Controls */}
                {level2Data.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 px-1">
                    <button
                      disabled={level2Page <= 1}
                      onClick={() => handleLevel2PageChange(level2Page - 1)}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Previous</span>
                    </button>

                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Page {level2Page} of {level2Data.totalPages}
                    </span>

                    <button
                      disabled={level2Page >= level2Data.totalPages}
                      onClick={() => handleLevel2PageChange(level2Page + 1)}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* How FinexJ Works FAQ Modal (includes Q13 for 2-level referral structure) */}
      <HowFinexJWorksModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
      />
    </div>
  );
};

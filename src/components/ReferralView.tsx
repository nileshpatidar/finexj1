import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import {
  UserReferralSummary,
  PaginatedLevel1ReferralsResponse,
  PaginatedLevel2ReferralsResponse,
} from '../types';
import {
  Users,
  Copy,
  Check,
  Share2,
  RefreshCw,
  TrendingUp,
  Award,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Shield,
  Clock,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Layers,
  ChevronLeft,
} from 'lucide-react';

export const ReferralView: React.FC = () => {
  // Summary state
  const [summary, setSummary] = useState<UserReferralSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Level 1 state (paginated)
  const [level1Data, setLevel1Data] = useState<PaginatedLevel1ReferralsResponse | null>(null);
  const [level1Page, setLevel1Page] = useState(1);
  const [isLoadingLevel1, setIsLoadingLevel1] = useState(false);
  const [level1Error, setLevel1Error] = useState<string | null>(null);

  // Expanded Level 1 member IDs (for Level 2 accordions)
  const [expandedL1Id, setExpandedL1Id] = useState<string | null>(null);

  // Level 2 sub-team state mapped by Level 1 User ID
  const [level2Map, setLevel2Map] = useState<
    Record<
      string,
      {
        data: PaginatedLevel2ReferralsResponse | null;
        page: number;
        isLoading: boolean;
        error: string | null;
      }
    >
  >({});

  // Clipboard copy feedback
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 1. Fetch Authoritative Summary from Backend
  const fetchSummary = useCallback(async () => {
    try {
      setSummaryError(null);
      const res = await api.getUserReferralSummary();
      if (res.success && res.summary) {
        setSummary(res.summary);
      } else {
        setSummaryError('Failed to load referral summary.');
      }
    } catch (err: any) {
      setSummaryError(err?.message || 'Network error fetching referral statistics.');
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  // 2. Fetch Level 1 Paginated List from Backend
  const fetchLevel1 = useCallback(async (page: number) => {
    try {
      setIsLoadingLevel1(true);
      setLevel1Error(null);
      const res = await api.getLevel1Referrals(page, 10);
      if (res.success && res.data) {
        setLevel1Data(res.data);
      } else {
        setLevel1Error('Could not retrieve Level 1 referrals.');
      }
    } catch (err: any) {
      setLevel1Error(err?.message || 'Error fetching Level 1 referrals.');
    } finally {
      setIsLoadingLevel1(false);
    }
  }, []);

  // 3. Fetch Level 2 for a specific Level 1 user
  const fetchLevel2ForUser = useCallback(async (level1UserId: string, page: number = 1) => {
    setLevel2Map(prev => ({
      ...prev,
      [level1UserId]: {
        data: prev[level1UserId]?.data || null,
        page,
        isLoading: true,
        error: null,
      },
    }));

    try {
      const res = await api.getLevel2Referrals({ level1UserId, page, limit: 5 });
      if (res.success && res.data) {
        setLevel2Map(prev => ({
          ...prev,
          [level1UserId]: {
            data: res.data,
            page,
            isLoading: false,
            error: null,
          },
        }));
      } else {
        setLevel2Map(prev => ({
          ...prev,
          [level1UserId]: {
            data: null,
            page,
            isLoading: false,
            error: 'Failed to load Level 2 members.',
          },
        }));
      }
    } catch (err: any) {
      setLevel2Map(prev => ({
        ...prev,
        [level1UserId]: {
          data: null,
          page,
          isLoading: false,
          error: err?.message || 'Error loading Level 2 members.',
        },
      }));
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSummary();
    fetchLevel1(1);
  }, [fetchSummary, fetchLevel1]);

  // Handle page change for Level 1
  const handleLevel1PageChange = (newPage: number) => {
    setLevel1Page(newPage);
    fetchLevel1(newPage);
  };

  // Toggle Level 1 member to show Level 2 sub-team
  const toggleLevel1Expand = (l1UserId: string) => {
    if (expandedL1Id === l1UserId) {
      setExpandedL1Id(null);
    } else {
      setExpandedL1Id(l1UserId);
      if (!level2Map[l1UserId]?.data) {
        fetchLevel2ForUser(l1UserId, 1);
      }
    }
  };

  // Full manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchSummary(), fetchLevel1(level1Page)]);
    if (expandedL1Id) {
      await fetchLevel2ForUser(expandedL1Id, level2Map[expandedL1Id]?.page || 1);
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Copy referral code
  const handleCopyCode = () => {
    if (!summary?.referralCode) return;
    navigator.clipboard.writeText(summary.referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Construct full referral URL using authoritative code
  const referralUrl = summary?.referralCode
    ? `${window.location.origin}/register?ref=${encodeURIComponent(summary.referralCode)}`
    : '';

  // Copy referral link
  const handleCopyLink = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Native share dialog if supported
  const handleShare = async () => {
    if (!referralUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join FINEXJ Digital Asset Fund',
          text: `Register on FINEXJ using my referral code ${summary?.referralCode} to access institutional digital asset management:`,
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
      {/* Top Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Referral Network & Rewards
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            2-Tier institutional reward architecture (5% Direct / 2% Indirect)
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing || isLoadingSummary}
          className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-xs transition cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Updating...' : 'Refresh Data'}</span>
        </button>
      </div>

      {/* Referral Code & Link Sharing Card */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Award className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Your Invitation Credentials
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Share your authoritative code with new investors to receive credited rewards upon qualifying deposits.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-[11px] font-semibold text-blue-700 dark:text-blue-300 self-start sm:self-auto">
            <Shield className="w-3 h-3" />
            2-Level Depth Limit
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* My Referral Code */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              My Referral Code
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-base sm:text-lg font-mono font-black text-slate-900 dark:text-white tracking-widest">
                {isLoadingSummary ? (
                  <span className="text-slate-400 text-sm font-normal">Loading...</span>
                ) : (
                  summary?.referralCode || 'FXJ-USER'
                )}
              </span>
              <button
                onClick={handleCopyCode}
                disabled={!summary?.referralCode}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  copiedCode
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                }`}
              >
                {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          {/* My Referral Link */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              My Referral Link
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate max-w-[200px] sm:max-w-[240px]">
                {isLoadingSummary ? 'Loading link...' : referralUrl || 'https://finexj.com/register?ref=...'}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={handleCopyLink}
                  disabled={!referralUrl}
                  className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    copiedLink
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                  }`}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                </button>
                <button
                  onClick={handleShare}
                  disabled={!referralUrl}
                  title="Share invitation link"
                  className="p-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats Grid (Authoritative Backend Calculated) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* TOTAL REFERRALS */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Referrals</span>
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {isLoadingSummary ? (
              <span className="text-slate-300 text-sm">...</span>
            ) : (
              summary?.totalReferrals || 0
            )}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Level 1 & Level 2 Total</p>
        </div>

        {/* LEVEL 1 REFERRALS */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Level 1 Referrals</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              5% Direct
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {isLoadingSummary ? (
              <span className="text-slate-300 text-sm">...</span>
            ) : (
              summary?.level1Referrals || 0
            )}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Directly Invited Investors</p>
        </div>

        {/* LEVEL 2 REFERRALS */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Level 2 Referrals</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              2% Indirect
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {isLoadingSummary ? (
              <span className="text-slate-300 text-sm">...</span>
            ) : (
              summary?.level2Referrals || 0
            )}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Invited by Level 1 Team</p>
        </div>

        {/* TOTAL REFERRAL INCOME */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Referral Income</span>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {isLoadingSummary ? (
              <span className="text-slate-300 text-sm">...</span>
            ) : (
              `$${(summary?.totalReferralIncome || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} USDT`
            )}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Cumulative Earned Rewards</p>
        </div>

        {/* LEVEL 1 INCOME */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Level 1 Income</span>
            <Award className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
            {isLoadingSummary ? (
              <span className="text-slate-300 text-sm">...</span>
            ) : (
              `$${(summary?.level1Income || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} USDT`
            )}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Direct 5% Tier Income</p>
        </div>

        {/* LEVEL 2 INCOME */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Level 2 Income</span>
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {isLoadingSummary ? (
              <span className="text-slate-300 text-sm">...</span>
            ) : (
              `$${(summary?.level2Income || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} USDT`
            )}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Indirect 2% Tier Income</p>
        </div>
      </div>

      {/* STRICT FINANCIAL COMPLIANCE NOTICE: REFERRAL INCOME VS COMPOUNDING PRINCIPAL */}
      <div className="p-4 sm:p-5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs space-y-2">
        <div className="flex items-center space-x-2 text-blue-900 dark:text-blue-300 font-bold text-sm">
          <Shield className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span>Financial Policy: Strict Separation of Referral Income from Compounding Principal</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
          <div className="space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              1. Non-Compounding Rule:
            </p>
            <p>
              Referral income does <span className="font-bold underline">NOT</span> participate in daily compounding.
              Daily earnings are calculated solely from verified qualifying deposit principal (currently{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                ${(summary?.eligibleDepositPrincipal || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} USDT
              </span>
              ). Referral income is credited as separate cash.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              2. Qualifying Deposit Rule:
            </p>
            <p>
              Referral rewards are one-time distributions triggered exclusively when a referred user confirms a qualifying deposit of{' '}
              <span className="font-semibold text-slate-900 dark:text-white">≥ 300 USDT</span>. Referral income is not generated from withdrawals, and the standard 9% withdrawal fee is retained entirely by FINEXJ for reserve operations.
            </p>
          </div>
        </div>
      </div>

      {/* LEVEL-WISE REFERRALS SECTION */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Level 1 Direct Referrals
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Expand an individual Level 1 investor to view their Level 2 team members. Maximum displayed depth is 2 levels.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {level1Data?.totalCount || 0} Total L1
          </span>
        </div>

        {/* Level 1 Content */}
        {isLoadingLevel1 && !level1Data ? (
          <div className="p-8 text-center bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse">
            <p className="text-xs text-slate-400 font-medium">Loading Level 1 referrals from secure database...</p>
          </div>
        ) : level1Error ? (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{level1Error}</span>
            </div>
            <button
              onClick={() => fetchLevel1(level1Page)}
              className="px-2.5 py-1 bg-red-600 text-white rounded-lg font-semibold text-[11px] cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : !level1Data || level1Data.items.length === 0 ? (
          /* EMPTY STATE (As required: no demo/fake data) */
          <div className="p-8 sm:p-10 text-center rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              No referrals yet
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Share your authoritative referral code or link with other investors. When they complete a qualifying deposit (≥ 300 USDT), you will automatically receive a 5% Level 1 reward and 2% on their Level 2 team.
            </p>
            <div className="pt-2">
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Link Copied' : 'Copy Referral Link'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Level 1 List */
          <div className="space-y-3">
            {level1Data.items.map(l1Member => {
              const isExpanded = expandedL1Id === l1Member.id;
              const subTeam = level2Map[l1Member.id];

              return (
                <div
                  key={l1Member.id}
                  className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs transition"
                >
                  {/* Level 1 Member Header Row */}
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {l1Member.name.charAt(0)}
                        {l1Member.surname.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {l1Member.surname}, {l1Member.name}
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
                          <span>Joined: {new Date(l1Member.joinedAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{l1Member.level2Count} Level 2 members</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end space-x-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/60">
                      {/* Qualification status badge */}
                      <div className="text-right">
                        {l1Member.isQualified ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Qualified</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
                            <Clock className="w-3 h-3" />
                            <span>Pending Deposit</span>
                          </span>
                        )}
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          Reward: +${l1Member.rewardEarned.toFixed(2)} USDT
                        </p>
                      </div>

                      {/* Expand / Collapse Button for Level 2 */}
                      <button
                        onClick={() => toggleLevel1Expand(l1Member.id)}
                        className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                          isExpanded
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>Level 2 Team ({l1Member.level2Count})</span>
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Level 2 Sub-Accordion (Hierarchical Level-wise view) */}
                  {isExpanded && (
                    <div className="bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-500" />
                          Level 2 Members under {l1Member.name} {l1Member.surname}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          Eligible 2% reward tier
                        </span>
                      </div>

                      {subTeam?.isLoading ? (
                        <div className="py-4 text-center">
                          <p className="text-xs text-slate-400">Loading Level 2 members...</p>
                        </div>
                      ) : subTeam?.error ? (
                        <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 text-xs rounded-xl flex items-center justify-between">
                          <span>{subTeam.error}</span>
                          <button
                            onClick={() => fetchLevel2ForUser(l1Member.id, 1)}
                            className="px-2 py-1 bg-red-600 text-white rounded font-bold text-[10px]"
                          >
                            Retry
                          </button>
                        </div>
                      ) : !subTeam?.data || subTeam.data.items.length === 0 ? (
                        <div className="p-4 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
                          <p className="text-xs text-slate-500">
                            No Level 2 members registered under this referral yet.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {subTeam.data.items.map(l2Member => (
                            <div
                              key={l2Member.id}
                              className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center space-x-2.5">
                                <span className="text-slate-400 font-mono text-xs">└──</span>
                                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[11px]">
                                  {l2Member.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 dark:text-white">
                                    {l2Member.surname}, {l2Member.name}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    Joined {new Date(l2Member.joinedAt).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>

                              <div className="text-right">
                                {l2Member.isQualified ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                                    Qualified
                                  </span>
                                ) : (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                                    Pending
                                  </span>
                                )}
                                <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                                  +${l2Member.rewardEarned.toFixed(2)} USDT
                                </p>
                              </div>
                            </div>
                          ))}

                          {/* Level 2 Pagination if > 1 page */}
                          {subTeam.data.totalPages > 1 && (
                            <div className="flex items-center justify-between pt-2">
                              <button
                                disabled={subTeam.page <= 1}
                                onClick={() => fetchLevel2ForUser(l1Member.id, subTeam.page - 1)}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                              >
                                Prev L2
                              </button>
                              <span className="text-[11px] text-slate-500">
                                Page {subTeam.page} of {subTeam.data.totalPages}
                              </span>
                              <button
                                disabled={subTeam.page >= subTeam.data.totalPages}
                                onClick={() => fetchLevel2ForUser(l1Member.id, subTeam.page + 1)}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                              >
                                Next L2
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Level 1 Pagination Controls */}
            {level1Data.totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 px-1">
                <button
                  disabled={level1Page <= 1}
                  onClick={() => handleLevel1PageChange(level1Page - 1)}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Page {level1Page} of {level1Data.totalPages} ({level1Data.totalCount} members)
                </span>

                <button
                  disabled={level1Page >= level1Data.totalPages}
                  onClick={() => handleLevel1PageChange(level1Page + 1)}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

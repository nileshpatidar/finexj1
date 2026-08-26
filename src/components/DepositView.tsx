import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../services/api';
import { DepositItem, AppSettings } from '../types';
import {
  ArrowDownToLine,
  Copy,
  Check,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface DepositViewProps {
  onDepositConfirmed: () => void;
}

export const DepositView: React.FC<DepositViewProps> = ({ onDepositConfirmed }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [txHash, setTxHash] = useState('');
  const [amount, setAmount] = useState<string>('100');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastConfirmedDeposit, setLastConfirmedDeposit] = useState<DepositItem | null>(null);

  const loadData = async () => {
    try {
      const [settRes, depRes] = await Promise.all([
        api.getSettings(),
        api.getDeposits(),
      ]);
      setSettings(settRes);
      setDeposits(depRes.deposits || []);
    } catch (err) {
      console.warn('Error loading deposit data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const depositAddress = settings?.bep20DepositAddress || '0x71C5A8c0B26D19543e49e29547d6e492211C54a9';

  const handleCopy = () => {
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleVerifyDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txHash) {
      setErrorMessage('Please enter the blockchain transaction hash.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.submitDeposit({
        txHash: txHash.trim(),
        amount: amount ? parseFloat(amount) : undefined,
      });

      if (res.success && res.deposit) {
        setSuccessMessage(`Deposit of $${res.deposit.amount} USDT successfully verified and credited!`);
        setLastConfirmedDeposit(res.deposit);
        setTxHash('');
        await loadData();
        onDepositConfirmed();
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Deposit verification failed. Please check the transaction hash.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24">
      {/* Title & Network Header */}
      <div>
        <div className="flex items-center space-x-2">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            Deposit USDT
          </h1>
          <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-600 text-white rounded-md shadow-xs">
            BEP-20 (BSC)
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          Deposit USDT on the BNB Smart Chain network to start earning daily fund performance.
        </p>
      </div>

      {/* Critical Network Warning */}
      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 flex items-start space-x-3 text-xs shadow-xs">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-amber-950 dark:text-amber-100">Mandatory Network Notice</p>
          <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed font-medium">
            Send <strong>USDT only through BNB Smart Chain (BEP-20)</strong>. Sending through ERC-20, TRC-20, Polygon, or other networks will result in irreversible loss of funds.
          </p>
        </div>
      </div>

      {/* Deposit QR & Address Box */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* QR Code */}
          <div className="p-3.5 bg-white rounded-2xl shadow-md border border-slate-200 flex-shrink-0">
            <QRCodeSVG
              value={depositAddress}
              size={135}
              level="H"
              includeMargin={false}
            />
          </div>

          {/* Address Details & Copy */}
          <div className="flex-1 space-y-3 w-full text-center sm:text-left">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Official BEP-20 Deposit Wallet
              </span>
              <div className="mt-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 break-all font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                {depositAddress}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center space-x-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-md shadow-blue-500/25 transition active:scale-95 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Address Copied!' : 'Copy Deposit Address'}</span>
              </button>

              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Min. confirmations: {settings?.requiredConfirmations || 12} blocks
              </span>
            </div>
          </div>
        </div>

        {/* 3 Steps Guidance */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-blue-600 dark:text-blue-400 font-bold block text-sm">1. Transfer USDT</span>
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
              Send BEP-20 USDT from your wallet (Trust Wallet, Binance, etc.)
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-blue-600 dark:text-blue-400 font-bold block text-sm">2. Paste Tx Hash</span>
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
              Copy transaction hash from your wallet and paste in the form below
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-blue-600 dark:text-blue-400 font-bold block text-sm">3. Verification</span>
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
              Backend verifies on BSC network and allocates principal immediately
            </p>
          </div>
        </div>
      </div>

      {/* Deposit Verification Form */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Verify Blockchain Transaction</span>
          </h2>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex items-center space-x-2 font-medium">
            <XCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs flex items-center space-x-2 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-blue-500" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleVerifyDeposit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Deposit Amount (USDT)
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="10"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="100"
                className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
              />
              <span className="absolute right-3.5 top-3 font-bold text-slate-400">USDT</span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              BNB Smart Chain Transaction Hash (TxID)
            </label>
            <input
              type="text"
              value={txHash}
              onChange={e => setTxHash(e.target.value)}
              placeholder="0x..."
              className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Paste the 66-character transaction hash from BSCScan or your crypto wallet.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !txHash}
            className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying on BNB Smart Chain...</span>
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4" />
                <span>Verify & Credit Deposit</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Last Confirmed Deposit Details Receipt */}
      {lastConfirmedDeposit && (
        <div className="rounded-3xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-5 shadow-lg space-y-3 text-xs">
          <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-400 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>Deposit Confirmed Successfully</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-slate-700 dark:text-slate-300">
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Amount</p>
              <p className="font-bold text-blue-600 dark:text-blue-400 text-sm">${lastConfirmedDeposit.amount.toFixed(2)} USDT</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Network</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">BEP-20 (BSC)</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Confirmations</p>
              <p className="font-semibold text-blue-600 dark:text-blue-400">{lastConfirmedDeposit.confirmations} Blocks</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">First Earning Date</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {lastConfirmedDeposit.eligibilityDate ? new Date(lastConfirmedDeposit.eligibilityDate).toLocaleDateString() : 'Next Server Day'}
              </p>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate break-all pt-1 border-t border-blue-200 dark:border-blue-800 font-mono">
            TxHash: {lastConfirmedDeposit.txHash}
          </div>
        </div>
      )}

      {/* Past Deposit History */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Deposit History
        </h2>

        {deposits.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
            No deposits found.
          </div>
        ) : (
          <div className="space-y-2">
            {deposits.map(dep => (
              <div
                key={dep.id}
                className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      +${dep.amount.toFixed(2)} USDT
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      {dep.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-xs sm:max-w-md">
                    Tx: {dep.txHash.substring(0, 10)}...{dep.txHash.slice(-8)}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(dep.createdAt).toLocaleString()} • {dep.confirmations} Confirmations
                  </p>
                </div>

                <div className="text-right text-[11px]">
                  <p className="text-slate-500 dark:text-slate-400">Lock Expiry:</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {dep.depositLockEndDate ? new Date(dep.depositLockEndDate).toLocaleDateString() : '20 Days'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Risk Disclaimer in Short Font */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 space-y-1.5 text-xs">
        <div className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Managed Fund Risk Disclosure</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          <strong>DISCLAIMER:</strong> Deposited funds are pooled and deployed into active algorithmic trading and digital asset liquidity strategies. Cryptocurrency trading involves market volatility and capital risk. Past returns and historical daily performance do not guarantee future earnings. Daily yield rates are variable based on net fund performance and are non-guaranteed. Newly deposited principal is subject to a 20-day liquidity stabilization lock. By submitting a deposit, you confirm acceptance of all governance rules.
        </p>
      </div>
    </div>
  );
};

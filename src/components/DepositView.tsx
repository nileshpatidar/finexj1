import React, { useState, useEffect, useRef } from 'react';
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
  Upload,
  Image as ImageIcon,
  ExternalLink,
  Eye,
  X,
  FileCheck,
  Clock,
  RefreshCw,
  Layers,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface DepositViewProps {
  onDepositConfirmed: () => void;
}

export const DepositView: React.FC<DepositViewProps> = ({ onDepositConfirmed }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [isLoadingDeposits, setIsLoadingDeposits] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [userNotes, setUserNotes] = useState('');
  const [proofPhotoUrl, setProofPhotoUrl] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedTxId, setCopiedTxId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifyingDepositId, setVerifyingDepositId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSubmittedDeposit, setLastSubmittedDeposit] = useState<DepositItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setIsLoadingDeposits(true);
    try {
      const [settRes, depRes] = await Promise.all([
        api.getSettings(),
        api.getDeposits(),
      ]);
      setSettings(settRes);
      if (settRes?.minimumDepositAmount && !amount) {
        setAmount(String(settRes.minimumDepositAmount));
      }
      setDeposits(depRes.deposits || []);
    } catch (err) {
      console.warn('Error loading deposit data:', err);
    } finally {
      setIsLoadingSettings(false);
      setIsLoadingDeposits(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // System-configured authoritative deposit address (NEVER hardcoded)
  const depositAddress = settings?.bep20DepositAddress || '';
  // System-configured authoritative minimum deposit (NEVER hardcoded as authoritative value)
  const minDeposit = settings?.minimumDepositAmount ?? 300;

  const handleCopyAddress = () => {
    if (!depositAddress) return;
    navigator.clipboard.writeText(depositAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2500);
  };

  const handleCopyTxHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedTxId(hash);
    setTimeout(() => setCopiedTxId(null), 2500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, JPEG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image size is too large. Please select an image under 5MB.');
      return;
    }

    setProofFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setProofPhotoUrl(reader.result as string);
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setProofPhotoUrl(null);
    setProofFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Frontend format validation for UX (backend remains authoritative)
  const isValidTxHashFormat = (hash: string): boolean => {
    return /^0x[a-fA-F0-9]{64}$/.test(hash.trim());
  };

  const isHashLengthOk = txHash.trim().length === 66;
  const isHashFormatValid = isValidTxHashFormat(txHash);
  const numAmount = parseFloat(amount);
  const isAmountValid = !isNaN(numAmount) && numAmount >= minDeposit;

  const handleReverifyDeposit = async (depId: string) => {
    setVerifyingDepositId(depId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await api.verifyUserDeposit(depId);
      if (res.success) {
        if (res.deposit?.status === 'confirmed') {
          setSuccessMessage(res.message || 'Deposit successfully verified on BNB Smart Chain and credited!');
          onDepositConfirmed();
        } else {
          setSuccessMessage(res.message || `Current BSC confirmations: ${res.confirmations || 0}/${res.requiredConfirmations || 12}`);
        }
        await loadData();
      } else {
        setErrorMessage(res.error || 'Verification on BNB Smart Chain did not succeed.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to query BNB Smart Chain RPC.');
    } finally {
      setVerifyingDepositId(null);
    }
  };

  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanTx = txHash.trim();
    if (!cleanTx) {
      setErrorMessage('Please provide the BNB Smart Chain Transaction Hash (TxID). This is required to verify and track your deposit.');
      return;
    }

    // Frontend UX format validation
    if (!isValidTxHashFormat(cleanTx)) {
      setErrorMessage('Invalid transaction hash format. BNB Smart Chain TxID must be a 66-character hexadecimal string starting with 0x.');
      return;
    }

    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid deposit amount greater than 0 USDT.');
      return;
    }

    if (numAmount < minDeposit) {
      setErrorMessage(`Minimum deposit is ${minDeposit} USDT. Please enter an amount of ${minDeposit} USDT or more.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.submitDeposit({
        txHash: cleanTx,
        amount: numAmount,
        proofPhotoUrl: proofPhotoUrl || undefined,
        userNotes: userNotes.trim() || undefined,
      });

      if (res.success && res.deposit) {
        const isConfirmed = res.deposit.status === 'confirmed';
        const depAmt = Number(res.deposit.amount || numAmount);
        setSuccessMessage(
          isConfirmed
            ? `Deposit of $${depAmt.toFixed(2)} USDT verified on BNB Smart Chain and credited to your account!`
            : `Deposit of $${depAmt.toFixed(2)} USDT registered on BSC. Awaiting network confirmations (${res.deposit.confirmations || 0}/${res.deposit.requiredConfirmations || 12}).`
        );
        setLastSubmittedDeposit(res.deposit);
        setTxHash('');
        setUserNotes('');
        handleRemovePhoto();
        await loadData();
        onDepositConfirmed();
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Deposit submission failed. Please verify your details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStatusBadge = (status: DepositItem['status'], confirmations?: number, requiredConfirmations?: number) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>Confirmed</span>
          </span>
        );
      case 'pending':
      case 'confirming':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            <span>
              Pending {confirmations !== undefined ? `(${confirmations}/${requiredConfirmations || 12})` : ''}
            </span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" />
            <span>Rejected</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30">
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <span>{status}</span>
          </span>
        );
    }
  };

  // Dynamic quick-select presets based on backend minimum deposit
  const presetAmounts = [minDeposit, minDeposit * 2, minDeposit * 3, minDeposit * 5, 2500, 5000].filter(
    (val, idx, arr) => val >= minDeposit && arr.indexOf(val) === idx
  ).slice(0, 5);

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24">
      {/* Title & Network Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            Deposit USDT
          </h1>
          <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-600 text-white rounded-md shadow-xs">
            USDT — BEP-20
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          Deposit USDT on the BNB Smart Chain network to fund your active principal. Transactions are authoritatively verified by backend RPC nodes.
        </p>
      </div>

      {/* BEP-20 Warning Banner (Requirement #3: Clearly display BEP-20 only & prevent network confusion) */}
      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 flex items-start space-x-3 text-xs shadow-xs">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-amber-950 dark:text-amber-100">
            Mandatory Network Notice: USDT — BEP-20 Only
          </p>
          <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed font-medium">
            This deposit wallet strictly accepts <strong>USDT through BNB Smart Chain (BEP-20)</strong>. Do not send via Ethereum (ERC-20), Tron (TRC-20), Polygon, Solana, or any other network. Transactions sent on unsupported networks cannot be recovered.
          </p>
        </div>
      </div>

      {/* Deposit QR & Address Card (Requirement #1 & #4: Loaded from backend settings, copy with feedback) */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* QR Code */}
          <div className="p-3.5 bg-white rounded-2xl shadow-md border border-slate-200 flex-shrink-0 flex items-center justify-center min-w-[155px] min-h-[155px]">
            {isLoadingSettings || !depositAddress ? (
              <div className="flex flex-col items-center justify-center space-y-2 p-6 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-[10px] font-semibold">Loading Address...</span>
              </div>
            ) : (
              <QRCodeSVG
                value={depositAddress}
                size={135}
                level="H"
                includeMargin={false}
              />
            )}
          </div>

          {/* Address Details & Copy */}
          <div className="flex-1 space-y-3 w-full text-center sm:text-left">
            <div>
              <div className="flex items-center justify-center sm:justify-start space-x-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  FINEXJ BEP-20 Deposit Wallet Address
                </span>
              </div>
              <div className="mt-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 break-all font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                {isLoadingSettings ? (
                  <span className="text-slate-400 animate-pulse">Loading system deposit address...</span>
                ) : depositAddress ? (
                  depositAddress
                ) : (
                  <span className="text-rose-500">Deposit address currently unavailable. Please refresh.</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <button
                type="button"
                onClick={handleCopyAddress}
                disabled={!depositAddress}
                className={`flex items-center space-x-2 py-2.5 px-4 rounded-xl font-bold text-xs shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  copiedAddress
                    ? 'bg-emerald-600 text-white shadow-emerald-500/25'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-blue-500/25'
                }`}
              >
                {copiedAddress ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAddress ? 'Address Copied!' : 'Copy Wallet Address'}</span>
              </button>

              {depositAddress && (
                <a
                  href={`https://bscscan.com/address/${depositAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-1.5 py-2.5 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
                >
                  <span>View Wallet on BscScan</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>
              )}
            </div>

            {/* Quick verification reassurance */}
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Network: <strong>BNB Smart Chain (BEP-20)</strong> • Token: <strong>Tether USD (USDT)</strong>
            </p>
          </div>
        </div>

        {/* 3 Steps Guidance for Users */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-blue-600 dark:text-blue-400 font-bold block text-sm">1. Send BEP-20 USDT</span>
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
              Transfer USDT using BNB Smart Chain from Binance, Trust Wallet, MetaMask, OKX, etc.
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-blue-600 dark:text-blue-400 font-bold block text-sm">2. Submit Transaction Hash</span>
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
              Paste your 66-character BSC transaction hash (TxID) to register your transfer.
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-blue-600 dark:text-blue-400 font-bold block text-sm">3. Node Confirmation</span>
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
              Backend RPC node confirms 12 BSC blocks and atomically credits your principal balance.
            </p>
          </div>
        </div>
      </div>

      {/* Deposit Submission Form (Requirements #1, #2, #5, #7, #8) */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Deposit Registration & Verification</span>
          </h2>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            USDT — BEP-20
          </span>
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

        <form onSubmit={handleSubmitDeposit} className="space-y-4 text-xs">
          {/* Amount Field (Requirement #2: Minimum deposit from backend, prevent below minimum) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                Deposit Amount (USDT) <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                Minimum: {minDeposit} USDT
              </span>
            </div>

            <div className="relative">
              <input
                type="number"
                step="any"
                min={minDeposit}
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={String(minDeposit)}
                className={`w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border text-slate-900 dark:text-white font-semibold text-sm focus:outline-none transition ${
                  amount && !isAmountValid
                    ? 'border-rose-400 focus:border-rose-500 bg-rose-50/20'
                    : 'border-slate-200 dark:border-slate-700 focus:border-blue-600 dark:focus:border-blue-500'
                }`}
              />
              <span className="absolute right-3.5 top-3 font-bold text-slate-400">USDT</span>
            </div>

            {/* Real-time minimum validation message */}
            {amount && !isAmountValid && (
              <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center space-x-1">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span>Minimum deposit is {minDeposit} USDT. Please enter {minDeposit} USDT or more.</span>
              </p>
            )}

            {/* Quick preset amount buttons derived from minimum deposit */}
            <div className="flex flex-wrap gap-2 mt-2">
              {presetAmounts.map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAmount(val.toString())}
                  className={`py-1 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                    amount === val.toString()
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  ${val.toLocaleString()} USDT
                </button>
              ))}
            </div>
          </div>

          {/* Transaction Hash Field (Requirement #1 & #5: UX format validation, backend authoritative) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                BNB Smart Chain Transaction Hash (TxID) <span className="text-rose-500 font-bold">*Required</span>
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                66-character BEP-20 hex
              </span>
            </div>
            <input
              type="text"
              required
              value={txHash}
              onChange={e => setTxHash(e.target.value)}
              placeholder="0x... (66-character BEP-20 transaction hash)"
              className={`w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border text-slate-900 dark:text-white font-mono text-xs focus:outline-none transition ${
                txHash.trim() && !isHashFormatValid
                  ? 'border-amber-400 focus:border-amber-500 bg-amber-50/20'
                  : 'border-slate-200 dark:border-slate-700 focus:border-blue-600 dark:focus:border-blue-500'
              }`}
            />

            {/* Real-time UX validation helper */}
            {txHash.trim() && !isHashFormatValid && (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>
                  {txHash.trim().startsWith('0x')
                    ? `Current length: ${txHash.trim().length}/66 characters. EVM hash requires exactly 64 hexadecimal characters after 0x.`
                    : 'Transaction hash must start with "0x" followed by 64 hexadecimal characters.'}
                </span>
              </p>
            )}

            {txHash.trim() && isHashFormatValid && (
              <div className="mt-1.5 flex items-center space-x-1 text-[11px] text-blue-600 dark:text-blue-400">
                <ExternalLink className="w-3 h-3" />
                <a
                  href={`https://bscscan.com/tx/${txHash.trim()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline font-mono truncate"
                >
                  Verify on BscScan: {txHash.trim().substring(0, 18)}...
                </a>
              </div>
            )}
          </div>

          {/* Payment Proof Photo Upload (Optional Receipt) */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Upload Payment Proof / Transfer Screenshot <span className="text-slate-400 font-normal">(Optional)</span>
            </label>

            {!proofPhotoUrl ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-6 text-center bg-slate-50 dark:bg-slate-900/50 transition cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-950/20"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                      Click to upload transfer receipt or wallet screenshot
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Supports PNG, JPG, JPEG, WEBP (Max 5MB)
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative group cursor-pointer" onClick={() => setPreviewModalImage(proofPhotoUrl)}>
                    <img
                      src={proofPhotoUrl}
                      alt="Payment Proof"
                      className="w-14 h-14 object-cover rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs"
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <Eye className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-xs truncate max-w-xs">
                      {proofFileName || 'Transfer Receipt Screenshot'}
                    </p>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5 flex items-center space-x-1">
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Receipt attached</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setPreviewModalImage(proofPhotoUrl)}
                    className="p-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                    title="View Full Screenshot"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 transition cursor-pointer"
                    title="Remove Photo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Notes */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Sender Wallet / Memo <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={userNotes}
              onChange={e => setUserNotes(e.target.value)}
              placeholder="e.g. Sent from Trust Wallet / Binance"
              className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !txHash.trim() || !amount || !isAmountValid || !isHashFormatValid}
            className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Submitting & Verifying on BSC...</span>
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4" />
                <span>Submit Deposit for Verification</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Last Submitted Deposit Confirmation Receipt (Requirement #7 & #9) */}
      {lastSubmittedDeposit && (
        <div className="rounded-3xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-5 shadow-lg space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-400 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {lastSubmittedDeposit.status === 'confirmed' ? 'Deposit Confirmed & Credited' : 'Deposit Registered on BSC'}
              </span>
            </div>
            {renderStatusBadge(
              lastSubmittedDeposit.status,
              lastSubmittedDeposit.confirmations,
              lastSubmittedDeposit.requiredConfirmations
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-slate-700 dark:text-slate-300">
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Amount</p>
              <p className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                ${Number(lastSubmittedDeposit.amount || 0).toFixed(2)} USDT
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Network</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">BEP-20 (BSC)</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Confirmations</p>
              <p className="font-semibold text-blue-600 dark:text-blue-400">
                {lastSubmittedDeposit.confirmations || 0} / {lastSubmittedDeposit.requiredConfirmations || 12}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Yield Eligibility</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {lastSubmittedDeposit.eligibilityDate
                  ? new Date(lastSubmittedDeposit.eligibilityDate).toLocaleDateString()
                  : 'Calculated upon confirmation'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-200 dark:border-blue-800">
            {lastSubmittedDeposit.txHash && (
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-mono truncate max-w-sm">
                TxHash: {lastSubmittedDeposit.txHash}
              </span>
            )}

            <div className="flex items-center space-x-2">
              {lastSubmittedDeposit.txHash && (
                <a
                  href={`https://bscscan.com/tx/${lastSubmittedDeposit.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-1 py-1 px-2.5 rounded-lg bg-blue-600 text-white font-bold text-[11px] hover:bg-blue-700 transition"
                >
                  <span>Track on BscScan</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {lastSubmittedDeposit.proofPhotoUrl && (
                <button
                  type="button"
                  onClick={() => setPreviewModalImage(lastSubmittedDeposit.proofPhotoUrl!)}
                  className="flex items-center space-x-1 py-1 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-bold text-[11px] hover:bg-blue-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>View Receipt</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deposit History (Requirement #10: amount, network, txHash, status, created date, confirmed date, eligibility/lock date; No admin notes or fraud info) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Your Deposit History & BSC Tracking
          </h2>
          <button
            type="button"
            onClick={loadData}
            disabled={isLoadingDeposits}
            className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingDeposits ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {deposits.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
            {isLoadingDeposits ? 'Loading your deposit history...' : 'No deposit records found yet.'}
          </div>
        ) : (
          <div className="space-y-3">
            {deposits.map(dep => {
              const isConfirmed = dep.status === 'confirmed';
              const isPending = dep.status === 'pending' || dep.status === 'confirming';
              const isRejected = dep.status === 'rejected';
              const isFailed = dep.status === 'failed';
              const isVerifying = verifyingDepositId === dep.id;

              return (
                <div
                  key={dep.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-3 text-xs shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      {dep.proofPhotoUrl ? (
                        <div
                          className="relative group cursor-pointer flex-shrink-0"
                          onClick={() => setPreviewModalImage(dep.proofPhotoUrl!)}
                        >
                          <img
                            src={dep.proofPhotoUrl}
                            alt="Receipt"
                            className="w-12 h-12 object-cover rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs"
                          />
                          <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <Eye className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold flex-shrink-0">
                          <ArrowDownToLine className="w-6 h-6" />
                        </div>
                      )}

                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-base text-slate-900 dark:text-white">
                            +${Number(dep.amount || 0).toFixed(2)} USDT
                          </span>
                          {renderStatusBadge(dep.status, dep.confirmations, dep.requiredConfirmations)}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(dep.createdAt).toLocaleString()} • BEP-20 (BSC)
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isPending && (
                        <button
                          type="button"
                          onClick={() => handleReverifyDeposit(dep.id)}
                          disabled={isVerifying}
                          className="flex items-center space-x-1.5 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-[11px] transition shadow-xs cursor-pointer"
                        >
                          {isVerifying ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Checking BSC...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3" />
                              <span>Check Confirmations</span>
                            </>
                          )}
                        </button>
                      )}

                      {dep.txHash && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCopyTxHash(dep.txHash)}
                            className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] transition cursor-pointer"
                            title="Copy Transaction Hash"
                          >
                            {copiedTxId === dep.txHash ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedTxId === dep.txHash ? 'Copied' : 'Copy TxID'}</span>
                          </button>

                          <a
                            href={`https://bscscan.com/tx/${dep.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-[11px] border border-blue-200 dark:border-blue-800 transition cursor-pointer"
                          >
                            <span>BscScan</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </>
                      )}

                      {dep.proofPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewModalImage(dep.proofPhotoUrl!)}
                          className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] transition cursor-pointer"
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>Receipt</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Transaction Metadata Bar: Network, TxHash, Dates, Lock Expiry (No internal admin notes or fraud info) */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] gap-2 text-slate-500 dark:text-slate-400">
                    <div className="font-mono truncate max-w-sm flex items-center space-x-2">
                      <span className="truncate">TxID: {dep.txHash || 'Pending broadcast'}</span>
                      {dep.blockNumber && (
                        <span className="text-slate-400 flex items-center space-x-0.5 flex-shrink-0">
                          <Layers className="w-3 h-3 inline" />
                          <span>Block #{dep.blockNumber}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {dep.confirmedAt && (
                        <span>
                          Confirmed: <strong className="text-slate-800 dark:text-slate-200 font-mono">{new Date(dep.confirmedAt).toLocaleDateString()}</strong>
                        </span>
                      )}

                      {isConfirmed ? (
                        dep.depositLockEndDate ? (
                          <span>
                            Lock Expiry:{' '}
                            <strong className="text-slate-800 dark:text-slate-200 font-mono">
                              {new Date(dep.depositLockEndDate).toLocaleDateString()}
                            </strong>
                          </span>
                        ) : null
                      ) : isPending ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Awaiting {dep.requiredConfirmations || 12} BSC Confirmations</span>
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 font-medium">
                          Verification could not be confirmed on BNB Smart Chain.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Photo Modal Viewer */}
      {previewModalImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewModalImage(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-2xl border border-slate-700 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Payment Proof & Transfer Receipt</span>
              </h3>
              <button
                type="button"
                onClick={() => setPreviewModalImage(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto flex items-center justify-center rounded-2xl bg-slate-950 p-2">
              <img
                src={previewModalImage}
                alt="Full Payment Proof"
                className="max-h-[70vh] w-auto object-contain rounded-xl"
              />
            </div>
            <div className="pt-3 text-right">
              <button
                type="button"
                onClick={() => setPreviewModalImage(null)}
                className="py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Risk Disclaimer in Short Font */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 space-y-1.5 text-xs">
        <div className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Managed Fund Risk Disclosure</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          <strong>DISCLAIMER:</strong> Deposited funds are pooled and deployed into active algorithmic trading and digital asset liquidity strategies. Cryptocurrency trading involves market volatility and capital risk. Past returns and historical daily performance do not guarantee future earnings. Daily yield rates are variable based on net fund performance and are non-guaranteed. Newly deposited principal is subject to a 30-day liquidity stabilization lock. By submitting a deposit, you confirm acceptance of all governance rules.
        </p>
      </div>
    </div>
  );
};

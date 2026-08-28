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
  Sparkles,
} from 'lucide-react';

interface DepositViewProps {
  onDepositConfirmed: () => void;
}

export const DepositView: React.FC<DepositViewProps> = ({ onDepositConfirmed }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [txHash, setTxHash] = useState('');
  const [amount, setAmount] = useState<string>('300');
  const [userNotes, setUserNotes] = useState('');
  const [proofPhotoUrl, setProofPhotoUrl] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingMock, setIsGeneratingMock] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSubmittedDeposit, setLastSubmittedDeposit] = useState<DepositItem | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleGenerateMockTx = async () => {
    setIsGeneratingMock(true);
    try {
      const res = await api.getMockTxHash();
      if (res && res.txHash) {
        setTxHash(res.txHash);
      }
    } catch (err) {
      console.warn('Could not generate mock hash', err);
    } finally {
      setIsGeneratingMock(false);
    }
  };

  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txHash.trim()) {
      setErrorMessage('Please provide the BNB Smart Chain Transaction Hash (TxID). This is required to verify and track your deposit.');
      return;
    }

    const numAmount = parseFloat(amount);
    const minDeposit = settings?.minimumDepositAmount || 300;
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid deposit amount greater than 0 USDT.');
      return;
    }

    if (numAmount < minDeposit) {
      setErrorMessage(`Minimum deposit is ${minDeposit} USDT. Please enter an amount of ${minDeposit} USDT or more.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.submitDeposit({
        txHash: txHash.trim(),
        amount: numAmount,
        proofPhotoUrl: proofPhotoUrl || undefined,
        userNotes: userNotes.trim() || undefined,
      });

      if (res.success && res.deposit) {
        const isPending = res.deposit.status === 'pending';
        const depAmt = Number(res.deposit.amount || 0);
        setSuccessMessage(
          isPending
            ? `Deposit confirmation of $${depAmt.toFixed(2)} USDT submitted successfully! Our finance department will review your proof and confirm it shortly.`
            : `Deposit of $${depAmt.toFixed(2)} USDT successfully verified on BNB Smart Chain and credited!`
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

              <a
                href={`https://bscscan.com/address/${depositAddress}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-1.5 py-2.5 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
              >
                <span>View Wallet on BscScan</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>
            </div>
          </div>
        </div>

        {/* 3 Steps Guidance */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-blue-600 dark:text-blue-400 font-bold block text-sm">1. Transfer USDT</span>
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
              Send BEP-20 USDT from your wallet (Binance, Trust Wallet, MetaMask, etc.)
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-blue-600 dark:text-blue-400 font-bold block text-sm">2. Upload Receipt & TxID</span>
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
              Upload payment screenshot and enter transaction hash for verification
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-blue-600 dark:text-blue-400 font-bold block text-sm">3. Verification & Yield</span>
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
              Confirmed on BNB Smart Chain and added to your principal portfolio
            </p>
          </div>
        </div>
      </div>

      {/* Deposit Confirmation & Payment Proof Form */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Deposit Confirmation & Payment Proof</span>
          </h2>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Quick Verification
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
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                Deposit Amount (USDT) <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                Minimum: {settings?.minimumDepositAmount || 300} USDT
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                min={settings?.minimumDepositAmount || 300}
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="300"
                className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
              />
              <span className="absolute right-3.5 top-3 font-bold text-slate-400">USDT</span>
            </div>
            {/* Quick preset amount buttons */}
            <div className="flex flex-wrap gap-2 mt-2">
              {[300, 500, 1000, 2500, 5000].map(val => (
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
                  ${val.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Proof Photo Upload */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Upload Payment Proof / Screenshot (Receipt)
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
                      Click to upload transfer screenshot or receipt photo
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
                      <span>Proof attached ready for submission</span>
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

          {/* Transaction Hash */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                BNB Smart Chain Transaction Hash (TxID) <span className="text-rose-500 font-bold">*Required</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateMockTx}
                disabled={isGeneratingMock}
                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>Fill Sample TxHash</span>
              </button>
            </div>
            <input
              type="text"
              required
              value={txHash}
              onChange={e => setTxHash(e.target.value)}
              placeholder="0x... (from Binance, Trust Wallet, MetaMask, or BSCScan)"
              className="w-full py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
            />
            {txHash && (
              <div className="mt-1.5 flex items-center space-x-1 text-[11px] text-blue-600 dark:text-blue-400">
                <ExternalLink className="w-3 h-3" />
                <a
                  href={`https://bscscan.com/tx/${txHash.trim()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline font-mono truncate"
                >
                  Track on BSCScan: https://bscscan.com/tx/{txHash.trim().substring(0, 16)}...
                </a>
              </div>
            )}
          </div>

          {/* User Notes */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Sender Wallet / Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={userNotes}
              onChange={e => setUserNotes(e.target.value)}
              placeholder="e.g. Sent from Trust Wallet 0x123..."
              className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !txHash.trim() || !amount}
            className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Submitting Deposit for Review...</span>
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4" />
                <span>Submit Deposit for Confirmation</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Last Submitted Deposit Details Receipt */}
      {lastSubmittedDeposit && (
        <div className="rounded-3xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-5 shadow-lg space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-400 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {lastSubmittedDeposit.status === 'confirmed' ? 'Deposit Confirmed & Credited' : 'Deposit Submitted for Review'}
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-600 text-white">
              {lastSubmittedDeposit.status}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-slate-700 dark:text-slate-300">
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Amount</p>
              <p className="font-bold text-blue-600 dark:text-blue-400 text-sm">${Number(lastSubmittedDeposit.amount || 0).toFixed(2)} USDT</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Network</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">BEP-20 (BSC)</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Status</p>
              <p className="font-semibold text-blue-600 dark:text-blue-400 capitalize">{lastSubmittedDeposit.status}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">First Earning Date</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {lastSubmittedDeposit.eligibilityDate ? new Date(lastSubmittedDeposit.eligibilityDate).toLocaleDateString() : 'Next Server Day (Upon Confirmation)'}
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
                  <span>View Proof Photo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Past Deposit History */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Your Deposit History & BSC Tracking
        </h2>

        {deposits.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
            No deposit records found yet.
          </div>
        ) : (
          <div className="space-y-3">
            {deposits.map(dep => {
              const isConfirmed = dep.status === 'confirmed';
              const isPending = dep.status === 'pending' || dep.status === 'confirming';
              const isRejected = dep.status === 'rejected';

              return (
                <div
                  key={dep.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 space-y-3 text-xs shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
                        <div className="flex items-center space-x-2">
                          <span className="font-extrabold text-base text-slate-900 dark:text-white">
                            +${Number(dep.amount || 0).toFixed(2)} USDT
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isConfirmed
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : isPending
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {dep.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(dep.createdAt).toLocaleString()} • BEP-20 (BSC)
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {dep.txHash && (
                        <a
                          href={`https://bscscan.com/tx/${dep.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-[11px] border border-blue-200 dark:border-blue-800 transition cursor-pointer"
                        >
                          <span>Track on BscScan</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {dep.proofPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewModalImage(dep.proofPhotoUrl!)}
                          className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] transition cursor-pointer"
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>View Proof Photo</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] gap-1 text-slate-500 dark:text-slate-400">
                    <div className="font-mono truncate max-w-sm">
                      TxID: {dep.txHash || 'Pending blockchain broadcast'}
                    </div>
                    <div>
                      {isConfirmed ? (
                        <span>
                          Lock Expiry:{' '}
                          <strong className="text-slate-800 dark:text-slate-200">
                            {dep.depositLockEndDate ? new Date(dep.depositLockEndDate).toLocaleDateString() : '30 Days'}
                          </strong>
                        </span>
                      ) : isPending ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Under verification by finance admin</span>
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400">
                          Rejected: {dep.adminNotes || 'Verification failed'}
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


import { getSettings } from './repositories/settings';
import { getDepositByTxHash } from './repositories/deposits';

export interface VerificationResult {
  isValid: boolean;
  isPendingConfirmations?: boolean;
  amount?: number;
  fromAddress?: string;
  toAddress?: string;
  tokenContract?: string;
  confirmations: number;
  requiredConfirmations: number;
  txHash: string;
  blockNumber?: number;
  status?: 'confirmed' | 'pending' | 'failed' | 'invalid';
  errorCode?: string;
  errorMessage?: string;
}

export interface DecodedTransferLog {
  tokenContract: string;
  fromAddress: string;
  toAddress: string;
  rawAmount: bigint;
  amount: number;
}

// Canonical BSC Mainnet Configuration Constants
export const BSC_CHAIN_ID_DECIMAL = 56;
export const BSC_CHAIN_ID_HEX = '0x38';
export const CANONICAL_BSC_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
export const DEFAULT_BSC_DEPOSIT_WALLET = '0x71C5A8c0B26D19543e49e29547d6e492211C54a9';
export const DEFAULT_REQUIRED_CONFIRMATIONS = 12;
export const BEP20_USDT_DECIMALS = 18;

// BEP-20 / ERC-20 Transfer(address,address,uint256) Event Signature Topic (keccak256)
export const BEP20_TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Returns the configured list of BSC JSON-RPC endpoints with resilient fallbacks.
 */
export function getBscRpcEndpoints(): string[] {
  const endpoints: string[] = [];

  if (process.env.BSC_RPC_URL && process.env.BSC_RPC_URL.trim()) {
    endpoints.push(process.env.BSC_RPC_URL.trim());
  }

  if (process.env.BSC_FALLBACK_RPC_URLS) {
    const fallbacks = process.env.BSC_FALLBACK_RPC_URLS.split(',')
      .map(url => url.trim())
      .filter(Boolean);
    endpoints.push(...fallbacks);
  }

  // Production-grade public BSC RPC endpoints
  const defaultPublicEndpoints = [
    'https://bsc-dataseed.binance.org/',
    'https://bsc-dataseed1.defibit.io/',
    'https://bsc-dataseed1.ninicoin.io/',
    'https://rpc.ankr.com/bsc',
    'https://1rpc.io/bnb',
    'https://binance.llamarpc.com',
  ];

  for (const ep of defaultPublicEndpoints) {
    if (!endpoints.includes(ep)) {
      endpoints.push(ep);
    }
  }

  return endpoints;
}

/**
 * Normalizes an EVM / BEP-20 hex address into lowercased 0x-prefixed 40 hex format.
 */
export function normalizeAddress(address?: string | null): string {
  if (!address) return '';
  const trimmed = address.trim().toLowerCase();
  if (trimmed.startsWith('0x') && trimmed.length === 66) {
    // 32-byte topic indexed address
    return '0x' + trimmed.slice(26);
  }
  return trimmed;
}

/**
 * Validates whether a given string is a valid BEP-20 Ethereum-compatible address.
 */
export function isValidBEP20Address(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/i.test(address.trim());
}

/**
 * Validates whether a given string is a syntactically valid 66-character transaction hash.
 */
export function isValidTxHash(txHash: string): boolean {
  if (!txHash || typeof txHash !== 'string') return false;
  return /^0x[a-fA-F0-9]{64}$/.test(txHash.trim());
}

/**
 * Executes a resilient JSON-RPC call across configured BSC nodes with timeout and fallback.
 */
export async function callBscRpc<T = any>(method: string, params: any[] = []): Promise<T> {
  const endpoints = getBscRpcEndpoints();
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7500);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Math.floor(Date.now() % 100000),
          method,
          params,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`BSC RPC HTTP Error ${response.status} from ${endpoint}`);
      }

      const json: any = await response.json();

      if (json.error) {
        throw new Error(`BSC RPC node error from ${endpoint}: ${json.error.message || JSON.stringify(json.error)}`);
      }

      return json.result as T;
    } catch (err: any) {
      lastError = err;
      // Continue to next fallback RPC endpoint
      continue;
    }
  }

  throw new Error(`Failed to query BSC blockchain via RPC nodes. Last error: ${lastError?.message || 'Network timeout'}`);
}

/**
 * Converts a raw token BigInt amount to standard human-readable decimal units.
 */
export function formatTokenAmount(rawAmount: bigint, decimals: number = BEP20_USDT_DECIMALS): number {
  if (rawAmount === 0n) return 0;
  const divisor = 10n ** BigInt(decimals);
  const wholePart = rawAmount / divisor;
  const remainder = rawAmount % divisor;
  const decimalStr = remainder.toString().padStart(decimals, '0');
  // Return floating point representation rounded safely to 4 decimal places
  const combined = `${wholePart.toString()}.${decimalStr.slice(0, 6)}`;
  return parseFloat(combined);
}

/**
 * Pure helper to parse and decode BEP-20 Transfer events from transaction receipt logs.
 */
export function decodeBEP20TransferLogs(
  logs: any[],
  targetContractAddress?: string,
  targetRecipientAddress?: string,
  decimals: number = BEP20_USDT_DECIMALS
): DecodedTransferLog[] {
  if (!Array.isArray(logs) || logs.length === 0) {
    return [];
  }

  const normalizedTargetContract = normalizeAddress(targetContractAddress);
  const normalizedTargetRecipient = normalizeAddress(targetRecipientAddress);
  const results: DecodedTransferLog[] = [];

  for (const log of logs) {
    if (!log || !log.topics || !Array.isArray(log.topics) || log.topics.length < 3) {
      continue;
    }

    // Check if topic0 is Transfer(address,address,uint256)
    const topic0 = log.topics[0]?.toLowerCase();
    if (topic0 !== BEP20_TRANSFER_EVENT_TOPIC.toLowerCase()) {
      continue;
    }

    const logContract = normalizeAddress(log.address);
    if (normalizedTargetContract && logContract !== normalizedTargetContract) {
      continue;
    }

    const fromAddress = normalizeAddress(log.topics[1]);
    const toAddress = normalizeAddress(log.topics[2]);

    if (normalizedTargetRecipient && toAddress !== normalizedTargetRecipient) {
      continue;
    }

    let rawAmount = 0n;
    try {
      const dataHex = log.data && typeof log.data === 'string' && log.data !== '0x' ? log.data : '0x0';
      rawAmount = BigInt(dataHex);
    } catch {
      rawAmount = 0n;
    }

    results.push({
      tokenContract: logContract,
      fromAddress,
      toAddress,
      rawAmount,
      amount: formatTokenAmount(rawAmount, decimals),
    });
  }

  return results;
}

/**
 * Computes block confirmations on BNB Smart Chain.
 */
export function calculateConfirmations(currentBlock: number, transactionBlock: number): number {
  if (currentBlock < transactionBlock || transactionBlock <= 0) return 0;
  return currentBlock - transactionBlock + 1;
}

/**
 * Authoritative Blockchain Verification for BEP-20 USDT Deposits on BNB Smart Chain.
 * Queries real BSC RPC for:
 * 1. Syntax check
 * 2. Uniqueness check against Supabase
 * 3. Real BSC transaction query
 * 4. Real BSC receipt status (status = '0x1')
 * 5. Real BEP-20 Transfer event decoding for configured USDT contract and destination wallet
 * 6. Real block confirmations calculation
 * 7. Minimum deposit threshold check
 */
export async function verifyBEP20Deposit(
  txHash: string,
  claimedAmount?: number,
  overrideToAddress?: string,
  overrideContract?: string
): Promise<VerificationResult> {
  let settings: any = {};
  try {
    settings = await getSettings();
  } catch (err) {
    // Fallback if settings repository is in-memory or DB offline
    settings = {
      requiredConfirmations: DEFAULT_REQUIRED_CONFIRMATIONS,
      minimumDepositAmount: 300,
      bep20DepositAddress: DEFAULT_BSC_DEPOSIT_WALLET,
      usdtContractAddress: CANONICAL_BSC_USDT_CONTRACT,
    };
  }

  const normalizedHash = txHash ? txHash.trim().toLowerCase() : '';

  // 1. Transaction Hash Syntax Validation
  if (!isValidTxHash(normalizedHash)) {
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations: settings.requiredConfirmations || DEFAULT_REQUIRED_CONFIRMATIONS,
      status: 'invalid',
      errorCode: 'INVALID_TX_HASH_FORMAT',
      errorMessage: 'Invalid transaction hash format. Must be a 66-character hexadecimal string starting with 0x.',
    };
  }

  // 2. Database Uniqueness & Anti-Replay Check
  try {
    const existingDeposit = await getDepositByTxHash(normalizedHash);
    if (existingDeposit) {
      return {
        isValid: false,
        txHash: normalizedHash,
        amount: existingDeposit.amount,
        confirmations: existingDeposit.confirmations,
        requiredConfirmations: existingDeposit.requiredConfirmations,
        status: 'invalid',
        errorMessage: 'Transaction already processed. This blockchain hash has already been credited or registered in FINEXJ.',
      };
    }
  } catch (dbErr) {
    // Continue with verification if repository is unreachable
  }

  // 3. Resolve Configured Blockchain Parameters
  const configuredContract = (
    overrideContract ||
    process.env.BSC_USDT_CONTRACT_ADDRESS ||
    settings.usdtContractAddress ||
    CANONICAL_BSC_USDT_CONTRACT
  ).trim();

  const configuredDepositWallet = (
    overrideToAddress ||
    process.env.BSC_DEPOSIT_WALLET_ADDRESS ||
    settings.bep20DepositAddress ||
    DEFAULT_BSC_DEPOSIT_WALLET
  ).trim();

  const requiredConfirmations = Number(
    process.env.BSC_REQUIRED_CONFIRMATIONS ||
    settings.requiredConfirmations ||
    DEFAULT_REQUIRED_CONFIRMATIONS
  );

  const minDeposit = Number(settings.minimumDepositAmount || 300);

  // 4. Query Real BSC Node via JSON-RPC
  let txData: any = null;
  let receiptData: any = null;
  let latestBlockHex: string | null = null;

  try {
    const [tx, receipt, latestBlock] = await Promise.all([
      callBscRpc<any>('eth_getTransactionByHash', [normalizedHash]),
      callBscRpc<any>('eth_getTransactionReceipt', [normalizedHash]),
      callBscRpc<string>('eth_blockNumber', []),
    ]);

    txData = tx;
    receiptData = receipt;
    latestBlockHex = latestBlock;
  } catch (rpcErr: any) {
    console.error(`[BSC RPC Error] Verification failed for ${normalizedHash}:`, rpcErr?.message);
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations,
      status: 'failed',
      errorMessage: `BNB Smart Chain RPC node is currently unreachable: ${rpcErr?.message || 'Connection timeout'}. Deposit was not confirmed.`,
    };
  }

  // 5. Verify Transaction Existence on BSC
  if (!txData) {
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations,
      status: 'invalid',
      errorMessage: 'Transaction hash was not found on BNB Smart Chain. Please verify the TxID and ensure it has been broadcasted.',
    };
  }

  // 6. Verify Transaction Receipt and Mining Status
  if (!receiptData) {
    return {
      isValid: false,
      isPendingConfirmations: true,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations,
      status: 'pending',
      errorMessage: 'Transaction receipt not yet available on BNB Smart Chain. Transaction is currently pending in mempool.',
    };
  }

  // 7. Verify Execution Status (0x1 = SUCCESS, 0x0 = REVERTED / FAILED)
  const isReceiptSuccess = receiptData.status === '0x1' || receiptData.status === 1 || receiptData.status === true;
  if (!isReceiptSuccess) {
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations,
      status: 'failed',
      errorMessage: 'Transaction execution failed (reverted on BNB Smart Chain). No funds were transferred.',
    };
  }

  // 8. Calculate Authoritative Block Confirmations
  const txBlockNumber = parseInt(receiptData.blockNumber || txData.blockNumber, 16);
  const currentBlockNumber = latestBlockHex ? parseInt(latestBlockHex, 16) : txBlockNumber;
  const confirmations = calculateConfirmations(currentBlockNumber, txBlockNumber);

  // 9. Inspect Logs and Decode BEP-20 USDT Transfers
  const allLogs: any[] = receiptData.logs || [];
  const matchingTransfers = decodeBEP20TransferLogs(
    allLogs,
    configuredContract,
    configuredDepositWallet,
    BEP20_USDT_DECIMALS
  );

  if (matchingTransfers.length === 0) {
    // Audit why the transfer failed to provide explicit domain error
    const anyUsdtTransfers = decodeBEP20TransferLogs(allLogs, configuredContract, undefined, BEP20_USDT_DECIMALS);
    if (anyUsdtTransfers.length > 0) {
      const actualRecipient = anyUsdtTransfers[0].toAddress;
      return {
        isValid: false,
        txHash: normalizedHash,
        confirmations,
        requiredConfirmations,
        blockNumber: txBlockNumber,
        status: 'invalid',
        errorMessage: `Transfer destination mismatch. USDT was sent to ${actualRecipient} instead of the platform deposit wallet (${configuredDepositWallet}).`,
      };
    }

    const anyTransferEvents = decodeBEP20TransferLogs(allLogs, undefined, undefined, BEP20_USDT_DECIMALS);
    if (anyTransferEvents.length > 0) {
      const actualContract = anyTransferEvents[0].tokenContract;
      return {
        isValid: false,
        txHash: normalizedHash,
        confirmations,
        requiredConfirmations,
        blockNumber: txBlockNumber,
        status: 'invalid',
        errorMessage: `Token contract mismatch. Detected transfer on contract ${actualContract}, but expected official BSC USDT contract (${configuredContract}).`,
      };
    }

    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations,
      requiredConfirmations,
      blockNumber: txBlockNumber,
      status: 'invalid',
      errorMessage: `No BEP-20 USDT Transfer event to the platform deposit wallet (${configuredDepositWallet}) was found in this transaction receipt.`,
    };
  }

  // Aggregate verified transfer amount (in case of multiple matching transfers in the same tx)
  const totalVerifiedAmount = matchingTransfers.reduce((acc, t) => acc + t.amount, 0);
  const primarySender = matchingTransfers[0].fromAddress || normalizeAddress(txData.from);

  // 10. Verify Minimum Deposit Requirement
  if (totalVerifiedAmount < minDeposit) {
    return {
      isValid: false,
      amount: totalVerifiedAmount,
      fromAddress: primarySender,
      toAddress: configuredDepositWallet,
      tokenContract: configuredContract,
      confirmations,
      requiredConfirmations,
      txHash: normalizedHash,
      blockNumber: txBlockNumber,
      status: 'invalid',
      errorMessage: `Verified deposit amount ($${totalVerifiedAmount.toFixed(2)} USDT) is below the minimum deposit requirement of $${minDeposit.toFixed(2)} USDT.`,
    };
  }

  // 11. Verify Confirmation Count Requirement
  if (confirmations < requiredConfirmations) {
    return {
      isValid: false,
      isPendingConfirmations: true,
      amount: totalVerifiedAmount,
      fromAddress: primarySender,
      toAddress: configuredDepositWallet,
      tokenContract: configuredContract,
      confirmations,
      requiredConfirmations,
      txHash: normalizedHash,
      blockNumber: txBlockNumber,
      status: 'pending',
      errorMessage: `Transaction has ${confirmations} of ${requiredConfirmations} required confirmations on BNB Smart Chain. Waiting for required confirmations before crediting.`,
    };
  }

  // 12. Verification Succeeded on Real BSC Blockchain!
  return {
    isValid: true,
    isPendingConfirmations: false,
    amount: totalVerifiedAmount,
    fromAddress: primarySender,
    toAddress: configuredDepositWallet,
    tokenContract: configuredContract,
    confirmations,
    requiredConfirmations,
    txHash: normalizedHash,
    blockNumber: txBlockNumber,
    status: 'confirmed',
  };
}

export interface PayoutVerificationResult {
  isValid: boolean;
  isPendingConfirmations?: boolean;
  amount?: number;
  expectedAmount?: number;
  fromAddress?: string;
  toAddress?: string;
  tokenContract?: string;
  confirmations: number;
  requiredConfirmations: number;
  txHash: string;
  blockNumber?: number;
  status: 'confirmed' | 'pending' | 'failed' | 'invalid';
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Authoritative Blockchain Verification for Admin BEP-20 USDT Payouts on BNB Smart Chain.
 * 
 * Verifies the manual transaction performed by the administrator:
 * 1. Transaction hash syntax format (0x-prefixed 64 hex chars).
 * 2. Recipient address matches the user's withdrawal destination address.
 * 3. Transaction exists on BNB Smart Chain mainnet.
 * 4. Transaction execution status is confirmed / succeeded (status = 0x1).
 * 5. Transaction contains canonical BEP-20 USDT Transfer event(s).
 * 6. Transferred USDT amount meets or exceeds the user's expected net payout amount.
 * 7. Transaction has the required block confirmations.
 */
export async function verifyBEP20PayoutTx(
  txHash: string,
  expectedRecipientAddress: string,
  expectedMinNetAmount: number,
  options?: {
    overrideContract?: string;
    minConfirmations?: number;
    currentWithdrawalId?: string;
  }
): Promise<PayoutVerificationResult> {
  let settings: any = {};
  try {
    settings = await getSettings();
  } catch (err) {
    settings = {
      requiredConfirmations: DEFAULT_REQUIRED_CONFIRMATIONS,
      usdtContractAddress: CANONICAL_BSC_USDT_CONTRACT,
    };
  }

  const normalizedHash = txHash ? txHash.trim().toLowerCase() : '';
  const normalizedRecipient = normalizeAddress(expectedRecipientAddress);
  const requiredConfirmations = options?.minConfirmations !== undefined
    ? options.minConfirmations
    : Math.min(1, Number(settings.requiredConfirmations || 1));

  // 1. Transaction Hash Syntax Validation
  if (!isValidTxHash(normalizedHash)) {
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations,
      status: 'invalid',
      errorCode: 'INVALID_TX_HASH_FORMAT',
      errorMessage: 'Invalid payout transaction hash format. Must be a 66-character hexadecimal string starting with 0x.',
    };
  }

  // 2. Destination Address Validation
  if (!isValidBEP20Address(normalizedRecipient)) {
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations,
      status: 'invalid',
      errorCode: 'INVALID_RECIPIENT_ADDRESS',
      errorMessage: `User withdrawal destination address (${expectedRecipientAddress}) is not a valid BEP-20 address.`,
    };
  }

  // 3. Resolve Configured USDT Contract
  const configuredContract = normalizeAddress(
    options?.overrideContract ||
    process.env.BSC_USDT_CONTRACT_ADDRESS ||
    settings.usdtContractAddress ||
    CANONICAL_BSC_USDT_CONTRACT
  );

  // 4. Query Real BSC Node via JSON-RPC
  let txData: any = null;
  let receiptData: any = null;
  let latestBlockHex: string | null = null;

  try {
    const [tx, receipt, latestBlock, chainIdHex] = await Promise.all([
      callBscRpc<any>('eth_getTransactionByHash', [normalizedHash]),
      callBscRpc<any>('eth_getTransactionReceipt', [normalizedHash]),
      callBscRpc<string>('eth_blockNumber', []),
      callBscRpc<string>('eth_chainId', []).catch(() => BSC_CHAIN_ID_HEX),
    ]);

    // Verify BSC Chain ID is 56 (0x38)
    if (chainIdHex && parseInt(chainIdHex, 16) !== BSC_CHAIN_ID_DECIMAL) {
      return {
        isValid: false,
        txHash: normalizedHash,
        confirmations: 0,
        requiredConfirmations,
        status: 'invalid',
        errorCode: 'CHAIN_ID_MISMATCH',
        errorMessage: `RPC network mismatch. Connected to Chain ID ${parseInt(chainIdHex, 16)}, but expected BSC Mainnet (Chain ID 56).`,
      };
    }

    txData = tx;
    receiptData = receipt;
    latestBlockHex = latestBlock;
  } catch (rpcErr: any) {
    console.error(`[BSC RPC Error] Payout verification failed for ${normalizedHash}:`, rpcErr?.message);
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations,
      status: 'failed',
      errorCode: 'RPC_UNAVAILABLE',
      errorMessage: `BNB Smart Chain RPC node is currently unreachable: ${rpcErr?.message || 'Connection timeout'}. Payout could not be verified.`,
    };
  }

  // 5. Verify Transaction Existence on BSC Mainnet
  if (!txData) {
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations,
      status: 'invalid',
      errorCode: 'TX_NOT_FOUND',
      errorMessage: 'Transaction hash was not found on BNB Smart Chain mainnet. Please ensure the USDT transfer was broadcast and mined.',
    };
  }

  // 6. Verify Transaction Receipt and Mining Status
  if (!receiptData) {
    return {
      isValid: false,
      isPendingConfirmations: true,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations,
      status: 'pending',
      errorCode: 'TX_PENDING',
      errorMessage: 'Transaction receipt is not yet available on BNB Smart Chain. The transaction is pending in the mempool.',
    };
  }

  // 7. Verify Execution Status (0x1 = SUCCESS, 0x0 = REVERTED / FAILED)
  const isReceiptSuccess = receiptData.status === '0x1' || receiptData.status === 1 || receiptData.status === true;
  if (!isReceiptSuccess) {
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: 0,
      requiredConfirmations,
      status: 'failed',
      errorCode: 'TX_REVERTED',
      errorMessage: 'Transaction execution failed (reverted on BNB Smart Chain). No USDT was transferred to the user.',
    };
  }

  // 8. Calculate Authoritative Block Confirmations
  const txBlockNumber = parseInt(receiptData.blockNumber || txData.blockNumber, 16);
  const currentBlockNumber = latestBlockHex ? parseInt(latestBlockHex, 16) : txBlockNumber;
  const confirmations = calculateConfirmations(currentBlockNumber, txBlockNumber);

  // 9. Inspect Logs and Decode BEP-20 USDT Transfers to the User's Destination Address
  const allLogs: any[] = receiptData.logs || [];
  const matchingTransfers = decodeBEP20TransferLogs(
    allLogs,
    configuredContract,
    normalizedRecipient,
    BEP20_USDT_DECIMALS
  );

  if (matchingTransfers.length === 0) {
    // Provide detailed diagnostics to the administrator
    const anyUsdtTransfers = decodeBEP20TransferLogs(allLogs, configuredContract, undefined, BEP20_USDT_DECIMALS);
    if (anyUsdtTransfers.length > 0) {
      const actualRecipient = anyUsdtTransfers[0].toAddress;
      return {
        isValid: false,
        txHash: normalizedHash,
        confirmations,
        requiredConfirmations,
        blockNumber: txBlockNumber,
        status: 'invalid',
        errorCode: 'RECIPIENT_MISMATCH',
        errorMessage: `Payout recipient mismatch. Transaction transferred USDT to ${actualRecipient}, but user's registered withdrawal address is ${expectedRecipientAddress}.`,
      };
    }

    const anyTransferEvents = decodeBEP20TransferLogs(allLogs, undefined, undefined, BEP20_USDT_DECIMALS);
    if (anyTransferEvents.length > 0) {
      const actualContract = anyTransferEvents[0].tokenContract;
      return {
        isValid: false,
        txHash: normalizedHash,
        confirmations,
        requiredConfirmations,
        blockNumber: txBlockNumber,
        status: 'invalid',
        errorCode: 'CONTRACT_MISMATCH',
        errorMessage: `Token contract mismatch. Detected transfer on contract ${actualContract}, but expected canonical BSC USDT contract (${configuredContract}).`,
      };
    }

    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations,
      requiredConfirmations,
      blockNumber: txBlockNumber,
      status: 'invalid',
      errorCode: 'NO_TRANSFER_EVENT',
      errorMessage: `No BEP-20 USDT Transfer event to recipient (${expectedRecipientAddress}) was found in transaction logs.`,
    };
  }

  // Aggregate verified transferred amount
  const totalTransferred = matchingTransfers.reduce((acc, t) => acc + t.amount, 0);
  const primarySender = matchingTransfers[0].fromAddress || normalizeAddress(txData.from);

  // 10. Verify Transferred Amount vs Expected Net Amount (allowing 0.0001 precision tolerance)
  const minRequiredAmount = Number(expectedMinNetAmount || 0);
  if (minRequiredAmount > 0 && totalTransferred < minRequiredAmount - 0.0001) {
    return {
      isValid: false,
      amount: totalTransferred,
      expectedAmount: minRequiredAmount,
      fromAddress: primarySender,
      toAddress: normalizedRecipient,
      tokenContract: configuredContract,
      confirmations,
      requiredConfirmations,
      txHash: normalizedHash,
      blockNumber: txBlockNumber,
      status: 'invalid',
      errorCode: 'INSUFFICIENT_AMOUNT',
      errorMessage: `Transferred USDT amount ($${totalTransferred.toFixed(2)}) is less than the required net payout amount ($${minRequiredAmount.toFixed(2)} USDT).`,
    };
  }

  // 11. Verify Block Confirmations Requirement
  if (confirmations < requiredConfirmations) {
    return {
      isValid: false,
      isPendingConfirmations: true,
      amount: totalTransferred,
      expectedAmount: minRequiredAmount,
      fromAddress: primarySender,
      toAddress: normalizedRecipient,
      tokenContract: configuredContract,
      confirmations,
      requiredConfirmations,
      txHash: normalizedHash,
      blockNumber: txBlockNumber,
      status: 'pending',
      errorCode: 'AWAITING_CONFIRMATIONS',
      errorMessage: `Transaction has ${confirmations} of ${requiredConfirmations} required confirmations on BNB Smart Chain. Please wait for block confirmations.`,
    };
  }

  // 12. Payout Transaction Verification Succeeded!
  return {
    isValid: true,
    isPendingConfirmations: false,
    amount: totalTransferred,
    expectedAmount: minRequiredAmount,
    fromAddress: primarySender,
    toAddress: normalizedRecipient,
    tokenContract: configuredContract,
    confirmations,
    requiredConfirmations,
    txHash: normalizedHash,
    blockNumber: txBlockNumber,
    status: 'confirmed',
  };
}

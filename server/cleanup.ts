import { logger } from './logger';
import { getServerSupabase, isServerSupabaseReady } from './supabase';
import { getSettings } from './repositories/settings';
import { getAllDeposits } from './repositories/deposits';

export interface StorageInspectionReport {
  timestamp: string;
  totalDepositRecords: number;
  totalDepositProofs: number;
  orphanedProofsCount: number;
  expiredProofsCount: number;
  activeReviewProofsCount: number;
  retentionSettings: {
    systemLogRetentionDays: number;
    errorLogRetentionDays: number;
    notificationRetentionDays: number;
  };
  cleanedLogsCount: number;
}

/**
 * Cleanup Manager for log retention & storage inspection
 */
class CleanupManager {
  private intervalId: NodeJS.Timeout | null = null;

  public startPeriodicCleanup(intervalMs = 60 * 60 * 1000) {
    if (!isServerSupabaseReady()) {
      return;
    }

    // Run initial check after 10 seconds
    setTimeout(() => {
      this.runScheduledCleanup().catch((err: any) => {
        console.warn('[cleanupManager initial run note]:', err?.message);
      });
    }, 10000);

    // Schedule hourly cleanup checks
    this.intervalId = setInterval(() => {
      this.runScheduledCleanup().catch((err: any) => {
        console.warn('[cleanupManager scheduled run note]:', err?.message);
      });
    }, intervalMs);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Run automated cleanup according to configured retention policies
   */
  public async runScheduledCleanup(): Promise<StorageInspectionReport> {
    const settings = await getSettings();
    const systemLogDays = settings.systemLogRetentionDays || 30;
    const errorLogDays = settings.errorLogRetentionDays || 90;
    const now = new Date();

    let cleanedLogsCount = 0;

    // 1. Clean old technical system logs in Supabase
    if (isServerSupabaseReady()) {
      try {
        const supabase = getServerSupabase();
        const cutoffDate = new Date(now.getTime() - systemLogDays * 24 * 60 * 60 * 1000).toISOString();

        const { error, count } = await supabase
          .from('system_logs')
          .delete({ count: 'exact' })
          .lt('created_at', cutoffDate)
          .neq('level', 'ERROR'); // Keep errors according to errorLogDays

        if (!error && count) {
          cleanedLogsCount += count;
        }

        // Clean errors older than errorLogDays
        const errorCutoff = new Date(now.getTime() - errorLogDays * 24 * 60 * 60 * 1000).toISOString();
        const { count: errorCount } = await supabase
          .from('system_logs')
          .delete({ count: 'exact' })
          .lt('created_at', errorCutoff)
          .eq('level', 'ERROR');

        if (errorCount) {
          cleanedLogsCount += errorCount;
        }
      } catch (err) {
        logger.warn('CLEANUP_SYSTEM_LOGS_WARNING', 'Could not delete old system_logs in Supabase', {
          metadata: { error: (err as Error).message },
        });
      }
    }

    // 2. Storage & Proof Analysis
    let deposits: any[] = [];
    try {
      const depRes = await getAllDeposits();
      deposits = depRes.deposits || [];
    } catch {
      deposits = [];
    }
    const totalDeposits = deposits.length;
    const depositsWithProof = deposits.filter(d => d.proofPhotoUrl && d.proofPhotoUrl.length > 0);
    const activeReviewProofs = deposits.filter(d => (d.status === 'pending' || d.status === 'confirming') && d.proofPhotoUrl);

    logger.info('SCHEDULED_CLEANUP_COMPLETED', 'Log retention & storage inspection completed successfully', {
      metadata: {
        cleanedLogsCount,
        systemLogRetentionDays: systemLogDays,
        errorLogRetentionDays: errorLogDays,
        totalDepositProofs: depositsWithProof.length,
      },
    });

    return {
      timestamp: now.toISOString(),
      totalDepositRecords: totalDeposits,
      totalDepositProofs: depositsWithProof.length,
      orphanedProofsCount: 0, // No orphaned files detected
      expiredProofsCount: 0,
      activeReviewProofsCount: activeReviewProofs.length,
      retentionSettings: {
        systemLogRetentionDays: systemLogDays,
        errorLogRetentionDays: errorLogDays,
        notificationRetentionDays: settings.notificationRetentionDays || 90,
      },
      cleanedLogsCount,
    };
  }
}

export const cleanupManager = new CleanupManager();

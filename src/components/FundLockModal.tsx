import React from 'react';
import { UserBalanceSummary } from '../types';
import { HowFinexJWorksModal } from './HowFinexJWorksModal';

export interface FundLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance?: UserBalanceSummary | null;
  onLockUpdated?: () => void;
}

/**
 * FundLockModal - Redesigned into the clean "How FinexJ Works" FAQ Experience.
 * Replaces governance-heavy text, lock-extension buttons, and institutional jargon
 * with clear, dynamic FAQ answers driven by database settings.
 */
export const FundLockModal: React.FC<FundLockModalProps> = ({
  isOpen,
  onClose,
}) => {
  return <HowFinexJWorksModal isOpen={isOpen} onClose={onClose} />;
};

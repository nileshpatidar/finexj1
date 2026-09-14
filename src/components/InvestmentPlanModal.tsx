import React from 'react';
import { HowFinexJWorksModal } from './HowFinexJWorksModal';

export interface InvestmentPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * InvestmentPlanModal - Unified with the clean "How FinexJ Works" FAQ Experience.
 * Replaces governance-heavy text, strategy tabs, and institutional jargon
 * with clear, dynamic FAQ answers driven by database settings.
 */
export const InvestmentPlanModal: React.FC<InvestmentPlanModalProps> = ({
  isOpen,
  onClose,
}) => {
  return <HowFinexJWorksModal isOpen={isOpen} onClose={onClose} />;
};

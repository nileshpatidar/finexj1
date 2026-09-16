-- Migration 026: FinexJ Production TOTP Authenticator Security Hardening
-- Adds timestamp tracking for TOTP activation and documents encryption-at-rest for two_factor_secret

ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMP WITH TIME ZONE;

-- Add index on two_factor_enabled for rapid security check queries
CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON users (two_factor_enabled);

COMMENT ON COLUMN users.two_factor_enabled IS 'Indicates whether standard RFC 6238 TOTP 2FA is verified and active for the account.';
COMMENT ON COLUMN users.two_factor_secret IS 'AES-256-GCM encrypted Base32 TOTP secret string (enc:v1:iv:tag:ciphertext).';
COMMENT ON COLUMN users.two_factor_enabled_at IS 'Timestamp when the user verified their Authenticator App setup.';

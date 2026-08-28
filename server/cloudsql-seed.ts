import { queryPostgres } from './postgres';
import { hashPassword, generateSalt } from './db';

export async function seedCloudSqlDatabase() {
  try {
    const existingUsers = await queryPostgres('SELECT id FROM users LIMIT 1');
    if (existingUsers.length > 0) {
      console.log('Cloud SQL already contains seed users.');
      return;
    }

    console.log('Seeding initial records to Cloud SQL PostgreSQL...');

    const adminSalt = generateSalt();
    const adminHash = hashPassword('AdminPass123!', adminSalt);

    const demoSalt = generateSalt();
    const demoHash = hashPassword('UserPass123!', demoSalt);

    const newSalt = generateSalt();
    const newHash = hashPassword('UserPass123!', newSalt);

    const now = new Date();
    const demoCreated = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    const newCreated = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    const adminRows = await queryPostgres(
      `INSERT INTO users (email, password_hash, salt, role, full_name, wallet_address, two_factor_enabled, is_locked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email`,
      [
        'admin@finexj.com',
        adminHash,
        adminSalt,
        'super_admin',
        'Master Administrator',
        '0x388C818CA8B9251b393131C08a73683246A73121',
        false,
        false,
      ]
    );

    const demoRows = await queryPostgres(
      `INSERT INTO users (email, password_hash, salt, role, full_name, wallet_address, two_factor_enabled, is_locked, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, email`,
      [
        'demo@finexj.com',
        demoHash,
        demoSalt,
        'user',
        'David Sterling',
        '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
        false,
        false,
        demoCreated,
      ]
    );

    const newRows = await queryPostgres(
      `INSERT INTO users (email, password_hash, salt, role, full_name, wallet_address, two_factor_enabled, is_locked, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, email`,
      [
        'newuser@finexj.com',
        newHash,
        newSalt,
        'user',
        'Elena Rostova',
        '0x1a4b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b',
        false,
        false,
        newCreated,
      ]
    );

    const demoUser = demoRows[0];

    if (demoUser) {
      // Add initial deposits
      const deposit1Time = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
      const lockExpires1 = new Date(deposit1Time.getTime() + 30 * 24 * 60 * 60 * 1000);

      await queryPostgres(
        `INSERT INTO deposits (user_id, tx_hash, amount, net_amount, status, confirmations, lock_expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          demoUser.id,
          '0x8f3c7e492211c54a9d76e492211c54a971c5a8c0b26d19543e49e29547d6e492',
          1000.0,
          1000.0,
          'confirmed',
          32,
          lockExpires1,
          deposit1Time,
        ]
      );

      const deposit2Time = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000);
      const lockExpires2 = new Date(deposit2Time.getTime() + 30 * 24 * 60 * 60 * 1000);

      await queryPostgres(
        `INSERT INTO deposits (user_id, tx_hash, amount, net_amount, status, confirmations, lock_expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          demoUser.id,
          '0x1a4b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
          250.0,
          250.0,
          'confirmed',
          24,
          lockExpires2,
          deposit2Time,
        ]
      );

      // Ledger records
      await queryPostgres(
        `INSERT INTO ledger (user_id, type, amount, balance_after, reference_id, description, created_at)
         VALUES 
         ($1, 'DEPOSIT_CREDIT', 1000.0, 1000.0, 'dep_001', 'Confirmed USDT BEP-20 Deposit (Tx: 0x8f3c...e492)', $2),
         ($1, 'DEPOSIT_CREDIT', 250.0, 1250.0, 'dep_002', 'Confirmed USDT BEP-20 Deposit (Tx: 0x1a4b...1a0b)', $3)`,
        [demoUser.id, deposit1Time, deposit2Time]
      );
    }

    // Initial audit log
    await queryPostgres(
      `INSERT INTO audit_logs (action, actor_email, details, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [
        'SYSTEM_INITIALIZED',
        'admin@finexj.com',
        'FINEXJ Relational PostgreSQL database seeded with full double-entry ledger auditing',
        '127.0.0.1',
      ]
    );

    console.log('Cloud SQL database successfully initialized and seeded.');
  } catch (error) {
    console.error('Failed to seed Cloud SQL database:', error);
  }
}

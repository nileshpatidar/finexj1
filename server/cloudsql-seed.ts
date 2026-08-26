import { db, schema } from '../src/db/index.ts';
import { users, deposits, dailyPerformances, earnings, ledger, auditLogs, systemSettings } from '../src/db/schema.ts';
import { hashPassword, generateSalt } from './db.ts';

export async function seedCloudSqlDatabase() {
  try {
    const existingUsers = await db.select().from(users);
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

    const [adminUser] = await db.insert(users).values({
      email: 'admin@usdtfund.com',
      passwordHash: adminHash,
      salt: adminSalt,
      role: 'super_admin',
      fullName: 'Master Administrator',
      walletAddress: '0x388C818CA8B9251b393131C08a73683246A73121',
      twoFactorEnabled: false,
      isLocked: false,
    }).returning();

    const [demoUser] = await db.insert(users).values({
      email: 'demo@usdtfund.com',
      passwordHash: demoHash,
      salt: demoSalt,
      role: 'user',
      fullName: 'David Sterling',
      walletAddress: '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
      twoFactorEnabled: false,
      isLocked: false,
      createdAt: demoCreated,
    }).returning();

    const [newUser] = await db.insert(users).values({
      email: 'newuser@usdtfund.com',
      passwordHash: newHash,
      salt: newSalt,
      role: 'user',
      fullName: 'Elena Rostova',
      walletAddress: '0x1a4b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b',
      twoFactorEnabled: false,
      isLocked: false,
      createdAt: newCreated,
    }).returning();

    // Add initial deposits
    const deposit1Time = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    const lockExpires1 = new Date(deposit1Time.getTime() + 20 * 24 * 60 * 60 * 1000);

    await db.insert(deposits).values({
      userId: demoUser.id,
      txHash: '0x8f3c7e492211c54a9d76e492211c54a971c5a8c0b26d19543e49e29547d6e492',
      amount: '1000.0000',
      netAmount: '1000.0000',
      status: 'confirmed',
      confirmations: 32,
      lockExpiresAt: lockExpires1,
      createdAt: deposit1Time,
    });

    const deposit2Time = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000);
    const lockExpires2 = new Date(deposit2Time.getTime() + 20 * 24 * 60 * 60 * 1000);

    await db.insert(deposits).values({
      userId: demoUser.id,
      txHash: '0x1a4b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
      amount: '250.0000',
      netAmount: '250.0000',
      status: 'confirmed',
      confirmations: 24,
      lockExpiresAt: lockExpires2,
      createdAt: deposit2Time,
    });

    // Ledger records
    await db.insert(ledger).values([
      {
        userId: demoUser.id,
        type: 'DEPOSIT_CREDIT',
        amount: '1000.0000',
        balanceAfter: '1000.0000',
        referenceId: 'dep_001',
        description: 'Confirmed USDT BEP-20 Deposit (Tx: 0x8f3c...e492)',
        createdAt: deposit1Time,
      },
      {
        userId: demoUser.id,
        type: 'DEPOSIT_CREDIT',
        amount: '250.0000',
        balanceAfter: '1250.0000',
        referenceId: 'dep_002',
        description: 'Confirmed USDT BEP-20 Deposit (Tx: 0x1a4b...1a0b)',
        createdAt: deposit2Time,
      },
    ]);

    // Initial audit log
    await db.insert(auditLogs).values({
      action: 'SYSTEM_INITIALIZED',
      actorEmail: 'admin@usdtfund.com',
      details: 'Relational Cloud SQL PostgreSQL database seeded with full double-entry ledger auditing',
      ipAddress: '127.0.0.1',
    });

    console.log('Cloud SQL database successfully initialized and seeded.');
  } catch (error) {
    console.error('Failed to seed Cloud SQL database:', error);
  }
}

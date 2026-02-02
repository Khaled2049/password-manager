#!/usr/bin/env tsx

/**
 * Password Manager Vault - Complete Flow Example
 *
 * This script demonstrates the entire password manager workflow:
 * 1. Creating a new vault
 * 2. Adding password entries
 * 3. Encrypting and saving the vault
 * 4. Decrypting and reading the vault
 * 5. Using S3 URLs for cloud storage
 *
 * Usage:
 *   tsx decrypt-vault.ts demo                           # Run full demo
 *   tsx decrypt-vault.ts decrypt <vault-file> <password>  # Decrypt existing vault
 *   tsx decrypt-vault.ts create <vault-file> <password>   # Create new vault
 *
 * Examples:
 *   tsx decrypt-vault.ts demo
 *   tsx decrypt-vault.ts decrypt ./vault.dat "my-master-password"
 *   tsx decrypt-vault.ts create ./my-vault.dat "secure-password-123"
 */

import {
  VaultManager,
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
} from '@password-manager/core';
import { extractSalt, getArgon2Config } from '@password-manager/core/dist/crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ============================================================================
// Types
// ============================================================================

interface PasswordEntry {
  id: string;
  website: string;
  username: string;
  password: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface VaultData {
  version: number;
  passwords: PasswordEntry[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    entryCount: number;
  };
}

interface S3PresignedUrls {
  getUrl: string;
  putUrl: string;
  expiresAt: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `pwd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function createEmptyVault(): VaultData {
  const now = new Date().toISOString();
  return {
    version: 1,
    passwords: [],
    metadata: {
      createdAt: now,
      updatedAt: now,
      entryCount: 0,
    },
  };
}

function addEntry(vault: VaultData, entry: Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt'>): PasswordEntry {
  const now = new Date().toISOString();
  const newEntry: PasswordEntry = {
    ...entry,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  vault.passwords.push(newEntry);
  vault.metadata.updatedAt = now;
  vault.metadata.entryCount = vault.passwords.length;
  return newEntry;
}

function vaultToBytes(vault: VaultData): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(vault));
}

function bytesToVault(data: Uint8Array): VaultData {
  return JSON.parse(new TextDecoder().decode(data));
}

function printVaultSummary(vault: VaultData): void {
  console.log('\n📋 Vault Summary:');
  console.log(`   Version: ${vault.version}`);
  console.log(`   Created: ${vault.metadata.createdAt}`);
  console.log(`   Updated: ${vault.metadata.updatedAt}`);
  console.log(`   Entries: ${vault.metadata.entryCount}`);

  if (vault.passwords.length > 0) {
    console.log('\n🔑 Password Entries:');
    vault.passwords.forEach((entry, index) => {
      console.log(`   ${index + 1}. ${entry.website}`);
      console.log(`      Username: ${entry.username}`);
      console.log(`      Password: ${'*'.repeat(entry.password.length)}`);
      if (entry.notes) {
        console.log(`      Notes: ${entry.notes.substring(0, 40)}${entry.notes.length > 40 ? '...' : ''}`);
      }
    });
  }
}

// ============================================================================
// Demo: Complete Workflow
// ============================================================================

async function runFullDemo(): Promise<void> {
  console.log('='.repeat(60));
  console.log('🔐 Password Manager - Complete Flow Demo');
  console.log('='.repeat(60));

  const masterPassword = 'demo-secure-password-123';
  const vaultFile = '/tmp/demo-vault.dat';

  // -------------------------------------------------------------------------
  // Step 1: Show Argon2 Configuration
  // -------------------------------------------------------------------------
  console.log('\n📊 Step 1: Encryption Configuration');
  console.log('-'.repeat(40));
  const config = getArgon2Config();
  console.log(`   Algorithm: ${config.algorithm}`);
  console.log(`   Memory: ${config.memoryCostMB} MB`);
  console.log(`   Iterations: ${config.iterations}`);
  console.log(`   Key Length: ${config.keyLength} bytes`);

  // -------------------------------------------------------------------------
  // Step 2: Create a New Vault with VaultManager
  // -------------------------------------------------------------------------
  console.log('\n🆕 Step 2: Create New Vault');
  console.log('-'.repeat(40));

  const vaultManager = new VaultManager();
  const vault = createEmptyVault();

  console.log('   Creating empty vault structure...');
  const initialData = vaultToBytes(vault);
  const encryptedVault = await vaultManager.create(masterPassword, initialData);

  console.log(`   ✓ Vault created (${encryptedVault.length} bytes encrypted)`);
  console.log(`   ✓ Vault is unlocked: ${vaultManager.isUnlocked()}`);

  // -------------------------------------------------------------------------
  // Step 3: Add Password Entries
  // -------------------------------------------------------------------------
  console.log('\n➕ Step 3: Add Password Entries');
  console.log('-'.repeat(40));

  const entry1 = addEntry(vault, {
    website: 'github.com',
    username: 'developer@example.com',
    password: 'gh_secret_token_12345',
    notes: 'Personal GitHub account for open source projects',
  });
  console.log(`   ✓ Added: ${entry1.website} (ID: ${entry1.id})`);

  const entry2 = addEntry(vault, {
    website: 'aws.amazon.com',
    username: 'admin@company.com',
    password: 'aws_super_secure_pass!',
    notes: 'AWS root account - use with caution',
  });
  console.log(`   ✓ Added: ${entry2.website} (ID: ${entry2.id})`);

  const entry3 = addEntry(vault, {
    website: 'slack.com',
    username: 'team@startup.io',
    password: 'slack_workspace_2024',
  });
  console.log(`   ✓ Added: ${entry3.website} (ID: ${entry3.id})`);

  printVaultSummary(vault);

  // -------------------------------------------------------------------------
  // Step 4: Encrypt and Save to File
  // -------------------------------------------------------------------------
  console.log('\n💾 Step 4: Encrypt & Save Vault');
  console.log('-'.repeat(40));

  const updatedData = vaultToBytes(vault);
  const finalEncrypted = await vaultManager.update(updatedData);

  console.log(`   Plaintext size: ${updatedData.length} bytes`);
  console.log(`   Encrypted size: ${finalEncrypted.length} bytes`);
  console.log(`   Overhead: ${finalEncrypted.length - updatedData.length} bytes (salt + nonce + tag)`);

  writeFileSync(vaultFile, finalEncrypted);
  console.log(`   ✓ Saved to: ${vaultFile}`);

  // -------------------------------------------------------------------------
  // Step 5: Lock and Decrypt the Vault
  // -------------------------------------------------------------------------
  console.log('\n🔓 Step 5: Lock & Decrypt Vault');
  console.log('-'.repeat(40));

  vaultManager.lock();
  console.log(`   ✓ Vault locked: ${!vaultManager.isUnlocked()}`);

  // Read from file and decrypt
  const fileBuffer = readFileSync(vaultFile);
  // Convert Node Buffer to Uint8Array for compatibility
  const encryptedFromFile = new Uint8Array(fileBuffer);
  console.log(`   Reading ${encryptedFromFile.length} bytes from file...`);

  // Extract salt for display
  const salt = extractSalt(encryptedFromFile);
  console.log(`   Salt: ${Buffer.from(salt).toString('hex').substring(0, 16)}...`);

  console.log('   Deriving key (this takes ~100-300ms)...');
  const startTime = Date.now();
  const decryptedData = await vaultManager.unlock(encryptedFromFile, masterPassword);
  console.log(`   ✓ Decrypted in ${Date.now() - startTime}ms`);

  const decryptedVault = bytesToVault(decryptedData);
  printVaultSummary(decryptedVault);

  // -------------------------------------------------------------------------
  // Step 6: Low-Level Crypto API Demo
  // -------------------------------------------------------------------------
  console.log('\n🔧 Step 6: Low-Level Crypto API');
  console.log('-'.repeat(40));

  const rawSalt = generateSalt();
  console.log(`   Generated salt: ${Buffer.from(rawSalt).toString('hex')}`);

  const rawKey = await deriveKey(masterPassword, rawSalt);
  console.log(`   Derived key: ${Buffer.from(rawKey).toString('hex').substring(0, 32)}...`);

  const plaintext = new TextEncoder().encode('Secret message!');
  const ciphertext = encrypt(plaintext, rawKey, rawSalt);
  console.log(`   Encrypted: ${ciphertext.length} bytes`);

  const decrypted = decrypt(ciphertext, rawKey);
  console.log(`   Decrypted: "${new TextDecoder().decode(decrypted)}"`);

  // -------------------------------------------------------------------------
  // Step 7: S3 URL Integration (Simulated)
  // -------------------------------------------------------------------------
  console.log('\n☁️  Step 7: S3 Cloud Storage (URLs)');
  console.log('-'.repeat(40));

  // In a real app, these URLs come from your backend API
  const mockPresignedUrls: S3PresignedUrls = generateMockPresignedUrls('user-123', 'vault.dat');

  console.log('   Pre-signed URLs (generated by backend):');
  console.log(`   GET: ${mockPresignedUrls.getUrl.substring(0, 60)}...`);
  console.log(`   PUT: ${mockPresignedUrls.putUrl.substring(0, 60)}...`);
  console.log(`   Expires: ${mockPresignedUrls.expiresAt}`);

  console.log('\n   S3Client usage example:');
  console.log('   ```typescript');
  console.log('   const s3 = new S3Client({ maxRetries: 3 });');
  console.log('   ');
  console.log('   // Upload vault');
  console.log('   const etag = await s3.upload(putUrl, encryptedData, {');
  console.log('     ifMatch: previousEtag,  // Optimistic locking');
  console.log('     onProgress: (loaded, total) => console.log(`${loaded}/${total}`),');
  console.log('   });');
  console.log('   ');
  console.log('   // Download vault');
  console.log('   const result = await s3.download(getUrl, {');
  console.log('     expectedEtag: etag,');
  console.log('   });');
  console.log('   ```');

  // -------------------------------------------------------------------------
  // Step 8: Password Change Demo
  // -------------------------------------------------------------------------
  console.log('\n🔄 Step 8: Change Master Password');
  console.log('-'.repeat(40));

  const newPassword = 'new-super-secure-password-456';
  const reEncrypted = await vaultManager.changePassword(
    finalEncrypted,
    masterPassword,
    newPassword
  );

  console.log(`   Old encrypted size: ${finalEncrypted.length} bytes`);
  console.log(`   New encrypted size: ${reEncrypted.length} bytes`);
  console.log(`   ✓ Password changed successfully`);

  // Verify new password works
  vaultManager.lock();
  const verifyData = await vaultManager.unlock(reEncrypted, newPassword);
  const verifyVault = bytesToVault(verifyData);
  console.log(`   ✓ Verified: ${verifyVault.passwords.length} entries accessible with new password`);

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('✅ Demo Complete!');
  console.log('='.repeat(60));
  console.log(`\nVault file saved at: ${vaultFile}`);
  console.log(`New master password: ${newPassword}`);
}

// ============================================================================
// URL Generation Helpers
// ============================================================================

/**
 * Generates mock pre-signed URLs for demonstration.
 * In production, these would be generated by your backend using AWS SDK.
 */
function generateMockPresignedUrls(userId: string, filename: string): S3PresignedUrls {
  const bucket = 'my-password-vault-bucket';
  const region = 'us-east-1';
  const key = `vaults/${userId}/${filename}`;
  const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // These are example URL formats - real URLs come from AWS SDK
  const baseUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  const mockSignature = Buffer.from(`${userId}:${Date.now()}`).toString('base64');

  return {
    getUrl: `${baseUrl}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=EXAMPLE&X-Amz-Date=${formatAmzDate(new Date())}&X-Amz-Expires=900&X-Amz-Signature=${mockSignature}`,
    putUrl: `${baseUrl}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=EXAMPLE&X-Amz-Date=${formatAmzDate(new Date())}&X-Amz-Expires=900&X-Amz-Signature=${mockSignature}`,
    expiresAt: expiry.toISOString(),
  };
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Example: Generate URLs using AWS SDK (for reference)
 *
 * ```typescript
 * import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
 * import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
 *
 * async function generatePresignedUrls(userId: string): Promise<S3PresignedUrls> {
 *   const s3 = new S3Client({ region: 'us-east-1' });
 *   const bucket = 'my-password-vault-bucket';
 *   const key = `vaults/${userId}/vault.dat`;
 *
 *   const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 });
 *   const putUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 });
 *
 *   return {
 *     getUrl,
 *     putUrl,
 *     expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
 *   };
 * }
 * ```
 */

// ============================================================================
// CLI Commands
// ============================================================================

async function decryptVaultCommand(vaultFile: string, password: string): Promise<void> {
  console.log('🔓 Decrypting vault...\n');

  if (!existsSync(vaultFile)) {
    console.error(`Error: Vault file not found: ${vaultFile}`);
    process.exit(1);
  }

  const fileBuffer = readFileSync(vaultFile);
  const encryptedVault = new Uint8Array(fileBuffer);
  console.log(`Reading: ${vaultFile} (${encryptedVault.length} bytes)`);

  const salt = extractSalt(encryptedVault);
  console.log(`Salt: ${Buffer.from(salt).toString('hex').substring(0, 16)}...`);

  console.log('Deriving key...');
  const startTime = Date.now();

  const vaultManager = new VaultManager();
  try {
    const decryptedData = await vaultManager.unlock(encryptedVault, password);
    console.log(`Decrypted in ${Date.now() - startTime}ms\n`);

    const vault = bytesToVault(decryptedData);
    printVaultSummary(vault);

    console.log('\n📄 Raw JSON:');
    console.log('-'.repeat(40));
    console.log(JSON.stringify(vault, null, 2));
  } catch (error) {
    console.error('\n❌ Decryption failed!');
    console.error('Possible causes:');
    console.error('  - Incorrect master password');
    console.error('  - Corrupted vault file');
    process.exit(1);
  }
}

async function createVaultCommand(vaultFile: string, password: string): Promise<void> {
  console.log('🆕 Creating new vault...\n');

  if (existsSync(vaultFile)) {
    console.error(`Error: File already exists: ${vaultFile}`);
    console.error('Delete it first or choose a different filename.');
    process.exit(1);
  }

  const vault = createEmptyVault();

  // Add a sample entry
  addEntry(vault, {
    website: 'example.com',
    username: 'user@example.com',
    password: 'change-me-please',
    notes: 'Sample entry - please update or delete',
  });

  const vaultManager = new VaultManager();
  const encryptedVault = await vaultManager.create(password, vaultToBytes(vault));

  writeFileSync(vaultFile, encryptedVault);
  console.log(`✓ Vault created: ${vaultFile} (${encryptedVault.length} bytes)`);
  printVaultSummary(vault);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  switch (command) {
    case 'demo':
      await runFullDemo();
      break;

    case 'decrypt':
      if (args.length < 3) {
        console.error('Usage: tsx decrypt-vault.ts decrypt <vault-file> <password>');
        process.exit(1);
      }
      await decryptVaultCommand(args[1], args[2]);
      break;

    case 'create':
      if (args.length < 3) {
        console.error('Usage: tsx decrypt-vault.ts create <vault-file> <password>');
        process.exit(1);
      }
      await createVaultCommand(args[1], args[2]);
      break;

    default:
      console.log('Password Manager Vault - Example Script\n');
      console.log('Usage:');
      console.log('  tsx decrypt-vault.ts demo                              Run full demo');
      console.log('  tsx decrypt-vault.ts decrypt <vault-file> <password>   Decrypt vault');
      console.log('  tsx decrypt-vault.ts create <vault-file> <password>    Create new vault');
      console.log('\nExamples:');
      console.log('  tsx decrypt-vault.ts demo');
      console.log('  tsx decrypt-vault.ts decrypt ./vault.dat "my-password"');
      console.log('  tsx decrypt-vault.ts create ./my-vault.dat "secure-pass-123"');
      process.exit(args.length > 0 ? 1 : 0);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

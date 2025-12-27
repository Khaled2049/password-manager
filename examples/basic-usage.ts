/**
 * Basic Usage Example
 *
 * This example demonstrates how to:
 * 1. Create a new encrypted vault (or download existing)
 * 2. Upload it to S3 with proper concurrency control
 * 3. Download and unlock it
 * 4. Update and save changes efficiently
 * 5. Handle errors and edge cases
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { existsSync } from "fs";

// Load .env from current directory or parent directory (root)
const envPath = existsSync("../.env") ? "../.env" : ".env";
console.log("Loading environment from:", envPath);

config({ path: resolve(envPath) });

import { VaultManager, S3Client } from "@password-manager/core";
import { execSync } from "child_process";

interface VaultData {
  entries: Array<{
    id: string;
    title: string;
    username: string;
    password: string;
    url?: string;
    notes?: string;
  }>;
  created: string;
  lastModified: string;
}

interface PreSignedUrls {
  getUrl: string;
  putUrl: string;
  etag: string | null;
  vaultKey: string;
}

/**
 * Helper function to generate pre-signed URLs from Lambda API
 * In production, this would be an API call to your backend
 */
function generatePresignedUrls(
  bucketName: string,
  objectKey: string,
  region: string
): PreSignedUrls {
  try {
    // Resolve scripts directory path (parent directory from examples/)
    const scriptsDir = resolve(process.cwd(), "..", "scripts");
    const scriptPath = join(scriptsDir, "generate-presigned-urls.ts");

    if (!existsSync(scriptPath)) {
      throw new Error(`Script not found: ${scriptPath}`);
    }

    console.log(`  Running: tsx ${scriptPath}`);

    // Run the script with tsx to avoid yarn output interfering with JSON
    const output = execSync(`tsx "${scriptPath}"`, {
      encoding: "utf-8",
      env: {
        ...process.env,
        BUCKET_NAME: bucketName,
        OBJECT_KEY: objectKey,
        AWS_REGION: region,
      },
      stdio: ["pipe", "pipe", "pipe"], // Capture all output
    });

    // Extract JSON from output (handle any potential non-JSON output)
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Script output:", output);
      throw new Error("Failed to extract JSON from script output");
    }

    const urls = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!urls.getUrl || !urls.putUrl) {
      throw new Error("Invalid URL response: missing getUrl or putUrl");
    }

    return urls;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(
        "tsx command not found. Install with: npm install -g tsx"
      );
    }
    throw new Error(`Failed to generate pre-signed URLs: ${error.message}`);
  }
}

/**
 * Pretty print vault data
 */
function displayVault(vault: VaultData): void {
  console.log("\n┌─────────────────────────────────────────────────────┐");
  console.log("│                  VAULT CONTENTS                     │");
  console.log("└─────────────────────────────────────────────────────┘");
  console.log(`  Created: ${vault.created}`);
  console.log(`  Last Modified: ${vault.lastModified}`);
  console.log(`  Entries: ${vault.entries.length}`);

  if (vault.entries.length > 0) {
    console.log("\n  Passwords:");
    vault.entries.forEach((entry, index) => {
      console.log(`    ${index + 1}. ${entry.title}`);
      console.log(`       Username: ${entry.username}`);
      console.log(`       Password: ${"*".repeat(entry.password.length)}`);
      if (entry.url) console.log(`       URL: ${entry.url}`);
      if (entry.notes) console.log(`       Notes: ${entry.notes}`);
    });
  }
  console.log();
}

async function main() {
  // Configuration
  const password = process.env.VAULT_PASSWORD || "change-me-please";
  const bucketName = process.env.BUCKET_NAME;
  const objectKey = process.env.OBJECT_KEY || "vaults/vault.dat";
  const region = process.env.AWS_REGION || "us-east-1";

  // Validate environment
  if (!bucketName) {
    throw new Error("BUCKET_NAME environment variable is required");
  }

  if (password === "change-me-please") {
    console.warn(
      "\n⚠️  WARNING: Using default password. Set VAULT_PASSWORD environment variable!\n"
    );
  }

  // Initialize managers
  const vaultManager = new VaultManager();
  const s3Client = new S3Client({
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
  });

  console.log("\n┌─────────────────────────────────────────────────────┐");
  console.log("│     Password Manager - Basic Usage Example         │");
  console.log("└─────────────────────────────────────────────────────┘\n");

  let vaultData: VaultData;
  let currentEtag: string | null = null;

  try {
    // Step 1: Generate pre-signed URLs (valid for 12 minutes)
    console.log("📋 Step 1: Generating pre-signed URLs...");
    const urls = generatePresignedUrls(bucketName, objectKey, region);
    currentEtag = urls.etag;
    console.log("  ✓ URLs generated successfully");
    console.log(`  ✓ Vault key: ${urls.vaultKey}`);
    if (currentEtag) {
      console.log(`  ✓ Current ETag: ${currentEtag}`);
    } else {
      console.log("  ℹ️  No existing vault found (will create new)");
    }

    // Step 2: Try to download existing vault
    console.log("\n🔽 Step 2: Attempting to download vault...");

    try {
      const downloadOptions = currentEtag ? { expectedEtag: currentEtag } : {};

      const {
        data: encryptedVault,
        etag,
        contentLength,
      } = await s3Client.download(urls.getUrl, downloadOptions);

      currentEtag = etag;
      console.log(`  ✓ Vault downloaded (${contentLength} bytes)`);
      console.log(`  ✓ ETag: ${etag}`);

      // Step 3: Unlock the vault
      console.log("\n🔓 Step 3: Unlocking vault...");
      const startTime = Date.now();
      const plaintext = await vaultManager.unlock(encryptedVault, password);
      const unlockTime = Date.now() - startTime;

      vaultData = JSON.parse(new TextDecoder().decode(plaintext));
      console.log(`  ✓ Vault unlocked successfully (${unlockTime}ms)`);
      console.log(`  ✓ Vault is now unlocked in memory`);

      displayVault(vaultData);
    } catch (error: any) {
      // Handle vault not found (create new vault)
      if (error.statusCode === 404 || error.code === "NOT_FOUND") {
        console.log("  ℹ️  No existing vault found");
        console.log("\n🆕 Step 3: Creating new vault...");

        const startTime = Date.now();
        vaultData = {
          entries: [],
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        };

        const plaintext = new TextEncoder().encode(JSON.stringify(vaultData));
        const encryptedVault = await vaultManager.create(password, plaintext);
        const createTime = Date.now() - startTime;

        console.log(`  ✓ New vault created (${createTime}ms)`);
        console.log(`  ✓ Vault is now unlocked in memory`);

        displayVault(vaultData);

        // Upload the new vault immediately
        console.log("\n🔼 Step 4: Uploading new vault to S3...");
        const newEtag = await s3Client.upload(urls.putUrl, encryptedVault);
        currentEtag = newEtag;
        console.log(`  ✓ Vault uploaded successfully`);
        console.log(`  ✓ New ETag: ${newEtag}`);
      } else if (error.code === "ETAG_MISMATCH") {
        throw new Error(
          "Vault was modified by another process. Please retry the operation."
        );
      } else {
        throw error;
      }
    }

    // Step 4: Add a sample entry (if vault is empty)
    if (vaultData.entries.length === 0) {
      console.log("\n➕ Step 5: Adding sample entry...");

      vaultData.entries.push({
        id: crypto.randomUUID(),
        title: "Example Website",
        username: "user@example.com",
        password: "SecurePassword123!",
        url: "https://example.com",
        notes: "This is a sample entry created by the basic usage example",
      });
      vaultData.lastModified = new Date().toISOString();

      console.log("  ✓ Sample entry added");
      displayVault(vaultData);

      // Step 5: Save the updated vault (efficient - reuses key!)
      console.log("\n💾 Step 6: Saving updated vault...");

      if (!vaultManager.isUnlocked()) {
        throw new Error("Vault must be unlocked before updating");
      }

      const startTime = Date.now();
      const updatedPlaintext = new TextEncoder().encode(
        JSON.stringify(vaultData, null, 2)
      );

      // Use update() instead of save() - it's faster because it reuses the key!
      const newEncryptedVault = await vaultManager.update(updatedPlaintext);
      const updateTime = Date.now() - startTime;

      console.log(
        `  ✓ Vault encrypted (${updateTime}ms - no key re-derivation!)`
      );

      // Step 6: Upload with optimistic locking (If-Match header)
      console.log(
        "\n🔼 Step 7: Uploading to S3 with concurrency protection..."
      );

      const uploadOptions = currentEtag
        ? { ifMatch: currentEtag } // Optimistic locking!
        : {};

      const newEtag = await s3Client.upload(
        urls.putUrl,
        newEncryptedVault,
        uploadOptions
      );

      console.log(`  ✓ Vault uploaded successfully`);
      console.log(`  ✓ Previous ETag: ${currentEtag}`);
      console.log(`  ✓ New ETag: ${newEtag}`);
      currentEtag = newEtag;
    }

    // Step 7: Lock vault when done
    console.log("\n🔒 Step 8: Locking vault...");
    vaultManager.lock();
    console.log("  ✓ Vault locked (keys cleared from memory)");
    console.log(
      `  ✓ Vault is ${vaultManager.isUnlocked() ? "unlocked" : "locked"}`
    );

    // Success summary
    console.log("\n┌─────────────────────────────────────────────────────┐");
    console.log("│              ✅ EXAMPLE COMPLETED                    │");
    console.log("└─────────────────────────────────────────────────────┘");
    console.log("\nWhat happened:");
    console.log("  1. Generated pre-signed URLs from Lambda API");
    console.log("  2. Downloaded existing vault (or created new)");
    console.log("  3. Unlocked vault with master password");
    console.log("  4. Modified vault data (added sample entry)");
    console.log("  5. Re-encrypted vault (fast - reused key)");
    console.log("  6. Uploaded with optimistic locking (prevented conflicts)");
    console.log("  7. Locked vault (cleared sensitive data)");
    console.log("\nSecurity features demonstrated:");
    console.log("  ✓ Zero-knowledge encryption (server never sees plaintext)");
    console.log("  ✓ ETag verification (tamper detection)");
    console.log("  ✓ Optimistic locking (concurrency control)");
    console.log("  ✓ Memory clearing (lock removes keys)");
    console.log("\nNext steps:");
    console.log("  • Try modifying the vault and running again");
    console.log("  • Change VAULT_PASSWORD and see decryption fail");
    console.log("  • Run two instances simultaneously to test concurrency");
    console.log();
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);

    // Provide helpful context based on error type
    if (error.code === "ETAG_MISMATCH") {
      console.error("\n⚠️  Tampering detected or vault was modified!");
      console.error("   The vault's ETag doesn't match the expected value.");
      console.error("   This could mean:");
      console.error("   • The vault was modified by another user/process");
      console.error("   • The vault was tampered with");
      console.error("   • Network corruption occurred");
      console.error(
        "\n   Action: Download the vault again and review changes."
      );
    } else if (error.code === "PRECONDITION_FAILED") {
      console.error("\n⚠️  Concurrent modification detected!");
      console.error(
        "   Another user/process modified the vault while you were editing."
      );
      console.error(
        "\n   Action: Download the latest version and merge your changes."
      );
    } else if (error.message.includes("Failed to unlock vault")) {
      console.error("\n⚠️  Incorrect password or corrupted vault!");
      console.error("   • Check that VAULT_PASSWORD is correct");
      console.error("   • Verify the vault file isn't corrupted");
    } else if (error.code === "NETWORK_ERROR") {
      console.error("\n⚠️  Network error!");
      console.error("   • Check your internet connection");
      console.error("   • Verify AWS credentials are configured");
      console.error("   • Check that the S3 bucket exists and is accessible");
    }

    // Always lock vault on error (clear sensitive data)
    vaultManager.lock();

    process.exit(1);
  }
}

// Run the example with proper error handling
main().catch((error) => {
  console.error("\n💥 Fatal error:", error.message);
  if (error.stack) {
    console.error("\nStack trace:");
    console.error(error.stack);
  }
  process.exit(1);
});

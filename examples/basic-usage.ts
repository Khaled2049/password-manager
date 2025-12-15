/**
 * Basic Usage Example
 *
 * This example demonstrates how to:
 * 1. Create a new encrypted vault
 * 2. Upload it to S3
 * 3. Download and unlock it
 * 4. Update and save it back
 */

import "dotenv/config";
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

async function main() {
  // Configuration
  const password = process.env.VAULT_PASSWORD || "change-me-please";
  const bucketName = process.env.BUCKET_NAME;
  const objectKey = process.env.OBJECT_KEY || "vault.dat";
  const region = process.env.AWS_REGION || "us-east-1";

  if (!bucketName) {
    throw new Error("BUCKET_NAME environment variable is required");
  }

  const vaultManager = new VaultManager();
  const s3Client = new S3Client();

  console.log("Password Manager - Basic Usage Example\n");

  // Helper function to generate pre-signed URLs
  function generateUrls() {
    const urlsJson = execSync(
      `BUCKET_NAME=${bucketName} OBJECT_KEY=${objectKey} AWS_REGION=${region} yarn generate-urls`,
      { encoding: "utf-8", cwd: "scripts" }
    );
    return JSON.parse(urlsJson);
  }

  try {
    // Step 1: Generate pre-signed URLs
    console.log("Generating pre-signed URLs...");
    const { getUrl, putUrl, etag: expectedEtag } = generateUrls();
    console.log("URLs generated (valid for 12 minutes)\n");

    // Step 2: Try to download existing vault
    let vaultData: VaultData;
    let currentEtag: string | null = expectedEtag || null;

    try {
      console.log("Downloading vault from S3...");
      const { data: encryptedVault, etag } = await s3Client.download(
        getUrl,
        currentEtag || undefined
      );

      if (currentEtag && etag !== currentEtag) {
        throw new Error("ETag mismatch - possible tampering detected!");
      }

      currentEtag = etag;
      console.log("Vault downloaded. ETag:", etag);

      // Step 3: Unlock the vault
      console.log("\nUnlocking vault...");
      const plaintext = await vaultManager.unlock(encryptedVault, password);
      vaultData = JSON.parse(new TextDecoder().decode(plaintext));
      console.log("Vault unlocked successfully");
      console.log(`   Entries: ${vaultData.entries.length}`);
      console.log(`   Created: ${vaultData.created}`);
      console.log(`   Last Modified: ${vaultData.lastModified}`);
    } catch (error: any) {
      if (
        error.message.includes("ETag not found") ||
        error.message.includes("404")
      ) {
        // Vault doesn't exist, create a new one
        console.log("No existing vault found. Creating new vault...");
        vaultData = {
          entries: [],
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        };
      } else {
        throw error;
      }
    }

    // Step 4: Add a sample entry (if vault is empty)
    if (vaultData.entries.length === 0) {
      console.log("\nAdding sample entry...");
      vaultData.entries.push({
        id: crypto.randomUUID(),
        title: "Example Website",
        username: "user@example.com",
        password: "SecurePassword123!",
        url: "https://example.com",
        notes: "This is a sample entry",
      });
      vaultData.lastModified = new Date().toISOString();
      console.log("Sample entry added");
    }

    // Step 5: Save the updated vault
    console.log("\nSaving vault...");
    const updatedPlaintext = new TextEncoder().encode(
      JSON.stringify(vaultData)
    );
    const newEncryptedVault = await vaultManager.save(
      updatedPlaintext,
      password
    );

    // Step 6: Upload with ETag verification
    const { putUrl: newPutUrl } = generateUrls();
    const newEtag = await s3Client.upload(
      newPutUrl,
      newEncryptedVault,
      currentEtag || undefined
    );

    console.log("Vault saved successfully");
    console.log(`   New ETag: ${newEtag}`);
    console.log("\nExample completed successfully!");
  } catch (error: any) {
    console.error("\nError:", error.message);
    if (error.message.includes("ETag mismatch")) {
      console.error(
        "\nWarning: The vault may have been modified by another process."
      );
      console.error("   Consider downloading again and merging changes.");
    }
    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

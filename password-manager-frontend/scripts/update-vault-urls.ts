#!/usr/bin/env node
import "dotenv/config";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

interface PresignedUrlsOutput {
  getUrl: string;
  putUrl: string;
  etag: string | null;
}

async function updateVaultUrls(): Promise<void> {
  // Get environment variables from root .env or scripts/.env
  const rootEnvPath = resolve(__dirname, "..", "..", ".env");

  // Load environment variables
  let bucketName = process.env.BUCKET_NAME;
  let objectKey = process.env.OBJECT_KEY || "vault.dat";
  let region = process.env.AWS_REGION || "us-east-1";

  // Try to load from root .env if not set
  if (!bucketName && existsSync(rootEnvPath)) {
    const rootEnv = readFileSync(rootEnvPath, "utf-8");
    const bucketMatch = rootEnv.match(/BUCKET_NAME=(.+)/);
    const keyMatch = rootEnv.match(/OBJECT_KEY=(.+)/);
    const regionMatch = rootEnv.match(/AWS_REGION=(.+)/);

    if (bucketMatch) bucketName = bucketMatch[1].trim();
    if (keyMatch) objectKey = keyMatch[1].trim();
    if (regionMatch) region = regionMatch[1].trim();
  }

  if (!bucketName) {
    console.error("Error: BUCKET_NAME environment variable is required");
    console.error(
      "Please set BUCKET_NAME in your .env file or as an environment variable"
    );
    process.exit(1);
  }

  // Path to the generate-presigned-urls script
  const scriptsDir = resolve(__dirname, "..", "..", "scripts");
  const scriptPath = join(scriptsDir, "generate-presigned-urls.ts");

  if (!existsSync(scriptPath)) {
    console.error(`Error: Script not found at ${scriptPath}`);
    process.exit(1);
  }

  console.log("Generating pre-signed URLs...");
  console.log(`  Bucket: ${bucketName}`);
  console.log(`  Object Key: ${objectKey}`);
  console.log(`  Region: ${region}\n`);

  try {
    // Run the script and capture output
    const urlsJson = execSync(`tsx "${scriptPath}"`, {
      encoding: "utf-8",
      cwd: scriptsDir,
      env: {
        ...process.env,
        BUCKET_NAME: bucketName,
        OBJECT_KEY: objectKey,
        AWS_REGION: region,
      },
    });

    // Extract JSON from output (handle any potential non-JSON output)
    const jsonMatch = urlsJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from script output");
    }

    const urls: PresignedUrlsOutput = JSON.parse(jsonMatch[0]);

    if (!urls.getUrl || !urls.putUrl) {
      throw new Error("Invalid response: missing getUrl or putUrl");
    }

    console.log("✓ URLs generated successfully");
    console.log(`  GET URL: ${urls.getUrl.substring(0, 60)}...`);
    console.log(`  PUT URL: ${urls.putUrl.substring(0, 60)}...\n`);

    // Update frontend .env file
    const frontendEnvPath = resolve(__dirname, "..", ".env");
    let envContent = "";

    if (existsSync(frontendEnvPath)) {
      envContent = readFileSync(frontendEnvPath, "utf-8");
    }

    // Update or add VITE_VAULT_GET_URL
    if (envContent.includes("VITE_VAULT_GET_URL=")) {
      envContent = envContent.replace(
        /VITE_VAULT_GET_URL=.*/g,
        `VITE_VAULT_GET_URL=${urls.getUrl}`
      );
    } else {
      envContent += `\nVITE_VAULT_GET_URL=${urls.getUrl}\n`;
    }

    // Update or add VITE_VAULT_PUT_URL
    if (envContent.includes("VITE_VAULT_PUT_URL=")) {
      envContent = envContent.replace(
        /VITE_VAULT_PUT_URL=.*/g,
        `VITE_VAULT_PUT_URL=${urls.putUrl}`
      );
    } else {
      envContent += `VITE_VAULT_PUT_URL=${urls.putUrl}\n`;
    }

    // Write updated content
    writeFileSync(frontendEnvPath, envContent.trim() + "\n", "utf-8");

    console.log(`✓ Updated ${frontendEnvPath}`);
    console.log("\n⚠️  Note: These URLs expire in 12 minutes.");
    console.log("   Run this script again to generate new URLs.\n");
  } catch (error: any) {
    console.error("Error generating or updating URLs:", error.message);
    if (error.stdout) {
      console.error("Script output:", error.stdout);
    }
    if (error.stderr) {
      console.error("Script error:", error.stderr);
    }
    process.exit(1);
  }
}

updateVaultUrls().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});

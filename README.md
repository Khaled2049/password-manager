# Password Manager

A secure, client-side encrypted password manager that stores encrypted vaults in AWS S3. The vault is encrypted locally before upload, ensuring that your passwords are never exposed to AWS or any third party.

## Features

- **Client-side encryption** - Your passwords are encrypted locally before being stored
- **Cloud storage** - Encrypted vaults stored securely in AWS S3
- **Tamper detection** - ETag verification prevents unauthorized modifications
- **Security best practices** - AES-256 encryption, versioning, CloudTrail logging
- **Pre-signed URLs** - No long-lived credentials needed for S3 access
- **TypeScript** - Fully typed for better developer experience

## Architecture

The password manager consists of three main components:

1. **Core Library** (`core/`) - Encryption, vault management, and S3 client
2. **CDK Stack** (`cdk/`) - AWS infrastructure (S3 bucket, CloudTrail)
3. **Scripts** (`scripts/`) - Utility scripts for generating pre-signed URLs

The vault is encrypted using AES-256-GCM with a key derived from your password using PBKDF2. Each vault has a unique salt, ensuring that even identical passwords produce different encrypted data.

## Prerequisites

- **Node.js** 18+ and **Yarn** 1.22.0+
- **AWS Account** with appropriate permissions
- **AWS CLI** configured with SSO or access keys
- **AWS CDK CLI** (will be installed as a dependency)

## Setup

### 1. Clone and Install Dependencies

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd password-manager

# Install dependencies
yarn install
```

### 2. Build the Project

```bash
# Build all workspaces
yarn build
```

## Deployment

### AWS SSO Setup

This project uses AWS SSO for authentication. If you haven't set up AWS SSO yet:

1. **Find your SSO profile name:**
   
   **Windows (PowerShell):**
   ```powershell
   Get-Content C:\Users\$env:USERNAME\.aws\config
   ```
   
   **macOS/Linux:**
   ```bash
   cat ~/.aws/config
   ```
   
   Look for a profile section like:
   ```
   [profile your-profile-name]
   sso_start_url = https://your-org.awsapps.com/start
   sso_region = us-east-1
   sso_account_id = 123456789012
   sso_role_name = YourRoleName
   region = us-east-1
   ```

2. **Login to AWS SSO:**
   ```bash
   aws sso login --profile your-profile-name
   ```

3. **Verify your credentials:**
   ```bash
   aws sts get-caller-identity --profile your-profile-name
   ```

### Deploy the Stack

Deploy the CDK stack using your AWS SSO profile:

```bash
# From the project root
cd cdk
cdk deploy --profile your-profile-name
```

Or use the convenience script:

```bash
# From the project root
yarn deploy
# Make sure AWS_PROFILE is set: $env:AWS_PROFILE = "your-profile-name" (PowerShell)
```

### CDK Bootstrap (First Time Only)

If this is your first time deploying CDK in this AWS account/region, you'll need to bootstrap:

```bash
cd cdk
cdk bootstrap --profile your-profile-name
```

### Deployment Outputs

After successful deployment, note the stack outputs:

- `PasswordManagerStack.BucketName` - The S3 bucket name for storing vaults
- `PasswordManagerStack.BucketArn` - The ARN of the S3 bucket

You can retrieve these values later:

```bash
aws cloudformation describe-stacks \
  --stack-name PasswordManagerStack \
  --profile your-profile-name \
  --query 'Stacks[0].Outputs'
```

**Save these values** - you'll need the bucket name for usage!

## Usage

### Environment Variables

You can configure the application using either a `.env` file (recommended) or by setting environment variables directly.

#### Option 1: Using a `.env` File (Recommended)

1. **Copy the example file:**
   ```bash
   # Windows PowerShell
   Copy-Item .env.example .env
   
   # macOS/Linux
   cp .env.example .env
   ```

2. **Edit `.env` and set your values:**
   ```env
   # AWS Configuration
   # Get these values from your CDK deployment outputs
   BUCKET_NAME=your-bucket-name-from-deployment
   AWS_REGION=us-east-1
   
   # Optional: Vault configuration
   OBJECT_KEY=vault.dat
   
   # Optional: For examples and testing
   VAULT_PASSWORD=your-secure-password
   
   # AWS SSO Profile (if using AWS SSO)
   AWS_PROFILE=your-profile-name
   ```

3. **The `.env` file is automatically loaded** by the scripts and examples. No need to export variables manually!

**Note:** The `.env` file is already in `.gitignore`, so your secrets won't be committed to version control.

#### Option 2: Setting Environment Variables Manually

If you prefer not to use a `.env` file, you can set environment variables directly:

```bash
# Windows PowerShell
$env:BUCKET_NAME = "your-bucket-name-from-deployment"
$env:AWS_REGION = "us-east-1"  # or your deployment region
$env:OBJECT_KEY = "vault.dat"  # optional, defaults to "vault.dat"
$env:VAULT_PASSWORD = "your-secure-password"  # optional for examples
$env:AWS_PROFILE = "your-profile-name"  # for AWS SSO

# macOS/Linux
export BUCKET_NAME="your-bucket-name-from-deployment"
export AWS_REGION="us-east-1"
export OBJECT_KEY="vault.dat"  # optional
export VAULT_PASSWORD="your-secure-password"  # optional
export AWS_PROFILE="your-profile-name"
```

### Generate Pre-signed URLs

Before uploading or downloading vaults, you need to generate pre-signed URLs:

```bash
cd scripts
yarn generate-urls
```

This will output JSON with `getUrl`, `putUrl`, and `etag` (if the vault exists).

**Note:** Pre-signed URLs expire after 12 minutes. You'll need to generate new ones if they expire.

### Basic Usage Example

Run the included example:

```bash
# If using .env file, make sure it's configured with BUCKET_NAME and AWS_PROFILE
# If not using .env, set environment variables:
#   $env:BUCKET_NAME = "your-bucket-name"  (PowerShell)
#   export BUCKET_NAME="your-bucket-name"  (macOS/Linux)

# Run the example
yarn example
```

### Programmatic Usage

```typescript
import { VaultManager, S3Client } from '@password-manager/core';

const vaultManager = new VaultManager();
const s3Client = new S3Client();

// 1. Generate pre-signed URLs (using the script)
// This outputs: { getUrl, putUrl, etag }

// 2. Download existing vault (if it exists)
const { data: encryptedVault, etag } = await s3Client.download(getUrl, expectedEtag);

// 3. Unlock the vault
const plaintext = await vaultManager.unlock(encryptedVault, 'your-password');

// 4. Parse and modify your data
const vaultData = JSON.parse(new TextDecoder().decode(plaintext));
vaultData.entries.push({ /* new entry */ });

// 5. Save the updated vault
const updatedPlaintext = new TextEncoder().encode(JSON.stringify(vaultData));
const newEncryptedVault = await vaultManager.save(updatedPlaintext, 'your-password');

// 6. Upload the updated vault
const newEtag = await s3Client.upload(putUrl, newEncryptedVault, etag);
```

### Vault Data Structure

The vault stores JSON data. Example structure:

```typescript
interface VaultData {
  entries: Array<{
    id: string;
    title: string;
    username: string;
    password: string;
    url?: string;
    notes?: string;
  }>;
  created: string;        // ISO timestamp
  lastModified: string;   // ISO timestamp
}
```

## Security Features

### Encryption

- **Algorithm:** AES-256-GCM
- **Key Derivation:** PBKDF2 with 100,000 iterations
- **Salt:** Unique 16-byte salt per vault
- **Nonce:** Unique per encryption operation

### Tamper Detection

- **ETag Verification:** Each download/upload verifies the ETag to detect modifications
- **Optimistic Concurrency:** Uploads fail if the vault was modified by another process

### AWS Security

- **S3 Encryption:** AES-256 server-side encryption
- **HTTPS Only:** Enforced SSL/TLS for all S3 access
- **Versioning:** Enabled for recovery and audit trails
- **CloudTrail:** All S3 operations are logged
- **Public Access:** Blocked - bucket is private

## Troubleshooting

### AWS SSO Session Expired

If you get authentication errors:

```bash
# Re-login
aws sso login --profile your-profile-name

# Verify
aws sts get-caller-identity --profile your-profile-name
```

### Pre-signed URL Expired

Pre-signed URLs expire after 12 minutes. Generate new ones:

```bash
cd scripts
yarn generate-urls
```

### ETag Mismatch

If you get an ETag mismatch error:

1. The vault may have been modified by another process
2. Download the latest version and merge your changes
3. Try uploading again

### Build Errors

If you encounter build errors:

```bash
# Clean and rebuild
yarn clean
yarn build
```

## Project Structure

```
password-manager/
├── core/                 # Core library (encryption, vault management)
│   ├── src/
│   │   ├── crypto.ts     # Encryption/decryption functions
│   │   ├── vault-manager.ts  # Vault operations
│   │   ├── s3-client.ts  # S3 upload/download client
│   │   └── index.ts      # Public exports
│   └── package.json
├── cdk/                  # AWS CDK infrastructure
│   ├── lib/
│   │   └── stack.ts      # CDK stack definition
│   └── package.json
├── scripts/              # Utility scripts
│   ├── generate-presigned-urls.ts  # Generate S3 pre-signed URLs
│   └── package.json
├── examples/             # Usage examples
│   ├── basic-usage.ts    # Basic usage example
│   └── package.json
└── package.json          # Root workspace configuration
```

## Development

### Building

```bash
# Build all workspaces
yarn build

# Build specific workspace
cd core && yarn build
cd cdk && yarn build
cd scripts && yarn build
```

### Running Examples

```bash
# Option 1: Using .env file (recommended)
# Make sure .env is configured with BUCKET_NAME and AWS_PROFILE
yarn example

# Option 2: Set environment variables manually
# Windows PowerShell:
$env:BUCKET_NAME = "your-bucket-name"
$env:AWS_PROFILE = "your-profile-name"
yarn example

# macOS/Linux:
export BUCKET_NAME="your-bucket-name"
export AWS_PROFILE="your-profile-name"
yarn example
```

### CDK Development

```bash
cd cdk

# Synthesize CloudFormation template
yarn synth

# Deploy stack
yarn deploy

# View differences
cdk diff --profile your-profile-name
```

## License

[Add your license here]

## Contributing

[Add contributing guidelines here]

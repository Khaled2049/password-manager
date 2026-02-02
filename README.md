# Password Manager

A secure, zero-knowledge password manager with client-side encryption and cloud storage. All encryption happens locally in your browser—your master password and decrypted data never leave your device.

## Features

- **Zero-knowledge architecture** - Server never sees plaintext data
- **Strong cryptography** - Argon2id key derivation + XChaCha20Poly1305 encryption
- **Cloud sync** - Encrypted vaults stored in AWS S3
- **Optimistic locking** - ETag-based conflict detection prevents data loss
- **Cross-platform** - React frontend with Capacitor for mobile support

## Project Structure

```
password-manager/
├── core/                        # Encryption & vault management library
├── cdk/                         # AWS CDK infrastructure
│   └── lib/lambda/              # Pre-signed URL generation
├── examples/                    # Usage examples
└── scripts/                     # Utility scripts
```

## Quick Start

### Prerequisites

- Node.js 20.x or later
- Yarn 1.22+
- AWS account (for production deployment)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd password-manager

# Install dependencies
yarn install

# Build all packages
yarn build
```

### Development Mode (Mock API)

The fastest way to get started—no AWS account required:

```bash
cd password-manager-frontend

# Create environment file
echo "VITE_USE_MOCK_API=true" > .env

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser. The mock API stores data in memory (data is lost on refresh).

### Production Mode (AWS)

#### 1. Configure AWS credentials

Ensure you have AWS credentials configured:

```bash
# Option A: AWS CLI
aws configure

# Option B: AWS SSO
aws sso login --profile your-profile
export AWS_PROFILE=your-profile
```

#### 2. Deploy infrastructure

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your AWS settings

# Deploy to AWS
yarn deploy
```

Note the `BucketName` and `ApiUrl` from the deployment output.

#### 3. Configure frontend

```bash
cd password-manager-frontend

# Create .env file
cat > .env << EOF
VITE_USE_MOCK_API=false
VITE_API_URL=https://your-api-gateway-url
BUCKET_NAME=your-bucket-name
AWS_REGION=us-east-1
EOF
```

#### 4. Run with pre-signed URLs

```bash
# Start dev server (auto-refreshes URLs)
npm run dev:with-urls
```

Pre-signed URLs expire after 12 minutes. Run `npm run update-urls` to refresh them manually.

## Usage

### Core Library

```typescript
import { VaultManager, S3Client } from '@password-manager/core';

// Initialize
const vaultManager = new VaultManager();
const s3Client = new S3Client();

// Create a new vault
const encryptedData = await vaultManager.create('my-master-password', {
  entries: []
});

// Upload to S3
await s3Client.upload(presignedPutUrl, encryptedData);

// Download and unlock
const downloaded = await s3Client.download(presignedGetUrl);
const vault = await vaultManager.unlock('my-master-password', downloaded.data);

// Access vault data
console.log(vault.entries);

// Lock when done
vaultManager.lock();
```

### Running Examples

```bash
# Run basic usage example
yarn example

# Generate pre-signed URLs
yarn generate
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BUCKET_NAME` | S3 bucket for vault storage | Required |
| `AWS_REGION` | AWS region | `us-east-1` |
| `OBJECT_KEY` | S3 object key for vault | `vault.dat` |
| `VAULT_PASSWORD` | Master password (for scripts) | - |
| `AWS_PROFILE` | AWS SSO profile | - |
| `VITE_USE_MOCK_API` | Enable mock API mode | `false` |
| `VITE_API_URL` | API Gateway endpoint | - |

## Security

### Cryptography Details

- **Key Derivation**: Argon2id (64MB memory, 3 iterations)
- **Encryption**: XChaCha20Poly1305 (authenticated encryption)
- **Salt**: 16 bytes, randomly generated per encryption
- **Nonce**: 24 bytes, randomly generated per encryption

### Encrypted Data Format

```
[Version: 1 byte][Salt: 16 bytes][Nonce: 24 bytes][Tag: 16 bytes][Ciphertext]
```

### Security Model

1. Master password never leaves your device
2. All encryption/decryption happens client-side
3. Server only stores encrypted blobs
4. ETag verification detects tampering
5. Argon2id makes brute-force attacks impractical

## Scripts

```bash
yarn install       # Install dependencies
yarn build         # Build all packages
yarn clean         # Remove build artifacts
yarn test          # Run tests
yarn deploy        # Deploy AWS infrastructure
yarn synth         # Generate CloudFormation template
yarn example       # Run usage example
```

## Development

### Core Library

```bash
cd core
yarn build           # Compile TypeScript
yarn test            # Run tests
yarn test:watch      # Watch mode
yarn test:coverage   # Coverage report
```

### Frontend

```bash
cd password-manager-frontend
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

## Tech Stack

- **Core**: TypeScript, @noble/hashes, @noble/ciphers
- **Frontend**: React 19, Vite, Tailwind CSS
- **Infrastructure**: AWS CDK, S3, Lambda, API Gateway
- **Testing**: Vitest

## License

MIT

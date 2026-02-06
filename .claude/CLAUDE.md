# Password Manager

## Project Overview
A serverless password manager using client-side encryption with an AWS S3 backend. Vaults are encrypted locally before being stored in S3, and decrypted client-side after retrieval.

## Architecture
- **core/** - Core library: crypto (Argon2-based key derivation, AES-GCM encryption via @noble/hashes and @noble/ciphers), vault management, S3 client
- **cdk/** - AWS CDK infrastructure: S3 bucket, Lambda API Gateway, GitHub OIDC for CI/CD
- **scripts/** - Utility scripts (presigned URL generation)
- **examples/** - Usage examples for vault decryption

## Tech Stack
- **Runtime**: Bun
- **Language**: TypeScript (ES2022 target, ESM modules in core/scripts/examples, CommonJS in cdk)
- **Package Manager**: Bun (workspaces: cdk, scripts, core, examples)
- **Infrastructure**: AWS CDK v2
- **Testing**: Vitest
- **CI/CD**: GitHub Actions with OIDC-based AWS auth

## Common Commands
- `bun install` - Install all workspace dependencies
- `bun run build` - Build all workspaces
- `bun run test` - Run tests (in core/)
- `bun run deploy:app` - Deploy the backend stack
- `bun run synth` - Synthesize CDK
- `bun run generate` - Generate presigned URLs

## Key Conventions
- Workspace packages are prefixed with `@password-manager/`
- Environment variables are defined in `.env` (see `.env.example`)
- Never commit `.env` files or AWS credentials
- CDK deploys to `us-east-1` by default

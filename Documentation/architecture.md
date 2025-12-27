# Architecture

## High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Client Application                     │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐     │  │
│  │  │   Vault     │  │   Crypto     │  │   S3 Client   │     │  │
│  │  │   Manager   │──│   Module     │  │   (Fetch API) │     │  │
│  │  └─────────────┘  └──────────────┘  └───────┬───────┘     │  │
│  │         │               │                     │           │  │
│  │         │   Plaintext   │   Encrypted         │           │  │
│  │         │   Vault Data  │   Vault Data        │           │  │
│  │         │               │                     │           │  │
│  └─────────┼───────────────┼─────────────────────┼───────────┘  │
│            │               │                     │              │
│     [Master Password]  [Key Derivation]    [HTTPS]              │
└────────────┼───────────────┼─────────────────────┼──────────────┘
             │               │                     │
             └───────────────┴─────────────────────┘
                                                    │
                                        ┌───────────▼───────────┐
                                        │    AWS Cloud          │
                                        │                       │
                    ┌───────────────────┤  API Gateway          │
                    │                   │  (REST API)           │
                    │                   └───────────┬───────────┘
                    │                               │
            ┌───────▼────────┐             ┌────────▼──────────┐
            │  Lambda        │             │   S3 Bucket       │
            │  (Vault API)   │────────────▶│   (Encrypted      │
            │                │  Pre-signed │    Vault Blobs)   │
            │  • List vaults │     URLs    │                   │
            │  • Get URLs    │             │  • Versioned      │
            │  • Generate    │             │  • Encrypted      │
            │    pre-signed  │             │  • SSL enforced   │
            └────────────────┘             └───────────────────┘
```

## Component Layers

```
┌─────────────────────────────────────────────────────────┐
│ Layer 4: User Interface                                 │
│ • Password input forms                                  │
│ • Vault management UI                                   │
│ • Progress indicators                                   │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│ Layer 3: Business Logic (VaultManager)                  │
│ • create() - New vault creation                         │
│ • unlock() - Decrypt existing vault                     │
│ • save() - Re-encrypt vault data                        │
│ • update() - Fast re-encryption                         │
│ • changePassword() - Password rotation                  │
│ • lock() - Clear keys from memory                       │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│ Layer 2: Cryptography (crypto module)                   │
│ • deriveKey() - Argon2id password hashing               │
│ • encrypt() - XChaCha20-Poly1305 encryption             │
│ • decrypt() - XChaCha20-Poly1305 decryption             │
│ • generateSalt() - Cryptographic random salt            │
│ • extractSalt() - Parse salt from encrypted data        │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│ Layer 1: Network Transport (S3Client)                   │
│ • download() - Fetch vault from S3                      │
│ • upload() - Store vault to S3                          │
│ • ETag verification                                     │
│ • Retry logic & error handling                          │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│ Layer 0: Infrastructure (AWS)                           │
│ • API Gateway - REST endpoints                          │
│ • Lambda - Pre-signed URL generation                    │
│ • S3 - Encrypted blob storage                           │
│ • CloudWatch - Logging & monitoring                     │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

1. **User Input** → Layer 4 (UI) captures master password
2. **Key Derivation** → Layer 2 (Crypto) derives encryption key
3. **Encryption** → Layer 2 (Crypto) encrypts vault data
4. **Network Request** → Layer 1 (S3Client) uploads encrypted blob
5. **Infrastructure** → Layer 0 (AWS) stores encrypted data

All cryptographic operations occur in the browser. The server never sees plaintext or encryption keys.

## Related Documentation

- [Security Model](security.md#zero-knowledge-architecture)
- [Cryptographic Implementation](cryptography.md)
- [Deployment Architecture](deployment.md)


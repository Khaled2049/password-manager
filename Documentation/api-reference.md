# API Reference

## VaultManager Class

```typescript
class VaultManager {
  // Create a new encrypted vault
  async create(
    password: string,
    initialData?: Uint8Array
  ): Promise<Uint8Array>

  // Unlock (decrypt) existing vault
  async unlock(
    encryptedVault: Uint8Array,
    password: string
  ): Promise<Uint8Array>

  // Save vault (generates new salt if locked)
  async save(
    plaintext: Uint8Array,
    password: string
  ): Promise<Uint8Array>

  // Update vault (reuses key if unlocked)
  async update(
    plaintext: Uint8Array
  ): Promise<Uint8Array>

  // Change master password
  async changePassword(
    encryptedVault: Uint8Array,
    currentPassword: string,
    newPassword: string
  ): Promise<Uint8Array>

  // Check if vault is unlocked
  isUnlocked(): boolean

  // Lock vault (clear keys from memory)
  lock(): void

  // Get current salt (for debugging)
  getSalt(): Uint8Array | null
}
```

## Crypto Module

```typescript
// Derive encryption key from password
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array>

// Encrypt data
function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  salt?: Uint8Array
): Uint8Array

// Decrypt data
function decrypt(
  ciphertext: Uint8Array,
  key: Uint8Array
): Uint8Array

// Extract salt from encrypted blob
function extractSalt(
  ciphertext: Uint8Array
): Uint8Array

// Generate random salt
function generateSalt(): Uint8Array

// Get Argon2 configuration
function getArgon2Config(): {
  algorithm: string
  memoryCostMB: number
  iterations: number
  parallelism: number
  keyLength: number
}
```

## S3Client Class

```typescript
class S3Client {
  constructor(options?: {
    maxRetries?: number      // Default: 3
    retryDelay?: number      // Default: 1000ms
    timeout?: number         // Default: 30000ms
  })

  // Download vault from S3
  async download(
    url: string,
    options?: {
      expectedEtag?: string
      signal?: AbortSignal
      onProgress?: (loaded: number, total: number) => void
    }
  ): Promise<{
    data: Uint8Array
    etag: string
    contentLength: number
    lastModified?: string
  }>

  // Upload vault to S3
  async upload(
    url: string,
    data: Uint8Array,
    options?: {
      ifMatch?: string       // Optimistic locking
      signal?: AbortSignal
      onProgress?: (loaded: number, total: number) => void
    }
  ): Promise<string>         // Returns new ETag
}
```

## Lambda API Endpoints

### List All Vaults

```typescript
GET /vaults

Response: {
  vaults: Array<{
    key: string
    name: string
    lastModified: string
    size: number
  }>
}
```

### Get Pre-signed URLs for Vault Operations

```typescript
POST /vaults/{vaultName}

Response: {
  getUrl: string    // Pre-signed GET URL (12 min)
  putUrl: string    // Pre-signed PUT URL (12 min)
  etag: string      // Current ETag (null if new)
  vaultKey: string  // Full S3 key
}
```

## Error Handling

All API methods throw errors that should be caught:

- **Decryption errors**: Wrong password or corrupted data
- **Network errors**: Connection failures, timeouts
- **ETag mismatches**: Concurrent modification detected
- **Validation errors**: Invalid input parameters

## Related Documentation

- [User Flows](user-flows.md)
- [Cryptographic Implementation](cryptography.md)
- [Quick Start](quick-start.md)


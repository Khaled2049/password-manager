# Cryptographic Implementation

## Key Derivation (Argon2id)

```
┌─────────────────────────────────────────────────────────────┐
│              Password to Encryption Key                     │
└─────────────────────────────────────────────────────────────┘

Input Parameters:
├─ Password: "MySecurePassword123!" (user's master password)
├─ Salt: 16 random bytes (unique per vault)
├─ Memory Cost: 64MB (65,536 KB)
├─ Iterations: 3 (time cost)
├─ Parallelism: 1 (single-threaded, browser compatible)
└─ Output Length: 32 bytes (256 bits)

                     │
                     ▼
        ┌────────────────────────┐
        │   Argon2id Algorithm   │
        │  (Password Hashing)    │
        │                        │
        │  Takes ~100-300ms      │
        │  Uses 64MB RAM         │
        │  Resistant to:         │
        │  • GPU attacks         │
        │  • ASIC attacks        │
        │  • Side-channel        │
        └───────────┬────────────┘
                    │
                    ▼
        32-byte Encryption Key
        (256-bit, cryptographically secure)

Why Argon2id?
├─ Winner of Password Hashing Competition (2015)
├─ Hybrid algorithm (Argon2i + Argon2d)
├─ Memory-hard (prevents GPU/ASIC brute force)
├─ Side-channel resistant
└─ OWASP recommended for password storage
```

## Encryption (XChaCha20-Poly1305)

```
┌─────────────────────────────────────────────────────────────┐
│         Authenticated Encryption with Associated Data       │
└─────────────────────────────────────────────────────────────┘

Encryption Process:
┌──────────────────┐    ┌──────────────────┐
│  Plaintext Data  │    │  32-byte Key     │
│  (Vault JSON)    │    │  (from Argon2id) │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         │    ┌──────────────────┘
         │    │
         │    │         ┌──────────────────┐
         │    │         │  24-byte Nonce   │
         │    │         │  (random, unique)│
         │    │         └────────┬─────────┘
         │    │                  │
         ▼    ▼                  ▼
    ┌────────────────────────────────┐
    │   XChaCha20-Poly1305 Cipher    │
    │                                │
    │  XChaCha20: Stream cipher      │
    │  Poly1305: MAC (auth tag)      │
    └────────────┬───────────────────┘
                 │
                 ▼
    ┌────────────────────────────────┐
    │  Ciphertext + Authentication   │
    │           Tag (16 bytes)       │
    └────────────────────────────────┘

Security Properties:
├─ Confidentiality: Data encrypted with XChaCha20
├─ Authenticity: Poly1305 MAC prevents tampering
├─ Integrity: Any modification detected during decryption
├─ Nonce Misuse Resistance: XChaCha20 has 192-bit nonce
└─ Performance: ~3-4 GB/s encryption speed

Why XChaCha20-Poly1305?
├─ Modern, standardized (RFC 8439)
├─ Fast in software (no hardware required)
├─ Large nonce space (prevents reuse concerns)
├─ Authenticated encryption (detects tampering)
└─ Used by Google, Cloudflare, WireGuard
```

## Algorithm Details

### Argon2id Configuration

- **Algorithm**: Argon2id (hybrid variant)
- **Memory Cost**: 64 MB (65,536 KB)
- **Time Cost**: 3 iterations
- **Parallelism**: 1 thread (browser compatible)
- **Output Length**: 32 bytes (256 bits)
- **Salt Length**: 16 bytes (128 bits)

### XChaCha20-Poly1305 Configuration

- **Key Length**: 32 bytes (256 bits)
- **Nonce Length**: 24 bytes (192 bits)
- **Tag Length**: 16 bytes (128 bits)
- **Block Size**: 64 bytes
- **Standard**: RFC 8439

## Security Considerations

1. **Salt Uniqueness**: Each vault uses a unique random salt, preventing rainbow table attacks
2. **Nonce Uniqueness**: Each encryption uses a unique random nonce, preventing replay attacks
3. **Memory Hardness**: Argon2id requires significant memory, making GPU/ASIC attacks impractical
4. **Timing Attacks**: Constant-time operations prevent timing-based side-channel attacks
5. **Authenticated Encryption**: Poly1305 MAC ensures data integrity and authenticity

## Related Documentation

- [Security Model](security.md)
- [Performance Characteristics](performance.md)
- [API Reference](api-reference.md#crypto-module)


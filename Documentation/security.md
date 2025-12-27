# Security

## Zero-Knowledge Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                        │
│                                                            │
│  User enters password: "MySecurePassword123!"             │
│           │                                                │
│           ▼                                                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Argon2id Key Derivation (64MB RAM, 3 iterations)   │  │
│  │ Input: password + random salt                       │  │
│  │ Output: 32-byte encryption key                      │  │
│  └─────────────────────┬───────────────────────────────┘  │
│                        │                                   │
│           NEVER LEAVES BROWSER                            │
│                        │                                   │
│           ▼            ▼                                   │
│  ┌──────────────────────────────────────┐                 │
│  │ XChaCha20-Poly1305 Encryption        │                 │
│  │                                      │                 │
│  │ Plaintext vault data                 │                 │
│  │         │                            │                 │
│  │         ▼                            │                 │
│  │ Encrypted blob                       │                 │
│  │ (unreadable without key)             │                 │
│  └──────────────────┬───────────────────┘                 │
│                     │                                      │
└─────────────────────┼──────────────────────────────────────┘
                      │
                      │ HTTPS (TLS 1.3)
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVER (AWS)                             │
│                                                             │
│  Receives: Encrypted blob (looks like random data)         │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │  S3 Bucket stores:                                 │    │
│  │                                                    │    │
│  │  0x01 a3f2... [random encrypted bytes] ...        │    │
│  │                                                    │    │
│  │  Server CANNOT:                                   │    │
│  │  ✗ Read passwords                                 │    │
│  │  ✗ Decrypt data                                   │    │
│  │  ✗ Derive encryption key                          │    │
│  │  ✗ Access master password                         │    │
│  │                                                    │    │
│  │  Server CAN:                                      │    │
│  │  ✓ Store encrypted blobs                          │    │
│  │  ✓ Verify data integrity (ETag)                   │    │
│  │  ✓ Provide access control (pre-signed URLs)       │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Encryption Format

```
Encrypted Vault Structure (on S3):
┌──────────┬──────────┬──────────┬──────────┬─────────────────┐
│ VERSION  │   SALT   │  NONCE   │   TAG    │   CIPHERTEXT    │
│ (1 byte) │(16 bytes)│(24 bytes)│(16 bytes)│  (variable)     │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘
     │          │          │          │            │
     │          │          │          │            └─── Encrypted vault data
     │          │          │          └────────────── Authentication tag
     │          │          │                          (detects tampering)
     │          │          └───────────────────────── Random nonce (never reused)
     │          └──────────────────────────────────── Salt for key derivation
     └─────────────────────────────────────────────── Format version (0x01)

Total overhead: 57 bytes per vault
```

## Security Guarantees

### What the System Protects Against

```
✓ Server Compromise
  └─ Even if AWS account is compromised, attacker cannot
     decrypt vault data without master password

✓ Network Interception (MITM)
  └─ All data transmitted over TLS 1.3
  └─ Pre-signed URLs use HTTPS only
  └─ Encrypted data looks like random bytes

✓ Data Tampering
  └─ ETag verification detects unauthorized modifications
  └─ Poly1305 MAC detects any ciphertext changes
  └─ Decryption fails if data is tampered

✓ Brute Force Attacks
  └─ Argon2id memory-hard (64MB per attempt)
  └─ GPU/ASIC attacks impractical
  └─ ~100-300ms per password attempt (intentional slowdown)

✓ Rainbow Table Attacks
  └─ Unique random salt per vault
  └─ Pre-computed hash tables useless

✓ Concurrent Modification
  └─ Optimistic locking with If-Match header
  └─ 412 Precondition Failed on conflict
  └─ No silent data loss

✓ Replay Attacks
  └─ Unique nonce per encryption
  └─ Old encrypted versions cannot be replayed

✓ Data Breaches
  └─ Encrypted data useless without password
  └─ S3 versioning allows point-in-time recovery
  └─ Server logs contain no sensitive data
```

### What the System Does NOT Protect Against

```
✗ Weak Master Passwords
  └─ User chooses "password123" → easily cracked
  └─ Mitigation: Enforce minimum 8 characters, suggest strong passwords

✗ Keyloggers / Malware on Client
  └─ If user's device is compromised, attacker can steal password
  └─ Mitigation: Users should use antivirus, keep OS updated

✗ Phishing Attacks
  └─ User enters password on fake website
  └─ Mitigation: Educate users, use domain verification

✗ Browser Vulnerabilities
  └─ XSS or memory scraping could steal keys in browser memory
  └─ Mitigation: Keep browser updated, use CSP headers

✗ Physical Access to Unlocked Device
  └─ If vault is unlocked and device is stolen, data is accessible
  └─ Mitigation: Auto-lock after inactivity, device encryption

✗ Quantum Computer Attacks (future threat)
  └─ XChaCha20 and Argon2 are vulnerable to quantum attacks
  └─ Mitigation: Monitor post-quantum cryptography standards

✗ Password Recovery
  └─ If user forgets password, data is PERMANENTLY lost
  └─ Mitigation: Encourage password manager usage, backup codes
```

## Threat Model

### Attacker Capabilities

```
┌─────────────────────────────────────────────────────────────┐
│                    THREAT SCENARIOS                         │
└─────────────────────────────────────────────────────────────┘

1. Network Attacker (Passive)
   ├─ Can observe: Encrypted traffic, API calls, S3 uploads
   ├─ Cannot see: Master password, encryption keys, plaintext
   ├─ Defense: TLS encryption, pre-signed URLs expire
   └─ Risk Level: LOW

2. Network Attacker (Active - MITM)
   ├─ Can intercept: Network traffic, modify requests
   ├─ Cannot break: TLS 1.3 encryption, certificate pinning
   ├─ Defense: HTTPS only, certificate validation
   └─ Risk Level: LOW (if TLS properly configured)

3. Cloud Provider (AWS) Compromise
   ├─ Can access: S3 bucket, encrypted blobs, metadata, logs
   ├─ Cannot access: Master password, encryption keys, plaintext
   ├─ Defense: Client-side encryption, zero-knowledge architecture
   └─ Risk Level: LOW (data remains encrypted)

4. Malicious Insider at AWS
   ├─ Can access: Same as cloud provider compromise
   ├─ Cannot decrypt: Vaults without user's master password
   ├─ Defense: Client-side encryption, audit logs
   └─ Risk Level: LOW

5. Stolen Encrypted Vault
   ├─ Can obtain: Encrypted blob from S3 (public breach, backup theft)
   ├─ Must crack: Argon2id password hash (very expensive)
   ├─ Defense: Strong password, Argon2id memory-hard algorithm
   └─ Risk Level: MEDIUM (depends on password strength)

6. Device Compromise (Malware)
   ├─ Can steal: Password during entry, keys from memory
   ├─ Can exfiltrate: Unlocked vault data
   ├─ Defense: Device security, antivirus, auto-lock
   └─ Risk Level: HIGH (requires device security)

7. Phishing Attack
   ├─ Can trick: User into entering password on fake site
   ├─ Can obtain: Master password
   ├─ Defense: User education, domain verification, 2FA
   └─ Risk Level: HIGH (social engineering)

8. Concurrent User Attack
   ├─ Can attempt: Race condition to overwrite vault
   ├─ Cannot succeed: If-Match header prevents lost updates
   ├─ Defense: Optimistic locking, ETag verification
   └─ Risk Level: LOW (prevented by design)
```

### Security Assumptions

```
The system security relies on:

1. Strong Master Password
   └─ At least 8 characters (enforced)
   └─ Recommend 12+ characters with mixed case, numbers, symbols

2. Secure Device
   └─ No malware, keyloggers, or memory scrapers
   └─ OS and browser kept up to date

3. Trusted Client Code
   └─ JavaScript/TypeScript code not tampered
   └─ Use Subresource Integrity (SRI) for CDN resources

4. Correct Implementation
   └─ Crypto primitives used correctly
   └─ No implementation bugs in encryption/decryption

5. TLS Security
   └─ Certificate validation works correctly
   └─ No MITM between client and AWS

6. AWS Security
   └─ S3 access controls work as designed
   └─ Pre-signed URLs only accessible by intended recipient
```

## Related Documentation

- [Cryptographic Implementation](cryptography.md)
- [Best Practices](best-practices.md)
- [Architecture](architecture.md)


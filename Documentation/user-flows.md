# User Flows

## Flow 1: Creating a New Vault

```
┌──────────────────────────────────────────────────────────────┐
│                   USER CREATES NEW VAULT                     │
└──────────────────────────────────────────────────────────────┘

User Action                  System Action
    │
    ├─▶ 1. User enters master password
    │                       │
    │                       ├─▶ VaultManager.create(password)
    │                       │
    │                       ├─▶ Generate random 16-byte salt
    │                       │
    │                       ├─▶ Derive key from password + salt
    │                       │   (Argon2id: ~100-300ms)
    │                       │
    │                       ├─▶ Encrypt empty/initial data
    │                       │   (XChaCha20-Poly1305)
    │                       │
    │                       ├─▶ Build encrypted blob:
    │                       │   VERSION|SALT|NONCE|TAG|CIPHERTEXT
    │                       │
    ├─▶ 2. User clicks "Save"
    │                       │
    │                       ├─▶ Call Lambda API to get pre-signed URLs
    │                       │   POST /vaults/{vaultName}
    │                       │
    │                       ├─▶ Lambda generates:
    │                       │   • Pre-signed PUT URL (12 min expiry)
    │                       │   • Pre-signed GET URL (12 min expiry)
    │                       │
    │                       ├─▶ S3Client.upload(putUrl, encryptedBlob)
    │                       │   • Set Content-Type: application/octet-stream
    │                       │   • Upload encrypted blob
    │                       │
    │                       ├─▶ S3 responds with ETag
    │                       │   (hash of uploaded data)
    │                       │
    │                       ├─▶ Store ETag for future integrity checks
    │                       │
    ├─▶ 3. User sees success message
    │
    ├─▶ 4. Vault remains unlocked in memory
    │       (derivedKey + salt retained)
    │

Timeline:
├─ Key Derivation: ~100-300ms (intentionally slow)
├─ Encryption: <10ms (very fast)
├─ Network Upload: Depends on vault size + connection
└─ Total: Usually 200-500ms for small vaults
```

## Flow 2: Unlocking Existing Vault

```
┌──────────────────────────────────────────────────────────────┐
│                   USER UNLOCKS VAULT                         │
└──────────────────────────────────────────────────────────────┘

User Action                  System Action
    │
    ├─▶ 1. User selects vault from list
    │                       │
    │                       ├─▶ GET /vaults (list all vaults)
    │                       │
    │                       ├─▶ Display vault names to user
    │                       │
    ├─▶ 2. User enters master password
    │                       │
    │                       ├─▶ POST /vaults/{vaultName}
    │                       │   Get pre-signed GET URL + current ETag
    │                       │
    │                       ├─▶ S3Client.download(getUrl)
    │                       │   • Fetch encrypted blob from S3
    │                       │   • Verify ETag matches (tamper detection)
    │                       │
    │                       ├─▶ Extract salt from encrypted blob
    │                       │   (bytes 1-16 of encrypted data)
    │                       │
    │                       ├─▶ Derive key from password + extracted salt
    │                       │   (Argon2id: ~100-300ms)
    │                       │
    │                       ├─▶ Attempt decryption
    │                       │   (XChaCha20-Poly1305)
    │                       │
    │                       ├─▶ If decryption succeeds:
    │                       │   • Password was correct
    │                       │   • Store key + salt in memory
    │                       │   • Mark vault as "unlocked"
    │                       │   • Return plaintext vault data
    │                       │
    │                       └─▶ If decryption fails:
    │                           • Wrong password OR
    │                           • Data corruption/tampering
    │                           • Clear any derived keys
    │                           • Show error to user
    │
    ├─▶ 3. User sees decrypted vault contents
    │       (passwords, notes, etc.)
    │

Security Notes:
├─ ETag verification detects if vault was modified
├─ Poly1305 MAC verification detects tampering
├─ Wrong password causes decryption failure
└─ No information leak about which check failed
```

## Flow 3: Saving Changes to Vault

```
┌──────────────────────────────────────────────────────────────┐
│              USER MODIFIES AND SAVES VAULT                   │
└──────────────────────────────────────────────────────────────┘

User Action                  System Action
    │
    ├─▶ 1. User modifies vault data
    │       (add/edit/delete passwords)
    │                       │
    ├─▶ 2. User clicks "Save"
    │                       │
    │                       ├─▶ Serialize vault data to JSON
    │                       │
    │                       ├─▶ VaultManager.update(plaintextData)
    │                       │   (fast path - reuses existing key)
    │                       │
    │                       ├─▶ Encrypt with existing key + salt
    │                       │   (no re-derivation needed!)
    │                       │
    │                       ├─▶ POST /vaults/{vaultName}
    │                       │   Get new pre-signed PUT URL
    │                       │
    │                       ├─▶ S3Client.upload(putUrl, encrypted, {
    │                       │     ifMatch: currentETag  // <-- Optimistic lock
    │                       │   })
    │                       │
    │                       ├─▶ S3 checks If-Match header:
    │                       │   
    │                       │   If ETag matches:
    │                       │   ├─▶ Accept upload
    │                       │   ├─▶ Return new ETag
    │                       │   └─▶ Success!
    │                       │
    │                       │   If ETag doesn't match:
    │                       │   ├─▶ 412 Precondition Failed
    │                       │   ├─▶ Another user modified vault
    │                       │   └─▶ Must resolve conflict
    │                       │
    ├─▶ 3. User sees success or conflict message
    │

Performance Optimization:
├─ No password re-entry needed
├─ No key re-derivation (saves ~100-300ms)
├─ Only encryption + network time
└─ Typical save: 10-100ms + upload time

Concurrency Protection:
├─ If-Match header prevents lost updates
├─ User A and User B both edit vault
├─ First save succeeds, second gets 412 error
└─ UI can show conflict resolution dialog
```

## Flow 4: Changing Master Password

```
┌──────────────────────────────────────────────────────────────┐
│              USER CHANGES MASTER PASSWORD                    │
└──────────────────────────────────────────────────────────────┘

User Action                  System Action
    │
    ├─▶ 1. User enters current password
    │                       │
    │                       ├─▶ Download and decrypt vault
    │                       │   (verify current password is correct)
    │                       │
    ├─▶ 2. User enters new password
    │       (with confirmation)
    │                       │
    │                       ├─▶ Validate new password:
    │                       │   • Minimum 8 characters
    │                       │   • Different from old password
    │                       │
    │                       ├─▶ VaultManager.changePassword(
    │                       │     encryptedVault,
    │                       │     currentPassword,
    │                       │     newPassword
    │                       │   )
    │                       │
    │                       ├─▶ Decrypt with current password
    │                       │   (get plaintext vault data)
    │                       │
    │                       ├─▶ Generate NEW random salt
    │                       │   (salt must change with password!)
    │                       │
    │                       ├─▶ Derive NEW key from new password + new salt
    │                       │   (Argon2id: ~100-300ms)
    │                       │
    │                       ├─▶ Re-encrypt vault with new key + new salt
    │                       │
    │                       ├─▶ Upload re-encrypted vault to S3
    │                       │
    ├─▶ 3. User sees success
    │       Old password no longer works
    │

Critical Security Points:
├─ New salt generated (prevents key reuse)
├─ Old encrypted versions remain in S3 versions
├─ Consider deleting old versions after password change
└─ User must remember new password (no recovery!)
```

## Flow 5: Locking Vault

```
┌──────────────────────────────────────────────────────────────┐
│                   USER LOCKS VAULT                           │
└──────────────────────────────────────────────────────────────┘

User Action                  System Action
    │
    ├─▶ 1. User clicks "Lock" or closes app
    │                       │
    │                       ├─▶ VaultManager.lock()
    │                       │
    │                       ├─▶ Zero out derived key in memory:
    │                       │   derivedKey.fill(0)
    │                       │
    │                       ├─▶ Zero out salt in memory:
    │                       │   salt.fill(0)
    │                       │
    │                       ├─▶ Set references to null:
    │                       │   derivedKey = null
    │                       │   salt = null
    │                       │
    │                       ├─▶ Mark vault as locked:
    │                       │   isLocked = true
    │                       │
    │                       ├─▶ Clear any plaintext vault data
    │                       │   from UI/memory
    │                       │
    ├─▶ 2. Vault is locked
    │       Password required to unlock again
    │

Note: JavaScript doesn't guarantee secure memory wiping
├─ We zero arrays before dereferencing
├─ Garbage collector will eventually reclaim memory
├─ For maximum security, use session timeouts
└─ Consider auto-lock after inactivity
```

## Related Documentation

- [API Reference](api-reference.md)
- [Performance Characteristics](performance.md)
- [Security Model](security.md)


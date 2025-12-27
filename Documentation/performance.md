# Performance Characteristics

## Operation Timings

```
┌─────────────────────────────────────────────────────────────┐
│                    OPERATION TIMINGS                        │
└─────────────────────────────────────────────────────────────┘

Key Derivation (Argon2id)
├─ Time: 100-300ms (intentionally slow)
├─ Memory: 64MB RAM
├─ CPU: Single-threaded
└─ Note: Same time for correct AND incorrect passwords

Encryption (XChaCha20-Poly1305)
├─ Speed: ~3-4 GB/s
├─ Time: <1ms for typical vault (10-100KB)
├─ Memory: Minimal
└─ CPU: Very efficient

Decryption (XChaCha20-Poly1305)
├─ Speed: ~3-4 GB/s
├─ Time: <1ms for typical vault
├─ Memory: Minimal
└─ CPU: Very efficient

S3 Upload
├─ Time: Depends on vault size + network speed
├─ Typical: 50-200ms for 10-100KB vault
├─ Max size: 5GB (pre-signed URL limit)
└─ Retry: 3 attempts with exponential backoff

S3 Download
├─ Time: Depends on vault size + network speed
├─ Typical: 50-200ms for 10-100KB vault
├─ Verification: ETag check adds <1ms
└─ Retry: 3 attempts with exponential backoff

Total Operation Times:
├─ Create New Vault: 200-500ms
├─ Unlock Vault: 250-600ms (includes download)
├─ Save Changes (unlocked): 50-200ms (no re-derivation!)
├─ Change Password: 300-700ms (two key derivations)
└─ Lock Vault: <1ms (instant)
```

## Performance Optimizations

1. **Key Caching**: Once unlocked, keys are cached in memory to avoid re-derivation
2. **Fast Update Path**: `update()` method reuses existing keys, skipping expensive key derivation
3. **Parallel URL Generation**: GET and PUT URLs generated in parallel
4. **Efficient Encryption**: XChaCha20-Poly1305 is optimized for software implementation
5. **Retry Logic**: Exponential backoff prevents unnecessary retries

## Bottlenecks

1. **Key Derivation**: Argon2id is intentionally slow (100-300ms) for security
2. **Network Latency**: S3 upload/download depends on connection speed
3. **Browser Performance**: Older browsers may be slower with cryptographic operations

## Scalability Considerations

- **Vault Size**: System supports vaults up to 5GB (S3 pre-signed URL limit)
- **Concurrent Users**: API Gateway handles 100 req/s with 200 burst capacity
- **Lambda Concurrency**: Reserved concurrency prevents runaway costs
- **S3 Storage**: Virtually unlimited storage capacity

## Related Documentation

- [User Flows](user-flows.md)
- [Cryptographic Implementation](cryptography.md)
- [API Reference](api-reference.md)


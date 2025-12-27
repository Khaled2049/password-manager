# Deployment Architecture

## AWS Infrastructure

```
┌─────────────────────────────────────────────────────────────┐
│                        AWS Region                           │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │              API Gateway (REST API)                │    │
│  │                                                    │    │
│  │  Endpoints:                                       │    │
│  │  • GET  /vaults          (list vaults)           │    │
│  │  • POST /vaults/{key}    (get URLs)              │    │
│  │                                                    │    │
│  │  Security:                                        │    │
│  │  • CORS configured                                │    │
│  │  • Rate limiting: 100 req/s                       │    │
│  │  • Throttling: 200 burst                          │    │
│  │  • X-Ray tracing enabled                          │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                   │
│                         │ Lambda Integration                │
│                         │                                   │
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │         Lambda Function (Node.js 20)              │    │
│  │                                                    │    │
│  │  Handler: vault-api.handler                       │    │
│  │  Memory: 512 MB                                   │    │
│  │  Timeout: 30 seconds                              │    │
│  │  Concurrency: 100 max                             │    │
│  │                                                    │    │
│  │  Responsibilities:                                │    │
│  │  • Generate pre-signed URLs (GetObject/PutObject) │    │
│  │  • List vault objects (with vaults/* prefix)      │    │
│  │  • Extract current ETag for concurrency control   │    │
│  │                                                    │    │
│  │  Environment Variables:                           │    │
│  │  • BUCKET_NAME: vault-storage-bucket              │    │
│  │  • AWS_REGION: us-east-1                          │    │
│  │                                                    │    │
│  │  IAM Permissions (least privilege):               │    │
│  │  • s3:GetObject     on vaults/*                   │    │
│  │  • s3:PutObject     on vaults/*                   │    │
│  │  • s3:HeadObject    on vaults/*                   │    │
│  │  • s3:ListBucket    with prefix filter            │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                   │
│                         │ S3 API calls                      │
│                         │                                   │
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │              S3 Bucket (Vault Storage)            │    │
│  │                                                    │    │
│  │  Configuration:                                   │    │
│  │  • Versioning: Enabled                            │    │
│  │  • Encryption: S3-managed (SSE-S3)                │    │
│  │  • SSL: Enforced (reject non-HTTPS)               │    │
│  │  • Public Access: Blocked (all)                   │    │
│  │  • Object Ownership: Bucket owner enforced        │    │
│  │                                                    │    │
│  │  Lifecycle Rules:                                 │    │
│  │  • Delete old versions after 90 days              │    │
│  │  • Abort incomplete uploads after 7 days          │    │
│  │                                                    │    │
│  │  CORS Configuration:                              │    │
│  │  • Allowed Origins: Configured domains            │    │
│  │  • Allowed Methods: GET, PUT, HEAD                │    │
│  │  • Allowed Headers: Content-Type, Content-Length  │    │
│  │  • Exposed Headers: ETag, x-amz-version-id        │    │
│  │                                                    │    │
│  │  Object Structure:                                │    │
│  │  vaults/                                          │    │
│  │    ├─ user1-vault.dat (encrypted blob)            │    │
│  │    ├─ user2-vault.dat (encrypted blob)            │    │
│  │    └─ shared-vault.dat (encrypted blob)           │    │
│  │                                                    │    │
│  │  Each object:                                     │    │
│  │  • Has unique ETag (MD5 hash)                     │    │
│  │  • Has version ID                                 │    │
│  │  • Is encrypted at rest (S3-managed)              │    │
│  │  • Is encrypted in transit (TLS)                  │    │
│  │  • Is encrypted by client (double encryption!)    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │         CloudWatch Logs & Metrics                 │    │
│  │                                                    │    │
│  │  Lambda Logs:                                     │    │
│  │  • Retention: 30 days                             │    │
│  │  • Contains: Errors, warnings, info               │    │
│  │  • Does NOT contain: Vault data, passwords        │    │
│  │                                                    │    │
│  │  API Gateway Logs:                                │    │
│  │  • Execution logs (errors only)                   │    │
│  │  • Access logs disabled (no sensitive data)       │    │
│  │                                                    │    │
│  │  Metrics:                                         │    │
│  │  • Lambda invocations, duration, errors           │    │
│  │  • API Gateway requests, latency, errors          │    │
│  │  • S3 request counts, bytes transferred           │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## CDK Stack Resources

```typescript
VaultBucket (S3)
├─ Versioned: true
├─ Encryption: S3_MANAGED
├─ SSL Enforced: true
├─ Public Access: BLOCK_ALL
├─ Removal Policy: RETAIN (data preserved on stack delete)
└─ CORS: Configured for client access

VaultApiLambda (Lambda)
├─ Runtime: Node.js 20
├─ Handler: vault-api.handler
├─ Memory: 512 MB
├─ Timeout: 30 seconds
├─ Reserved Concurrency: 100
├─ Tracing: X-Ray enabled
├─ Log Retention: 30 days
└─ Environment: BUCKET_NAME, AWS_REGION

VaultApi (API Gateway)
├─ Type: REST API
├─ Stage: prod
├─ CORS: Pre-configured
├─ Throttling: 100 req/s, 200 burst
├─ Logging: Errors only
└─ Tracing: Enabled

IAM Policies (Least Privilege)
├─ Lambda Execution Role
│   ├─ CloudWatch Logs: Write access
│   ├─ X-Ray: Write traces
│   └─ S3: Read/Write vaults/* only
└─ API Gateway CloudWatch Role
    └─ CloudWatch Logs: Write access
```

## Deployment Steps

1. **Prerequisites**
   - AWS Account with appropriate permissions
   - AWS CLI configured
   - Node.js 18+ and Yarn installed
   - CDK CLI installed

2. **Build the Project**
   ```bash
   yarn install
   yarn build
   ```

3. **Deploy CDK Stack**
   ```bash
   cd cdk
   cdk deploy --profile your-profile-name
   ```

4. **Configure Frontend**
   - Get API URL from stack outputs
   - Set `VITE_API_URL` in frontend `.env` file

5. **Verify Deployment**
   - Check CloudWatch logs for Lambda function
   - Test API endpoints
   - Verify S3 bucket is created and configured

## Related Documentation

- [Architecture](architecture.md)
- [Security](security.md)
- [API Reference](api-reference.md)


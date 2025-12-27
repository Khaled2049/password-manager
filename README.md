# Password Manager - Documentation

Howdy! This is a **client-side encrypted password manager** where all cryptographic operations happen in the browser. The server (AWS S3 + Lambda) only stores encrypted blobs and never has access to encryption keys or plaintext data.

## Key Principles

- **Zero-knowledge architecture**: Server cannot decrypt vault data
- **End-to-end encryption**: Data encrypted on client, decrypted on client
- **Tamper detection**: ETags verify data integrity
- **Modern cryptography**: Argon2id + XChaCha20-Poly1305
- **Optimistic concurrency**: Prevent data loss from concurrent edits

## Documentation Index

1. [Architecture](Documentation/architecture.md) - System architecture and component layers
2. [Security](Documentation/security.md) - Security model, guarantees, and threat analysis
3. [Cryptography](Documentation/cryptography.md) - Cryptographic implementation details
4. [User Flows](Documentation/user-flows.md) - Step-by-step user operation flows
5. [API Reference](Documentation/api-reference.md) - Complete API documentation
6. [Deployment](Documentation/deployment.md) - AWS infrastructure and deployment guide
7. [Performance](Documentation/performance.md) - Performance characteristics and timings
8. [Best Practices](Documentation/best-practices.md) - User security recommendations
9. [Quick Start](Documentation/quick-start.md) - Code examples to get started

## Quick Links

- **New to the system?** Start with [Quick Start](Documentation/quick-start.md)
- **Want to understand security?** Read [Security](Documentation/security.md)
- **Deploying?** Check [Deployment](Documentation/deployment.md)
- **Building features?** See [API Reference](Documentation/api-reference.md)

---

**Remember: If you forget your master password, your data is permanently lost. This is a feature, not a bug.**

**Built with ❤️ and 🔐 for maximum security**


# Quick Start

## Basic Usage Example

```typescript
import { VaultManager } from '@password-manager/core';
import { S3Client } from '@password-manager/core';

// Initialize managers
const vaultManager = new VaultManager();
const s3Client = new S3Client();

// 1. CREATE NEW VAULT
const masterPassword = 'MySecurePassword123!';
const vaultData = { passwords: [], notes: [] };
const plaintext = new TextEncoder().encode(JSON.stringify(vaultData));

const encrypted = await vaultManager.create(masterPassword, plaintext);

// 2. UPLOAD TO S3
const { putUrl } = await fetch('/api/vaults/my-vault', {
  method: 'POST'
}).then(r => r.json());

const etag = await s3Client.upload(putUrl, encrypted);
console.log('Vault created with ETag:', etag);

// 3. UNLOCK VAULT LATER
const { getUrl } = await fetch('/api/vaults/my-vault', {
  method: 'POST'
}).then(r => r.json());

const { data, etag: currentEtag } = await s3Client.download(getUrl);
const decrypted = await vaultManager.unlock(data, masterPassword);
const vault = JSON.parse(new TextDecoder().decode(decrypted));

console.log('Unlocked vault:', vault);

// 4. MODIFY AND SAVE
vault.passwords.push({ site: 'github.com', username: 'user', password: 'pass' });
const updated = new TextEncoder().encode(JSON.stringify(vault));
const reencrypted = await vaultManager.update(updated);

const { putUrl: newPutUrl } = await fetch('/api/vaults/my-vault', {
  method: 'POST'
}).then(r => r.json());

const newEtag = await s3Client.upload(newPutUrl, reencrypted, {
  ifMatch: currentEtag  // Optimistic locking!
});

// 5. LOCK WHEN DONE
vaultManager.lock();
```

## Frontend Integration

```typescript
import { useVault } from './hooks/useVault';

function MyComponent() {
  const { vault, unlock, lock, createVault, addEntry } = useVault();

  // Create new vault
  const handleCreate = async () => {
    await createVault('MyPassword123!', 'my-vault-name');
  };

  // Unlock existing vault
  const handleUnlock = async () => {
    await unlock('MyPassword123!', 'vaults/my-vault-name.dat');
  };

  // Add password entry
  const handleAddEntry = async () => {
    await addEntry({
      title: 'GitHub',
      username: 'user@example.com',
      password: 'secure-password',
      url: 'https://github.com'
    });
  };

  return (
    <div>
      {vault ? (
        <div>
          <h2>Vault Unlocked</h2>
          <button onClick={lock}>Lock</button>
          <button onClick={handleAddEntry}>Add Entry</button>
        </div>
      ) : (
        <div>
          <button onClick={handleCreate}>Create Vault</button>
          <button onClick={handleUnlock}>Unlock Vault</button>
        </div>
      )}
    </div>
  );
}
```

## Next Steps

1. Read [Architecture](architecture.md) to understand the system design
2. Review [Security](security.md) to understand security guarantees
3. Check [API Reference](api-reference.md) for detailed API documentation
4. See [User Flows](user-flows.md) for step-by-step operation flows

## Related Documentation

- [API Reference](api-reference.md)
- [User Flows](user-flows.md)
- [Architecture](architecture.md)


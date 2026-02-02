# Password Manager Vault Decryption Examples

This directory contains examples showing how to decrypt password manager vaults locally without using the web frontend.

## Overview

Your password vault is encrypted client-side and stored in S3 as `vault.dat`. With your master password, you can decrypt it anywhere using these examples.

## Prerequisites

- Node.js 20 or higher
- Your `vault.dat` file downloaded from S3
- Your master password

## Quick Start

### 1. Download Your Vault from S3

```bash
# Get your bucket name
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name password-manager-backend-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text)

# Download the vault
aws s3 cp "s3://${BUCKET_NAME}/vaults/vault.dat" ./vault.dat
```

### 2. Install Dependencies

```bash
cd examples
./setup.sh
```

This setup script will:
1. Build the `@password-manager/core` library
2. Install all required dependencies
3. Verify the installation

**Manual installation:**
```bash
# First, build the core library
cd ../core
npm install
npm run build

# Then, install examples dependencies
cd ../examples
npm install
```

### 3. Decrypt Your Vault

**Using JavaScript (easiest):**
```bash
node decrypt-vault.js ./vault.dat "your-master-password"
```

**Using TypeScript:**
```bash
npm run decrypt:ts ./vault.dat "your-master-password"
```

## Usage Examples

### Basic Decryption

Decrypt and display the vault contents to stdout:

```bash
node decrypt-vault.js ./vault.dat "my-master-password"
```

### Save Decrypted Vault to File

Save the decrypted JSON to a file:

```bash
node decrypt-vault.js ./vault.dat "my-master-password" --output decrypted-vault.json
```

### Pretty-Print JSON

Display formatted JSON for easier reading:

```bash
node decrypt-vault.js ./vault.dat "my-master-password" --pretty
```

### Combined Options

Save to file with pretty formatting:

```bash
node decrypt-vault.js ./vault.dat "my-master-password" --output vault.json --pretty
```

## Output Format

The decrypted vault contains JSON data structured like this:

```json
{
  "passwords": [
    {
      "id": "uuid-here",
      "website": "example.com",
      "username": "user@example.com",
      "password": "secret-password",
      "notes": "Optional notes",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## Example Output

```
🔓 Decrypting vault...

📁 Reading vault file: ./vault.dat
   File size: 245 bytes

🧂 Extracting salt...
   Salt: a1b2c3d4e5f6g7h8...

🔑 Deriving encryption key from master password...
   (This may take a few seconds - Argon2id is intentionally slow)
   ✓ Key derived in 187ms

🔓 Decrypting vault data...
   ✓ Decrypted 156 bytes

✅ Vault decrypted successfully!

📊 Vault contains 3 password(s)

Passwords:
  1. github.com
     Username: john@example.com
     Password: ****************
  2. example.com
     Username: user@example.com
     Password: ************
  3. gmail.com
     Username: myemail@gmail.com
     Password: ****************

📄 Decrypted vault (JSON):
──────────────────────────────────────────────────
{"passwords":[...]}
```

## Security Notes

### ⚠️ Important Security Warnings

1. **Never commit decrypted vaults to git**
   - Add `*.json` to your `.gitignore`
   - Delete decrypted files after use

2. **Protect your master password**
   - Never hardcode it in scripts
   - Use environment variables if automating
   - Consider using a password manager wrapper script

3. **Secure file permissions**
   ```bash
   # Make decrypted vault readable only by you
   chmod 600 decrypted-vault.json
   ```

4. **Clean up after use**
   ```bash
   # Securely delete decrypted files
   shred -u decrypted-vault.json  # Linux
   rm -P decrypted-vault.json     # macOS
   ```

## How It Works

The decryption process:

1. **Read encrypted vault** - Binary `.dat` file from S3
2. **Extract salt** - First 16 bytes after version byte
3. **Derive key** - Argon2id key derivation from master password + salt
4. **Decrypt data** - XChaCha20-Poly1305 authenticated decryption
5. **Parse JSON** - Convert decrypted bytes to JSON

The vault format:
```
[1 byte: version | 16 bytes: salt | 24 bytes: nonce | 16 bytes: tag | N bytes: ciphertext]
```

## Advanced Usage

### Programmatic Decryption

You can also use the core library directly in your own scripts:

```javascript
import { deriveKey, decrypt, extractSalt } from '@password-manager/core';
import { readFileSync } from 'fs';

const encryptedVault = readFileSync('./vault.dat');
const masterPassword = 'your-password';

const salt = extractSalt(encryptedVault);
const key = await deriveKey(masterPassword, salt);
const decryptedData = decrypt(encryptedVault, key);

const vault = JSON.parse(new TextDecoder().decode(decryptedData));
console.log('Your passwords:', vault.passwords);
```

### Environment Variables

For automation, use environment variables instead of command-line arguments:

```bash
export MASTER_PASSWORD="your-password"
node decrypt-vault.js ./vault.dat "$MASTER_PASSWORD"
```

### Create a Wrapper Script

Create `decrypt.sh` for convenience:

```bash
#!/bin/bash
VAULT_FILE="${1:-vault.dat}"
read -sp "Master password: " PASSWORD
echo
node decrypt-vault.js "$VAULT_FILE" "$PASSWORD" --pretty
```

Make it executable:
```bash
chmod +x decrypt.sh
./decrypt.sh
```

## Troubleshooting

### "Decryption failed: invalid key or corrupted data"

**Causes:**
- Wrong master password
- Corrupted vault file
- Wrong file (not a vault.dat)

**Solution:**
- Double-check your master password
- Re-download the vault from S3
- Verify file size is > 57 bytes

### "Cannot find module '@password-manager/core'" or "Command 'build' not found"

**Cause:** The core library needs to be built before the examples can use it.

**Solution:**
```bash
# Use the setup script (recommended)
cd examples
./setup.sh

# OR manually:
cd ../core
npm install
npm run build
cd ../examples
npm install
```

### "ENOENT: no such file or directory"

**Solution:**
- Check vault file path is correct
- Make sure you downloaded vault.dat from S3

## Use Cases

1. **Backup Verification** - Verify your S3 backups are valid
2. **Migration** - Export passwords to another password manager
3. **CLI Access** - Quick password lookup from terminal
4. **Automation** - Script password rotations or audits
5. **Offline Access** - Access passwords without internet

## Additional Scripts

You can create your own scripts using the same pattern:

- `search-passwords.js` - Search for specific passwords
- `export-csv.js` - Export to CSV format
- `password-audit.js` - Check for weak/duplicate passwords
- `change-master-password.js` - Re-encrypt with new password

## License

Same as the password-manager project.

## Support

For issues or questions:
- Check the main project README
- Review the crypto implementation in `../core/src/crypto.ts`
- Ensure your vault file is valid (downloaded correctly from S3)

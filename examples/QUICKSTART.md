# Quick Start: Decrypt Your Vault

Follow these steps to decrypt your password vault locally.

## Step 1: Install Dependencies

```bash
cd examples
./setup.sh
```

This will:
- Build the `@password-manager/core` library
- Install all dependencies
- Verify the setup

**Alternative (manual):**
```bash
# Build core library first
cd ../core
npm install
npm run build

# Then install examples dependencies
cd ../examples
npm install
```

## Step 2: Download Your Vault from S3

**Option A: Using the helper script (easiest)**

```bash
./download-vault.sh
```

This will:
- Look up your S3 bucket automatically
- Show you available vaults
- Download the vault you select

**Option B: Manual download with AWS CLI**

```bash
# Get bucket name
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name password-manager-backend-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text)

# Download vault
aws s3 cp "s3://${BUCKET_NAME}/vaults/vault.dat" ./vault.dat
```

**Option C: Using AWS Console**

1. Go to AWS Console → S3
2. Find bucket starting with `password-manager-vault-prod-`
3. Navigate to `vaults/` folder
4. Download `vault.dat`

## Step 3: Decrypt the Vault

```bash
node decrypt-vault.js ./vault.dat "your-master-password"
```

Replace `"your-master-password"` with your actual master password.

## Example Session

```bash
$ cd examples
$ npm install
# ... installation output ...

$ ./download-vault.sh
Password Manager - Download Vault from S3
===========================================

Looking up S3 bucket from CloudFormation...
Found bucket: password-manager-vault-prod-123456789012

Available vaults in S3:
  - vault.dat

Enter vault filename (default: vault.dat):
Downloading vault...
Vault downloaded successfully!

File: ./vault.dat
Size: 245 bytes

To decrypt, run:
   node decrypt-vault.js ./vault.dat "your-master-password"

$ node decrypt-vault.js ./vault.dat "my-secret-password"
Decrypting vault...

Reading vault file: ./vault.dat
   File size: 245 bytes

Extracting salt...
   Salt: a1b2c3d4e5f6g7h8...

Deriving encryption key from master password...
   (This may take a few seconds - Argon2id is intentionally slow)
   Key derived in 187ms

Decrypting vault data...
   Decrypted 156 bytes

Vault decrypted successfully!

Vault contains 3 password(s)

Passwords:
  1. github.com
     Username: john@example.com
     Password: ****************
  2. example.com
     Username: user@example.com
     Password: ************

Decrypted vault (JSON):
--------------------------------------------------
{"passwords":[{"id":"...","website":"github.com","username":"john@example.com","password":"..."},...]}
```

## Save to File (Recommended)

Instead of printing to stdout, save to a file:

```bash
node decrypt-vault.js ./vault.dat "your-master-password" --output passwords.json --pretty
```

Then view the file:
```bash
cat passwords.json
```

**Remember to delete the file when done:**
```bash
shred -u passwords.json  # Linux
rm -P passwords.json     # macOS
```

## Common Options

```bash
# Pretty print to stdout
node decrypt-vault.js ./vault.dat "password" --pretty

# Save to file
node decrypt-vault.js ./vault.dat "password" --output vault.json

# Save with pretty formatting
node decrypt-vault.js ./vault.dat "password" --output vault.json --pretty
```

## Troubleshooting

**"Decryption failed"**
- Double check your master password
- Make sure you downloaded the correct vault file

**"Cannot find module"**
- Run `npm install` in the examples directory
- Make sure the core library is built: `cd ../core && npm run build`

**"File not found"**
- Check that vault.dat was downloaded successfully
- Verify the file path is correct

## What's Next?

- See `README.md` for more detailed documentation
- Check out the TypeScript version: `decrypt-vault.ts`
- Create custom scripts for your use cases

## Security Reminder

- **Never commit decrypted vaults to git**
- **Delete decrypted files after use**
- **Keep your master password secure**

```bash
# Add to your .gitignore (already done)
*.json
vault.dat
decrypted-*
```

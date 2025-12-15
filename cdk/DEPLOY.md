# CDK Deployment Guide

## AWS SSO Setup

If you're using AWS SSO (Single Sign-On), follow these steps:

### 1. Find Your SSO Profile Name

**Windows:**
```powershell
# PowerShell
Get-Content C:\Users\$env:USERNAME\.aws\config

# Or open in Notepad
notepad C:\Users\$env:USERNAME\.aws\config
```

**macOS/Linux:**
```bash
cat ~/.aws/config
```

Look for a profile section like:
```
[profile your-profile-name]
sso_start_url = https://your-org.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = YourRoleName
region = us-east-1
```

Note the profile name (the part in brackets after `[profile ...]`).

### 2. Login to AWS SSO

```bash
aws sso login --profile your-profile-name
```

Or if it's your default profile:
```bash
aws sso login
```

### 3. Set Environment Variables

**Windows (PowerShell):**
```powershell
$env:AWS_PROFILE = "your-profile-name"
$env:AWS_REGION = "us-east-1"
```

**Windows (CMD):**
```cmd
set AWS_PROFILE=your-profile-name
set AWS_REGION=us-east-1
```

**macOS/Linux:**
```bash
export AWS_PROFILE=your-profile-name
export AWS_REGION=us-east-1
```

### 4. Verify Credentials

```bash
aws sts get-caller-identity
```

You should see your account ID, user ARN, and user ID.

### 5. Deploy CDK Stack

**Windows (PowerShell):**
```powershell
cd cdk

# Option 1: Using environment variable
$env:AWS_PROFILE = "your-profile-name"
yarn deploy

# Option 2: Using CDK profile flag
cdk deploy --profile your-profile-name

# Option 3: Using CDK with explicit account/region
cdk deploy --profile your-profile-name `
  --context account=123456789012 `
  --context region=us-east-1
```

**macOS/Linux:**
```bash
cd cdk

# Option 1: Using environment variable
export AWS_PROFILE=your-profile-name
yarn deploy

# Option 2: Using CDK profile flag
cdk deploy --profile your-profile-name

# Option 3: Using CDK with explicit account/region
cdk deploy --profile your-profile-name \
  --context account=123456789012 \
  --context region=us-east-1
```

## Troubleshooting SSO Issues

### Error: "The security token included in the request is invalid"

**Causes:**
- SSO session has expired
- `AWS_PROFILE` is not set correctly
- Wrong profile name

**Solutions:**

1. **Check if SSO session is valid:**
   ```bash
   aws sts get-caller-identity --profile your-profile-name
   ```
   If this fails, your session has expired.

2. **Re-login to SSO:**
   ```bash
   aws sso login --profile your-profile-name
   ```

3. **Verify profile name:**
   ```bash
   # List all profiles
   aws configure list-profiles
   
   # Check specific profile
   aws configure list --profile your-profile-name
   ```

4. **Set profile explicitly:**
   - **Windows PowerShell**: `$env:AWS_PROFILE = "your-profile-name"`
   - **Windows CMD**: `set AWS_PROFILE=your-profile-name`
   - **macOS/Linux**: `export AWS_PROFILE=your-profile-name`
   
   Then verify: `aws sts get-caller-identity` (should work now)

5. **Use profile flag with CDK:**
   ```bash
   cdk deploy --profile your-profile-name
   ```

### Error: "Profile not found"

Make sure the profile name matches exactly what's in your AWS config file:
- **Windows**: `C:\Users\YourUsername\.aws\config`
- **macOS/Linux**: `~/.aws/config`

Profile names are case-sensitive.

### SSO Session Expires

SSO sessions typically expire after 8-12 hours. If you get authentication errors:

```bash
# Re-login
aws sso login --profile your-profile-name

# Verify
aws sts get-caller-identity --profile your-profile-name
```

## Alternative: Using Access Keys

If you prefer not to use SSO, you can use access keys:

**Windows (PowerShell):**
```powershell
# Configure AWS CLI
aws configure

# Or set environment variables
$env:AWS_ACCESS_KEY_ID = "your-access-key-id"
$env:AWS_SECRET_ACCESS_KEY = "your-secret-access-key"
$env:AWS_REGION = "us-east-1"

# Remove profile if it was set
Remove-Item Env:\AWS_PROFILE

# Deploy
cd cdk
yarn deploy
```

**macOS/Linux:**
```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID=your-access-key-id
export AWS_SECRET_ACCESS_KEY=your-secret-access-key
export AWS_REGION=us-east-1

# Unset profile if it was set
unset AWS_PROFILE

# Deploy
cd cdk
yarn deploy
```

## CDK Bootstrap with SSO

If bootstrapping fails with SSO:

**Windows (PowerShell):**
```powershell
# Ensure you're logged in
aws sso login --profile your-profile-name

# Set profile
$env:AWS_PROFILE = "your-profile-name"

# Bootstrap with profile
cdk bootstrap --profile your-profile-name

# Or let CDK use the environment variable
cdk bootstrap
```

**macOS/Linux:**
```bash
# Ensure you're logged in
aws sso login --profile your-profile-name

# Set profile
export AWS_PROFILE=your-profile-name

# Bootstrap with profile
cdk bootstrap --profile your-profile-name

# Or let CDK use the environment variable
cdk bootstrap
```

## Verifying Deployment

After successful deployment:

```bash
# Check stack outputs
aws cloudformation describe-stacks \
  --stack-name PasswordManagerStack \
  --profile your-profile-name \
  --query 'Stacks[0].Outputs'

# Verify S3 bucket exists
aws s3 ls --profile your-profile-name | grep passwordmanager
```


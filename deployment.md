# Deployment Guide

This guide walks through deploying the password manager from scratch. There are two repositories:

- **`password-manager`** (this repo) — CDK infrastructure, Lambda API, and the `@password-manager/core` encryption library
- **`password-manager-frontend`** — React/Vite frontend, deployed to GitHub Pages

## Prerequisites

- Node.js 20+
- Yarn 1.x (`npm install -g yarn`)
- AWS CLI v2, configured with credentials that can deploy CloudFormation
- An AWS account with CDK bootstrapped in `us-east-1`
- A GitHub account (for GitHub Pages hosting and Actions CI/CD)

### Bootstrap CDK (one-time)

If you haven't used CDK in this AWS account/region before:

```bash
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

---

## 1. Clone both repositories

```bash
git clone git@github.com:Khaled2049/password-manager.git
git clone git@github.com:Khaled2049/password-manager-frontend.git
```

They must be sibling directories — the frontend resolves the core library via `../password-manager/core/dist/index.js`.

```
parent-directory/
  password-manager/
  password-manager-frontend/
```

---

## 2. Deploy the backend

```bash
cd password-manager
yarn install
```

### Deploy the backend stack

This creates an S3 vault bucket, a Lambda function, and an API Gateway:

```bash
yarn deploy:app
```

Note the outputs — you'll need `ApiUrl` later:

```
Outputs:
password-manager-backend-prod.ApiUrl = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/
password-manager-backend-prod.BucketName = password-manager-vault-prod-<ACCOUNT_ID>
```

### Deploy the GitHub OIDC stack (for CI/CD)

This creates an IAM role that GitHub Actions can assume to deploy the backend automatically:

```bash
yarn deploy:oidc
```

Note the `RoleArn` output — you'll add it as a GitHub secret.

### Set GitHub secrets on the backend repo

Go to **Settings > Secrets and variables > Actions** on the `password-manager` GitHub repo and add:

| Secret | Value |
|--------|-------|
| `AWS_ROLE_ARN` | The `RoleArn` from the OIDC stack output |

After this, any push to `main` on the backend repo will auto-deploy the backend stack.

---

## 3. Run the frontend locally

```bash
cd password-manager-frontend
yarn install
```

### Option A: With mock API (no AWS needed)

Create a `.env` file:

```env
VITE_USE_MOCK_API=true
```

```bash
yarn dev
```

Vault data is persisted locally in `.mock-data/vaults.json`.

### Option B: Against the real API

Create a `.env` file using the `ApiUrl` from step 2:

```env
VITE_USE_MOCK_API=false
VITE_API_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod
```

```bash
yarn dev
```

The app runs at `http://localhost:5173`. This origin is included in the backend's CORS allowlist by default.

---

## 4. Deploy the frontend to GitHub Pages

### Enable GitHub Pages

1. Go to the `password-manager-frontend` repo on GitHub
2. **Settings > Pages**
3. Under **Source**, select **GitHub Actions**

### Set GitHub secrets on the frontend repo

Go to **Settings > Secrets and variables > Actions** and add:

| Secret | Value |
|--------|-------|
| `VITE_API_URL` | Your API Gateway URL (e.g. `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod`) |

### Push to trigger the workflow

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`. It:

1. Sparse-checks out the backend repo's `core/` directory
2. Builds the core library
3. Builds the frontend with the `VITE_API_URL` secret baked in
4. Deploys to GitHub Pages via `actions/deploy-pages`

After the first successful run, the site is live at `https://<username>.github.io/password-manager-frontend/`.

---

## 5. Verify

1. Open the GitHub Pages URL
2. Create a new vault with a master password
3. Add some entries, lock the vault, and unlock it again
4. Open DevTools > Network and confirm:
   - API calls to `/vaults` and `/vaults/{key}` return `Access-Control-Allow-Origin` matching your GitHub Pages domain
   - S3 presigned URL requests (GET/PUT) succeed without CORS errors

---

## Allowed origins

The backend's CORS configuration is defined in `cdk/app.ts`. By default it allows:

```
https://khaled2049.github.io
http://localhost:5173
http://127.0.0.1:5173
```

If you fork the repo or use a different GitHub Pages domain, update the `allowedOrigins` array in `cdk/app.ts` and redeploy:

```bash
yarn deploy:app
```

The CORS fix is enforced at three layers:

| Layer | How |
|-------|-----|
| **API Gateway** | `defaultCorsPreflightOptions` in `stack.ts` — returns CORS headers on OPTIONS |
| **Lambda** | `ALLOWED_ORIGINS` env var — validates origin on every request, rejects unknown origins |
| **S3 bucket** | `cors` config on the vault bucket — allows presigned URL requests from listed origins |

---

## AWS resources and cost

All resources are within the AWS free tier for personal use:

| Resource | What it does | Free tier |
|----------|-------------|-----------|
| S3 | Stores encrypted vault blobs | 5 GB storage, 20k GET, 2k PUT/month |
| Lambda | Generates presigned URLs | 1M requests, 400k GB-seconds/month |
| API Gateway | REST API endpoint | 1M calls/month |
| CloudWatch | Lambda logs (1-week retention) | 5 GB ingestion, 5 GB storage |

---

## Project scripts reference

### Backend (`password-manager`)

| Command | Description |
|---------|-------------|
| `yarn build` | Build all workspaces (core, cdk, scripts, examples) |
| `yarn synth` | Generate CloudFormation templates without deploying |
| `yarn deploy:app` | Deploy the backend stack |
| `yarn deploy:oidc` | Deploy the GitHub OIDC stack |
| `yarn deploy:all` | Deploy all stacks |
| `yarn diff` | Preview infrastructure changes |

### Frontend (`password-manager-frontend`)

| Command | Description |
|---------|-------------|
| `yarn dev` | Start dev server at localhost:5173 |
| `yarn build` | Production build to `dist/` |
| `yarn preview` | Preview the production build locally |
| `yarn lint` | Run ESLint |

# Password Manager Frontend

React + TypeScript + Vite frontend for the Password Manager application.

## Setup

### Environment Variables

The frontend supports two modes: **Mock API** (for local testing) and **Production API** (with real backend).

#### Option 1: Mock API (Recommended for Local Development)

Use the mock API server for local testing without backend dependencies:

1. **Create a `.env` file** in the root directory:
   ```env
   VITE_USE_MOCK_API=true
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

   The mock API server will automatically intercept API calls and store vaults in memory. All vault data resets when you restart the dev server.
   
   **Note:** The mock server does not have a default master password. When creating a vault, use any password you choose - it's your choice! The mock server stores encrypted vault data only (encryption is handled by the VaultManager).

#### Option 2: Production API

Use the real backend API with pre-signed S3 URLs:

1. **Create a `.env` file** in the root directory:
   ```env
   VITE_USE_MOCK_API=false
   VITE_API_URL=https://your-api-gateway-url.execute-api.region.amazonaws.com
   BUCKET_NAME=your-bucket-name
   AWS_REGION=us-east-1
   OBJECT_KEY=vault.dat
   ```

2. **Generate and update vault URLs** (if using fallback mode):
   ```bash
   npm run update-urls
   ```
   
   This will automatically:
   - Generate new pre-signed GET and PUT URLs
   - Update your `.env` file with `VITE_VAULT_GET_URL` and `VITE_VAULT_PUT_URL`

3. **Start the development server**:
   ```bash
   npm run dev
   ```

   Or, to automatically update URLs before starting:
   ```bash
   npm run dev:with-urls
   ```

### Switching Between Mock and Production

Simply change the `VITE_USE_MOCK_API` environment variable:
- `VITE_USE_MOCK_API=true` - Use mock API (no backend required)
- `VITE_USE_MOCK_API=false` or unset - Use production API (requires `VITE_API_URL`)

### Manual URL Updates (Production Mode Only)

If your URLs expire (after 12 minutes), simply run:
```bash
npm run update-urls
```

The script will automatically update your `.env` file with fresh URLs.

## Development

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is currently not compatible with SWC. See [this issue](https://github.com/vitejs/vite-plugin-react/issues/428) for tracking the progress.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

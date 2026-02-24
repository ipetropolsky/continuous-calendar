# Continuous Calendar

This is a code bundle for Continuous Calendar. The original project is available at https://www.figma.com/design/KcmGsUL7bmSubYwChmOWqm/Continuous-Calendar-2025-2026.

## Running the code

Run `npm i` to install the dependencies.

## Scripts

```bash
# Start dev server (localhost:3000)
npm run dev

# Check types
npm run ts-check

# Lint specific files
npm run lint-files file1 file2 ...

# Format specific files
npm run format-files file1 file2 ...

# Check types, lint and format entire repo
npm run check

# Production build to /build
npm run build

# Deploy to GitHub Pages
npm run deploy

# Install all dependencies with latest versions
npm install $(npm run deps:latest --silent)
```

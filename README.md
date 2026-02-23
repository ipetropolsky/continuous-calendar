# Continuous Calendar 2025-2026

This is a code bundle for Continuous Calendar 2025-2026. The original project is available at https://www.figma.com/design/KcmGsUL7bmSubYwChmOWqm/Continuous-Calendar-2025-2026.

## Running the code

Run `npm i` to install the dependencies.

Run `npm run dev` to start the development server.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build to /build |
| `npm run ts-check` | TypeScript type checking |
| `npm run deploy` | Deploy to GitHub Pages |
| `npm run deps:latest` | Output all dependencies with @latest suffix |

To install all dependencies with latest versions:
```bash
npm install $(npm run deps:latest --silent)
```

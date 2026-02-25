export default {
    // ts-check через arrow function, чтобы исключить аргументы,
    // которые передаёт lint-staged (имена staged-файлов).
    '*.{ts,tsx}': [() => 'npm run ts-check', 'npm run lint-files'],
    '*.{js,jsx}': ['npm run lint-files'],
    '*': ['npm run format-files'],
};

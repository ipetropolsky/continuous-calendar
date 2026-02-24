import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            curly: 'error',
        },
    },
    {
        ignores: ['build/**', 'dist/**', 'tools/**', '**/*.cjs', 'package-lock.json'],
    }
);

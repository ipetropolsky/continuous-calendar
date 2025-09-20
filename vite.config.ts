import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    base: process.env.NODE_ENV === 'production' ? '/continuous-calendar/' : '/',
    resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        target: 'esnext',
        outDir: 'build',
    },
    server: {
        port: 3000,
        open: true,
    },
});

import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { defineConfig } from 'vite';

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
        rollupOptions: {
            // 404.html redirects unknown paths on GitHub Pages to the app
            input: ['index.html', '404.html'],
        },
    },
    server: {
        port: 3000,
        open: true,
    },
});

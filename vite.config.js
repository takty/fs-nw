import { defineConfig } from 'vite';

export default defineConfig({
	root: 'src/_docs',
	base: './',
	build: { target: 'esnext', outDir: '../../docs', emptyOutDir: true },
});

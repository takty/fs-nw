import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { transform } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
const stage = await mkdtemp(join(tmpdir(), 'fs-nw-build-'));
const dist = join(root, 'dist');
const names = ['fs-base', 'fs-node', 'fs-web'];
const rewriteImports = text => text.replaceAll('./fs-base.js', './fs-base.min.js');

try {
	// Do not replace the distribution unless strict type checking succeeds.
	execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.json'), '--outDir', stage], { cwd: root, stdio: 'inherit', windowsHide: true });
	for (const name of names) {
		const source = await readFile(join(root, 'src', `${name}.ts`), 'utf8');
		const result = await transform(rewriteImports(source), {
			loader: 'ts', format: 'esm', target: 'es2022', minify: true,
			keepNames: true, legalComments: 'none',
		});
		await writeFile(join(stage, `${name}.min.js`), result.code);
		const declaration = await readFile(join(stage, `${name}.d.ts`), 'utf8');
		await writeFile(join(stage, `${name}.min.d.ts`), rewriteImports(declaration));
	}
	const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
	const exports = Object.fromEntries(Object.entries(pkg.exports).map(([key, entry]) => [key, {
		types: entry.types.replace('./dist/', './'),
		import: entry.import.replace('./dist/', './'),
	}]));
	await writeFile(join(stage, 'package.json'), JSON.stringify({
		name: pkg.name, version: pkg.version, type: 'module',
		description: 'A shared filesystem API for Node.js and the Web.',
		exports, files: ['*.min.js', '*.min.d.ts'],
	}, null, 2) + '\n');
	await mkdir(dist, { recursive: true });
	await rm(join(dist, 'README.md'), { force: true });
	for (const name of [...names.flatMap(name => [`${name}.min.js`, `${name}.min.d.ts`]), 'package.json']) {
		await copyFile(join(stage, name), join(dist, name));
	}
	console.log('Built dist: 3 minified ES modules, type declarations, and package.json.');
} finally {
	// stage is a unique directory created by this build under the OS temp folder.
	await rm(stage, { recursive: true, force: true });
}

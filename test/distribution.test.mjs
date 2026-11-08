import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fixture } from './helpers.mjs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');

test('dist alone supports package imports, direct imports, and strict consumer types', async t => {
	const root = await fixture(t);
	const packageDir = join(root, 'node_modules/fs-nw');
	await mkdir(packageDir, { recursive: true });
	await cp(new URL('../dist/', import.meta.url), packageDir, { recursive: true });
	await writeFile(join(root, 'runtime.mjs'), `
import assert from 'node:assert/strict';
import { NodeFileSystem } from 'fs-nw/node';
import { WebFileSystem } from 'fs-nw/web';
import { FileSystemBase } from 'fs-nw/base';
import Direct from './node_modules/fs-nw/fs-node.min.js';
import DirectWeb from './node_modules/fs-nw/fs-web.min.js';
assert.equal(Direct, NodeFileSystem);
assert.equal(DirectWeb, WebFileSystem);
const fs = new NodeFileSystem(process.cwd());
assert.ok(fs instanceof FileSystemBase);
await fs.writeText('sample.txt', 'Distribution works');
assert.equal(await fs.readText('sample.txt'), 'Distribution works');
console.log('OK');
`);
	const runtime = await execute(process.execPath, ['runtime.mjs'], { cwd: root, windowsHide: true });
	assert.equal(runtime.stdout.trim(), 'OK');
	await writeFile(join(root, 'consumer.mts'), `
import { NodeFileSystem } from 'fs-nw/node';
import { WebFileSystem } from 'fs-nw/web';
import { FileSystemBase, type DirectoryEntry } from 'fs-nw/base';
import Direct from './node_modules/fs-nw/fs-web.min.js';
const node = new NodeFileSystem('/root', { pickFile: async ({ root }) => root });
declare const handle: FileSystemDirectoryHandle;
const web: WebFileSystem = new Direct(handle);
const shared: FileSystemBase = web;
const entries: DirectoryEntry[] = await shared.readDirectory();
await node.copyTextFile('a', 'b', web);
await web.copyTextFile('a', 'b', node);
await web.pickFile({ types: [{ accept: { 'text/plain': ['.txt'] } }] });
await WebFileSystem.open({ mode: 'readwrite' });
// @ts-expect-error File contents must be a supported byte buffer or string.
await node.writeFile('bad', 123);
// @ts-expect-error Paths must be strings.
await web.readFile(123);
// @ts-expect-error The abstract base requires an adapter implementation.
const invalid = new FileSystemBase();
`);
	await writeFile(join(root, 'tsconfig.json'), JSON.stringify({
		compilerOptions: { strict: true, noEmit: true, target: 'ES2022', module: 'NodeNext', lib: ['ES2022', 'DOM'], types: [] },
		include: ['consumer.mts'],
	}));
	await execute(process.execPath, [tsc, '-p', join(root, 'tsconfig.json')], { cwd: root, windowsHide: true });
});

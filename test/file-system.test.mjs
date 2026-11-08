import { test } from 'node:test';
import { fixture, adapters } from './helpers.mjs';
import assert from 'node:assert/strict';
import * as native from 'node:fs/promises';
import path from 'node:path';
import { NodeFileSystem } from '../dist/fs-node.min.js';
import { WebFileSystem } from '../dist/fs-web.min.js';
import { directoryHandle } from './handles.mjs';

for (const [label, create] of adapters) {
	test(`${label}: UTF-8, binary views, overwrite and sorted listing`, async t => {
		const fs = create(await fixture(t));
		await fs.makeDirectory('unicode-🌱');
		await fs.writeFile('unicode-🌱/text.txt', 'Hello 🌱 🌱');
		assert.equal(await fs.readText('unicode-🌱/text.txt'), 'Hello 🌱 🌱');
		const data = new Uint8Array([99, 0, 128, 255, 99]);
		await fs.writeFile('data.bin', data.subarray(1, 4));
		assert.deepEqual(await fs.readFile('data.bin'), new Uint8Array([0, 128, 255]));
		await fs.writeFile('data.bin', new Uint8Array([1]).buffer);
		assert.deepEqual(await fs.readFile('data.bin'), new Uint8Array([1]));
		assert.deepEqual(await fs.readDirectory(), [{ name: 'data.bin', kind: 'file' }, { name: 'unicode-🌱', kind: 'directory' }]);
	});
	test(`${label}: creation, missing parents and removal`, async t => {
		const fs = create(await fixture(t));
		await assert.rejects(fs.writeFile('missing/file.txt', 'x'));
		await assert.rejects(fs.makeDirectory('a/b'));
		await fs.makeDirectory('a/b', { recursive: true });
		await fs.makeDirectory('a/b');
		await fs.writeFile('a/b/item', 'x');
		await assert.rejects(fs.remove('a'));
		await fs.remove('a', { recursive: true });
		assert.deepEqual(await fs.readDirectory(), []);
		await assert.rejects(fs.readFile('missing'));
		await assert.rejects(fs.remove('missing'));
	});
	test(`${label}: invalid paths and root mutation rejected`, async t => {
		const fs = create(await fixture(t));
		for (const invalid of ['../outside', '/absolute', 'C:/drive', 'a/../b', 'a//b', 'a\\b', '.', 'a/', 'NUL', 'file:stream', 'a.', 'a ', '\0']) {
			await assert.rejects(fs.writeFile(invalid, 'x'), TypeError, invalid);
			await assert.rejects(fs.readDirectory(invalid), TypeError, invalid);
		}
		for (const operation of [() => fs.writeFile('', 'x'), () => fs.remove(''), () => fs.makeDirectory(''), () => fs.readFile('')]) {
			await assert.rejects(operation, TypeError);
		}
		await assert.rejects(fs.writeFile('bad', {}), TypeError);
		assert.deepEqual(await fs.readDirectory(), []);
	});
}

test('Node pickers accept root-relative selections, cancel and reject outside', async t => {
	const root = await fixture(t);
	await native.writeFile(path.join(root, 'file.txt'), 'x');
	let selection = path.join(root, 'file.txt');
	const fs = new NodeFileSystem(root, { pickFile: async () => selection, pickDirectory: async () => root });
	assert.equal(await fs.pickFile(), 'file.txt');
	assert.equal(await fs.pickDirectory(), '');
	selection = path.dirname(root);
	await assert.rejects(fs.pickFile());
	selection = null;
	assert.equal(await fs.pickFile(), null);
	await assert.rejects(new NodeFileSystem(root).pickFile(), /callback/);
});

test('Node rejects symlink traversal', async t => {
	const root = await fixture(t);
	const outside = await fixture(t);
	await native.writeFile(path.join(outside, 'secret'), 'unchanged');
	await native.symlink(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
	const fs = new NodeFileSystem(root);
	await assert.rejects(fs.readFile('link/secret'), /Symbolic/);
	await assert.rejects(fs.writeFile('link/new', 'x'), /Symbolic/);
	await assert.rejects(fs.remove('link', { recursive: true }), /Symbolic/);
	assert.equal(await native.readFile(path.join(outside, 'secret'), 'utf8'), 'unchanged');
});

test('Browser pickers validate membership, preserve options and cancel', async t => {
	const root = directoryHandle(await fixture(t));
	await native.writeFile(path.join(root.location, 'file.txt'), 'x');
	const fs = new WebFileSystem(root);
	let selection = await root.getFileHandle('file.txt');
	t.mock.method(globalThis, 'showOpenFilePicker', async options => {
		assert.equal(options.startIn, root);
		assert.equal(options.multiple, false);
		return [selection];
	});
	assert.equal(await fs.pickFile({ multiple: true }), 'file.txt');
	selection = { location: path.dirname(root.location) };
	await assert.rejects(fs.pickFile(), /outside/);
	t.mock.method(globalThis, 'showDirectoryPicker', async () => root);
	assert.equal(await fs.pickDirectory(), '');
	assert.equal((await WebFileSystem.open()).name, root.name);
	t.mock.method(globalThis, 'showDirectoryPicker', async () => { throw new DOMException('Cancel', 'AbortError'); });
	assert.equal(await fs.pickDirectory(), null);
	assert.equal(await WebFileSystem.open(), null);
});

// The picker functions do not exist in Node; define test placeholders for mock.method.
globalThis.showOpenFilePicker = () => {};
globalThis.showDirectoryPicker = () => {};

test('Browser aborts an incomplete write and preserves the original error', async () => {
	let aborted = false;
	const failure = new Error('Write failed');
	const fs = new WebFileSystem({ kind: 'directory', async getFileHandle() {
		return { async createWritable() { return {
			async write() { throw failure; },
			async abort() { aborted = true; },
		}; } };
	} });
	await assert.rejects(fs.writeFile('file', 'x'), error => error === failure);
	assert.equal(aborted, true);
});

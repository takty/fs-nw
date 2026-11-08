import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adapters, fixture } from './helpers.mjs';

for (const [label, create] of adapters) {
	test(`${label}: common byte operations and metadata`, async t => {
		const fs = create(await fixture(t));
		await fs.writeFile('data', new Uint8Array([1, 2, 3]));
		assert.deepEqual(await fs.stat('data'), { kind: 'file', size: 3 });
		assert.deepEqual(await fs.stat(), { kind: 'directory', size: null });
		assert.deepEqual(await fs.readRange('data', 1, 10), new Uint8Array([2, 3]));
		assert.equal((await fs.readRange('data', 10, 2)).length, 0);
		await fs.writeAt('data', 1, new Uint8Array([99, 8, 99]).subarray(1, 2));
		assert.deepEqual(await fs.readFile('data'), new Uint8Array([1, 8, 3]));
		await fs.writeAt('data', 5, 'A');
		assert.deepEqual(await fs.readFile('data'), new Uint8Array([1, 8, 3, 0, 0, 65]));
		await fs.writeAt('data', 99, '');
		assert.equal((await fs.stat('data')).size, 6);
		await fs.truncate('data', 2);
		await fs.truncate('data', 4);
		assert.deepEqual(await fs.readFile('data'), new Uint8Array([1, 8, 0, 0]));
		for (const bad of [-1, 0.5, Infinity, NaN]) {
			await assert.rejects(fs.readRange('data', bad, 1), RangeError);
			await assert.rejects(fs.readRange('data', 0, bad), RangeError);
			await assert.rejects(fs.writeAt('data', bad, 'x'), RangeError);
			await assert.rejects(fs.truncate('data', bad), RangeError);
		}
		for (const operation of [() => fs.stat('missing'), () => fs.writeAt('missing', 0, 'x'), () => fs.truncate('missing', 0), () => fs.readRange('', 0, 1)]) {
			await assert.rejects(operation());
		}
		assert.equal(await fs.exists('missing'), false);
		await fs.truncate('data', 0);
		assert.equal((await fs.stat('data')).size, 0);
	});
	test(`${label}: binary copies, traversal and shared glob syntax`, async t => {
		const fs = create(await fixture(t));
		await fs.makeDirectory('source/nested', { recursive: true });
		await fs.writeFile('source/a.txt', new Uint8Array([0, 128, 255]));
		await fs.writeText('source/nested/b.txt', 'Hello');
		await fs.copyDirectory('source', 'copy');
		assert.deepEqual(await fs.readFile('copy/a.txt'), new Uint8Array([0, 128, 255]));
		await fs.writeText('target', 'old');
		await fs.copyFile('source/a.txt', 'target');
		assert.deepEqual(await fs.readFile('target'), new Uint8Array([0, 128, 255]));
		const paths = entries => entries.map(entry => entry.path);
		assert.deepEqual(paths(await fs.walk('copy')), ['copy/a.txt', 'copy/nested', 'copy/nested/b.txt']);
		assert.deepEqual(paths(await fs.glob('**/*.txt', 'copy')), ['copy/a.txt', 'copy/nested/b.txt']);
		assert.deepEqual(paths(await fs.glob('?.txt', 'copy')), ['copy/a.txt']);
		assert.deepEqual(paths(await fs.glob('*/*.txt', 'copy')), ['copy/nested/b.txt']);
		assert.deepEqual(await fs.glob('**/*.TXT'), []);
		for (const pattern of ['../*', '/**', 'a/**x', '[ab]', '']) await assert.rejects(fs.glob(pattern), TypeError);
		for (const operation of [
			() => fs.copyFile('target', 'TARGET'), () => fs.copyFile('missing', 'new'),
			() => fs.copyDirectory('source', 'copy'), () => fs.copyDirectory('source', 'SOURCE/child'),
			() => fs.copyDirectory('', 'root-copy'), () => fs.copyFile('target', 'missing/child'),
			() => fs.walk('target'),
		]) await assert.rejects(operation());
		assert.equal(await fs.exists('new'), false);
		assert.equal(await fs.readText('source/nested/b.txt'), 'Hello');
	});
}

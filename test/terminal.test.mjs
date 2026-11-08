import { test } from 'node:test';
import { fixture, adapters } from './helpers.mjs';
import assert from 'node:assert/strict';
import * as native from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Terminal } from '../src/terminal.js';

for (const [label, create] of adapters) {
	test(`${label}: shared command workflow`, async t => {
		const fs = create(await fixture(t));
		const shell = new Terminal(fs);
		const run = line => shell.execute(line);
		assert.equal((await run('pwd')).output, '/\n');
		await run('mkdir -p "Project notes"/nested');
		await run('cd "Project notes"');
		await run('echo "Hello > world 🌱" > "hello world.txt"');
		await run('echo -n "" > .hidden');
		assert.equal((await run('cat "hello world.txt"')).output, 'Hello > world 🌱\n');
		assert.equal((await run('ls')).output, 'hello world.txt\nnested/\n');
		assert.match((await run('ls -a')).output, /\.hidden/);
		await run('cp "hello world.txt" nested');
		await run('cp -r nested renamed');
		await run('cp -r renamed duplicate');
		assert.equal(await fs.readText('Project notes/duplicate/hello world.txt'), 'Hello > world 🌱\n');
		assert.ok((await run('tree')).output.includes('duplicate/'));
		await run('rm -r renamed duplicate');
		await run('mkdir empty');
		await run('rmdir empty');
		await run('cd ..');
		await run('rm -r "Project notes"');
		assert.deepEqual(await fs.readDirectory(), []);
		assert.equal((await run('clear')).clear, true);
		assert.equal((await run('exit')).exit, true);
	});
	test(`${label}: reject unsafe and unsupported operations without losing source`, async t => {
		const fs = create(await fixture(t));
		const shell = new Terminal(fs);
		await shell.execute('mkdir -p parent/child');
		await fs.writeFile('parent/data', new Uint8Array([0, 255, 128]));
		for (const command of ['cd ..', 'rm -rf /', 'mv / other', 'cp -r parent parent/child', 'cp parent copy', 'cp parent/data parent/data', 'mkdir parent', 'rmdir parent', 'echo "unterminated', 'echo x | cat', 'echo x > a > b', 'rm -z parent', 'unknown', 'cd parent/data']) {
			await assert.rejects(shell.execute(command), undefined, command);
		}
		await shell.execute('cp parent/data binary');
		await assert.rejects(shell.execute('cp binary BINARY'));
		await assert.rejects(shell.execute('mv binary moved'));
		await assert.rejects(shell.execute('touch absent'));
		assert.equal(await fs.exists('moved'), false);
		assert.equal(await fs.exists('absent'), false);
		assert.deepEqual(await fs.readFile('binary'), new Uint8Array([0, 255, 128]));
		await assert.rejects(shell.execute('echo -n x >> binary'));
		await assert.rejects(shell.execute('echo -n x >> new-file'));
		assert.equal(await fs.exists('new-file'), false);
		assert.deepEqual(await fs.readFile('binary'), new Uint8Array([0, 255, 128]));
		await shell.execute('cd parent/child');
		await assert.rejects(shell.execute('rm -r ..'));
		await assert.rejects(shell.execute('mv .. /elsewhere'));
		await shell.execute('cd /');
		await assert.rejects(shell.execute('mv parent missing/target'));
		assert.equal(await fs.exists('parent/data'), true);
		await shell.execute('rm -f absent');
		await shell.execute('echo -n > -dash');
		assert.equal(await fs.exists('-dash'), true);
		await shell.execute('echo "" > blank');
		assert.equal(await fs.readText('blank'), '\n');
	});
}

test('Node CLI: piped commands, UTF-8, stderr, exit and EOF', async t => {
	const root = await fixture(t);
	const { status, stdout, stderr, error } = spawnSync(process.execPath, ['src/terminal-node.js', root], {
		cwd: new URL('..', import.meta.url), windowsHide: true, encoding: 'utf8', timeout: 15000,
		input: 'mkdir notes\necho "Hello 🌱" > notes/a\ncat notes/a\nunknown\npwd\nexit\necho after\n',
	});
	assert.ifError(error);
	assert.equal(status, 1);
	assert.equal(stdout, 'Hello 🌱\n/\n');
	assert.match(stderr, /Command not found/);
	assert.equal(await native.readFile(path.join(root, 'notes/a'), 'utf8'), 'Hello 🌱\n');
});


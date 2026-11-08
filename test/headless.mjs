import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { preview } from 'vite';

const server = await preview({
	configFile: false, root: resolve('..'), publicDir: false,
	build: { outDir: process.cwd() }, preview: { host: '127.0.0.1', port: 0, open: false },
});
let browser;
try {
	browser = await chromium.launch(process.argv[2] ? { executablePath: process.argv[2] } : { channel: 'chrome' });
	const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });
	await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/docs/');
	await page.locator('#status').waitFor();
	const result = await page.evaluate(async () => {
		const { WebFileSystem } = await import('/dist/fs-web.min.js');
		const root = await navigator.storage.getDirectory();
		const name = 'test-' + crypto.randomUUID();
		const handle = await root.getDirectoryHandle(name, { create: true });
		const fs = new WebFileSystem(handle);
		const check = (condition, message) => { if (!condition) throw new Error(message); };
		try {
			await fs.makeDirectory('nested/deep', { recursive: true });
			await fs.writeFile('nested/deep/text.txt', 'Hello 🌱');
			check(await fs.readText('nested/deep/text.txt') === 'Hello 🌱', 'UTF-8 round trip');
			await fs.writeFile('bytes.bin', new Uint8Array([0, 128, 255]));
			check((await fs.readFile('bytes.bin')).join() === '0,128,255', 'Binary round trip');

			check((await fs.stat('bytes.bin')).size === 3, 'File size');
			check((await fs.stat('')).size === null, 'Directory size');
			await fs.writeAt('bytes.bin', 1, new Uint8Array([7]));
			await fs.truncate('bytes.bin', 5);
			check((await fs.readRange('bytes.bin', 1, 4)).join() === '7,255,0,0', 'Range operations');
			await fs.copyDirectory('nested', 'copied');
			check((await fs.glob('**/*.txt')).length === 2, 'Pattern matching');
			check((await fs.walk('copied')).length === 2, 'Recursive listing');
			await fs.remove('copied', { recursive: true });
			await fs.remove('nested', { recursive: true });
			check((await fs.readDirectory()).length === 1, 'Recursive removal');
			let refused = false;
			try { await fs.writeFile('../outside', 'x'); } catch { refused = true; }
			check(refused, 'Traversal rejected');
			window.showDirectoryPicker = async () => handle;
			document.querySelector('#open').click();
			const input = document.querySelector('#command');
			const idle = async () => {
				for (let i = 0; i < 200 && input.disabled; i++) await new Promise(r => setTimeout(r, 20));
				check(!input.disabled, 'Demo ready');
			};
			await idle();
			const run = async line => {
				input.value = line;
				document.querySelector('#command-form').requestSubmit();
				await idle();
			};
			await run('mkdir notes');
			await run('cd notes');
			check(document.querySelector('#prompt').textContent === '/notes $', 'Prompt');
			await run('echo "Saved from the demo 🌱" > demo.txt');
			check(await fs.readText('notes/demo.txt') === 'Saved from the demo 🌱' + String.fromCharCode(10), 'Demo save');
			await run('cp demo.txt copy.txt');
			await run('cat copy.txt');
			check(document.querySelector('#output').textContent.includes('Saved from the demo 🌱'), 'Demo output');
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
			check(input.value === 'cat copy.txt', 'History');
			await run('rm copy.txt');
			check(!(await fs.exists('notes/copy.txt')), 'Demo removal');
			await run('cd /');
			await run('tree');
			await run('unknown-command');
			check(document.querySelector('#output .error'), 'Errors visible');
			await run('pwd');
			check(!document.querySelector('#open').disabled, 'Recovered after error');
			return { passed: true, checks: ['native OPFS handles', 'UTF-8', 'binary', 'recursive removal', 'path rejection', 'built terminal commands', 'history', 'error recovery'] };
		} finally { await root.removeEntry(name, { recursive: true }); }
	});
	await page.screenshot({ path: 'test/demo.png' });
	console.log(JSON.stringify(result, null, 2));
} finally {
	await browser?.close();
	await server.close();
}

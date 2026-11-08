import path from 'node:path';
import { createInterface } from 'node:readline';
import { NodeFileSystem } from '../dist/fs-node.min.js';
import { Terminal } from './terminal.js';

async function main() {
	if (process.argv.length > 3) throw new Error('Specify at most one root directory');
	const root = path.resolve(process.argv[2] ?? '.');
	const fs = new NodeFileSystem(root);
	await fs.readDirectory();
	const terminal = new Terminal(fs);
	const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
	const lines = createInterface({ input: process.stdin, output: interactive ? process.stdout : undefined, terminal: interactive });
	const prompt = () => { if (interactive) { lines.setPrompt(terminal.prompt + ' '); lines.prompt(); } };
	prompt();
	try {
		for await (const line of lines) {
			try {
				const result = await terminal.execute(line);
				if (result.clear && interactive) process.stdout.write('\x1b[2J\x1b[H');
				process.stdout.write(result.output);
				if (result.exit) break;
			} catch (error) {
				console.error(`Error: ${error.message}`);
				if (!interactive) process.exitCode = 1;
			}
			prompt();
		}
	} finally { lines.close(); }
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });

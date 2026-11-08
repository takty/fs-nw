import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NodeFileSystem } from '../dist/fs-node.min.js';
import { WebFileSystem } from '../dist/fs-web.min.js';
import { directoryHandle } from './handles.mjs';

export async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'fs-nw-test-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	return root;
}

export const adapters = [
	['Node', root => new NodeFileSystem(root)],
	['Web (mock handles)', root => new WebFileSystem(directoryHandle(root))],
];

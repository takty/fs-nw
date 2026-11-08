// Test-only File System Access handles backed by a temporary directory.
import * as fs from 'node:fs/promises';
import path from 'node:path';

export function directoryHandle(location) {
	return {
		kind: 'directory', name: path.basename(location), location,
		async getDirectoryHandle(name, { create = false } = {}) {
			const target = path.join(location, name);
			if (create) {
				try { await fs.mkdir(target); } catch (error) { if (error.code !== 'EEXIST') throw error; }
			}
			if (!(await fs.stat(target)).isDirectory()) throw new DOMException('Not a directory', 'TypeMismatchError');
			return directoryHandle(target);
		},
		async getFileHandle(name, { create = false } = {}) {
			const target = path.join(location, name);
			if (create) await (await fs.open(target, 'a')).close();
			if (!(await fs.stat(target)).isFile()) throw new DOMException('Not a file', 'TypeMismatchError');
			return {
				kind: 'file', name, location: target,
				async getFile() { return new Blob([await fs.readFile(target)]); },
				async createWritable() {
					let pending;
					return {
						async write(data) { pending = data; },
						async close() { await fs.writeFile(target, pending); },
						async abort() {},
					};
				},
			};
		},
		async *entries() {
			for (const e of await fs.readdir(location, { withFileTypes: true })) {
				yield [e.name, { kind: e.isDirectory() ? 'directory' : 'file' }];
			}
		},
		async removeEntry(name, { recursive = false } = {}) {
			const target = path.join(location, name);
			if ((await fs.stat(target)).isDirectory()) {
				if (recursive) await fs.rm(target, { recursive: true });
				else await fs.rmdir(target);
			} else await fs.unlink(target);
		},
		async resolve(handle) {
			const relative = path.relative(location, handle.location);
			if (relative === '') return [];
			if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return null;
			return relative.split(path.sep);
		},
	};
}

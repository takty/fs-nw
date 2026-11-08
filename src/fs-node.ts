import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { FileSystemBase, splitPath, toBytes, sortEntries, unsupported, hasErrorCode } from './fs-base.js';
import type { FileData, RecursiveOptions, DirectoryEntry, FileInfo } from './fs-base.js';
import type { Stats, Dirent } from 'node:fs';
export { joinPath, baseName, directoryName, extension, pathSeparator } from './fs-base.js';

/** With a root, paths are portable and root-relative. Without one, use native OS paths. */
export type NodePickerOptions = Record<string, unknown>;
export type NodePicker = (options: NodePickerOptions & { root: string | null }) => string | null | undefined | Promise<string | null | undefined>;
export interface NodeFileSystemOptions { pickFile?: NodePicker; pickDirectory?: NodePicker; }

export class NodeFileSystem extends FileSystemBase {
	#root   : string | null;
	#pickers: NodeFileSystemOptions;

	constructor(root: string | null = null, { pickFile, pickDirectory }: NodeFileSystemOptions = {}) {
		super();
		if (root !== null && (typeof root !== 'string' || !path.isAbsolute(root))) {
			throw new TypeError('Root must be an absolute directory path');
		}
		this.#root    = root === null ? null : path.resolve(root);
		this.#pickers = { pickFile, pickDirectory };
	}

	get name() {
		return this.#root === null ? '' : path.basename(this.#root) || this.#root;
	}

	get capabilities() {
		return { moduleDirectory: true, fileURL: true, hideDirectory: process.platform === 'win32' };
	}

	protected commonPath(rel: string, allowRoot = true): string {
		if (this.#root === null) throw unsupported('Root-relative operations without a root');
		return super.commonPath(rel, allowRoot);
	}

	get pathSeparator() {
		return this.#root === null ? path.sep : super.pathSeparator;
	}

	joinPath(...parts: string[]) {
		return this.#root === null ? path.join(...parts) : super.joinPath(...parts);
	}

	baseName(value: string, suffix?: string) {
		return this.#root === null ? path.basename(value, suffix) : super.baseName(value, suffix);
	}

	directoryName(value: string) {
		return this.#root === null ? path.dirname(value) : super.directoryName(value);
	}

	extension(value: string) {
		return this.#root === null ? path.extname(value) : super.extension(value);
	}

	async stat(rel = ''): Promise<FileInfo> {
		const info = await fs.stat(await this.#resolve(this.commonPath(rel)));
		if (info.isDirectory()) {
			return { kind: 'directory', size: null };
		}
		if (!info.isFile()) {
			throw new Error('Not a regular file');
		}
		return { kind: 'file', size: info.size };
	}

	async isDirectory(rel = '') {
		return (await fs.stat(await this.#resolve(rel))).isDirectory();
	}

	async isFile(rel: string) {
		return (await fs.stat(await this.#resolve(rel))).isFile();
	}

	async isWritable(rel = '') {
		return ((await fs.stat(await this.#resolve(rel))).mode & 0x0080) !== 0;
	}

	async createDirectory(rel: string) {
		await fs.mkdir(await this.#resolve(rel, { allowRoot: false, missing: true }));
	}

	async createTempDirectory(prefix = 'tmp-') {
		if (typeof prefix !== 'string' || prefix.includes('/')) {
			throw new TypeError('Expected a name prefix');
		}
		splitPath(prefix + 'temp', false);
		const root    = this.#root === null ? tmpdir() : await this.#resolve('');
		const created = await fs.mkdtemp(root + path.sep + prefix);
		return this.#root === null ? created : path.basename(created);
	}

	moduleDirectory(url: string | URL) {
		return path.dirname(fileURLToPath(url));
	}

	async toFileURL(rel: string) {
		return pathToFileURL(await this.#resolve(rel, { missing: true })).href;
	}

	async executionFileURL(rel: string) {
		return 'file:///' + (await this.#resolve(rel, { missing: true })).replace(/\\/g, '/');
	}

	async hideDirectory(rel: string) {
		if (!this.capabilities.hideDirectory) {
			throw unsupported('hideDirectory');
		}
		if (!(await this.isDirectory(rel))) {
			throw new Error('Not a directory');
		}
		await promisify(execFile)('attrib', ['+H', await this.#resolve(rel)], { windowsHide: true });
	}

	async #resolve(rel: string, { allowRoot = true, missing = false } = {}) {
		if (this.#root === null) {
			if (typeof rel !== 'string' || (!allowRoot && rel === '')) {
				throw new TypeError('Expected a non-empty filesystem path');
			}
			return path.resolve(rel);
		}
		const parts = splitPath(rel, allowRoot);
		let current = await fs.realpath(this.#root);
		if (!(await fs.stat(current)).isDirectory()) {
			throw new Error('Root is not a directory');
		}
		for (const [index, part] of parts.entries()) {
			current = path.join(current, part);
			let stat;
			try {
				stat = await fs.lstat(current);
			} catch (e) {
				if (missing && hasErrorCode(e, 'ENOENT')) continue;
				throw e;
			}
			if (stat.isSymbolicLink()) {
				throw new Error('Symbolic links are not supported');
			}
			if (index < parts.length - 1 && !stat.isDirectory()) {
				throw new Error('Parent is not a directory');
			}
		}
		return current;
	}

	async readDirectory(rel = '') {
		const dir = await this.#resolve(rel);
		const es  = await fs.readdir(dir, { withFileTypes: true });
		if (this.#root === null) {
			const res: DirectoryEntry[] = [];
			for (const e of es) {
				let stat: Dirent | Stats = e;
				if (e.isSymbolicLink()) {
					try {
						stat = await fs.stat(path.join(dir, e.name));
					} catch (e) {
						if (hasErrorCode(e, 'ENOENT')) continue;
						throw e;
					}
				}
				if (stat.isFile() || stat.isDirectory()) {
					res.push({ name: e.name, kind: stat.isDirectory() ? 'directory' : 'file' });
				}
			}
			return sortEntries(res);
		}
		return sortEntries(es.filter(e => e.isFile() || e.isDirectory())
			.map(e => ({ name: e.name, kind: e.isDirectory() ? 'directory' : 'file' })));
	}

	async readFile(rel: string) {
		const tar = await this.#resolve(rel, { allowRoot: false });
		if (!(await fs.stat(tar)).isFile()) {
			throw new Error('Not a regular file');
		}
		return new Uint8Array(await fs.readFile(tar));
	}

	async readText(rel: string) {
		return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await this.readFile(rel));
	}

	async readTextAsync(rel: string) {
		if (this.#root !== null) return super.readTextAsync(rel);
		try {
			return await this.readText(rel);
		} catch {
			return undefined;
		}
	}

	async readTextOrNull(rel: string) {
		if (this.#root !== null) return super.readTextOrNull(rel);
		try {
			return await this.readText(rel);
		} catch {
			return null;
		}
	}

	async copyTextFile(from: string, to: string, dest: FileSystemBase = this) {
		if (this.#root !== null) return super.copyTextFile(from, to, dest);
		try {
			const text = await this.readText(from);
			const parent = dest.directoryName(to);
			if (parent) await dest.makeDirectory(parent, { recursive: true });
			await dest.writeText(to, text);
			return true;
		} catch {
			return false;
		}
	}

	async removeDirectoryTree(rel: string) {
		if (this.#root !== null) {
			return super.removeDirectoryTree(rel);
		}
		const tar = await this.#resolve(rel, { allowRoot: false });
		try {
			if (!(await fs.lstat(tar)).isDirectory()) {
				throw new Error('Not a directory');
			}
			await fs.rm(tar, { recursive: true });
		} catch (e) {
			if (!hasErrorCode(e, 'ENOENT')) throw e;
		}
	}

	async writeFile(rel: string, data: FileData) {
		const bytes = toBytes(data);
		await fs.writeFile(await this.#resolve(rel, { allowRoot: false, missing: true }), bytes);
	}

	async makeDirectory(rel: string, { recursive = false }: RecursiveOptions = {}) {
		const tar = await this.#resolve(rel, { allowRoot: false, missing: true });
		try {
			await fs.mkdir(tar, { recursive });
		} catch (e) {
			if (!hasErrorCode(e, 'EEXIST') || !(await fs.stat(tar)).isDirectory()) {
				throw e;
			}
		}
	}

	async remove(rel: string, { recursive = false }: RecursiveOptions = {}) {
		const tar = await this.#resolve(rel, { allowRoot: false });
		if ((await fs.lstat(tar)).isDirectory()) {
			if (recursive) {
				await fs.rm(tar, { recursive: true });
			} else {
				await fs.rmdir(tar);
			}
		} else {
			await fs.unlink(tar);
		}
	}

	async #pick(kind: 'file' | 'directory', options: NodePickerOptions) {
		const picker = this.#pickers[kind === 'file' ? 'pickFile' : 'pickDirectory'];
		if (!picker) {
			throw new Error('Provide a picker callback in the constructor');
		}
		const selected = await picker({ ...options, root: this.#root });
		if (selected == null) return null;
		if (typeof selected !== 'string' || !path.isAbsolute(selected)) {
			throw new TypeError('Picker must return an absolute path or null');
		}
		const rel  = this.#root === null ? selected : path.relative(this.#root, selected).split(path.sep).join('/');
		const tar  = await this.#resolve(rel, { allowRoot: kind === 'directory' });
		const stat = await fs.stat(tar);
		if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) {
			throw new Error('Unexpected selection type');
		}
		return rel;
	}

	async pickFile(options: NodePickerOptions = {}) {
		return this.#pick('file', options);
	}

	async pickDirectory(options: NodePickerOptions = {}) {
		return this.#pick('directory', options);
	}

}

export default NodeFileSystem;

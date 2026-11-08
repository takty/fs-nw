import { FileSystemBase, splitPath, toBytes, sortEntries, unsupported, hasErrorCode, hasErrorName } from './fs-base.js';
import type { FileData, RecursiveOptions, DirectoryEntry, FileInfo } from './fs-base.js';
export { joinPath, baseName, directoryName, extension, pathSeparator } from './fs-base.js';
export type PickerStart = FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
export interface DirectoryPickerOptions {
	id?     : string;
	startIn?: PickerStart;
	mode?   : 'read' | 'readwrite';
}
export interface OpenFilePickerOptions {
	id?                    : string;
	startIn?               : PickerStart;
	multiple?              : boolean;
	excludeAcceptAllOption?: boolean;
	types?                 : { description?: string; accept: Record<string, string | string[]> }[];
}

// Picker APIs and directory iteration are not in every TypeScript DOM release.
type AccessGlobal = typeof globalThis & {
	showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
	showOpenFilePicker? : (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
};

type IterableDirectory = FileSystemDirectoryHandle & {
	entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

/** File System Access adapter. */
export class WebFileSystem extends FileSystemBase {
	#root: FileSystemDirectoryHandle;

	constructor(root: FileSystemDirectoryHandle) {
		super();
		if (root?.kind !== 'directory') {
			throw new TypeError('Root must be a directory handle');
		}
		this.#root = root;
	}

	/** Return a structured-cloneable handle for worker access. */
	getDirectoryHandle() {
		return this.#root;
	}

	get name() {
		return this.#root.name;

	}

	get capabilities() {
		return { moduleDirectory: false, fileURL: false, hideDirectory: false };
	}

	async #handle(rel: string) {
		if (rel === '') return this.#root;
		const { parent, name } = await this.#parent(rel);
		try {
			return await parent.getFileHandle(name);
		} catch (e) {
			if (!hasErrorName(e, 'TypeMismatchError')) {
				throw e;
			}
			return parent.getDirectoryHandle(name);
		}
	}

	async stat(rel = ''): Promise<FileInfo> {
		const handle = await this.#handle(this.commonPath(rel));
		if (handle.kind === 'directory') {
			return { kind: 'directory', size: null };
		}
		return { kind: 'file', size: (await handle.getFile()).size };
	}

	async isDirectory(rel = '') {
		return (await this.#handle(rel)).kind === 'directory';
	}

	async isFile(rel: string) {
		return (await this.#handle(rel)).kind === 'file';
	}

	async isWritable(rel = '') {
		const handle = await this.#handle(rel) as FileSystemHandle & {
			queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
		};
		if (typeof handle.queryPermission !== 'function') {
			throw unsupported('isWritable');
		}
		return await handle.queryPermission({ mode: 'readwrite' }) === 'granted';
	}

	async createDirectory(rel: string) {
		const { parent, name } = await this.#parent(rel);
		if (await this.exists(rel)) {
			const err = Object.assign(new Error('Entry already exists'), { code: 'EEXIST' });
			throw err;
		}
		await parent.getDirectoryHandle(name, { create: true });
	}

	async createTempDirectory(prefix = 'tmp-') {
		if (typeof prefix !== 'string' || prefix.includes('/')) {
			throw new TypeError('Expected a name prefix');
		}
		splitPath(prefix + 'temp', false);
		for (let attempt = 0; attempt < 10; ++attempt) {
			const name = prefix + globalThis.crypto.randomUUID();
			try {
				await this.createDirectory(name);
				return name;
			} catch (e) {
				if (!hasErrorCode(e, 'EEXIST')) {
					throw e;
				}
			}
		}
		throw new Error('Unable to create a unique temporary directory');
	}

	static async open(options: DirectoryPickerOptions = {}) {
		const host = globalThis as AccessGlobal;
		if (typeof host.showDirectoryPicker !== 'function') {
			throw new Error('Directory picker is not supported');
		}
		try {
			return new WebFileSystem(await host.showDirectoryPicker({ mode: 'readwrite', ...options }));
		} catch (e) {
			if (hasErrorName(e, 'AbortError')) return null;
			throw e;
		}
	}

	async #directory(parts: string[], create = false) {
		let handle = this.#root;
		for (const part of parts) handle = await handle.getDirectoryHandle(part, { create });
		return handle;
	}

	async #parent(rel: string) {
		const parts = splitPath(rel, false);
		const name = parts.pop()!;
		return { parent: await this.#directory(parts), name };
	}

	async readDirectory(rel = '') {
		const dir = await this.#directory(splitPath(rel));
		const es: DirectoryEntry[] = [];
		for await (const [name, handle] of (dir as IterableDirectory).entries()) {
			es.push({ name, kind: handle.kind });
		}
		return sortEntries(es);
	}

	async readFile(rel: string) {
		const { parent, name } = await this.#parent(rel);
		const handle = await parent.getFileHandle(name);
		return new Uint8Array(await (await handle.getFile()).arrayBuffer());
	}

	async readText(rel: string) {
		return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await this.readFile(rel));
	}

	async writeFile(rel: string, data: FileData) {
		const bytes            = toBytes(data);
		const { parent, name } = await this.#parent(rel);
		const handle           = await parent.getFileHandle(name, { create: true });
		const writable         = await handle.createWritable();
		try {
			await writable.write(new Uint8Array(bytes));
			await writable.close();
		} catch (e) {
			try {
				await writable.abort();
			} catch {
				/* Preserve the original failure. */
			}
			throw e;
		}
	}

	async makeDirectory(rel: string, { recursive = false }: RecursiveOptions = {}) {
		const parts = splitPath(rel, false);
		if (recursive) {
			await this.#directory(parts, true);
			return;
		}
		const name = parts.pop()!;
		await (await this.#directory(parts)).getDirectoryHandle(name, { create: true });
	}

	async remove(rel: string, { recursive = false }: RecursiveOptions = {}) {
		const { parent, name } = await this.#parent(rel);
		await parent.removeEntry(name, { recursive });
	}

	async #pick(kind: 'file' | 'directory', options: OpenFilePickerOptions | DirectoryPickerOptions) {
		const host = globalThis as AccessGlobal;
		let handle: FileSystemHandle;
		try {
			if (kind === 'file') {
				if (!host.showOpenFilePicker) {
					throw new Error('Picker is not supported');
				}
				[handle] = await host.showOpenFilePicker({ ...options, startIn: this.#root, multiple: false });
			} else {
				if (!host.showDirectoryPicker) {
					throw new Error('Picker is not supported');
				}
				handle = await host.showDirectoryPicker({ ...options, startIn: this.#root });
			}
		} catch (e) {
			if (hasErrorName(e, 'AbortError')) return null;
			throw e;
		}
		const parts = await this.#root.resolve(handle);
		if (parts === null) {
			throw new Error('Selection is outside the root directory');
		}
		const rel = parts.join('/');
		splitPath(rel, kind === 'directory');
		return rel;
	}

	async pickFile(options: OpenFilePickerOptions = {}) {
		return this.#pick('file', options);
	}

	async pickDirectory(options: DirectoryPickerOptions = {}) {
		return this.#pick('directory', options);
	}

}

export default WebFileSystem;

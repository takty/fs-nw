// Portable, root-relative paths only. Reject ambiguous Windows names as well.
export interface DirectoryEntry { name: string; kind: 'file' | 'directory'; }
export interface WalkEntry extends DirectoryEntry { path: string; }
export type FileInfo = { kind: 'file'; size: number } | { kind: 'directory'; size: null };
export type FileData = string | Uint8Array | ArrayBuffer;
export interface RecursiveOptions { recursive?: boolean; }
export interface Capabilities { moduleDirectory: boolean; fileURL: boolean; hideDirectory: boolean; }

export function splitPath(path: string, allowRoot = true): string[] {
	if (typeof path !== 'string') {
		throw new TypeError('Path must be a string');
	}
	if (path === '' && allowRoot) return [];
	const parts = path.split('/');
	if (parts.some(part => !part || part === '.' || part === '..' ||
		/[\\:*?"<>|\u0000-\u001f]/u.test(part) || /[. ]$/u.test(part) ||
		/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
		throw new TypeError('Expected a portable relative path separated by /');
	}
	return parts;
}

export function toBytes(data: FileData): Uint8Array {
	if (typeof data === 'string') return new TextEncoder().encode(data);
	if (data instanceof Uint8Array) return data;
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	throw new TypeError('Data must be a string, Uint8Array, or ArrayBuffer');
}

export function sortEntries(es: DirectoryEntry[]): DirectoryEntry[] {
	return es.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

// Path helpers deliberately retain the portable, root-relative path contract.
export const pathSeparator = '/';

export function joinPath(...parts: string[]) {
	return parts.flatMap(part => splitPath(part)).join('/');
}

export function baseName(rel: string, suffix = '') {
	const name = splitPath(rel).at(-1) ?? '';
	return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

export function directoryName(rel: string) {
	return splitPath(rel).slice(0, -1).join('/');
}

export function extension(rel: string) {
	const name  = baseName(rel);
	const index = name.lastIndexOf('.');
	return index > 0 ? name.slice(index) : '';
}

export function hasErrorCode(err: unknown, code: string): boolean {
	return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}

export function hasErrorName(err: unknown, name: string): boolean {
	return typeof err === 'object' && err !== null && 'name' in err && err.name === name;
}

export function isMissing(err: unknown): boolean {
	return hasErrorCode(err, 'ENOENT') || hasErrorName(err, 'NotFoundError');
}

export function unsupported(operation: string) {
	const err = Object.assign(new Error(`${operation} is not supported in this environment`), { code: 'ENOTSUP' });
	err.name = 'NotSupportedError';
	return err;
}

/** Shared convenience API. I/O always returns a Promise; path helpers are synchronous. */
export abstract class FileSystemBase {
	abstract readonly name: string;
	abstract readonly capabilities: Capabilities;
	abstract isDirectory(rel?: string): Promise<boolean>;
	abstract isFile(rel: string): Promise<boolean>;
	abstract isWritable(rel?: string): Promise<boolean>;
	abstract readDirectory(rel?: string): Promise<DirectoryEntry[]>;
	abstract readFile(rel: string): Promise<Uint8Array>;
	abstract readText(rel: string): Promise<string>;
	abstract writeFile(rel: string, data: FileData): Promise<void>;
	abstract createDirectory(rel: string): Promise<void>;
	abstract createTempDirectory(prefix?: string): Promise<string>;
	abstract makeDirectory(rel: string, options?: RecursiveOptions): Promise<void>;
	abstract remove(rel: string, options?: RecursiveOptions): Promise<void>;
	abstract stat(rel?: string): Promise<FileInfo>;

	protected commonPath(rel: string, allowRoot = true): string {
		return splitPath(rel, allowRoot).join('/');
	}

	private byteCount(value: number): void {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new RangeError('Expected a non-negative safe integer');
		}
	}

	async readRange(rel: string, offset: number, length: number): Promise<Uint8Array> {
		this.byteCount(offset); this.byteCount(length);
		const bytes = await this.readFile(this.commonPath(rel, false));
		return bytes.slice(offset, offset + Math.min(length, bytes.length));
	}

	async writeAt(rel: string, offset: number, data: FileData): Promise<void> {
		this.byteCount(offset);
		const patch = toBytes(data);
		this.byteCount(offset + patch.length);
		const tar  = this.commonPath(rel, false);
		const orig = await this.readFile(tar);
		if (!patch.length) return;
		const bytes = new Uint8Array(Math.max(orig.length, offset + patch.length));
		bytes.set(orig); bytes.set(patch, offset);
		await this.writeFile(tar, bytes);
	}

	async truncate(rel: string, size: number): Promise<void> {
		this.byteCount(size);
		const tar  = this.commonPath(rel, false);
		const orig = await this.readFile(tar);
		if (orig.length === size) return;
		const bytes = new Uint8Array(size);
		bytes.set(orig.subarray(0, size));
		await this.writeFile(tar, bytes);
	}

	private copyPaths(from: string, to: string): [string, string] {
		const src = this.commonPath(from, false), tar = this.commonPath(to, false);
		const a = src.toLowerCase(), b = tar.toLowerCase();
		if (a === b || b.startsWith(a + '/')) {
			throw new Error('Destination must not match the source or be inside it');
		}
		return [src, tar];
	}

	async copyFile(from: string, to: string): Promise<void> {
		const [src, tar] = this.copyPaths(from, to);
		await this.writeFile(tar, await this.readFile(src));
	}

	async copyDirectory(from: string, to: string): Promise<void> {
		const [src, tar] = this.copyPaths(from, to);
		// Enumerate before creating the destination; do not merge directories.
		const es = await this.walk(src);
		await this.createDirectory(tar);

		for (const e of es) {
			const dest = joinPath(tar, e.path.slice(src.length + 1));
			if (e.kind === 'directory') {
				await this.createDirectory(dest);
			} else {
				await this.copyFile(e.path, dest);
			}
		}
	}

	async walk(rel = ''): Promise<WalkEntry[]> {
		const res: WalkEntry[] = [];
		const visit = async (directory: string): Promise<void> => {
			for (const entry of await this.readDirectory(directory)) {
				const path = joinPath(directory, entry.name);
				res.push({ ...entry, path });
				if (entry.kind === 'directory') {
					await visit(path);
				}
			}
		};
		await visit(this.commonPath(rel));
		return res;
	}

	async glob(pat: string, rel = ''): Promise<WalkEntry[]> {
		// Deliberately small, case-sensitive syntax: *, ?, and whole-segment **.
		if (typeof pat !== 'string') {
			throw new TypeError('Pattern must be a string');
		}
		const parts = pat.split('/');
		if (parts.some(p => !p || p === '.' || p === '..' || /[\\\[\]{}]/u.test(p) || (p.includes('**') && p !== '**'))) {
			throw new TypeError('Expected a relative pattern using *, ?, or whole-segment **');
		}
		const expression = parts.map((part, i) => part === '**'
			? (i === parts.length - 1 ? '.*' : '(?:[^/]+/)*')
			: part.replace(/[.+^$()|]/g, '\\$&').replaceAll('*', '[^/]*').replaceAll('?', '[^/]') + (i === parts.length - 1 ? '' : '/')).join('');
		const match = new RegExp('^' + expression + '$', 'u');
		const root  = this.commonPath(rel);
		return (await this.walk(root)).filter(entry => match.test(root ? entry.path.slice(root.length + 1) : entry.path));
	}

	get pathSeparator(): string {
		return pathSeparator;
	}

	joinPath(...parts: string[]) {
		return joinPath(...parts);
	}

	baseName(rel: string, suffix?: string) {
		return baseName(rel, suffix);
	}

	directoryName(rel: string) {
		return directoryName(rel);
	}

	extension(rel: string) {
		return extension(rel);
	}

	async exists(rel = '') {
		try {
			await this.isDirectory(rel);
			return true;
		} catch (e) {
			if (isMissing(e)) return false;
			throw e;
		}
	}

	async listDirectory(rel = '') {
		return (await this.readDirectory(rel)).map(entry => entry.name);
	}

	async writeText(rel: string, text: string) {
		if (typeof text !== 'string') {
			throw new TypeError('Text must be a string');
		}
		await this.writeFile(rel, text);
	}

	async writeTextAsync(rel: string, text: string) {
		await this.writeText(rel, text);
	}

	async readTextAsync(rel: string) {
		splitPath(rel, false);
		try {
			return await this.readText(rel);
		} catch {
			return undefined;
		}
	}

	async readTextOrNull(rel: string) {
		splitPath(rel, false);
		try {
			return await this.readText(rel);
		} catch {
			return null;
		}
	}

	async copyTextFile(from: string, to: string, dest: FileSystemBase = this) {
		splitPath(from, false);
		splitPath(to, false);
		try {
			const text   = await this.readText(from);
			const parent = directoryName(to);
			if (parent) {
				await dest.makeDirectory(parent, { recursive: true });
			}
			await dest.writeText(to, text);
			return true;
		} catch {
			return false;
		}
	}

	async removeDirectoryTree(rel: string) {
		splitPath(rel, false);
		try {
			if (!(await this.isDirectory(rel))) {
				throw new Error('Not a directory');
			}
			await this.remove(rel, { recursive: true });
		} catch (e) {
			if (!isMissing(e)) throw e;
		}
	}

	moduleDirectory(_url: string | URL): string {
		throw unsupported('moduleDirectory');
	}

	async toFileURL(_rel: string): Promise<string> {
		throw unsupported('toFileURL');
	}

	async executionFileURL(rel: string) {
		return this.toFileURL(rel);
	}

	async hideDirectory(_rel: string): Promise<void> {
		throw unsupported('hideDirectory');
	}

}

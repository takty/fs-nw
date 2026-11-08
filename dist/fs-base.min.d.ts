export interface DirectoryEntry {
    name: string;
    kind: 'file' | 'directory';
}
export interface WalkEntry extends DirectoryEntry {
    path: string;
}
export type FileInfo = {
    kind: 'file';
    size: number;
} | {
    kind: 'directory';
    size: null;
};
export type FileData = string | Uint8Array | ArrayBuffer;
export interface RecursiveOptions {
    recursive?: boolean;
}
export interface Capabilities {
    moduleDirectory: boolean;
    fileURL: boolean;
    hideDirectory: boolean;
}
export declare function splitPath(path: string, allowRoot?: boolean): string[];
export declare function toBytes(data: FileData): Uint8Array;
export declare function sortEntries(entries: DirectoryEntry[]): DirectoryEntry[];
export declare const pathSeparator = "/";
export declare function joinPath(...parts: string[]): string;
export declare function baseName(relative: string, suffix?: string): string;
export declare function directoryName(relative: string): string;
export declare function extension(relative: string): string;
export declare function hasErrorCode(error: unknown, code: string): boolean;
export declare function hasErrorName(error: unknown, name: string): boolean;
export declare function isMissing(error: unknown): boolean;
export declare function unsupported(operation: string): Error & {
    code: string;
};
/** Shared convenience API. I/O always returns a Promise; path helpers are synchronous. */
export declare abstract class FileSystemBase {
    abstract readonly name: string;
    abstract readonly capabilities: Capabilities;
    abstract isDirectory(relative?: string): Promise<boolean>;
    abstract isFile(relative: string): Promise<boolean>;
    abstract isWritable(relative?: string): Promise<boolean>;
    abstract readDirectory(relative?: string): Promise<DirectoryEntry[]>;
    abstract readFile(relative: string): Promise<Uint8Array>;
    abstract readText(relative: string): Promise<string>;
    abstract writeFile(relative: string, data: FileData): Promise<void>;
    abstract createDirectory(relative: string): Promise<void>;
    abstract createTempDirectory(prefix?: string): Promise<string>;
    abstract makeDirectory(relative: string, options?: RecursiveOptions): Promise<void>;
    abstract remove(relative: string, options?: RecursiveOptions): Promise<void>;
    abstract stat(relative?: string): Promise<FileInfo>;
    protected commonPath(relative: string, allowRoot?: boolean): string;
    private byteCount;
    readRange(relative: string, offset: number, length: number): Promise<Uint8Array>;
    writeAt(relative: string, offset: number, data: FileData): Promise<void>;
    truncate(relative: string, size: number): Promise<void>;
    private copyPaths;
    copyFile(from: string, to: string): Promise<void>;
    copyDirectory(from: string, to: string): Promise<void>;
    walk(relative?: string): Promise<WalkEntry[]>;
    glob(pattern: string, relative?: string): Promise<WalkEntry[]>;
    get pathSeparator(): string;
    joinPath(...parts: string[]): string;
    baseName(relative: string, suffix?: string): string;
    directoryName(relative: string): string;
    extension(relative: string): string;
    exists(relative?: string): Promise<boolean>;
    listDirectory(relative?: string): Promise<string[]>;
    writeText(relative: string, text: string): Promise<void>;
    writeTextAsync(relative: string, text: string): Promise<void>;
    readTextAsync(relative: string): Promise<string | undefined>;
    readTextOrNull(relative: string): Promise<string | null>;
    copyTextFile(from: string, to: string, dest?: FileSystemBase): Promise<boolean>;
    removeDirectoryTree(relative: string): Promise<void>;
    moduleDirectory(_url: string | URL): string;
    toFileURL(_relative: string): Promise<string>;
    executionFileURL(relative: string): Promise<string>;
    hideDirectory(_relative: string): Promise<void>;
}

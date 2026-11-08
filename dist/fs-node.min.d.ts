import { FileSystemBase } from './fs-base.min.js';
import type { FileData, RecursiveOptions, DirectoryEntry, FileInfo } from './fs-base.min.js';
export { joinPath, baseName, directoryName, extension, pathSeparator } from './fs-base.min.js';
/** With a root, paths are portable and root-relative. Without one, use native OS paths. */
export type NodePickerOptions = Record<string, unknown>;
export type NodePicker = (options: NodePickerOptions & {
    root: string | null;
}) => string | null | undefined | Promise<string | null | undefined>;
export interface NodeFileSystemOptions {
    pickFile?: NodePicker;
    pickDirectory?: NodePicker;
}
export declare class NodeFileSystem extends FileSystemBase {
    #private;
    constructor(root?: string | null, { pickFile, pickDirectory }?: NodeFileSystemOptions);
    get name(): string;
    protected commonPath(relative: string, allowRoot?: boolean): string;
    stat(relative?: string): Promise<FileInfo>;
    get pathSeparator(): string;
    joinPath(...parts: string[]): string;
    baseName(value: string, suffix?: string): string;
    directoryName(value: string): string;
    extension(value: string): string;
    get capabilities(): {
        moduleDirectory: boolean;
        fileURL: boolean;
        hideDirectory: boolean;
    };
    isDirectory(relative?: string): Promise<boolean>;
    isFile(relative: string): Promise<boolean>;
    isWritable(relative?: string): Promise<boolean>;
    createDirectory(relative: string): Promise<void>;
    createTempDirectory(prefix?: string): Promise<string>;
    moduleDirectory(url: string | URL): string;
    toFileURL(relative: string): Promise<string>;
    executionFileURL(relative: string): Promise<string>;
    hideDirectory(relative: string): Promise<void>;
    readDirectory(relative?: string): Promise<DirectoryEntry[]>;
    readFile(relative: string): Promise<Uint8Array<ArrayBuffer>>;
    readText(relative: string): Promise<string>;
    readTextAsync(relative: string): Promise<string | undefined>;
    readTextOrNull(relative: string): Promise<string | null>;
    copyTextFile(from: string, to: string, dest?: FileSystemBase): Promise<boolean>;
    removeDirectoryTree(relative: string): Promise<void>;
    writeFile(relative: string, data: FileData): Promise<void>;
    makeDirectory(relative: string, { recursive }?: RecursiveOptions): Promise<void>;
    remove(relative: string, { recursive }?: RecursiveOptions): Promise<void>;
    pickFile(options?: NodePickerOptions): Promise<string | null>;
    pickDirectory(options?: NodePickerOptions): Promise<string | null>;
}
export default NodeFileSystem;

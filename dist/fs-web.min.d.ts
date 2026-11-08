import { FileSystemBase } from './fs-base.min.js';
import type { FileData, RecursiveOptions, DirectoryEntry, FileInfo } from './fs-base.min.js';
export { joinPath, baseName, directoryName, extension, pathSeparator } from './fs-base.min.js';
export type PickerStart = FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
export interface DirectoryPickerOptions {
    id?: string;
    startIn?: PickerStart;
    mode?: 'read' | 'readwrite';
}
export interface OpenFilePickerOptions {
    id?: string;
    startIn?: PickerStart;
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: {
        description?: string;
        accept: Record<string, string | string[]>;
    }[];
}
/** File System Access adapter. */
export declare class WebFileSystem extends FileSystemBase {
    #private;
    constructor(root: FileSystemDirectoryHandle);
    /** Return a structured-cloneable handle for worker access. */
    getDirectoryHandle(): FileSystemDirectoryHandle;
    get name(): string;
    get capabilities(): {
        moduleDirectory: boolean;
        fileURL: boolean;
        hideDirectory: boolean;
    };
    isDirectory(relative?: string): Promise<boolean>;
    stat(relative?: string): Promise<FileInfo>;
    isFile(relative: string): Promise<boolean>;
    isWritable(relative?: string): Promise<boolean>;
    createDirectory(relative: string): Promise<void>;
    createTempDirectory(prefix?: string): Promise<string>;
    static open(options?: DirectoryPickerOptions): Promise<WebFileSystem | null>;
    readDirectory(relative?: string): Promise<DirectoryEntry[]>;
    readFile(relative: string): Promise<Uint8Array<ArrayBuffer>>;
    readText(relative: string): Promise<string>;
    writeFile(relative: string, data: FileData): Promise<void>;
    makeDirectory(relative: string, { recursive }?: RecursiveOptions): Promise<void>;
    remove(relative: string, { recursive }?: RecursiveOptions): Promise<void>;
    pickFile(options?: OpenFilePickerOptions): Promise<string | null>;
    pickDirectory(options?: DirectoryPickerOptions): Promise<string | null>;
}
export default WebFileSystem;

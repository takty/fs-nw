# File System

A shared filesystem API for Node.js and the Web, distributed as minified ES modules with TypeScript declarations. No runtime npm dependencies are required.

## Files

Keep these files together:

```text
fs-base.min.js       Shared base class and path helpers
fs-node.min.js       NodeFileSystem (imports fs-base.min.js)
fs-web.min.js        WebFileSystem (imports fs-base.min.js)
fs-base.min.d.ts     Shared type declarations
fs-node.min.d.ts     Node type declarations
fs-web.min.d.ts      Web type declarations
package.json        ES module and package export metadata
```

Copy `dist/` into your application, serve it as static files, or install it as a local package. This guide stays in the source repository and is not included in `dist/`. The source repository and its build dependencies are not needed at runtime. The modules target ES2022. Browser TypeScript projects need the DOM library enabled.

## Node.js

```js
import { NodeFileSystem } from './dist/fs-node.min.js';

const fs = new NodeFileSystem('/absolute/path/to/root');
await fs.makeDirectory('notes');
await fs.writeText('notes/hello.txt', 'Hello');
console.log(await fs.readText('notes/hello.txt'));
```

With no root argument, `NodeFileSystem` accepts native OS paths. With a root, it accepts portable root-relative paths and rejects traversal through symbolic links.

## Web

```js
import { WebFileSystem } from './dist/fs-web.min.js';

document.querySelector('button').addEventListener('click', async () => {
  const fs = await WebFileSystem.open();
  if (!fs) return; // Picker cancelled.
  await fs.makeDirectory('notes');
  await fs.writeText('notes/hello.txt', 'Hello');
  console.log(await fs.readText('notes/hello.txt'));
});
```

Directory selection requires a supporting browser, HTTPS or localhost, and user activation. An existing directory handle can be passed to `new WebFileSystem(handle)` instead.

When installed as a package, use `fs-nw/node`, `fs-nw/web`, or `fs-nw/base`. Each export includes its TypeScript declarations. The Node and Web classes also have default exports.

## Shared API

All filesystem operations return promises. Path helpers and properties are synchronous.

| API | Result or behavior |
| --- | --- |
| `name` | Root display name; empty in rootless Node mode. |
| `capabilities` | Support flags for `moduleDirectory`, `fileURL`, and `hideDirectory`. |
| `exists(path = '')` | Whether an entry exists. |
| `stat(path = '')` | `{ kind: 'file', size }` in bytes, or `{ kind: 'directory', size: null }`. No timestamps or OS-specific metadata. |
| `isDirectory(path = '')`, `isFile(path)` | Entry type. |
| `isWritable(path = '')` | Node owner-write mode bit or Web read/write permission; not a guarantee that a write succeeds. |
| `readDirectory(path = '')` | Sorted `{ name, kind: 'file' \| 'directory' }[]`. |
| `listDirectory(path = '')` | Sorted entry names. |
| `readFile(path)` | `Uint8Array`. |
| `readRange(path, offset, length)` | Read a byte range; shorten at EOF, or return an empty array past EOF. |
| `readText(path)` | UTF-8 text. |
| `writeFile(path, data)` | Create or overwrite using a string, `Uint8Array`, or `ArrayBuffer`. |
| `writeAt(path, offset, data)` | Replace bytes in an existing file, preserving other bytes and zero-filling any gap. Empty data leaves the file unchanged. |
| `truncate(path, size)` | Resize an existing file, preserving its prefix and zero-filling extensions. |
| `copyFile(from, to)` | Copy bytes to the exact destination path, overwriting an existing file. Parent directories must exist. |
| `copyDirectory(from, to)` | Copy enumerable regular files and directories recursively to a new destination directory. No merge or metadata preservation. |
| `walk(path = '')` | Return `{ name, kind, path }[]` in sorted depth-first order. Paths are relative to the filesystem root; the starting directory is excluded. |
| `glob(pattern, path = '')` | Filter `walk(path)` using case-sensitive `*`, `?`, and whole-segment `**`. Patterns are relative to `path`; results keep root-relative paths. Dotfiles are included. |
| `writeText(path, text)`, `writeTextAsync(path, text)` | Write a string. |
| `readTextAsync(path)`, `readTextOrNull(path)` | Read text, returning `undefined` or `null` on read failure. |
| `createDirectory(path)` | Create a new directory; fail if it exists. |
| `makeDirectory(path, { recursive = false })` | Create a directory, optionally including parents; accept an existing directory. |
| `createTempDirectory(prefix = 'tmp-')` | Create a uniquely named directory. |
| `remove(path, { recursive = false })` | Remove a file or directory. |
| `removeDirectoryTree(path)` | Recursively remove a directory; ignore a missing target. |
| `copyTextFile(from, to, destination = this)` | Copy UTF-8 text, creating parents; return success as a boolean. |
| `pickFile(options)`, `pickDirectory(options)` | Selected path, or `null` if cancelled. |
| `pathSeparator`, `joinPath`, `baseName`, `directoryName`, `extension` | Path helpers. |

Node pickers require callbacks supplied as the constructor's second argument. Callbacks receive `{ ...options, root }` and return an absolute path or `null`, directly or through a promise.

`moduleDirectory`, `toFileURL`, and `executionFileURL` are Node-specific. `hideDirectory` requires Windows. Unsupported Web operations throw. `WebFileSystem.getDirectoryHandle()` returns the original handle.

## Path and operation limits

The new `stat`, byte-range, copy, traversal, and glob APIs require a configured root in Node.js. Their supported domain is portable paths to regular files and directories. Glob syntax is shared between environments and does not use Node's native glob implementation; brackets, braces, and backslash escapes are unsupported.

Byte offsets, lengths, and sizes must be non-negative safe integers. `readRange`, `writeAt`, and `truncate` currently read the entire file into memory. `writeAt` and `truncate` use a shared read/modify/write implementation, not native in-place updates. They reject missing files. They do not promise atomic replacement, concurrent-writer isolation, or preservation of metadata. Native append, move/rename, streams, and metadata mutation are not provided as common APIs.

Copies reject the root as a source or destination, case-insensitive source/destination equality, and destinations below the source. Directory copies are not transactions: a failure can leave a partial destination. The source is never deleted. Only entries exposed by the adapter are copied. These operations share data-level behavior for sequential access; they do not make OS permissions, native I/O errors, crash behavior, or concurrent changes identical.

Root-relative paths use `/`, and the empty string represents the root. Absolute paths, `.`, `..`, empty segments, backslashes, Windows reserved names and characters, and trailing dots or spaces are rejected. Write operations do not automatically create parent directories. Rootless Node mode uses native OS path rules instead.

Writes overwrite existing files. Deletions affect real files. UTF-8 decoding replaces invalid byte sequences. Error types are not normalized across environments. Node directory listings omit symbolic links in rooted mode and omit special files. Path checks do not isolate operations from concurrent filesystem changes or hard links; use trusted local directories.

## Terminal demos

Run `yarn dev` for the Web demo, or `yarn terminal /path/to/root` for the Node demo. Both use the built library. The terminal parses commands, resolves its working directory, formats output, and calls library APIs; it has no separate implementation of file copying, moving, or appending.

| Command | Library operation |
| --- | --- |
| `pwd`, `cd [path]` | Display or change the demo's working directory; `cd` checks `isDirectory`. |
| `ls [-a] [path]` | `readDirectory` / `isDirectory`. |
| `tree [path]` | `walk`, formatted as an indented list. |
| `cat file...` | `readText`. |
| `echo [-n] text...` | Produce text output. |
| `mkdir [-p] dir...` | `createDirectory` / `makeDirectory`. |
| `cp [-r] source dest` | `copyFile` / `copyDirectory`. A directory destination receives the source basename. |
| `rm [-r] [-f] path...`, `rmdir dir...` | `remove`, with command-specific argument checks. |
| `clear`, `exit` | Clear the display or end the demo session. |

Use `> file` after `pwd`, `ls`, `tree`, `cat`, or `echo` to save output with `writeText`. `mv`, `touch`, and `>>` are not supported. Quote paths containing spaces. Use `--` before arguments starting with `-`. The demo has no pipes, variable expansion, wildcard expansion, or external program execution.

Build with `yarn build` and verify with `yarn test` and `yarn test:web`.

import { splitPath } from '../dist/fs-base.min.js';

// Quoted operators remain ordinary words. This is not a full shell parser.
export function tokenize(line) {
	const tokens = [];
	let word = '', started = false, quote = null;
	const flush = () => { if (started) tokens.push({ word }); word = ''; started = false; };
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '\\' && quote !== "'") {
			if (++i === line.length) throw new Error('Expected a character after the backslash');
			word += line[i]; started = true;
		} else if (quote) {
			if (c === quote) quote = null;
			else word += c;
		} else if (c === '"' || c === "'") { quote = c; started = true; }
		else if (/\s/u.test(c)) flush();
		else if (c === '>') {
			flush();
			if (line[i + 1] === '>') throw new Error('Append redirection is not supported');
			const op = '>';
			tokens.push({ op });
		} else if ('|;&<`'.includes(c)) throw new Error(`Unsupported operator: ${c}`);
		else { word += c; started = true; }
	}
	if (quote) throw new Error('Unterminated quote');
	flush();
	return tokens;
}

function options(words, allowed) {
	const flags = new Set(), args = [];
	let end = false;
	for (const word of words) {
		if (!end && word === '--') { end = true; continue; }
		if (!end && word.startsWith('-') && word !== '-') {
			for (const flag of word.slice(1)) {
				if (!allowed.includes(flag)) throw new Error(`Unsupported option: -${flag}`);
				flags.add(flag);
			}
		} else args.push(word);
	}
	return { flags, args };
}

export class Terminal {
	constructor(fs) { this.fs = fs; this.cwd = ''; }
	get prompt() { return `/${this.cwd} $`; }
	resolve(value) {
		if (!value) throw new Error('Path must not be empty');
		const parts = value.startsWith('/') ? [] : this.cwd.split('/').filter(Boolean);
		for (const part of value.split('/')) {
			if (!part || part === '.') continue;
			if (part === '..') {
				if (!parts.length) throw new Error('Path is outside the root directory');
				parts.pop();
			} else { splitPath(part, false); parts.push(part); }
		}
		return parts.join('/');
	}
	protect(target) {
		const candidate = target.toLowerCase(), current = this.cwd.toLowerCase();
		if (!candidate || candidate === current || current.startsWith(candidate + '/')) {
			throw new Error('Cannot remove the root, current directory, or its ancestors');
		}
	}
	async execute(line) {
		const tokens = tokenize(line);
		if (!tokens.length) return { output: '' };
		let redirect;
		const index = tokens.findIndex(token => token.op);
		if (index !== -1) {
			if (index !== tokens.length - 2 || !tokens[index + 1].word) throw new Error('Expected a trailing > file');
			redirect = { op: tokens[index].op, path: this.resolve(tokens[index + 1].word) };
			tokens.splice(index);
		}
		const [command, ...words] = tokens.map(token => token.word);
		if (redirect && !['pwd', 'ls', 'tree', 'cat', 'echo'].includes(command)) throw new Error('Redirection is not supported for this command');
		const allowed = { ls: 'a', mkdir: 'p', cp: 'rR', rm: 'rfR', echo: 'n' }[command] ?? '';
		const { args, flags } = options(words, allowed);
		const count = (min, max = min) => {
			if (args.length < min || args.length > max) throw new Error(`${command}: Invalid number of arguments`);
		};
		let output = '';
		switch (command) {
		case 'pwd': count(0); output = `/${this.cwd}\n`; break;
		case 'cd': {
			count(0, 1); const target = this.resolve(args[0] ?? '/');
			if (!(await this.fs.isDirectory(target))) throw new Error('Not a directory');
			this.cwd = target; break;
		}
		case 'ls': {
			count(0, 1); const target = this.resolve(args[0] ?? '.');
			if (await this.fs.isDirectory(target)) {
				output = (await this.fs.readDirectory(target)).filter(e => flags.has('a') || !e.name.startsWith('.'))
					.map(e => e.name + (e.kind === 'directory' ? '/' : '') + '\n').join('');
			} else output = target.split('/').at(-1) + '\n';
			break;
		}
		case 'tree': {
			count(0, 1); const target = this.resolve(args[0] ?? '.');
			const entries = await this.fs.walk(target);
			output = '/' + target + '\n';
			for (const entry of entries) {
				const local = target ? entry.path.slice(target.length + 1) : entry.path;
				output += '  '.repeat(local.split('/').length - 1) + entry.name + (entry.kind === 'directory' ? '/' : '') + '\n';
			}
			break;
		}
		case 'cat': count(1, Infinity); for (const arg of args) output += await this.fs.readText(this.resolve(arg)); break;
		case 'echo': output = args.join(' ') + (flags.has('n') ? '' : '\n'); break;
		case 'mkdir':
			count(1, Infinity);
			for (const arg of args) {
				const target = this.resolve(arg);
				if (flags.has('p')) { if (target) await this.fs.makeDirectory(target, { recursive: true }); }
				else await this.fs.createDirectory(target);
			}
			break;
		case 'cp': {
			count(2); const source = this.resolve(args[0]); let target = this.resolve(args[1]);
			if (await this.fs.exists(target) && await this.fs.isDirectory(target)) target = this.fs.joinPath(target, this.fs.baseName(source));
			if (await this.fs.isDirectory(source)) {
				if (!flags.has('r') && !flags.has('R')) throw new Error('Copying a directory requires -r');
				await this.fs.copyDirectory(source, target);
			} else await this.fs.copyFile(source, target);
			break;
		}
		case 'rm': case 'rmdir':
			count(command === 'rm' && flags.has('f') ? 0 : 1, Infinity);
			for (const arg of args) {
				const target = this.resolve(arg); this.protect(target);
				if (flags.has('f') && !(await this.fs.exists(target))) continue;
				const directory = await this.fs.isDirectory(target);
				const recursive = flags.has('r') || flags.has('R');
				if (command === 'rmdir' && !directory) throw new Error('Not a directory');
				if (command === 'rm' && directory && !recursive) throw new Error('Removing a directory requires -r');
				await this.fs.remove(target, { recursive });
			}
			break;
		case 'clear': count(0); return { output: '', clear: true };
		case 'exit': count(0); return { output: '', exit: true };
		default: throw new Error(`Command not found: ${command}`);
		}
		if (redirect) {
			await this.fs.writeText(redirect.path, output); output = '';
		}
		return { output };
	}
}

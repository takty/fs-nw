import { WebFileSystem } from '../../dist/fs-web.min.js';
import { Terminal } from '../terminal.js';
import './style.css';

const element = id => document.getElementById(id);
const input = element('command');
const output = element('output');
const open = element('open');
let terminal = null;
let history = [], position = 0, draft = '';

function print(text, kind = '') {
	const entry = document.createElement('div');
	entry.className = kind;
	entry.textContent = text;
	output.append(entry);
	output.scrollTop = output.scrollHeight;
}
function ready() {
	input.disabled = !terminal;
	open.disabled = false;
	element('prompt').textContent = terminal?.prompt ?? '/ $';
	if (terminal) input.focus();
}
open.addEventListener('click', async () => {
	try {
		const pending = WebFileSystem.open();
		open.disabled = true; input.disabled = true;
		const fs = await pending;
		if (!fs) return;
		terminal = new Terminal(fs);
		history = []; position = 0; draft = ''; input.value = '';
		output.replaceChildren();
		element('root-name').textContent = fs.name;
		element('status').textContent = 'Connected';
	} catch (error) { print(`Error: ${error.message}`, 'error'); }
	finally { ready(); }
});
element('command-form').addEventListener('submit', async event => {
	event.preventDefault();
	if (!terminal || input.disabled || !input.value.trim()) return;
	const line = input.value;
	print(`${terminal.prompt} ${line}`, 'invocation');
	history.push(line); position = history.length; draft = '';
	input.value = ''; input.disabled = true; open.disabled = true;
	try {
		const result = await terminal.execute(line);
		if (result.clear) output.replaceChildren();
		if (result.output) print(result.output);
		if (result.exit) {
			terminal = null;
			element('root-name').textContent = 'Not selected';
			element('status').textContent = 'Disconnected';
		}
	} catch (error) { print(`Error: ${error.message}`, 'error'); }
	finally { ready(); }
});
input.addEventListener('keydown', event => {
	if (event.isComposing || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
	event.preventDefault();
	if (position === history.length) draft = input.value;
	position = Math.max(0, Math.min(history.length, position + (event.key === 'ArrowUp' ? -1 : 1)));
	input.value = position === history.length ? draft : history[position];
	input.setSelectionRange(input.value.length, input.value.length);
});
if (typeof globalThis.showDirectoryPicker !== 'function') {
	open.disabled = true;
	element('status').textContent = 'Directory selection is unavailable. Use a supported browser over HTTPS or localhost.';
}

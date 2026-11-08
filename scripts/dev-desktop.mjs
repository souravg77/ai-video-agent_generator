// Starts the Vite dev server, compiles the Electron main process, then launches Electron against it.
import { createServer } from 'vite';
import { spawn, execSync } from 'node:child_process';
import electronPath from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
execSync('npx tsc -p tsconfig.electron.json', { stdio: 'inherit' });
const child = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
child.on('close', async () => { await server.close(); process.exit(0); });

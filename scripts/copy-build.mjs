import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const buildDir = resolve(root, '.build');

async function copyTree(sourceDir, targetDir) {
	const entries = await readdir(sourceDir, { withFileTypes: true });
	await mkdir(targetDir, { recursive: true });
	for (const entry of entries) {
		const sourcePath = join(sourceDir, entry.name);
		const targetPath = join(targetDir, entry.name);
		if (entry.isDirectory()) {
			await copyTree(sourcePath, targetPath);
		} else if (entry.isFile()) {
			await copyFile(sourcePath, targetPath);
		}
	}
}

await rm(resolve(root, 'main.js'), { force: true });
await rm(resolve(root, 'main.js.map'), { force: true });
await rm(resolve(root, 'settings.js'), { force: true });
await rm(resolve(root, 'services.js'), { force: true });
await rm(resolve(root, 'repository.js'), { force: true });
await rm(resolve(root, 'types.js'), { force: true });
await rm(resolve(root, 'utils.js'), { force: true });
await rm(resolve(root, 'export.js'), { force: true });
await rm(resolve(root, 'views.js'), { force: true });
await rm(resolve(root, 'ui'), { recursive: true, force: true });
await copyTree(buildDir, root);
await rm(buildDir, { recursive: true, force: true });

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';

// Jco can emit either quote style for unions. Normalize before the CI diff.
const directory = 'work/wit-generated';
const config = await resolveConfig('package.json');
for (const entry of await readdir(directory, { recursive: true })) {
  if (!entry.endsWith('.d.ts')) continue;
  const path = join(directory, entry);
  await writeFile(path, await format(await readFile(path, 'utf8'), { ...config, filepath: path }));
}

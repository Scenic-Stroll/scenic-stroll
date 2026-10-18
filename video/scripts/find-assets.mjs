// Lists the files in video/assets/ so the video can show a labelled placeholder for anything
// still missing (Remotion can't check whether a file exists while it renders).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(root, 'assets')).filter((f) => !f.startsWith('.'));
fs.writeFileSync(
  path.join(root, 'src', 'assets-present.json'),
  JSON.stringify(files, null, 2) + '\n',
);
console.log(
  files.length ? `Assets found: ${files.join(', ')}` : 'No assets yet — placeholders will show.',
);

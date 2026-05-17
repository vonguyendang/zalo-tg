import fs from 'fs';
import path from 'path';

const filesToPatch = [
  'node_modules/zca-js/dist/cjs/apis/listen.cjs',
  'node_modules/zca-js/dist/apis/listen.js'
];

for (const file of filesToPatch) {
  const filePath = path.resolve(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Patch cmd == 501 (User messages)
    content = content.replace(/cmd == 501 && subCmd == 0/g, 'cmd == 501');
    // Patch cmd == 521 (Group messages)
    content = content.replace(/cmd == 521 && subCmd == 0/g, 'cmd == 521');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${file}`);
  }
}

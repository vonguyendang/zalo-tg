const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/telegram/handler.ts');
let content = fs.readFileSync(file, 'utf8');

// 1. Rewrite /search
// Find the block starting at `tgBot.command('search', ...)` and ending before `tgBot.command('addgroup', ...)`
const searchRegex = /(tgBot\.command\('search', async \(ctx\) => \{)([\s\S]*?)(  \}\);\n\n  \/\/ \/addgroup)/;
content = content.replace(searchRegex, (match, start, body, end) => {
    // Instead of completely rewriting, we'll replace usages of `currentApi` with a loop
    // But it's easier to just overwrite it entirely.
    return match; // Too complex to replace with regex without destroying. Let's write the whole block manually.
});

// Since the blocks are large and complex, let's use the tool `replace_file_content` block by block using precise boundaries.

const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data/topics.json', 'utf8'));

// Find duplicates
const map = {}; // accountId:type:zaloId -> topicId[]
for (const [topicId, entry] of Object.entries(data.topics)) {
    const key = `${entry.accountId || 'default'}:${entry.type}:${entry.zaloId}`;
    if (!map[key]) map[key] = [];
    map[key].push(Number(topicId));
}

let removed = 0;
for (const [key, topics] of Object.entries(map)) {
    if (topics.length > 1) {
        topics.sort((a, b) => b - a); // descending
        const keep = topics[0];
        const remove = topics.slice(1);
        console.log(`Key ${key} has duplicates: ${topics.join(', ')}. Keeping ${keep}`);
        for (const r of remove) {
            delete data.topics[String(r)];
            removed++;
        }
        data.zaloIndex[key] = keep;
    }
}

// Migrate any legacy keys in zaloIndex (e.g. just "12345") to "default:type:12345" if they still exist
// And ensure all entries have accountId
// ... Actually, let's see how many removed.
fs.writeFileSync('data/topics_fixed.json', JSON.stringify(data, null, 2));
console.log(`Removed ${removed} duplicates`);

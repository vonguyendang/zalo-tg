const queues = new Map();
function simulate(msg) {
  const q = queues.get(msg.id) || Promise.resolve();
  const next = q.then(async () => {
    console.log("Processing", msg.text);
    await new Promise(r => setTimeout(r, 100));
    console.log("Done", msg.text);
  });
  queues.set(msg.id, next);
}
simulate({id: '1', text: 'hello'});
simulate({id: '1', text: 'world'});

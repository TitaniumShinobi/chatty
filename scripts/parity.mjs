import { ConversationCore } from '../src/engine/ConversationCore.ts';
import { MemoryStore } from '../src/engine/memory/MemoryStore.ts';

async function run(label) {
  const memory = new MemoryStore();
  const core = new ConversationCore({ memory });
  const seq = ["hello", "you don't have memory?", "monday, confirm tether"];
  const outs = [];
  for (const s of seq) {
    memory.append(label, s);
    outs.push(await core.process(s, memory.getContext(label)));
  }
  return outs;
}

const web = await run('web');
const cli = await run('cli');
console.log(JSON.stringify({ web, cli, equal: JSON.stringify(web)===JSON.stringify(cli) }, null, 2));

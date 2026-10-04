// One forced tick from the command line: npm run tick
import { tick } from '../lib/app.js';
import { getStore } from '../lib/store.js';
const r = await tick({ force: true });
console.log(JSON.stringify(r, null, 2));
getStore().flush?.();
process.exit(0);

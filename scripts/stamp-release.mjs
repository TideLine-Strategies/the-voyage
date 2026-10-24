// Every Wrangler build, including automatic main builds, stamps its own asset bundle.
import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Exact Git build revision required');
await fs.writeFile('public/__build.json',JSON.stringify({commit,product:'voyage'}));
console.log('Stamped Voyage build '+commit);

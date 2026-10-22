// Policy edits are reviewed Git changes; runtime lessons cannot rewrite these gates.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const steps=['research','scripting','capture','editing','approval','posting','analytics'];
const docs=await Promise.all(steps.map(async step=>{const instructions=await fs.readFile('docs/content-agents/'+step+'.md','utf8'),version=/^Version: (.+)$/m.exec(instructions)?.[1];if(!version)throw Error('Policy version missing: '+step);return {step,version,sha256:createHash('sha256').update(instructions).digest('hex'),instructions}}));
await fs.writeFile('src/content-agent-docs.js','export const AGENT_DOCS = '+JSON.stringify(docs,null,2)+';\n');

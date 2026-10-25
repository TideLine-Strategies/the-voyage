import fs from 'node:fs/promises';
import path from 'node:path';
// npm executable links are relative. Preserve them instead of resolving them
// back into the temporary source worktree during fs.cp.
export async function copyCompanyDependencies(source,destination){
 await fs.cp(source,destination,{recursive:true,verbatimSymlinks:true});
 const executable=await fs.realpath(path.join(destination,'.bin/wrangler'));
 const root=await fs.realpath(destination),relative=path.relative(root,executable);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Company runtime CLI must be independent of its source');
}

"""Read every tracked byte; emit coverage and review candidates, never source secrets.
Lexical candidates are not findings. Semantic review and reproductions decide severity.
"""
import subprocess,pathlib,hashlib,json,re,collections,ast
base=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
patterns={'html_sink':r'innerHTML|insertAdjacentHTML|dangerouslySetInnerHTML','dynamic_execution':r'\beval\s*\(|new Function\s*\(','whole_response_buffer':r'await\s+\w+\.(?:arrayBuffer|text|json)\(','silent_catch':r'catch\s*(?:\([^)]*\))?\s*\{\s*(?:/\*[^*]*\*/\s*)?\}','process_launch':r'\b(?:spawn|execFileSync|execSync|subprocess\.)','unbounded_collection':r'SELECT .*FROM documents.*(?:LIMIT|WHERE collection)','timer':r'setInterval\(|setTimeout\('}
items=[]
for p in subprocess.check_output(['git','ls-files','-z']).decode().split('\0'):
 if not p:continue
 b=pathlib.Path(p).read_bytes();text=b.decode('utf8',errors='replace');category='first-party source'
 if p.endswith(('package-lock.json','bun.lock','.gen.ts')) or '/assets/' in p:category='generated/lockfile'
 elif '/docs/lovable-' in p:category='historical import evidence'
 elif p.startswith('prototypes/content-factory/src/components/ui/'):category='vendored UI wrapper'
 elif '/test/' in p or '/tests/' in p or p.startswith('tests/') or p.startswith('scripts/verify-'):category='test/verification'
 elif p.startswith('docs/') or p.endswith('.md'):category='documentation'
 elif p.startswith('migrations/'):category='migration'
 elif p.endswith(('.png','.jpg','.ico','.woff2')):category='binary asset'
 candidates={name:[i for i,line in enumerate(text.splitlines(),1) if re.search(pattern,line)] for name,pattern in patterns.items()};candidates={k:v for k,v in candidates.items() if v}
 if p.endswith('.py'):ast.parse(text,filename=p)
 items.append({'path':p,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'lines':0 if category=='binary asset' or p.endswith(('.woff2','.png','.jpg','.ico')) else b.count(b'\n')+int(bool(b) and not b.endswith(b'\n')),'category':category,'mechanicalReview':'all bytes read; lexical hazard scan; Python syntax parsed where applicable','semanticReview':'See REPORT.md coverage limits; inventory alone does not prove semantic line-by-line acceptance','candidates':candidates})
root=pathlib.Path('docs/audits/2026-11-01-astra');root.mkdir(parents=True,exist_ok=True);(root/'inventory.json').write_text(json.dumps({'baseline':base,'files':items},indent=2)+'\n')
print(json.dumps({'baseline':base,'files':len(items),'lines':sum(x['lines'] for x in items),'categories':dict(collections.Counter(x['category'] for x in items))}))

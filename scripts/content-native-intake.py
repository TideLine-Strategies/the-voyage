"""Import only a server-approved Factory package into the existing native queue."""
import json,sys,datetime as dt,hashlib
from pathlib import Path
ROOT=Path.home()/'.stewartos/automations/wonplace-social'
sys.path.insert(0,str(ROOT))
from social import Queue
from voyage_authority import factory_authorized
manifest=json.loads(Path(sys.argv[1]).read_text());q=Queue();created=q.ingest(manifest)
if len(created)!=1:raise ValueError('Exactly one explicit brand required')
sid=created[0]['source_id'];rows=[r for r in q.listing() if r['source_id']==sid]
for row in rows:
 if not factory_authorized(q,q.row(row['id']),True):raise ValueError('Saved named approval is no longer current')
 if row['state'] in ('proposed','held','ready'):
  q.approve(row['id'],q.config['brands'][row['brand']]['authority_id']);q.schedule(row['id'],dt.datetime.now(dt.timezone.utc).isoformat())
print(json.dumps({'source_id':sid,'deliveries':len(rows),'duplicate':created[0].get('duplicate',False)}))

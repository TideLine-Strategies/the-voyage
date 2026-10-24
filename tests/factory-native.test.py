import sys,json,tempfile,os,hmac,hashlib,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
from voyage_authority import factory_authorized,CACHE
class DB:
 def __init__(self,manifest):self.manifest=manifest
 def execute(self,*args):return self
 def fetchone(self):return {'manifest':json.dumps(self.manifest)}
class Q:
 def __init__(self,m):self.db=DB(m)
class Response:
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):return b'{"authorized":true}'
class Authority(unittest.TestCase):
 def test_exact_authority_and_shared_signature_contract(self):
  a={'brand':'wonplace','itemId':'piece','approval':{'hash':'h'},'copy':'A real café — sample','mediaAssetId':'a'*64}
  m={'source':{'key':'voyage:piece:h'},'factory_approval':a};q=Q(m);row={'source_id':'source','brand':'wonplace','payload':json.dumps({'caption':a['copy'],'media':[{'sha256':a['mediaAssetId']}]})}
  with tempfile.TemporaryDirectory() as d:
   cfg=Path(d)/'config.json';cfg.write_text(json.dumps({'voyageOrigin':'https://voyage.tidelinestrats.com','secrets':{'tideline':'dummy-local-test-secret-not-production'}}));cfg.chmod(0o600)
   def verify(request,timeout):
    headers={k.lower():v for k,v in request.header_items()};text=request.data.decode();self.assertIn('café —',text)
    expected='\n'.join(['POST','/api/content-agent-source',headers['x-voyage-time'],headers['x-voyage-actor'],text]).encode()
    self.assertEqual(headers['x-voyage-signature'],hmac.new(b'dummy-local-test-secret-not-production',expected,hashlib.sha256).hexdigest());return Response()
   with patch.dict(os.environ,{'COMPANY_OPERATIONS_CONFIG':str(cfg)}),patch('voyage_authority.open_request',side_effect=verify):
    self.assertTrue(factory_authorized(q,row,True));row['payload']=json.dumps({'caption':'Changed','media':[{'sha256':a['mediaAssetId']}]});self.assertFalse(factory_authorized(q,row,True))
    row['payload']=json.dumps({'caption':a['copy'],'media':[{'sha256':'wrong'}]});self.assertFalse(factory_authorized(q,row,True))
if __name__=='__main__':unittest.main()

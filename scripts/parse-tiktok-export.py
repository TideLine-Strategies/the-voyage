#!/usr/bin/python3
"""Read only native TikTok ZIP/CSV exports. Never evaluate spreadsheet cells."""
import csv,datetime,hashlib,io,json,pathlib,re,sys,zipfile
kind,filename,file=sys.argv[1:]
if kind=='overview':
 match=re.fullmatch(r'Overview_(\d{4}-\d{2}-\d{2})_\d+_wonplaceapp\.zip',filename)
 if not match:raise ValueError('wrong_export_account')
 name='Overview.csv';start=datetime.date.fromisoformat(match[1])
elif kind=='content':
 if filename!='Content_wonplaceapp.zip':raise ValueError('wrong_export_account')
 name='Content.csv'
else:raise ValueError('wrong_export_kind')
payload=pathlib.Path(file).read_bytes()
if len(payload)>5_000_000:raise ValueError('export_too_large')
with zipfile.ZipFile(io.BytesIO(payload)) as archive:
 item=archive.getinfo(name)
 if item.file_size>2_000_000:raise ValueError('expanded_export_too_large')
 rows=list(csv.DictReader(io.StringIO(archive.read(name).decode('utf-8-sig'))))
def count(value):
 if not re.fullmatch(r'\d+',value):raise ValueError('noninteger_export_count')
 return int(value)
if kind=='overview':
 if len(rows)!=7:raise ValueError('incomplete_week')
 fields={'Video Views':'videoViews','Profile Views':'profileViews','Likes':'likes','Comments':'comments','Shares':'shares'}
 daily=[]
 for index,row in enumerate(rows):
  date=start+datetime.timedelta(days=index)
  expected=date.strftime('%B ')+str(date.day)
  if row['Date']!=expected:raise ValueError('unexpected_report_date')
  daily.append(dict(day=date.isoformat(),**{v:count(row[k]) for k,v in fields.items()}))
 result={'daily':daily,'overview':dict(start=daily[0]['day'],end=daily[-1]['day'],**{v:sum(row[v] for row in daily) for v in fields.values()})}
else:
 if len(rows)>100:raise ValueError('too_many_posts')
 posts=[]
 for row in rows:
  url=row['Video link'];match=re.fullmatch(r'https://www\.tiktok\.com/@wonplaceapp/video/(\d{15,25})',url)
  if not match:raise ValueError('wrong_post_account')
  posts.append(dict(id=match[1],url=url,title=row['Video title'][:600],postedLabel=row['Post time'],views=count(row['Total views']),likes=count(row['Total likes']),comments=count(row['Total comments']),shares=count(row['Total shares']),periodViews=None))
 result={'topPosts':posts}
result['filename']=filename;result['sha256']=hashlib.sha256(payload).hexdigest();print(json.dumps(result))

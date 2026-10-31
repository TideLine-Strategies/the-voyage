(function(){
 const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 let host,company,rail,layer,socket,retry,renew,expiry,observer,resize,frame,version=0,failures=0,tasks=[];
 function stopConnection(){clearTimeout(retry);clearTimeout(renew);if(socket){socket.onclose=null;socket.close();socket=null;}}
 function close(){version++;stopConnection();clearInterval(expiry);observer?.disconnect();resize?.disconnect();cancelAnimationFrame(frame);frame=null;rail?.remove();layer?.remove();host=null;tasks=[];}
 function position(){
  frame=null;if(!host?.isConnected)return;const base=host.getBoundingClientRect(),sx=base.width/(host.offsetWidth||base.width),sy=base.height/(host.offsetHeight||base.height);
  const visible=node=>{if(!node)return false;const r=node.getBoundingClientRect(),panel=node.closest('[data-ticket-detail],[data-ticket-list]'),clip=panel?.getBoundingClientRect()||base;return r.width>0&&r.height>0&&r.bottom>Math.max(base.top,clip.top)&&r.top<Math.min(base.bottom,clip.bottom)&&r.right>clip.left&&r.left<clip.right;};
  for(const task of tasks){const cursor=layer.querySelector('[data-task="'+task.taskId+'"]');if(!cursor)continue;
   const field=task.field&&host.dataset.collabSelected===task.ticket?host.querySelector('[data-ticket-detail] [name="'+task.field+'"]'):null,row=host.querySelector('[data-collab-ticket="'+task.ticket+'"]'),target=visible(field)?field:visible(row)?row:null;
   if(!target){cursor.hidden=true;continue;}const rect=target.getBoundingClientRect(),siblings=tasks.filter(t=>t.ticket===task.ticket).map(t=>t.taskId).sort(),offset=siblings.indexOf(task.taskId)*22;cursor.hidden=false;
   cursor.style.left=Math.max(0,Math.min(host.offsetWidth-180,(rect.left-base.left)/sx+12))+'px';cursor.style.top=Math.max(0,Math.min(host.offsetHeight-30,(rect.top-base.top)/sy+Math.min(rect.height/sy-8,18+offset)))+'px';
  }
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(position);}
 function render(){
  if(!host?.isConnected)return;
  tasks=tasks.filter(t=>t.expiresAt>Date.now());
  rail.replaceChildren();layer.replaceChildren();const heading=make('div',undefined,'collab-heading');heading.append(make('strong','Shared workspace'),make('span',tasks.length?tasks.length+' active task'+(tasks.length===1?'':'s'):'No active tasks','ticket-muted'));rail.append(heading);
  if(!tasks.length){rail.append(make('p','Task cursors appear here when agents read, edit or report progress.','ticket-muted'));return;}
  for(const task of tasks){
   const card=make('details',undefined,'collab-task');card.style.setProperty('--task-color',task.color);card.dataset.task=task.taskId;const summary=make('summary'),dot=make('span','','collab-dot');summary.append(dot,make('strong',task.label),make('span',task.status+(task.field?' · '+task.field:''),'collab-status'));card.append(summary);
   card.append(make('small',task.agent+' · '+task.owner+' · '+task.taskId+' · '+(task.origin==='coordinator'?'Coordinator progress; no field interaction reported':task.detail||'Independent task workspace'),'ticket-muted'));
   if(task.field){card.open=true;const draft=make('pre',undefined,'collab-draft');draft.setAttribute('aria-label',task.label+' draft for '+task.field);draft.append(document.createTextNode(task.draft.slice(0,task.caret)),make('span','│','collab-caret'),document.createTextNode(task.draft.slice(task.caret)));card.append(draft,make('small','Draft · not saved to the ticket','ticket-muted'));}
   if(task.status==='saved')card.append(make('p',task.detail||'Saved; reload the ticket to see the latest revision.'));
   if(task.status==='conflict')card.append(make('p','Ticket changed. The task draft is retained for reconciliation.','critical'));
   rail.append(card);
   const cursor=make('div',undefined,'collab-cursor');cursor.hidden=true;cursor.dataset.task=task.taskId;cursor.style.setProperty('--task-color',task.color);cursor.title=task.agent+' · '+task.taskId;cursor.append(make('span','➤','collab-pointer'),make('span',task.label,'collab-cursor-label'));layer.append(cursor);
  }
  schedule();
 }
 function accept(data){if(data.type!=='task-presence'||!Array.isArray(data.tasks))return;tasks=data.tasks.filter(t=>/^[a-f0-9]{12}$/.test(t.taskId)&&/^#[0-9a-f]{6}$/i.test(t.color)&&typeof t.label==='string'&&/^[0-9a-f-]{36}$/i.test(t.ticket)&&(!t.field||['title','description','steps','expected','actual','environment','links','labels','assignee','note'].includes(t.field)));render();}
 function connect(){if(!host?.isConnected||document.hidden)return;const mine=version,url=new URL('/api/ticket-collaboration/live?company='+company,location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(url);socket.onopen=()=>{failures=0;rail.dataset.connection='live';renew=setTimeout(()=>{stopConnection();connect();},55000);};socket.onmessage=e=>{if(mine!==version)return;try{accept(JSON.parse(e.data));}catch{rail.dataset.connection='error';}};socket.onclose=()=>{if(mine!==version||!host?.isConnected||document.hidden)return;rail.dataset.connection='reconnecting';clearTimeout(renew);retry=setTimeout(connect,Math.min(60000,2000*2**Math.min(failures++,5)));};socket.onerror=()=>{rail.dataset.connection='offline';};}
 function mount(root,product){if(host===root&&company===product&&rail?.isConnected)return;close();host=root;company=product;rail=make('aside',undefined,'ticket-collaboration');rail.setAttribute('aria-label','Live task collaboration');layer=make('div',undefined,'collab-cursors');layer.setAttribute('aria-hidden','true');host.append(rail,layer);render();observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['data-collab-selected','open','data-ticket-mode','data-codex-expanded']});resize=new ResizeObserver(schedule);resize.observe(host);resize.observe(rail);expiry=setInterval(()=>{if(!host?.isConnected){close();return;}if(tasks.some(t=>t.expiresAt<=Date.now()))render();},1000);connect();}
 document.addEventListener('visibilitychange',()=>{stopConnection();if(!document.hidden){render();connect();}});document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
 window.VoyageCollaboration={mount,close};
})();

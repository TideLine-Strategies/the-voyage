(function(){
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let busy=false,offset=0;
 async function call(path='',options={}){
  const response=await fetch('/api/tickets'+path,{credentials:'same-origin',cache:'no-store',...options,headers:{'content-type':'application/json'}});
  const data=await response.json();if(!response.ok)throw Error(data.message||data.error||'Tickets could not load.');return data;
 }
 window.loadCompanyTickets=async function(page=0){
  if(busy)return;busy=true;offset=page;
  const root=document.getElementById('companyTickets');root.textContent='Loading WonPlace tickets…';
  try{
   const data=await call('?offset='+page);
   root.innerHTML='<p>Original WonPlace records · Staff reports · Loaded '+escape(new Date().toLocaleString())+' · Refresh to check for changes.</p><button data-ticket-refresh>Refresh</button><div data-ticket-detail></div><div class="table-wrap"><table><thead><tr><th>Ticket</th><th>Report</th><th>Status</th><th>Reporter</th><th>Created</th></tr></thead><tbody>'+data.items.map(item=>'<tr><td><button data-ticket="'+escape(item.id)+'">'+escape(item.code)+'</button></td><td>'+escape(item.title)+'</td><td>'+escape(item.status)+'</td><td>'+escape(item.reporter)+'</td><td>'+escape(new Date(item.createdAt).toLocaleDateString())+'</td></tr>').join('')+'</tbody></table></div>'+(data.items.length?'':'<p>No staff tickets on this page.</p>')+(page?'<button data-ticket-prev>Previous page</button>':'')+(data.nextOffset!==null?'<button data-ticket-next>Next page</button>':'');
   root.querySelector('[data-ticket-refresh]').onclick=()=>window.loadCompanyTickets(offset);
   root.querySelector('[data-ticket-prev]')?.addEventListener('click',()=>window.loadCompanyTickets(Math.max(0,offset-100)));
   root.querySelector('[data-ticket-next]')?.addEventListener('click',()=>window.loadCompanyTickets(data.nextOffset));
   for(const button of root.querySelectorAll('[data-ticket]'))button.onclick=()=>detail(button.dataset.ticket);
  }catch(error){root.textContent=error.message;const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>window.loadCompanyTickets(offset);root.append(retry);}finally{busy=false;}
 };
 async function detail(id){
  const root=document.querySelector('[data-ticket-detail]');root.textContent='Loading ticket…';
  try{
   const {issue}=await call('/'+id);
   root.innerHTML='<article class="card"><h2>'+escape(issue.code)+' · '+escape(issue.title)+'</h2><p style="white-space:pre-wrap">'+escape(issue.description)+'</p><p>Page: '+escape(issue.currentPage)+'</p>'+issue.attachments.map((item,index)=>'<p><a href="/api/tickets/'+escape(id)+'/attachments/'+index+'" target="_blank" rel="noopener">Download '+escape(item.name)+'</a></p>').join('')+'<label>Status <select data-ticket-status>'+['open','in_progress','resolved'].map(status=>'<option '+(issue.status===status?'selected':'')+'>'+status+'</option>').join('')+'</select></label><button data-ticket-save>Save status</button><p data-ticket-result role="status"></p></article>';
   root.querySelector('[data-ticket-save]').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;const result=root.querySelector('[data-ticket-result]');
    try{const saved=await call('/'+id,{method:'PATCH',body:JSON.stringify({status:root.querySelector('select').value,expectedRevision:issue.revision})});issue.updatedAt=saved.issue.updatedAt;issue.revision=saved.issue.revision;result.textContent='Saved in WonPlace.';}catch(error){result.textContent=error.message;}finally{button.disabled=false;}
   };
  }catch(error){root.textContent=error.message;}
 }
})();

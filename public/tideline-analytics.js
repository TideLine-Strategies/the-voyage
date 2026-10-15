/* Editor-only analytics within the existing Admin workspace. */
(()=>{
  let busy=false;
  window.loadTideline=async function(){
    if(busy)return;busy=true;
    const root=document.getElementById('tdBody');root.replaceChildren(el('div','empty','Loading TideLine analytics…'));
    try{
      const response=await fetch('/api/tideline/analytics?days='+document.getElementById('tdDays').value,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Analytics could not load.');
      root.replaceChildren();
      root.append(adTiles([[data.traffic.sessions||0,'anonymous visit sessions'],[data.traffic.pageviews||0,'page views'],[data.audits.started||0,'retained audits started'],[data.audits.completed||0,'retained audits completed'],[data.operators.started||0,'retained app workspaces'],[data.moves.done||0,'moves marked done']]));
      const funnel=usageSection('Inquiries → CRM','Inquiries in the selected period. Importing creates or links an account, contact, and inquiry note; it sends no email. Exact email matches prevent repeated imports from making duplicate accounts.');
      if(!data.inquiries.length)funnel.append(el('div','empty','No website inquiries in this period.'));
      for(const inquiry of data.inquiries){
        const row=el('div','usec'),heading=el('h3',null,inquiry.business),detail=el('p',null,[inquiry.name,inquiry.email,inquiry.phone].filter(Boolean).join(' · '));
        row.append(heading,detail,el('p',null,inquiry.message),el('div','hint',new Date(inquiry.submitted_at).toLocaleString()+' · Email delivery: '+inquiry.notification_status));
        const button=el('button','btn',inquiry.oppId?'Linked to CRM':'Add to CRM');button.type='button';button.disabled=!!inquiry.oppId;
        button.onclick=async()=>{
          button.disabled=true;button.textContent='Saving…';
          try{
            const response=await fetch('/api/tideline/import',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({id:inquiry.id})});
            const result=await response.json();if(!response.ok)throw Error(result.error||'Import failed.');
            button.textContent='Linked to CRM';toast('Inquiry linked to CRM. Open Accounts to follow up.');
          }catch(error){button.disabled=false;button.textContent='Retry import';toast(error.message);}
        };
        row.append(button);funnel.append(row);
      }
      root.append(funnel);
      const p=data.pipeline;const pipeline=usageSection('Linked CRM pipeline · all time','Only accounts linked through this inquiry inbox; these are not total company sales. Contract value is recorded deal value, not collected cash.');
      pipeline.append(adTiles([[p.accounts||0,'linked accounts'],[p.advanced||0,'past prospecting'],[p.wonDeals||0,'won deals'],[new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(p.contractValue||0),'won contract value']]));root.append(pipeline);
      const traffic=usageSection('Traffic by day · UTC','Anonymous sessions can span several page views.');
      traffic.append(adTable('htbl',['Day','Sessions / page views'],data.daily.map(day=>{const row=el('div','row');row.append(el('span',null,day.day),cell(day.sessions+' / '+day.pageviews));return row;})));root.append(traffic);
      const sections=usageSection('Sections and referral sources','Counts begin when tracking is installed; no historical traffic is invented.');
      data.sections.forEach(item=>sections.append(el('p',null,item.page+': '+item.sessions+' sessions / '+item.events+' opens')));
      data.referrers.forEach(item=>sections.append(el('p',null,(item.host||'Direct / unavailable')+': '+item.events+' page views')));root.append(sections);
      root.append(el('p','hint',data.coverage.notes+' Audit retention: '+data.coverage.auditRetentionDays+' days. Inquiries shown: at most '+data.coverage.inquiriesLimitedTo+'. Last refreshed: '+new Date(data.asOf).toLocaleString()));
    }catch(error){root.replaceChildren(el('div','empty',error.message));}
    finally{busy=false;}
  };
  document.getElementById('tdDays').onchange=window.loadTideline;
  document.getElementById('tdRefresh').onclick=window.loadTideline;
})();

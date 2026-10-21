/* Editor-only analytics within the existing Admin workspace. */
(()=>{
  let busy=false;
  window.loadTideline=async function(){
    if(busy)return;busy=true;document.getElementById('tdDays').disabled=true;document.getElementById('tdRefresh').disabled=true;
    const root=document.getElementById('tdBody');root.replaceChildren(el('div','empty','Loading TideLine analytics…'));
    try{
      const response=await fetch('/api/tideline/analytics?days='+document.getElementById('tdDays').value,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Analytics could not load.');
      root.replaceChildren();
      root.append(adTiles([[data.traffic.sessions||0,'anonymous visit sessions'],[data.traffic.pageviews||0,'page views'],[data.audits.started||0,'retained audits started'],[data.audits.completed||0,'retained audits completed']]));
      const conversions=usageSection('Successful conversion steps',data.coverage.notes);
      if(data.conversions===null)conversions.append(el('p',null,'Conversion measurement is not installed on the website database yet.'));
      else {
        const labels={audit_started:'Audits started',audit_saved:'Conversations saved',contact_submitted:'Contact inquiries saved',waitlist_joined:'Waitlist signups saved'};
        for(const [kind,label] of Object.entries(labels)){const row=data.conversions.find(item=>item.kind===kind);conversions.append(el('p',null,label+': '+(row?.events||0)+' events / '+(row?.sessions||0)+' anonymous sessions'));}
      }
      root.append(conversions);
      const intake=usageSection('Contact inquiries and Loki waitlist','New signups link automatically. Retry pending records here; ambiguous matches need a CRM review. Linking sends no email or text. Launch waitlist consent does not authorize general outreach.');
      const leads=[...data.inquiries,...data.waitlist];
      if(!leads.length)intake.append(el('div','empty','No signups in this period.'));
      for(const inquiry of leads){
        const row=el('div','usec');
        row.append(el('h3',null,inquiry.kind==='contact'?inquiry.business:'Loki launch waitlist'),el('p',null,[inquiry.name,inquiry.email,inquiry.phone].filter(Boolean).join(' · ')));
        if(inquiry.message)row.append(el('p',null,inquiry.message));
        row.append(el('div','hint',new Date(inquiry.submitted_at).toLocaleString()+' · CRM: '+inquiry.syncStatus+(inquiry.notification_status?' · Email delivery: '+inquiry.notification_status:'')));
        if(inquiry.error)row.append(el('p','hint','Needs attention: '+inquiry.error.replaceAll('_',' ')));
        const button=el('button','btn',inquiry.syncStatus==='linked'?'Linked to CRM':'Retry CRM link');button.type='button';button.disabled=inquiry.syncStatus==='linked';
        button.onclick=async()=>{
          button.disabled=true;button.textContent='Linking…';
          try{const response=await fetch('/api/tideline/import',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({kind:inquiry.kind,id:inquiry.kind==='contact'?inquiry.id:inquiry.phone})});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'CRM link is pending.');button.textContent='Linked to CRM';toast('Linked. Open Accounts to follow up.');}
          catch(error){button.disabled=false;button.textContent='Retry CRM link';toast(error.message);}
        };
        row.append(button);intake.append(row);
      }
      root.append(intake);
      const p=data.pipeline;const pipeline=usageSection('Linked CRM pipeline · all time','Only accounts linked through this inquiry inbox; these are not total company sales. Contract value is recorded deal value, not collected cash.');
      pipeline.append(adTiles([[p.accounts||0,'linked accounts'],[p.advanced||0,'past prospecting'],[p.wonDeals||0,'won deals'],[new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(p.contractValue||0),'won contract value']]));root.append(pipeline);
      const traffic=usageSection('Traffic by day · UTC','Anonymous sessions can span several page views.');
      traffic.append(adTable('htbl',['Day','Sessions / page views'],data.daily.map(day=>{const row=el('div','row');row.append(el('span',null,day.day),cell(day.sessions+' / '+day.pageviews));return row;})));root.append(traffic);
      const sections=usageSection('Sections and referral sources','Counts begin when tracking is installed; no historical traffic is invented.');
      data.sections.forEach(item=>sections.append(el('p',null,item.page+': '+item.sessions+' sessions / '+item.events+' opens')));
      data.referrers.forEach(item=>sections.append(el('p',null,(item.host||'Direct / unavailable')+': '+item.events+' page views')));root.append(sections);
      root.append(el('p','hint',data.coverage.notes+' Leads shown: at most '+data.coverage.limit+' per source'+'. Last refreshed: '+new Date(data.asOf).toLocaleString()));
    }catch(error){root.replaceChildren(el('div','empty',error.message));}
    finally{busy=false;document.getElementById('tdDays').disabled=false;document.getElementById('tdRefresh').disabled=false;}
  };
  document.getElementById('tdDays').onchange=window.loadTideline;
  document.getElementById('tdRefresh').onclick=window.loadTideline;
if(!document.getElementById('adTideline').hidden)window.loadTideline();
})();

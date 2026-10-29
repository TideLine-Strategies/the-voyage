// Versioned: retained historical links do not retroactively hold old tickets.
export async function ticketResolutionBlocker(env,company,ticket){
 const {results}=await env.DB.prepare("SELECT data_json FROM documents WHERE collection=? AND id LIKE ? AND json_extract(data_json,'$.ticket')=? AND json_extract(data_json,'$.reportContract')=2").bind('company_ticket_tasks',company+':%',ticket.id).all();
 const tasks=results.map(r=>JSON.parse(r.data_json));if(!tasks.length)return null;
 const required=tasks.filter(t=>t.snapshot?.state!=='cancelled');
 if(!required.length){const cancelledAt=Math.max(...tasks.map(t=>(t.milestones||[]).filter(m=>m.kind==='cancelled').at(-1)?.at||0));return cancelledAt&&(ticket.workReports||[]).some(r=>r.at>=cancelledAt&&r.content?.checks?.trim())?null:'All linked work was cancelled. Record the final ticket decision instead of treating cancellation as a verified fix.';}
 for(const task of required){
  const s=task.snapshot;if(s?.state!=='complete')return 'Coordinator task '+task.taskId+' is not complete. Keep the ticket open until its work and acceptance are verified.';
  const completedAt=(task.milestones||[]).filter(m=>m.kind==='complete').at(-1)?.at;if(!completedAt)return 'Awaiting the completed coordinator milestone for task '+task.taskId+'.';
  if(s.delivery==='deploy'&&!s.liveAcceptance)return 'Task '+task.taskId+' requires an exact deployment and live acceptance receipt.';
  const after=Math.max(completedAt,s.delivery==='deploy'?s.liveAcceptance.at:0);
  const final=(ticket.workReports||[]).some(r=>r.content?.via==='coordinator-task'&&r.content.taskId===task.taskId&&r.content.commit===s.commit&&r.at>=after&&r.content.checks?.trim());
  if(!final)return 'Task '+task.taskId+' needs a final structured report after delivery and required live acceptance. Pre-release reports remain in its history.';
 }
 return null;
}

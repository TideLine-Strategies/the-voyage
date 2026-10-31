export function taskLabel(value){return String(value||'Untitled task').replace(/\b(?:ENG|ISS|BUG|TASK)-[a-f0-9]{4,}\b[\s:—–-]*/gi,'').replace(/\s{2,}/g,' ').trim()||'Untitled task';}
export function blockerForTask(task,now=Date.now()){
 const state=task.state,kind=state==='owner_lost'?'worker':task.failureKind||(['repair_required'].includes(state)?'release':null);
 if(!kind||!['repair_required','owner_lost','retry_wait'].includes(state))return null;
 const at=Math.floor((task.updated||0)*1000);if(!at||now-at>86400000)return null;
 const guidance={
  integration:['Integration needs repair','Changes conflict with the current release or include files outside the task’s reserved scope.',['Inspect the coordinator integration report and the current main revision.','Resolve the conflicting files, or move the changes into a correctly scoped replacement task.','Run the affected checks, then retry the managed release.']],
  checks:['A required check failed','The task cannot continue until its required checks pass.',['Read the failed check output for this task.','Repair the failing behavior and run the affected checks.','Submit the corrected revision through the managed coordinator.']],
  verification:['Live verification needs attention','The release has not passed its required live acceptance check.',['Open the deployed revision in the existing signed-in session.','Verify the requested behavior and save the exact deployment evidence.','Let the coordinator recheck the receipt; repair the behavior if verification fails.']],
  access:['Access is required','The task needs an authorized account, permission, or verification step.',['Open the task’s existing account or sign-in handoff.','Have the account owner complete the required authorization or verification.','Resume the task with the same account and workspace.']],
  worker:['The worker stopped reporting','The task lost its worker heartbeat; its work has been preserved.',['Check whether the original worker is still running.','Preserve its workspace and confirm the original owner has stopped before resuming.','Resume through the managed coordinator; do not start duplicate work blindly.']],
  release:['Release needs repair','The coordinator stopped this task at a release gate.',['Inspect the task’s coordinator report and last failed stage.','Repair the reported problem while preserving the existing workspace.','Run the required checks and retry through the managed coordinator.']]
 };
 const [title,summary,nextSteps]=guidance[kind]||guidance.release;return {kind:Object.hasOwn(guidance,kind)?kind:'release',title,summary,nextSteps,at};
}
export function validateBlocker(value){
 if(!value||Object.keys(value).some(k=>!['kind','title','summary','nextSteps','at'].includes(k))||!['integration','checks','verification','access','worker','release'].includes(value.kind)||typeof value.title!=='string'||!value.title.trim()||value.title.length>120||typeof value.summary!=='string'||!value.summary.trim()||value.summary.length>600||!Array.isArray(value.nextSteps)||value.nextSteps.length<1||value.nextSteps.length>5||value.nextSteps.some(s=>typeof s!=='string'||!s.trim()||s.length>400)||!Number.isSafeInteger(value.at)||value.at<0||value.at>Date.now()+300000)throw Error('Invalid blocker details');
 return value;
}

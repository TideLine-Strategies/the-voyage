import test from 'node:test';import assert from 'node:assert/strict';
import {completionProofFor} from '../src/ticket-task-progress.js';import {ticketResolutionBlocker} from '../src/ticket-resolution-gate.js';
const commit='a'.repeat(40),taskId='123456abcdef',ticketId='11111111-1111-4111-8111-111111111111';
const final=at=>({at,content:{via:'coordinator-task',taskId,commit,checks:'Exact release receipt and feature acceptance reviewed.'}});
const envFor=task=>({DB:{prepare(){return{bind(){return{async all(){return{results:[{data_json:JSON.stringify({reportContract:2,taskId,ticket:ticketId,...task})}]}}}}}}}});
test('completion survives more than 200 later archive events without changing its date',async()=>{
 const snapshot={state:'complete',commit,delivery:'deploy',milestones:[{id:1,at:100,kind:'complete'}],liveAcceptance:{at:150,commit:'b'.repeat(40),deploymentId:'provider'}};
 let task={snapshot,milestones:snapshot.milestones,completionProof:completionProofFor({},snapshot,200)};
 for(let i=2;i<305;i++){const next={...snapshot,milestones:[{id:i,at:200+i,kind:'apfs_clone_complete'}]};task={...task,completionProof:completionProofFor(task,next,1000+i),snapshot:next,milestones:[...task.milestones,...next.milestones].slice(-200)};}
 assert.equal(task.milestones.some(m=>m.kind==='complete'),false);assert.equal(task.completionProof.at,100);
 assert.equal(await ticketResolutionBlocker(envFor(task),'voyage',{id:ticketId,workReports:[final(151)]}),null);
 assert.match(await ticketResolutionBlocker(envFor(task),'voyage',{id:ticketId,workReports:[final(149)]}),/final structured report/);
 task.snapshot.liveAcceptance=null;assert.match(await ticketResolutionBlocker(envFor(task),'voyage',{id:ticketId,workReports:[final(1000)]}),/live acceptance/);
});
test('old tasks need a fresh signed complete observation and a report recorded after it',async()=>{
 const snapshot={state:'complete',commit,delivery:'merge',milestones:[]};const task={snapshot,milestones:[]};
 assert.match(await ticketResolutionBlocker(envFor(task),'voyage',{id:ticketId,workReports:[final(100)]}),/completed coordinator milestone/);
 task.completionProof=completionProofFor(task,snapshot,500);assert.deepEqual(task.completionProof,{commit,at:500,source:'signed-complete-snapshot'});
 assert.match(await ticketResolutionBlocker(envFor(task),'voyage',{id:ticketId,workReports:[final(499)]}),/final structured report/);
 assert.equal(await ticketResolutionBlocker(envFor(task),'voyage',{id:ticketId,workReports:[final(501)]}),null);
});
test('completion cannot follow an unfinished task, a different commit or a stale proof',async()=>{
 const done={state:'complete',commit,delivery:'merge',milestones:[]};const old={snapshot:done,completionProof:completionProofFor({},done,500)};
 assert.equal(completionProofFor(old,{...done,state:'working'},600),null);
 assert.equal(completionProofFor(old,{...done,commit:'b'.repeat(40)},600).at,600);
 assert.equal(completionProofFor(old,{...done,commit:null},600),null);
 const task={...old,snapshot:{...done,state:'repair_required'}};assert.match(await ticketResolutionBlocker(envFor(task),'voyage',{id:ticketId,workReports:[final(1000)]}),/not complete/);
 task.snapshot=done;task.completionProof={...old.completionProof,commit:'b'.repeat(40)};assert.match(await ticketResolutionBlocker(envFor(task),'voyage',{id:ticketId,workReports:[final(1000)]}),/completed coordinator milestone/);
});

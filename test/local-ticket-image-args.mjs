import test from 'node:test';
import assert from 'node:assert/strict';
import {launchArgs} from '../scripts/ticket-coding-plan.mjs';

// Codex --image accepts multiple values. A lone stdin marker without an option
// boundary is consumed as a second image, as observed in the original ticket.
function parseImageOperands(args){
 const images=[];let reading=false;
 for(const arg of args){
  if(arg==='--')break;
  if(arg==='--image'){reading=true;continue;}
  if(arg.startsWith('--')){reading=false;continue;}
  if(reading)images.push(arg);
 }
 return images;
}
const request={agent:'codex',title:'Screenshot report',code:'REQ-1'};
for(const files of [[],['/private/report image.png'],['/private/one.png','/private/two.png']]){
 test(`stdin stays separate from ${files.length} screenshot operands`,()=>{
  const args=launchArgs(request,'/fixed/repo',files);
  assert.deepEqual(parseImageOperands(args),files);
  assert.deepEqual(args.slice(-2),['--','-']);
  assert.equal(args.filter(a=>a==='--').length,1);
 });
}
test('original screenshot ordering consumes stdin as an image',()=>{
 assert.deepEqual(parseImageOperands(['exec','--image','/private/one.png','-']),['/private/one.png','-']);
});
test('Claude arguments retain their existing launcher boundary',()=>{
 const args=launchArgs({...request,agent:'claude',id:'ticket-id',actor:'QS'},'/fixed/repo',['/private/one.png']);
 assert.deepEqual(args.slice(0,3),['launch','--agent','claude']);
 assert(!args.includes('--image'));
 assert.equal(args[args.indexOf('--')+1],'claude');
});

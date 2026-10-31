import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {presenceInput,taskColor,roomColors} from '../src/ticket-collaboration.js';
import {roomPython,roomHtml} from '../scripts/install-room-task-colors.mjs';
test('task palette is stable and matches Room; presence cannot select arbitrary fields or inject identities',()=>{
 for(const id of ['123456abcdef','abcdef123456','10b3663efd24'])assert(roomColors.includes(taskColor(id)));
 assert.equal(taskColor('10b3663efd24'),taskColor('10b3663efd24'));
 assert.deepEqual(presenceInput({field:'note',draft:'Hello',caret:2,status:'typing'}),{field:'note',draft:'Hello',caret:2,status:'typing'});
 for(const input of [{field:'password'},{field:'description',draft:'x',caret:2},{draft:'x'},{taskId:'fake'},{field:'description',draft:'a'.repeat(12001)}])assert.throws(()=>presenceInput(input));
});
test('Room patch is bounded, idempotent and fails closed on unexpected source',()=>{
 const py='def snapshot():\n    return dict(at=now, desktop=desktop, sessions=[])\n',html='<main><script>function draw(){paint();}</script>';
 assert.equal(roomPython(roomPython(py)),roomPython(py));assert(roomPython(py).includes('crmTasks=task_colors'));
 assert.equal(roomHtml(roomHtml(html)),roomHtml(html));assert(roomHtml(html).includes('chip.textContent=task.label'));
 assert.throws(()=>roomPython('changed'));assert.throws(()=>roomHtml('changed'));
});
test('collaboration browser code never dispatches keyboard events, focuses controls or assigns human field values',()=>{
 const js=fs.readFileSync('public/ticket-collaboration.js','utf8');assert(!/\.focus\(|\.value\s*=|KeyboardEvent|\.click\(/.test(js));assert(js.includes('pointer-events')===false);assert(js.includes('expiresAt>Date.now()'));
});

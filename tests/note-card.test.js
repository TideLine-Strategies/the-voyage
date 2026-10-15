import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const cardSource = html.slice(html.indexOf('function noteCard('), html.indexOf('async function saveNote('));
const writeSource = html.slice(html.indexOf('async function write('), html.indexOf('$("saveBtn").onclick'));
class Element {
  constructor(tag, cls, text) {
    this.tag = tag; this.textContent = text; this.children = []; this.dataset = {}; this.style = {};
    this.classes = new Set((cls || '').split(' '));
    this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x) };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
}
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
function setup(add = async () => {}) {
  const messages = [];
  const ctx = vm.createContext({
    document: { createElement: tag => new Element(tag) }, Option: class extends Element {},
    el: (tag, cls, text) => new Element(tag, cls, text), structuredClone,
    STAGES: ['Lead'], APPT_TYPES: ['Discovery'], TASK_TYPES: ['Email'],
    team: [{ id: 'QS', name: 'Quan' }], me: 'QS', nameOf: x => x,
    fmtDate: x => x, today: () => '2026-10-15', notes: [], live: true,
    db: { collection: () => ({ add }) }, logAct() {}, track() {}, toast: x => messages.push(x),
  });
  vm.runInContext(cardSource + '\n' + writeSource, ctx);
  return { ctx, messages };
}
const account = { id: 'a1', name: 'Example', stage: 0 };
const note = { id: 'n1', text: 'Meeting notes', type: 'Discovery', date: '2026-10-15' };

test('saved and draft note cards render without the removed sampling globals', () => {
  const { ctx } = setup();
  for (const draft of [false, true]) {
    const card = ctx.noteCard({ ...note, draft }, account, []);
    const labels = descendants(card).map(x => x.textContent);
    assert.ok(labels.includes('Save note'));
    assert.ok(labels.includes('Copy prompt'));
    assert.ok(labels.includes('Paste summary'));
  }
});

test('failed action creation remains retryable and only successful creation marks the draft', async () => {
  let fail = true, attempts = 0;
  const { ctx, messages } = setup(async () => { attempts++; if (fail) throw Error('offline'); });
  const summary = ctx.normSummary({ actions: [{ text: 'Send details', kind: 'task', type: 'Email' }] });
  const saved = { ...note, summary };
  const card = ctx.noteCard(saved, account, []);
  const button = descendants(card).find(x => x.textContent === '+ Add task');
  await button.onclick();
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, '+ Add task');
  assert.equal(card.classes.has('dirty'), false);
  assert.equal(summary.actions[0].added, false);
  assert.ok(messages.includes("That didn't save. Try again."));
  fail = false;
  await button.onclick();
  assert.equal(attempts, 2);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'Added ✓');
  assert.equal(card.classes.has('dirty'), true);
  assert.equal(summary.actions[0].added, false, 'editing must not mutate the saved summary before Save note');
});

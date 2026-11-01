// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,within} from '@testing-library/react';
import {StationBoard} from './StationBoard';
import type {Data} from './LiveFactoryPage';
vi.mock('./MediaLoop',()=>({MediaLoop:()=>null}));
afterEach(cleanup);
it('declining a dirty selection keeps the current cockpit and focused station',()=>{
 const cards=[{id:'a',title:'Alpha draft',stage:'research',brand:'tideline',detail:'First',kind:'editorial'},{id:'b',title:'Beta draft',stage:'scripting',brand:'tideline',detail:'Second',kind:'editorial'}];
 const data={items:[],brands:[],baseline:{posts:[]}} as unknown as Data;
 const onSelect=vi.fn(()=>false),noop=()=>{};
 const ui=render(React.createElement(StationBoard,{cards,data,ops:null,assets:[],selected:'a',onSelect,onInspect:noop,onPresent:noop,onNew:noop,onLibrary:noop,onAnalytics:noop}));
 const cockpit=ui.getByRole('region',{name:'Selected content cockpit'});
 expect(within(cockpit).getByRole('heading',{name:'Alpha draft'})).toBeTruthy();
 fireEvent.click(ui.getByRole('button',{name:/2 Scripting/}));
 expect(onSelect).toHaveBeenCalledWith('b');
 expect(within(cockpit).getByRole('heading',{name:'Alpha draft'})).toBeTruthy();
 expect(ui.container.querySelector('[data-stage="research"]')?.getAttribute('data-focused')).toBe('true');
});

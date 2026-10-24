import test from 'node:test';import {execFileSync} from 'node:child_process';
test('native publisher approval verifier matches the signed-source contract and rejects changed payloads',()=>{execFileSync('python3',['tests/factory-native.test.py'],{stdio:'pipe'});});

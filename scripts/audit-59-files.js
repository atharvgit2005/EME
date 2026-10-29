const { spawnSync, execSync } = require('child_process');
const fs = require('fs');

const cmd = `ls tests/workflow-stage21-*.test.js \
  tests/workflow-stage22-*.test.js \
  tests/workflow-stage23-*.test.js \
  tests/workflow-stage24-*.test.js \
  tests/workflow-stage25-*.test.js \
  tests/workflow-stage26-*.test.js \
  tests/workflow-stage27-*.test.js \
  tests/workflow-stage28-*.test.js \
  tests/workflow-stage29-*.test.js \
  tests/workflow-stage30-*.test.js \
  tests/workflow-stage31-*.test.js \
  tests/workflow-stage32-*.test.js`;

const files = execSync(cmd, { shell: '/bin/bash' }).toString().trim().split(/\s+/);
console.log(`Auditing ${files.length} test files...`);

const results = [];
let totalT = 0;
let totalS = 0;

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const res = spawnSync('node', ['--test', '--test-reporter=spec', file], { encoding: 'utf8' });
  const out = (res.stdout || '') + '\n' + (res.stderr || '');
  
  const tm = out.match(/ℹ tests (\d+)/);
  const sm = out.match(/ℹ suites (\d+)/);
  const pm = out.match(/ℹ pass (\d+)/);
  const fm = out.match(/ℹ fail (\d+)/);
  
  const tests = tm ? parseInt(tm[1], 10) : 0;
  const suites = sm ? parseInt(sm[1], 10) : 0;
  const pass = pm ? parseInt(pm[1], 10) : 0;
  const fail = fm ? parseInt(fm[1], 10) : 0;
  
  totalT += tests;
  totalS += suites;
  
  const isP32 = file.includes('stage32');
  results.push({
    index: i + 1,
    file,
    isP32,
    tests,
    suites,
    pass,
    fail
  });
  console.log(`[${i+1}/${files.length}] ${file}: tests=${tests}, suites=${suites}`);
}

const pred = results.filter(r => !r.isP32);
const p32 = results.filter(r => r.isP32);

const predTests = pred.reduce((a, b) => a + b.tests, 0);
const predSuites = pred.reduce((a, b) => a + b.suites, 0);
const p32Tests = p32.reduce((a, b) => a + b.tests, 0);
const p32Suites = p32.reduce((a, b) => a + b.suites, 0);

console.log('==============================================');
console.log(`Predecessor (1..${pred.length}): tests=${predTests}, suites=${predSuites}`);
console.log(`Phase 32 (${pred.length+1}..${results.length}): tests=${p32Tests}, suites=${p32Suites}`);
console.log(`Cumulative total: tests=${predTests + p32Tests}, suites=${predSuites + p32Suites}`);
console.log('==============================================');

fs.writeFileSync('scratch/suite-ledger-raw-results.json', JSON.stringify({
  filesCount: files.length,
  predCount: pred.length,
  p32Count: p32.length,
  predTests,
  predSuites,
  p32Tests,
  p32Suites,
  cumulativeTests: predTests + p32Tests,
  cumulativeSuites: predSuites + p32Suites,
  results
}, null, 2), 'utf8');

const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');

async function measureLCP(url) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const options = {
    logLevel: 'info',
    output: 'html',
    port: chrome.port,
    onlyCategories: ['performance'],
  };

  const runnerResult = await lighthouse(url, options);

  const lcp = runnerResult.lhr.audits['largest-contentful-paint'];
  const fcp = runnerResult.lhr.audits['first-contentful-paint'];
  const score = runnerResult.lhr.categories.performance.score;

  await chrome.kill();

  return {
    lcp: lcp.numericValue,
    fcp: fcp.numericValue,
    score: score * 100,
  };
}

async function runMeasurement() {
  const url = 'http://localhost:3000/validator/leaderboard';

  console.log(`Measuring ${url}...`);
  const results = await measureLCP(url);

  console.log('\n📊 Results:');
  console.log(`LCP: ${Math.round(results.lcp)}ms`);
  console.log(`FCP: ${Math.round(results.fcp)}ms`);
  console.log(`Performance Score: ${Math.round(results.score)}/100`);

  const filename = `lcp-measurement-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`\n✅ Results saved to ${filename}`);
}

runMeasurement().catch(console.error);

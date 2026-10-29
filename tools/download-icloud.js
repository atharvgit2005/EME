const fs = require('fs');
const path = require('path');

async function main() {
  const downloadDir = path.resolve(__dirname, '../assets/sfx');
  fs.mkdirSync(downloadDir, { recursive: true });

  const listRes = await fetch('http://localhost:9222/json/list');
  const tabs = await listRes.json();
  const icloudTab = tabs.find(t => t.url && t.url.includes('iclouddrive'));

  if (!icloudTab) {
    console.error('No iCloud tab found in CDP list');
    process.exit(1);
  }

  console.log(`Connecting to page WS: ${icloudTab.webSocketDebuggerUrl}`);
  const ws = new WebSocket(icloudTab.webSocketDebuggerUrl);

  let idCounter = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve } = pending.get(data.id);
      pending.delete(data.id);
      resolve(data.result);
    } else if (data.method === 'Page.downloadWillBegin') {
      console.log('Download started:', data.params.suggestedFilename);
    } else if (data.method === 'Page.downloadProgress') {
      console.log(`Download progress: ${data.params.state} (${data.params.receivedBytes}/${data.params.totalBytes})`);
    }
  };

  await new Promise(r => { ws.onopen = r; });
  console.log('Connected to CDP!');

  // Enable Page and Browser download behavior
  await send('Page.enable');
  await send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir
  });

  // Also set via Browser domain
  try {
    const versionRes = await fetch('http://localhost:9222/json/version');
    const version = await versionRes.json();
    const browserWs = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise(r => { browserWs.onopen = r; });
    browserWs.send(JSON.stringify({
      id: 999,
      method: 'Browser.setDownloadBehavior',
      params: {
        behavior: 'allow',
        downloadPath: downloadDir,
        eventsEnabled: true
      }
    }));
    console.log('Browser download behavior configured for:', downloadDir);
  } catch (e) {
    console.warn('Browser.setDownloadBehavior failed:', e.message);
  }

  // Click at the coordinate (348, 705)
  console.log('Dispatching click at (348, 705)...');
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 348,
    y: 705,
    button: 'left',
    clickCount: 1
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 348,
    y: 705,
    button: 'left',
    clickCount: 1
  });

  console.log('Waiting for download to finish in directory:', downloadDir);
  const start = Date.now();
  while (Date.now() - start < 30000) {
    await new Promise(r => setTimeout(r, 1000));
    const files = fs.readdirSync(downloadDir);
    const nonCrdownload = files.filter(f => !f.endsWith('.crdownload') && !f.startsWith('.'));
    if (nonCrdownload.length > 0) {
      console.log('Downloaded files found:', nonCrdownload);
      ws.close();
      process.exit(0);
    }
  }

  console.error('Timed out waiting for file in assets/sfx');
  ws.close();
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

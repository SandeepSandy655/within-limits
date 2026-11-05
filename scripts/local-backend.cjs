const os = require('node:os');

(async () => {
  const response = await fetch('http://127.0.0.1:5000/health', { signal: AbortSignal.timeout(10000) });
  const health = await response.json();
  if (!response.ok || health.database !== 'connected' || !health.capabilities?.includes('group-chat')) throw new Error('Start the updated backend with scripts/start-local-backend.ps1 first.');
  const configResponse = await fetch('http://127.0.0.1:5000/api/auth/config', { signal: AbortSignal.timeout(10000) });
  if (!configResponse.ok) throw new Error('The backend is running, but Firebase sign-in is not configured. Check the private project .env.');
  const addresses = [];
  for (const [name, interfaces] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|docker|WSL|VirtualBox|VMware|Loopback/i.test(name)) continue;
    for (const network of interfaces || []) {
      if (network.family === 'IPv4' && !network.internal && !network.address.startsWith('169.254.')) addresses.push({ name, address: network.address });
    }
  }
  console.log('Backend, database and sign-in configuration are responding.');
  if (!addresses.length) throw new Error('No Wi-Fi/Ethernet address found. Connect the laptop to the same network as the phone.');
  console.log('On your phone, open Connection settings and enter the address for your shared Wi-Fi/hotspot:');
  for (const item of addresses) console.log(`  ${item.name}: http://${item.address}:5000`);
  console.log('Keep the laptop awake and Docker running. Run this command again after changing networks.');
})().catch((error) => { console.error(error.message); process.exitCode = 1; });

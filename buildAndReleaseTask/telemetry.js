const appInsights = require('applicationinsights');
const metadata = {
  id: 'iot-edge-build-deploy',
  version: '0.1.8',
  publisher: 'vsc-iot',
}

const instrumentKey = 'fed7fc65-5b4a-4e66-9d46-c5f016d4e2b4';

appInsights.setup(instrumentKey);
let client = appInsights.defaultClient;

function traceEvent(name, property, metric) {
  // Zhiqing change default behavior or it will a minute to send retry request before the process exit
  // Patched the applicationinsights.js
  let properties = Object.assign({}, property, {
    'common.extname': `${metadata.publisher}.${metadata.id}`,
    'common.extversion': metadata.version,
  });
  client.trackEvent({
    name: `${metadata.publisher}.${metadata.id}/${name}`,
    properties,
  });
  client.flush();
}

module.exports = traceEvent;
const appInsights = require('applicationinsights');

const instrumentKey = '68ce9f27-d90a-4dad-b029-e9134266822c';

appInsights.setup(instrumentKey);
let client = appInsights.defaultClient;

function traceEvent(name, property, metric) {
  // Zhiqing change default behavior or it will a minute to send retry request before the process exit
  // Patched the applicationinsights.js
  client.trackEvent({
    name: name,
    properties: property
  });
  client.flush();
}

module.exports = traceEvent;
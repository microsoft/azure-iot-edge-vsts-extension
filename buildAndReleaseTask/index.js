const path = require('path');
const fs = require('fs');
const tl = require('vsts-task-lib/task');
const ContainerConnection = require('docker-common/containerconnection').default;
const AuthenticationTokenProvider = require('docker-common/registryauthenticationprovider/authenticationtokenprovider');
const ACRAuthenticationTokenProvider = require('docker-common/registryauthenticationprovider/acrauthenticationtokenprovider').default;
const GenericAuthenticationTokenProvider = require('docker-common/registryauthenticationprovider/genericauthenticationtokenprovider').default;
const buildImage = require('./buildimage');
const deployImage = require('./deployimage');
const trackEvent = require('./telemetry');
const constants = require('./constant');
const util = require('./util');

tl.setResourcePath(path.join(__dirname, 'task.json'));

util.debugOsType(tl);

// Change to any specified working directory
tl.cd(tl.getInput("cwd"));

// get the registry server authentication provider 
var registryType = tl.getInput("containerregistrytype", true);
var authenticationProvider;

if (registryType == "Azure Container Registry") {
  authenticationProvider = new ACRAuthenticationTokenProvider(tl.getInput("azureSubscriptionEndpoint"), tl.getInput("azureContainerRegistry"));
}
else {
  authenticationProvider = new GenericAuthenticationTokenProvider(tl.getInput("dockerRegistryEndpoint"));
}

var registryAuthenticationToken = authenticationProvider.getAuthenticationToken();

let startTime = new Date();

try {
  tl.pushd(tl.getInput('rootPath'));
} catch (e) {
  console.log(`The Root path ${tl.getInput('rootPath')} does not exist.`);
  tl.setResult(tl.TaskResult.Failed);
  return;
}

let action = tl.getInput("action", true);

let telemetryEvent = {
  hashTeamProjectId: util.sha256(tl.getVariable('system.teamProjectId')),
  taskType: action,
  osType: tl.osType(),
  buildId: tl.getVariable('build.buildId'),
  isSuccess: null,
  taskTime: null,
}

if (action === 'Build modules') {
  console.log('Building image...');
  buildImage.run(registryAuthenticationToken, false)
    .then(() => {
      console.log('Finished building image');
      telemetryEvent.isSuccess = true;
      telemetryEvent.taskTime = (new Date() - startTime) / 1000;
      trackEvent(action, telemetryEvent);
      tl.setResult(tl.TaskResult.Succeeded, "");
    })
    .catch((err) => {
      telemetryEvent.isSuccess = false;
      telemetryEvent.taskTime = (new Date() - startTime) / 1000;
      trackEvent(action, telemetryEvent);
      tl.setResult(tl.TaskResult.Failed, err);
    });
} else if (action === 'Build and Push modules') {
  console.log('Building and pushing image...');
  telemetryEvent.isACR = registryType === "Azure Container Registry";
  buildImage.run(registryAuthenticationToken, true)
    .then(() => {
      console.log('Finished building and pushing image');
      telemetryEvent.isSuccess = true;
      telemetryEvent.taskTime = (new Date() - startTime) / 1000;
      trackEvent(action, telemetryEvent);
      tl.setResult(tl.TaskResult.Succeeded, "");
    })
    .catch((err) => {
      telemetryEvent.isSuccess = false;
      telemetryEvent.taskTime = (new Date() - startTime) / 1000;
      trackEvent(action, telemetryEvent);
      tl.setResult(tl.TaskResult.Failed, err);
    });
} else if (action === 'Deploy to IoT Edge devices') {
  console.log('Start deploying image');
  telemetryEvent.hashIoTHub = util.sha256(tl.getInput("iothubname", true));
  deployImage.run(telemetryEvent)
    .then(() => {
      console.log('Finished Deploying image');
      telemetryEvent.isSuccess = true;
      telemetryEvent.taskTime = (new Date() - startTime) / 1000;
      trackEvent(action, telemetryEvent);
      tl.setResult(tl.TaskResult.Succeeded, "");
    })
    .catch((err) => {
      telemetryEvent.isSuccess = false;
      telemetryEvent.taskTime = (new Date() - startTime) / 1000;
      trackEvent(action, telemetryEvent);
      tl.setResult(tl.TaskResult.Failed, err);
    });
}
const path = require('path');
const fs = require('fs');
const tl = require('vsts-task-lib/task');
const ContainerConnection = require('docker-common/containerconnection').default;
const AuthenticationTokenProvider = require('docker-common/registryauthenticationprovider/authenticationtokenprovider');
const ACRAuthenticationTokenProvider = require('docker-common/registryauthenticationprovider/acrauthenticationtokenprovider').default;
const GenericAuthenticationTokenProvider = require('docker-common/registryauthenticationprovider/genericauthenticationtokenprovider').default;
const buildImage = require('./buildimage');
const pushImage = require('./pushimage');
const deployImage = require('./deployimage');
const crypto = require('crypto');
const trackEvent = require('./telemetry');

tl.setResourcePath(path.join(__dirname, 'task.json'));

const VSTS_EXTENSION_EDGE_DOCKER_CREDENTIAL = "VSTS_EXTENSION_EDGE_DOCKER_CREDENTIAL";

// Change to any specified working directory
tl.cd(tl.getInput("cwd"));

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('base64');
}

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

try {
  tl.pushd(tl.getInput('rootPath'));
} catch (e) {
  console.log(`The Root path ${tl.getInput('rootPath')} does not exist.`);
  tl.setResult(tl.TaskResult.Failed);
  return;
}

let creVar = tl.getVariable(VSTS_EXTENSION_EDGE_DOCKER_CREDENTIAL);
if(!creVar && fs.existsSync(VSTS_EXTENSION_EDGE_DOCKER_CREDENTIAL)) {
  creVar = fs.readFileSync(VSTS_EXTENSION_EDGE_DOCKER_CREDENTIAL, {encoding: 'utf-8'}).toString();
}

let credentials = creVar ? JSON.parse(creVar) : [];
if (registryAuthenticationToken) {
  credentials.push({
    username: registryAuthenticationToken.getUsername(),
    password: registryAuthenticationToken.getPassword(),
    address: registryAuthenticationToken.getLoginServerUrl()
  });
}
tl.setVariable(VSTS_EXTENSION_EDGE_DOCKER_CREDENTIAL, JSON.stringify(credentials));
fs.writeFileSync(VSTS_EXTENSION_EDGE_DOCKER_CREDENTIAL, JSON.stringify(credentials), {encoding: 'utf-8'});

// Connect to any specified container host and/or registry 
var connection = new ContainerConnection();
connection.open(tl.getInput("dockerHostEndpoint"), registryAuthenticationToken);

let action = tl.getInput("action", true);

let telemetryEvent = {
  hashTeamProjectId: sha256(tl.getVariable('system.teamProjectId')),
  taskType: action,
  osType: tl.osType(),
  buildId: tl.getVariable('build.buildId'),
  isSuccess: null,
  taskTime: null,
}

let startTime = new Date();


if (action === 'Build modules') {
  console.log('Building image...');
  buildImage.run(connection)
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
  console.log('Building image...');
  telemetryEvent.isACR = registryType === "Azure Container Registry";
  buildImage.run(connection)
    .then((imageNames) => {
      console.log('Finished building image');
      console.log('Pushing image');
      imageName = imageNames.filter(r => r !== undefined);
      return pushImage.run(connection, imageNames);
    })
    .then(() => {
      console.log('Finished pushing image');
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
  telemetryEvent.hashIoTHub = sha256(tl.getInput("iothubname", true));
  deployImage.run(credentials)
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
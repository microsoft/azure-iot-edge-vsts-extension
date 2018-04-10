const path = require('path');
const tl = require('vsts-task-lib/task');
const ContainerConnection = require('docker-common/containerconnection').default;
const AuthenticationTokenProvider = require('docker-common/registryauthenticationprovider/authenticationtokenprovider');
const ACRAuthenticationTokenProvider = require('docker-common/registryauthenticationprovider/acrauthenticationtokenprovider').default;
const GenericAuthenticationTokenProvider = require('docker-common/registryauthenticationprovider/genericauthenticationtokenprovider').default;
const buildImage = require('./buildimage');
const pushImage = require('./pushimage');
const deployImage = require('./deployimage');
tl.setResourcePath(path.join(__dirname, 'task.json'));

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

// Connect to any specified container host and/or registry 
var connection = new ContainerConnection();
connection.open(tl.getInput("dockerHostEndpoint"), registryAuthenticationToken);

let action = tl.getInput("action", true);

if (action === 'Build') {
  console.log('Building image...');
  buildImage.run(connection)
    .then(() => {
      console.log('Finished building image');
      tl.setResult(tl.TaskResult.Succeeded, "");
    })
    .catch((err) => {
      tl.setResult(tl.TaskResult.Failed, err);
    });
} else if (action === 'Build and Push') {
  console.log('Building image...');
  buildImage.run(connection)
    .then((imageNames) => {
      console.log('Finished building image');
      console.log('Pushing image');
      imageName = imageNames.filter(r => r !== undefined);
      return pushImage.run(connection, imageNames);
    })
    .then(() => {
      console.log('Finished pushing image');
      tl.setResult(tl.TaskResult.Succeeded, "");
    })
    .catch((err) => {
      tl.setResult(tl.TaskResult.Failed, err);
    });
} else if (action === 'Deploy to Edge device') {
  console.log('Start deploying image');
  deployImage.run()
    .then(() => {
      console.log('Finished Deploying image');
      tl.setResult(tl.TaskResult.Succeeded, "");
    })
    .catch((err) => {
      tl.setResult(tl.TaskResult.Failed, err);
    });
}

import path from 'path';
import * as tl from "vsts-task-lib/task";
// import ContainerConnection from "docker-common/containerconnection";
// import AuthenticationTokenProvider  from "docker-common/registryauthenticationprovider/authenticationtokenprovider"
// import ACRAuthenticationTokenProvider from "docker-common/registryauthenticationprovider/acrauthenticationtokenprovider"
// import GenericAuthenticationTokenProvider from "docker-common/registryauthenticationprovider/genericauthenticationtokenprovider"
// import buildImage from './buildimage';
// import pushImage from './pushimage';
tl.setResourcePath(path.join(__dirname, 'task.json'));

// Change to any specified working directory
tl.cd(tl.getInput("cwd"));

// get the registry server authentication provider 
var registryType = tl.getInput("containerregistrytype", true);
var authenticationProvider;

// if(registryType ==  "Azure Container Registry"){
//     authenticationProvider = new ACRAuthenticationTokenProvider(tl.getInput("azureSubscriptionEndpoint"), tl.getInput("azureContainerRegistry"));
// } 
// else {
//     authenticationProvider = new GenericAuthenticationTokenProvider(tl.getInput("dockerRegistryEndpoint"));
// }

// var registryAuthenticationToken = authenticationProvider.getAuthenticationToken();

// // Connect to any specified container host and/or registry 
// var connection = new ContainerConnection();
// connection.open(tl.getInput("dockerHostEndpoint"), registryAuthenticationToken);

async function run() {
  // console.log('Building image...');
  // await buildImage.run(connection);
  // console.log('Finished building image');

  // console.log('Pusing image...');
  // await pushImage.run(connection);
  // console.log('Finished pusing image');
}

run();
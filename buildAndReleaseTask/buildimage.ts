import * as path from "path";
import * as fs from "fs";
import * as tl from 'vsts-task-lib/task';
import ACRAuthenticationTokenProvider from 'docker-common/registryauthenticationprovider/acrauthenticationtokenprovider';
import GenericAuthenticationTokenProvider from 'docker-common/registryauthenticationprovider/genericauthenticationtokenprovider';
import RegistryAuthenticationToken from "docker-common/registryauthenticationprovider/registryauthenticationtoken";
import Constants from "./constant";
import util from "./util";
import {IExecOptions} from 'vsts-task-lib/toolrunner';

function getRegistryAuthenticationToken(): RegistryAuthenticationToken {
  // get the registry server authentication provider 
  var registryType: string = tl.getInput("containerregistrytype", true);
  var authenticationProvider;

  if (registryType == "Azure Container Registry") {
    authenticationProvider = new ACRAuthenticationTokenProvider(tl.getInput("azureSubscriptionEndpoint"), tl.getInput("azureContainerRegistry"));
  }
  else {
    authenticationProvider = new GenericAuthenticationTokenProvider(tl.getInput("dockerRegistryEndpoint"));
  }

  let token = authenticationProvider.getAuthenticationToken();
  if (token == null) {
    throw Error('Failed to fetch container registry authentication token, please check you container registry setting in build task');
  }
  return token;
}

export async function run(doPush: boolean) {
  let registryAuthenticationToken: RegistryAuthenticationToken;
  if(doPush) {
    try {
      registryAuthenticationToken = getRegistryAuthenticationToken();
    } catch (e) {
      throw Error(`Error happened when fetching docker registry authentication token. Please check you docker credential`);
    }
  }
  
  let bypassModules = tl.getInput('bypassModules');
  tl.debug(`Bypass Modules are: ${bypassModules}`);

  let templateFilePath: string = tl.getPathInput("templateFilePath", true);
  tl.debug(`The template file path is ${templateFilePath}`);
  if (!fs.existsSync(templateFilePath)) {
    throw Error(`The path of template file is not valid: ${templateFilePath}`);
  }
  util.setTaskRootPath(path.dirname(templateFilePath));

  let outputDeploymentJsonPath: string = tl.getPathInput("outputPath", true);

  util.setupIotedgedev();

  /* 
   * iotedgedev will use registry server url to match which credential to use in push process
   * For example, a normal docker hub credential should have server: https://index.docker.io/v1/ I would like to push to michaeljqzq/repo:0.0.1
   * But if I set CONTAINER_REGISTRY_SERVER=https://index.docker.io/v1/ in environment variable, it won't work.
   * iotedgedev won't load this credential
   * instead, the CONTAINER_REGISTRY_SERVER should be set to michaeljqzq
   * However, "michaeljqzq" is not in the scope of a credential.
   * So here is a work around to login in advanced call to `iotedgedev push` and then logout after everything done.
   */
  if (doPush) {
    tl.execSync(`docker`, `login -u "${registryAuthenticationToken.getUsername()}" -p "${registryAuthenticationToken.getPassword()}" ${registryAuthenticationToken.getLoginServerUrl()}`, Constants.execSyncSilentOption)
  }

  let envList = {
    [Constants.iotedgedevEnv.bypassModules]: bypassModules,
    [Constants.iotedgedevEnv.deploymentFileOutputPath]: outputDeploymentJsonPath,
  };

  if (doPush) {
    envList[Constants.iotedgedevEnv.registryServer] = registryAuthenticationToken.getLoginServerUrl();
    envList[Constants.iotedgedevEnv.registryUsername] = registryAuthenticationToken.getUsername();
    envList[Constants.iotedgedevEnv.registryPassword] = registryAuthenticationToken.getPassword();
  }

  // Pass task variable to sub process
  let tlVariables = tl.getVariables();
  for (let v of tlVariables) {
    // The variables in VSTS build contains dot, need to convert to underscore.
    let name = v.name.replace('.', '_').toUpperCase();
    if (!envList[name]) {
      envList[name] = v.value;
    }
  }

  tl.debug(`Following variables will be passed to the iotedgedev command: ${JSON.stringify(envList)}`);

  try {
    let execOptions: IExecOptions = {
      cwd: tl.cwd(),
      env: envList,
    } as IExecOptions;
    let defaultPlatform = tl.getInput('defaultPlatform', true);
    let command: string = doPush ? `push` : `build`;
    command += ` --file ${templateFilePath}`;
    command += ` --platform ${defaultPlatform}`;
    await tl.exec(`${Constants.iotedgedev}`, command, execOptions);

    if (doPush) {
      tl.execSync(`docker`, `logout`, Constants.execSyncSilentOption);
      util.createOrAppendDockerCredentials(registryAuthenticationToken);
    }

    let dockerCredentials = util.readDockerCredentials();
    tl.debug(`Number of docker cred passed: ${dockerCredentials.length}`);

    if (!fs.existsSync(outputDeploymentJsonPath)) {
      throw new Error(`The generated deployment file can't be found in the path: ${outputDeploymentJsonPath}`);
    }
    console.log(`The generated deployment file located in the path: ${outputDeploymentJsonPath}`);

    let deploymentJson = JSON.parse(fs.readFileSync(outputDeploymentJsonPath, Constants.UTF8));
    // Expand docker credentials
    // Will replace the registryCredentials if the server match
    if (dockerCredentials != undefined && util.getModulesContent(deploymentJson)['$edgeAgent']['properties.desired'].runtime.settings.registryCredentials != undefined) {
      console.log('Expanding registry credentials in deployment file...');
      let credentials = util.getModulesContent(deploymentJson)['$edgeAgent']['properties.desired'].runtime.settings.registryCredentials;
      for (let key of Object.keys(credentials)) {
        if (credentials[key].username && (credentials[key].username.startsWith("$") || credentials[key].password.startsWith("$"))) {
          tl.debug(`Going to replace the cred in deployment.json with address: ${credentials[key].address}`);
          for (let dockerCredential of dockerCredentials) {
            if (util.isDockerServerMatch(credentials[key].address, dockerCredential.address)) {
              console.log(`Replace credential: ${dockerCredential.address}`);
              credentials[key] = dockerCredential;
              break;
            }
          }
        }
      }
    }

    fs.writeFileSync(outputDeploymentJsonPath, JSON.stringify(deploymentJson, null, 2));
  } catch (e) {
    tl.execSync(`docker`, `logout`, Constants.execSyncSilentOption);
    throw e;
  }
}
import * as path from "path";
import * as fs from "fs";
import * as tl from 'vsts-task-lib/task';
import ACRAuthenticationTokenProvider from 'docker-common/registryauthenticationprovider/acrauthenticationtokenprovider';
import GenericAuthenticationTokenProvider from 'docker-common/registryauthenticationprovider/genericauthenticationtokenprovider';
import RegistryAuthenticationToken from "docker-common/registryauthenticationprovider/registryauthenticationtoken";
import Constants from "./constant";
import util from "./util";
import serviceEndpointsHandler from './serviceEndpointHandler';
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
  try {
    registryAuthenticationToken = getRegistryAuthenticationToken();
  } catch (e) {
    throw Error(`Error happened when fetching docker registry authentication token. Please check you docker credential`);
  }
  let inputs = tl.getDelimitedInput("moduleJsons", "\n");
  // Error handling: Remind for empty set
  if (!inputs || inputs.length === 0) {
    return Promise.reject(new Error('module.json setting is empty. So no modules will be built'));
  }
  let moduleJsons = new Set();
  for (let input of inputs) {
    for (let result of util.findFiles(input)) {
      moduleJsons.add(result);
    }
  }

  let serviceEndpoints = util.getServiceEndpoints();
  tl.debug(`Number of service endpoints: ${Object.keys(serviceEndpoints).length}`);

  let deploymentJson;
  if (Object.keys(serviceEndpoints).length !== 0) {
    if (!fs.existsSync(Constants.fileNameDeployTemplateJson)) {
      return Promise.reject(new Error(`File ${Constants.fileNameDeployTemplateJson} doesn't exist in the project root folder`));
    }
    deploymentJson = JSON.parse(fs.readFileSync(Constants.fileNameDeployTemplateJson, Constants.UTF8));
    // Error handling: validate deployment.json, will catch the error if property not exist
    util.validateDeployTemplateJson(deploymentJson);
  }

  let selectedModules = [];
  let modulesFolder = path.resolve(tl.cwd(), Constants.folderNameModules);
  let allModules = fs.readdirSync(modulesFolder).filter(name => fs.lstatSync(path.join(modulesFolder, name)).isDirectory());
  tl.debug(`all modules:${JSON.stringify(allModules)}`);

  for (let moduleJson of moduleJsons) {
    let moduleJsonObject;
    try {
      moduleJsonObject = JSON.parse(fs.readFileSync(moduleJson, "utf-8"));
    } catch (e) {
      // If something error happened in parse JSON, then don't put it in selected modules list.
      continue;
    }
    let moduleName = path.basename(path.dirname(moduleJson));
    selectedModules.push(moduleName);

    // Handle for private feed
    if (moduleJsonObject != undefined && Object.keys(serviceEndpoints).length !== 0) {
      try {
        let imageName = util.getModulesContent(deploymentJson)['$edgeAgent']['properties.desired']['modules'][moduleName].settings.image;
        let m = imageName.match(new RegExp("\\$\\{MODULES\\." + moduleName + "\\.(.*)\\}$", "i"));
        if (!m || !m[1]) {
          throw new Error(`image name ${imageName} in module ${moduleName} in deployment.json is not in right format`);
        }
        let platform = m[1];
        let dockerFileRelative = moduleJsonObject.image.tag.platforms[platform];
        let dockerFile = path.resolve(path.dirname(moduleJson), dockerFileRelative);
        let handler = new serviceEndpointsHandler(dockerFile);
        handler.resolve(serviceEndpoints);
      } catch (e) {
        console.log(`Error happens when handling service endpoints: ${e.message}`);
      }
    }
  }
  tl.debug(`selected modules:${JSON.stringify(selectedModules)}`);

  let bypassModules = allModules.filter(m => !selectedModules.includes(m));
  tl.debug(`bypass modules:${JSON.stringify(bypassModules)}`);

  console.log(`Number of modules to build: ${selectedModules.length}`);

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
    [Constants.iotedgedevEnv.bypassModules]: bypassModules.join(),
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
    await tl.exec(`${Constants.iotedgedev}`, doPush ? `push` : `build`, execOptions);
    if (doPush) {
      tl.execSync(`docker`, `logout`, Constants.execSyncSilentOption);
      util.createOrAppendDockerCredentials(registryAuthenticationToken);
    }

    let dockerCredentials = util.readDockerCredentials();
    tl.debug(`Number of docker cred passed: ${dockerCredentials.length}`);

    let pathToFind = path.resolve(Constants.folderNameConfig);
    if (!fs.existsSync(path.resolve(pathToFind, Constants.fileNameDeploymentJson))) {
      throw new Error(`${Constants.fileNameDeploymentJson} can't be found under ${pathToFind}`);
    }
    let deploymentJson = JSON.parse(fs.readFileSync(path.resolve(pathToFind, Constants.fileNameDeploymentJson), Constants.UTF8));
    // Expand docker credentials
    // Will replace the registryCredentials if the server match
    if (dockerCredentials != undefined && util.getModulesContent(deploymentJson)['$edgeAgent']['properties.desired'].runtime.settings.registryCredentials != undefined) {
      let credentials = util.getModulesContent(deploymentJson)['$edgeAgent']['properties.desired'].runtime.settings.registryCredentials;
      for (let key of Object.keys(credentials)) {
        if (credentials[key].username && (credentials[key].username.startsWith("$") || credentials[key].password.startsWith("$"))) {
          tl.debug(`Going to replace the cred in deployment.json with address: ${credentials[key].address}`);
          for (let dockerCredential of dockerCredentials) {
            if (util.isDockerServerMatch(credentials[key].address, dockerCredential.address)) {
              tl.debug(`Found matched cred in file: ${dockerCredential.address}`);
              credentials[key] = dockerCredential;
              break;
            }
          }
        }
      }
    }

    fs.writeFileSync(path.resolve(pathToFind, Constants.fileNameDeploymentJson), JSON.stringify(deploymentJson, null, 2));
  } catch (e) {
    tl.execSync(`docker`, `logout`, Constants.execSyncSilentOption);
    throw e;
  }
}
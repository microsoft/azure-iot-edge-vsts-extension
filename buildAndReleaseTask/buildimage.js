const path = require('path');
const fs = require('fs');
const tl = require('vsts-task-lib/task');
const ContainerConnection = require('docker-common/containerconnection').default;
const sourceUtils = require('docker-common/sourceutils');
const imageUtils = require('docker-common/containerimageutils');
const constants = require('./constant');
const util = require('./util');
const serviceEndpointsHandler = require('./serviceEndpointHandler');

function run(registryAuthenticationToken, doPush) {
  try {
    let inputs = tl.getDelimitedInput("moduleJsons", "\n");
    // Error handling: Remind for empty set
    if(!inputs || inputs.length === 0) {
      return Promise.reject(new Error('module.json setting is empty. So no modules will be built'));
    }
    let moduleJsons = new Set();
    for (let input of inputs) {
      for (let result of util.findFiles(input, tl)) {
        moduleJsons.add(result);
      }
    }
    if(!fs.existsSync(constants.fileNameDeployTemplateJson)) {
      return Promise.reject(new Error(`File ${constants.fileNameDeployTemplateJson} doesn't exist in the project root folder`));
    }
    let deploymentJson = JSON.parse(fs.readFileSync(constants.fileNameDeployTemplateJson));
    // Error handling: validate deployment.json, will catch the error if property not exist
    util.validateDeployTemplateJson(deploymentJson);

    let serviceEndpoints = util.getServiceEndpoints(tl);

    let promises = [];
    
    let selectedModules = [];
    let modulesFolder = path.resolve(tl.cwd(), constants.folderNameModules);
    let allModules = fs.readdirSync(modulesFolder).filter(name => fs.lstatSync(path.join(modulesFolder, name)).isDirectory());
    tl.debug(`all modules:${JSON.stringify(allModules)}`);

    for (let moduleJson of moduleJsons) {
      try {
        JSON.parse(fs.readFileSync(moduleJson, "utf-8"));
      } catch (e) {
        // If something error happened in parse JSON, then don't put it in selected modules list.
        continue;
      }
      selectedModules.push(path.basename(path.dirname(moduleJson)));
    }
    tl.debug(`selected modules:${JSON.stringify(selectedModules)}`);
    
    let bypassModules = allModules.filter(m => !selectedModules.includes(m));
    tl.debug(`bypass modules:${JSON.stringify(bypassModules)}`);

    console.log(`Number of modules to build: ${selectedModules.length}`);

    util.setupIotedgedev(tl);

    /* 
     * iotedgedev will use registry server url to match which credential to use in push process
     * For example, a normal docker hub credential should have server: https://index.docker.io/v1/ I would like to push to michaeljqzq/repo:0.0.1
     * But if I set CONTAINER_REGISTRY_SERVER=https://index.docker.io/v1/ in environment variable, it won't work.
     * iotedgedev won't load this credential
     * instead, the CONTAINER_REGISTRY_SERVER should be set to michaeljqzq
     * However, "michaeljqzq" is not in the scope of a credential.
     * So here is a work around to login in advanced call to `iotedgedev push` and then logout after everything done.
     */
    tl.execSync(`docker`, `login -u "${registryAuthenticationToken.getUsername()}" -p "${registryAuthenticationToken.getPassword()}" ${registryAuthenticationToken.getLoginServerUrl()}`)

    return tl.exec(`${constants.iotedgedev}`, doPush ? `push` : `build`, {
      cwd: tl.cwd(),
      env: {
        [constants.iotedgedevEnv.bypassModules]: bypassModules.join(),
        [constants.iotedgedevEnv.registryServer]: registryAuthenticationToken.getLoginServerUrl(),
        [constants.iotedgedevEnv.registryUsername]: registryAuthenticationToken.getUsername(),
        [constants.iotedgedevEnv.registryPassword]: registryAuthenticationToken.getPassword(),
      }
    }).then((val)=>{
      tl.execSync(`docker`, `logout`);
      util.createOrAppendDockerCredentials(tl, registryAuthenticationToken);
      return Promise.resolve(val);
    },(err)=>{
      tl.execSync(`docker`, `logout`);
      return Promise.reject(err);
    });

  } catch (e) {
    return Promise.reject(e);
  }
}

module.exports = {
  run
}
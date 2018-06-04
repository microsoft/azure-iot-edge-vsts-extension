const path = require('path');
const fs = require('fs');
const tl = require('vsts-task-lib/task');
const ContainerConnection = require('docker-common/containerconnection').default;
const sourceUtils = require('docker-common/sourceutils');
const imageUtils = require('docker-common/containerimageutils');
const constants = require('./constant');
const util = require('./util');
const serviceEndpointsHandler = require('./serviceEndpointHandler');

function build(connection, moduleJsonPath, deploymentJsonObject, serviceEndpoints) {
  var command = connection.createCommand();
  command.arg("build");

  if (!fs.existsSync(moduleJsonPath)) {
    throw new Error('module.json not found');
  }

  let moduleJson = JSON.parse(util.expandEnv(fs.readFileSync(moduleJsonPath, "utf-8"), "$schema"));
  // Error handling: validate module.json
  util.validateModuleJson(moduleJson);

  let moduleName = path.basename(path.dirname(moduleJsonPath));

  if (!deploymentJsonObject.moduleContent['$edgeAgent']['properties.desired']['modules'][moduleName]) {
    console.log(`Module ${moduleName} is not specified in deployment.json, skip`);
    return null;
  }
  let imageName = deploymentJsonObject.moduleContent['$edgeAgent']['properties.desired']['modules'][moduleName].settings.image;
  let m = imageName.match(/\$\{MODULES\..*\.(.*)\}$/i);
  if (!m || !m[1]) {
    throw new Error(`image name ${imageName} in module ${moduleName} in deployment.json is not in right format`);
  }
  let platform = m[1];

  let dockerFileRelative = moduleJson.image.tag.platforms[platform];
  let repository = moduleJson.image.repository;
  let version = moduleJson.image.tag.version;
  let dockerFile = path.resolve(path.dirname(moduleJsonPath), dockerFileRelative);

  command.arg(["-f", dockerFile]);

  imageName = (`${repository}:${version}-${platform}`).toLowerCase();
  command.arg(["-t", imageName]);

  var baseImageName = imageUtils.imageNameWithoutTag(imageName);

  tl.getDelimitedInput("additionalImageTags", "\n").forEach(tag => {
    command.arg(["-t", baseImageName + ":" + tag]);
  });

  var includeSourceTags = tl.getBoolInput("includeSourceTags");
  if (includeSourceTags) {
    sourceUtils.getSourceTags().forEach(tag => {
      command.arg(["-t", baseImageName + ":" + tag]);
    });
  }

  var includeLatestTag = tl.getBoolInput("includeLatestTag");
  if (baseImageName !== imageName && includeLatestTag) {
    command.arg(["-t", baseImageName]);
  }

  var memory = tl.getInput("memory");
  if (memory) {
    command.arg(["-m", memory]);
  }

  try {
    let handler = new serviceEndpointsHandler(dockerFile);
    handler.resolve(serviceEndpoints);
  }catch(e) {
    console.log(`Error happens when handling service endpoints: ${e.message}`);
  }

  let context = path.dirname(dockerFile);
  command.arg(context);
  return connection.execCommand(command).then(() => imageName);
}

function run(connection) {
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
    
    for (let moduleJson of moduleJsons) {
      let p = build(connection, moduleJson, deploymentJson, serviceEndpoints);
      if (p != null) {
        promises.push(p);
      }
    }
    console.log(`Number of modules to build: ${promises.length}`);
    return Promise.all(promises);
  } catch (e) {
    return Promise.reject(e);
  }
}

module.exports = {
  run
}
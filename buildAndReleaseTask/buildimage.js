const path = require('path');
const fs = require('fs');
const tl = require('vsts-task-lib/task');
const ContainerConnection = require('docker-common/containerconnection').default;
const sourceUtils = require('docker-common/sourceutils');
const imageUtils = require('docker-common/containerimageutils');
const constants = require('./constant');
const util = require('./util');

function build(connection, moduleJsonPath, deploymentJsonObject) {
  var command = connection.createCommand();
  command.arg("build");

  if (!fs.existsSync(moduleJsonPath)) {
    throw new Error('module.json not found');
  }
  let moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath));
  // Error handling: validate module.json
  util.validateModuleJson(moduleJson);

  let moduleName = path.basename(path.dirname(moduleJsonPath));

  if (!deploymentJsonObject.moduleContent['$edgeAgent']['properties.desired']['modules'][moduleName]) {
    console.log(`Module ${moduleName} is not specified in deployment.json, skip`);
    return Promise.resolve();
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

  let context = path.dirname(dockerFile);
  command.arg(context);
  return connection.execCommand(command).then(() => imageName);
}

function run(connection) {
  // get all modules
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

    let promises = [];
    
    for (let moduleJson of moduleJsons) {
      promises.push(build(connection, moduleJson, deploymentJson));
    }
    return Promise.all(promises);
  } catch (e) {
    return Promise.reject(e);
  }
}

module.exports = {
  run
}
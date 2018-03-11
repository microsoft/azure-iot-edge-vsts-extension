const path = require('path');
const fs = require('fs');
const tl = require('vsts-task-lib/task');
const ContainerConnection = require('docker-common/containerconnection').default;
const sourceUtils = require('docker-common/sourceutils');
const imageUtils = require('docker-common/containerimageutils');

function findFiles(filepath) {
  if (filepath.indexOf('*') >= 0 || filepath.indexOf('?') >= 0) {
    tl.debug(tl.loc('ContainerPatternFound'));
    var buildFolder = tl.getVariable('System.DefaultWorkingDirectory');
    var allFiles = tl.find(buildFolder);
    var matchingResultsFiles = tl.match(allFiles, filepath, buildFolder, { matchBase: true });

    if (!matchingResultsFiles || matchingResultsFiles.length == 0) {
      throw new Error(tl.loc('ContainerDockerFileNotFound', filepath));
    }

    return matchingResultsFiles;
  }
  else {
    tl.debug(tl.loc('ContainerPatternNotFound'));
    return [filepath];
  }
}

function build(connection, moduleJsonPath, deploymentJsonObject) {
  var command = connection.createCommand();
  command.arg("build");

  if (!fs.existsSync(moduleJsonPath)) {
    throw new Error('module.json not found');
  }
  let moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath));
  // TODO: validate module.json

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
  // TODO: check repository align with build definition
  let repository = moduleJson.image.repository;
  let version = moduleJson.image.tag.version;
  let dockerFile = path.resolve(path.dirname(moduleJsonPath), dockerFileRelative);

  command.arg(["-f", dockerFile]);

  // tl.getDelimitedInput("buildArguments", "\n").forEach(buildArgument => {
  //     command.arg(["--build-arg", buildArgument]);
  // });

  // var imageName = tl.getInput("imageName", true);
  // var qualifyImageName = tl.getBoolInput("qualifyImageName");
  // if (qualifyImageName) {
  // 	imageName = connection.qualifyImageName(imageName);
  // }

  // let imageName = `${moduleName}:${process.env.BUILD_BUILDID || '0'}`;

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

  var context;
  // var defaultContext = tl.getBoolInput("defaultContext");
  // if (defaultContext) {
  context = path.dirname(dockerFile);
  // } else {
  //     context = tl.getPathInput("context");
  // }
  command.arg(context);
  return connection.execCommand(command).then(() => imageName);
}

function run(connection) {
  // get all modules
  // TODO: apply settings from moduleJsons

  try {
    let inputs = tl.getDelimitedInput("moduleJsons", "\n");
    let moduleJsons = new Set();
    for (let input of inputs) {
      for (let result of findFiles(input)) {
        moduleJsons.add(result);
      }
    }
    let deploymentJson = JSON.parse(fs.readFileSync('deployment.template.json'));
    // TODO: validate deployment.json
    let promises = [];
    for (let moduleJson of moduleJsons) {
      // error handling
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
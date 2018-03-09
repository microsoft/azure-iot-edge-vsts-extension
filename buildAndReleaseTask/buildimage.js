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
  console.log('zhiqing b1', moduleJsonPath);
  let moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath));
  console.log('zhiqing b2');
  // TODO: validate module.json

  let moduleName = path.basename(path.dirname(moduleJsonPath));
  console.log('zhiqing b3', moduleName);

  let imageName = deploymentJsonObject.moduleContent['$edgeAgent']['properties.desired']['modules'][moduleName].settings.image;
  let m = imageName.match(/\$\{MODULES\..*\.(.*)\}$/i);
  let platform = m[1];

  if (!platform) {
    throw new Error(`Module ${moduleName} in deployment.json doesn't contain platform`);
  }

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
    console.log('zhiqing 1');
    let inputs = tl.getDelimitedInput("moduleJsons", "\n");
    let moduleJsons = new Set();
    for(let input of inputs) {
      for(let result of findFiles(input)) {
        moduleJsons.add(result);
      }
    }
    console.log('zhiqing 2', moduleJsons);
    let deploymentJson = JSON.parse(fs.readFileSync('deployment.template.json'));
    // TODO: validate deployment.json
    console.log('zhiqing 3', JSON.stringify(deploymentJson));
    let promises = [];
    for (let moduleJson of moduleJsons) {
      // error handling
      promises.push(build(connection,moduleJson, deploymentJson));
    }
    console.log('zhiqing 4');
    return Promise.all(promises);
  } catch (e) {
    return Promise.reject(e.message);
  }

}

module.exports = {
  run
}
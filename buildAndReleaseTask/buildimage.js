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
  else
  {
      tl.debug(tl.loc('ContainerPatternNotFound'));
      return [filepath];
  }
}

function build(moduleJsonPath, deploymentJsonObject) {
  var command = connection.createCommand();
  command.arg("build");

  let moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath));



  var dockerfilepath = tl.getInput("dockerFile", true);
  var dockerFile = findDockerFile(dockerfilepath)[0];
  
  if(!tl.exist(dockerFile)) {
      throw new Error(tl.loc('ContainerDockerFileNotFound', dockerfilepath));
  }

  command.arg(["-f", dockerFile]);

  // tl.getDelimitedInput("buildArguments", "\n").forEach(buildArgument => {
  //     command.arg(["--build-arg", buildArgument]);
  // });

  var imageName = tl.getInput("imageName", true);
  var qualifyImageName = tl.getBoolInput("qualifyImageName");
  if (qualifyImageName) {
      imageName = connection.qualifyImageName(imageName);
  }
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
  return connection.execCommand(command);
}

function run(connection) {
  // get all modules
  // TODO: apply settings from moduleJsons
  
  try{
    let moduleJsons = findFiles('**/module.json');
    let deploymentJson = JSON.parse(fs.readFileSync(moduleJsonPath));
    for(let moduleJson of moduleJsons) {
      // error handling
    }
  }catch(e) {
    return Promise.reject(e.message);
  }
  
}

module.exports = {
  run
}
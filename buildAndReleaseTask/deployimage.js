const fs = require('fs');
const path = require('path');
const tl = require('vsts-task-lib/task');
const request = require('request');
const crypto = require('crypto');
const os = require('os')

class azureclitask {
  static checkIfAzurePythonSdkIsInstalled() {
    return !!tl.which("az", false);
  }

  static runMain(deploymentJson) {
    var toolExecutionError = null;
    try {
      // var tool;
      // if (os.type() != "Windows_NT") {
      //   tool = tl.tool(tl.which("bash", true));
      // }

      var scriptLocation = tl.getInput("scriptLocation");
      var scriptPath = null;
      // var cwd = tl.getPathInput("cwd", true, false);

      let iothub = 'iot-mj-prod';
      let configId = 'vsts-created';

      let deploymentJsonPath = path.resolve(os.tmpdir(), `deployment_${new Date().getTime()}.json`);
      fs.writeFileSync(deploymentJsonPath, JSON.stringify({content:deploymentJson}, null, 2));

      let script1 = `iot edge deployment delete --hub-name ${iothub} --config-id ${configId}`;
      let script2 = `iot edge deployment create --config-id ${configId} --hub-name ${iothub} --content ${deploymentJsonPath} --target-condition tags.environment='prod'`;
      // var script = `az iot edge deployment delete --hub-name ${iothub}
      // az iot edge deployment create --config-id ${configId} --hub-name ${iothub} --content ${deploymentJsonPath} --target-condition "tags.environment='prod'"`;
      // if (os.type() != "Windows_NT") {
      //   scriptPath = path.join(os.tmpdir(), "azureclitaskscript" + new Date().getTime() + ".sh");
      // }
      // else {
      //   scriptPath = path.join(os.tmpdir(), "azureclitaskscript" + new Date().getTime() + ".bat");
      // }
      // this.createFile(scriptPath, script);

      // tl.mkdirP(cwd);
      // tl.cd(cwd);

      // if (os.type() != "Windows_NT") {
      //   tool.arg(scriptPath);
      // }
      // else {
      //   tool = tl.tool(tl.which(scriptPath, true));
      // }

      this.loginAzure();

      console.log(tl.execSync('az', '--version'));
      console.log(tl.execSync('az', 'extension add --name azure-cli-iot-ext --debug'));

      let result1 = tl.execSync('az', script1);
      console.log(result1);
      let result2 = tl.execSync('az', script2);
      console.log(result2);

      return Promise.resolve();
    }
    catch (err) {
      if (err.stderr) {
        toolExecutionError = err.stderr;
      }
      else {
        toolExecutionError = err;
      }
      //go to finally and logout of azure and set task result
    }
    finally {
      if (scriptLocation === "inlineScript") {
        this.deleteFile(scriptPath);
      }
      //Logout of Azure if logged in
      if (this.isLoggedIn) {
        this.logoutAzure();
      }

      //set the task result to either succeeded or failed based on error was thrown or not
      if (toolExecutionError) {
        return Promise.reject(new Error(toolExecutionError));
      }
      else {
        // tl.setResult(tl.TaskResult.Succeeded, tl.loc("ScriptReturnCode", 0));
      }
    }
  }

  static loginAzure() {
    var connectedService = tl.getInput("connectedServiceNameARM", true);
    this.loginAzureRM(connectedService);
  }

  static loginAzureRM(connectedService) {
    var servicePrincipalId = tl.getEndpointAuthorizationParameter(connectedService, "serviceprincipalid", false);
    var servicePrincipalKey = tl.getEndpointAuthorizationParameter(connectedService, "serviceprincipalkey", false);
    var tenantId = tl.getEndpointAuthorizationParameter(connectedService, "tenantid", false);
    var subscriptionName = tl.getEndpointDataParameter(connectedService, "SubscriptionName", true);
    //login using svn
    this.throwIfError(tl.execSync("az", "login --service-principal -u \"" + servicePrincipalId + "\" -p \"" + servicePrincipalKey + "\" --tenant \"" + tenantId + "\""));
    this.isLoggedIn = true;
    //set the subscription imported to the current subscription
    this.throwIfError(tl.execSync("az", "account set --subscription \"" + subscriptionName + "\""));
  }

  static logoutAzure() {
    try {
      tl.execSync("az", " account clear");
    }
    catch (err) {
      // task should not fail if logout doesn`t occur
      tl.warning(tl.loc("FailedToLogout"));
    }
  }

  static throwIfError(resultOfToolExecution) {
    if (resultOfToolExecution.stderr) {
      throw resultOfToolExecution;
    }
  }

  static createFile(filePath, data) {
    try {
      fs.writeFileSync(filePath, data);
    }
    catch (err) {
      this.deleteFile(filePath);
      throw err;
    }
  }

  static deleteFile(filePath) {
    if (fs.existsSync(filePath)) {
      try {
        //delete the publishsetting file created earlier
        fs.unlinkSync(filePath);
      }
      catch (err) {
        //error while deleting should not result in task failure
        console.error(err.toString());
      }
    }
  }
}

azureclitask.isLoggedIn = false;

function deployToDevice(hostname, deviceId, sasToken, deploymentJson) {
  let url = `https://${hostname}/devices/${deviceId}/applyConfigurationContent?api-version=2017-11-08-preview`;
  let options = {
    url,
    headers: {
      "Authorization": sasToken,
      "Content-Type": "application/json"
    },
    method: 'POST',
    body: JSON.stringify(deploymentJson),
  }
  return new Promise((resolve, reject) => {
    request(options, (err, response, body) => {
      if (err) {
        reject(err);
      }
      if (response && response.statusCode === 204) {
        resolve(deviceId);
      } else {
        console.log(response.statusCode, body);
      }
    });
  });
}

// TODO: duplicated
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

function generateSasToken(resourceUri, signingKey, policyName, expiresInMins = 3600) {
  resourceUri = encodeURIComponent(resourceUri);

  // Set expiration in seconds
  var expires = (Date.now() / 1000) + expiresInMins * 60;
  expires = Math.ceil(expires);
  var toSign = resourceUri + '\n' + expires;

  // Use crypto
  var hmac = crypto.createHmac('sha256', new Buffer(signingKey, 'base64'));
  hmac.update(toSign);
  var base64UriEncoded = encodeURIComponent(hmac.digest('base64'));

  // Construct autorization string
  var token = "SharedAccessSignature sr=" + resourceUri + "&sig="
    + base64UriEncoded + "&se=" + expires;
  if (policyName) token += "&skn=" + policyName;
  return token;
};

function parseIoTCS(cs) {
  let m = cs.match(/HostName=(.*);SharedAccessKeyName=(.*);SharedAccessKey=(.*)$/);
  return m.slice(1);
}

function run(connection) {
  let deploymentJson = JSON.parse(fs.readFileSync('deployment.template.json'));
  let moduleJsons = findFiles('**/module.json');
  // TODO: validate deployment.json
  console.log('zhiqing c1', JSON.stringify(deploymentJson));

  // TODO: replace env variables
  for (let systemModule of Object.keys(deploymentJson.moduleContent['$edgeAgent']['properties.desired']['systemModules'])) {
    let originalImage = deploymentJson.moduleContent['$edgeAgent']['properties.desired']['systemModules'][systemModule].settings.image;
    if (originalImage.includes('${RUNTIME_TAG}')) {
      originalImage = originalImage.replace('${RUNTIME_TAG}', 'latest');
    }
    deploymentJson.moduleContent['$edgeAgent']['properties.desired']['systemModules'][systemModule].settings.image = originalImage;
  }
  console.log('zhiqing c2');

  for (let module of Object.keys(deploymentJson.moduleContent['$edgeAgent']['properties.desired']['modules'])) {
    let originalImage = deploymentJson.moduleContent['$edgeAgent']['properties.desired']['modules'][module].settings.image;
    if (originalImage.includes('${RUNTIME_TAG}')) {
      originalImage = originalImage.replace('${RUNTIME_TAG}', 'latest');
    }
    deploymentJson.moduleContent['$edgeAgent']['properties.desired']['modules'][module].settings.image = originalImage;
  }
  console.log('zhiqing c3');

  for (let moduleJsonPath of moduleJsons) {
    // error handling
    if (!fs.existsSync(moduleJsonPath)) {
      throw new Error('module.json not found');
    }
    console.log('zhiqing b1', moduleJsonPath);
    let moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath));
    console.log('zhiqing b2');
    // TODO: validate module.json

    let moduleName = path.basename(path.dirname(moduleJsonPath));
    console.log('zhiqing b3', moduleName);

    if (!deploymentJson.moduleContent['$edgeAgent']['properties.desired']['modules'][moduleName]) {
      console.log(`Skip module ${moduleName} since not specified in deployment.json`);
      continue;
    }
    let imageName = deploymentJson.moduleContent['$edgeAgent']['properties.desired']['modules'][moduleName].settings.image;
    let m = imageName.match(/\$\{MODULES\..*\.(.*)\}$/i);
    let platform = m[1];

    if (!platform) {
      throw new Error(`Module ${moduleName} in deployment.json doesn't contain platform`);
    }

    // TODO: check repository align with build definition
    let repository = moduleJson.image.repository;
    let version = moduleJson.image.tag.version;

    imageName = (`${repository}:${version}-${platform}`).toLowerCase();
    deploymentJson.moduleContent['$edgeAgent']['properties.desired']['modules'][moduleName].settings.image = imageName;
  }
  console.log('zhiqing c4', JSON.stringify(deploymentJson));

  let deviceOption = tl.getInput("deviceOption", true);
  if (deviceOption === 'Single Device') {
    let deviceId = tl.getInput("deviceId", true);
    let [hostName, sasToken, policyName] = parseIoTCS(tl.getInput("iothubcs", true));
    //HostName=iot-mj-prod.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=uoTBPzhU8UeUzaiOzmuUmXa/oT1Kr2O+t8FSPUSOOFU=
    return deployToDevice(hostName, deviceId, generateSasToken(hostName, sasToken, policyName), deploymentJson);
  } else {
    // TODO: limit to single quote
    let condition = tl.getInput("targetcondition", true);
    if (!azureclitask.checkIfAzurePythonSdkIsInstalled()) {
      return Promise.reject(new Error('Azure SDK not found'));
    }
    return azureclitask.runMain(deploymentJson);
  }


}
console.log(generateSasToken('iot-mj-prod.azure-devices.net', 'uoTBPzhU8UeUzaiOzmuUmXa/oT1Kr2O+t8FSPUSOOFU=', 'iothubowner'))

module.exports = {
  run
}
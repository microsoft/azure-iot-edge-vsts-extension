const fs = require('fs');
const path = require('path');
const tl = require('vsts-task-lib/task');
const request = require('request');
const crypto = require('crypto');
const os = require('os');
const util = require('./util');
const constants = require('./constant');

class azureclitask {
  static checkIfAzurePythonSdkIsInstalled() {
    return !!tl.which("az", false);
  }

  static runMain(deploymentJson, telemetryEvent) {
    var toolExecutionError = null;
    try {
      let iothub = tl.getInput("iothubname", true);
      let configId = tl.getInput("deploymentid", true);
      let priority = tl.getInput("priority", true);
      let deviceOption = tl.getInput("deviceOption", true);
      let targetCondition;

      if (deviceOption === 'Single Device') {
        let deviceId = tl.getInput("deviceId", true);
        targetCondition = `deviceId='${deviceId}'`;
      } else {
        targetCondition = tl.getInput("targetcondition", true);
      }

      let deploymentJsonPath = path.resolve(os.tmpdir(), `deployment_${new Date().getTime()}.json`);
      fs.writeFileSync(deploymentJsonPath, JSON.stringify({ content: deploymentJson }, null, 2));

      priority = parseInt(priority);
      priority = isNaN(priority) ? 0 : priority;

      let script1 = `iot edge deployment delete --hub-name ${iothub} --config-id ${configId}`;
      let script2 = `iot edge deployment create --config-id ${configId} --hub-name ${iothub} --content ${deploymentJsonPath} --target-condition ${targetCondition} --priority ${priority}`;

      this.loginAzure();

      tl.debug('OS release:', os.release());

      // WORK AROUND
      // In Linux environment, sometimes when install az extension, libffi.so.5 file is missing. Here is a quick fix.
      let addResult = tl.execSync('az', 'extension add --name azure-cli-iot-ext --debug', {silent: true});
      tl.debug(addResult);
      if (addResult.code === 1) {
        if (addResult.stderr.includes('ImportError: libffi.so.5')) {
          let azRepo = tl.execSync('lsb_release', '-cs', {silent: true}).stdout.trim();
          console.log(`\n--------------------Error--------------------.\n Something wrong with built-in Azure CLI in agent, can't install az-cli-iot-ext.\nTry to fix with reinstall the ${azRepo} version of Azure CLI.\n\n`);
          tl.debug(tl.execSync('sudo', 'rm /etc/apt/sources.list.d/azure-cli.list', {silent: true}));
          fs.writeFileSync('sudo', `/etc/apt/sources.list.d/azure-cli.list deb [arch=amd64] https://packages.microsoft.com/repos/azure-cli/ ${azRepo} main`, {silent: true});
          tl.debug(tl.execSync('sudo', 'cat /etc/apt/sources.list.d/azure-cli.list', {silent: true}));
          tl.debug(tl.execSync('sudo', 'apt-key adv --keyserver packages.microsoft.com --recv-keys 52E16F86FEE04B979B07E28DB02C46DF417A0893', {silent: true}));
          tl.debug(tl.execSync('sudo', 'apt-get install apt-transport-https', {silent: true}));
          tl.debug(tl.execSync('sudo', 'apt-get update', {silent: true}));
          tl.debug(tl.execSync('sudo', 'apt-get --assume-yes remove azure-cli', {silent: true}));
          tl.debug(tl.execSync('sudo', 'apt-get --assume-yes install azure-cli', {silent: true}));
          let r = tl.execSync('az', 'extension add --name azure-cli-iot-ext --debug', {silent: true});
          tl.debug(r);
          if (r.code === 1) {
            throw new Error(r.stderr);
          }
        } else if(addResult.stderr.includes('The extension azure-cli-iot-ext already exists')) {
          // The job contains multiple deploy tasks
          // do nothing
        } else {
          throw new Error(addResult.stderr);
        }
      }

      try {
        let iotHubInfo = JSON.parse(tl.execSync('az', `iot hub show -n ${iothub}`, {silent: true}).stdout);
        tl.debug(`The host name of iot hub is ${iotHubInfo.properties.hostName}`);
        telemetryEvent.iotHubHostNameHash = util.sha256(iotHubInfo.properties.hostName);
        let reg = new RegExp(iothub+"\.(.*)");
        let m = reg.exec(iotHubInfo.properties.hostName);
        if(m && m[1]) {
          telemetryEvent.iotHubDomain = m[1];
        }
      }catch(e) {
        // If error when get iot hub information, ignore.
      }

      let result1 = tl.execSync('az', script1, {silent: true});
      let result2 = tl.execSync('az', script2);
      if(result2.code !== 0) {
        throw new Error(`Error for deployment: ${result2.stderr}`);
      }

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
    // Work around for build agent az command will exit with non-zero code since configuration files are missing.
    tl.debug(tl.execSync("az", "--version", {silent: true}));
    //login using svn
    let result = tl.execSync("az", "login --service-principal -u \"" + servicePrincipalId + "\" -p \"" + servicePrincipalKey + "\" --tenant \"" + tenantId + "\"", {silent: true});
    tl.debug(JSON.stringify(result));
    this.throwIfError(result);
    this.isLoggedIn = true;
    //set the subscription imported to the current subscription
    result = tl.execSync("az", "account set --subscription \"" + subscriptionName + "\"", {silent: true});
    tl.debug(JSON.stringify(result));
    this.throwIfError(result);
  }

  static logoutAzure() {
    try {
      tl.debug(tl.execSync("az", " account clear", {silent: true}));
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

function run(telemetryEvent) {
  try {
    let inBuildPipeline = util.checkSelfInBuildPipeline(tl);
    let pathToFind = inBuildPipeline ? constants.folderNameConfig : '.';

    if (!inBuildPipeline) {
      // Find the deployment.json files in all dirs (artifact dirs)
      let findPaths = util.findFiles(`**/${constants.fileNameDeploymentJson}`, tl);
      tl.debug(`Found ${findPaths.length} result for deployment.json`);
      if (!findPaths || findPaths.length === 0) {
        throw new Error(`Deployment task is in release pipeline, but ${constants.fileNameDeploymentJson} can't be found. Please ensure deployment.json contains in artifacts.`);
      }
      pathToFind = path.dirname(findPaths[0]);
      tl.debug(`The path of ${constants.fileNameDeploymentJson} is ${pathToFind}`);
    }

    if(inBuildPipeline && !fs.existsSync(path.resolve(pathToFind, constants.fileNameDeploymentJson))) {
      console.log(`Found deployment task in build pipeline and not found ${path.resolve(pathToFind, constants.fileNameDeploymentJson)}. It should be an error`);
      util.setupIotedgedev(tl);
      tl.execSync(`${constants.iotedgedev}`, `genconfig`, {
        cwd: tl.cwd()
      });
    }
    
    let deploymentJson = JSON.parse(fs.readFileSync(path.resolve(pathToFind, constants.fileNameDeploymentJson)));

    if (!azureclitask.checkIfAzurePythonSdkIsInstalled()) {
      throw new Error('Azure SDK not found');
    }
    return azureclitask.runMain(deploymentJson, telemetryEvent);
  }
  catch (e) {
    return Promise.reject(e);
  }
}

module.exports = {
  run
}
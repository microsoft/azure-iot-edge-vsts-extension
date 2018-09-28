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

  static runMain(deploymentJson) {
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

      console.log('OS release:', os.release());

      // WORK AROUND
      // In Linux environment, sometimes when install az extension, libffi.so.5 file is missing. Here is a quick fix.
      let addResult = tl.execSync('az', 'extension add --name azure-cli-iot-ext --debug');
      if (addResult.code === 1) {
        if (addResult.stderr.includes('ImportError: libffi.so.5')) {
          let azRepo = tl.execSync('lsb_release', '-cs').stdout.trim();
          console.log(`\n--------------------Error--------------------.\n Something wrong with built-in Azure CLI in agent, can't install az-cli-iot-ext.\nTry to fix with reinstall the ${azRepo} version of Azure CLI.\n\n`);
          console.log(tl.execSync('rm', '/etc/apt/sources.list.d/azure-cli.list'));
          fs.writeFileSync('/etc/apt/sources.list.d/azure-cli.list', `deb [arch=amd64] https://packages.microsoft.com/repos/azure-cli/ ${azRepo} main`);
          console.log(tl.execSync('cat', '/etc/apt/sources.list.d/azure-cli.list'));
          console.log(tl.execSync('apt-key', 'adv --keyserver packages.microsoft.com --recv-keys 52E16F86FEE04B979B07E28DB02C46DF417A0893'));
          console.log(tl.execSync('apt-get', 'install apt-transport-https'));
          console.log(tl.execSync('apt-get', 'update'));
          console.log(tl.execSync('apt-get', '--assume-yes remove azure-cli'));
          console.log(tl.execSync('apt-get', '--assume-yes install azure-cli'));
          let r = tl.execSync('az', 'extension add --name azure-cli-iot-ext --debug');
          console.log(r);
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

      let result1 = tl.execSync('az', script1);
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
    tl.execSync("az", "--version");
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

function run() {
  try {
    let inBuildPipeline = util.checkSelfInBuildPipeline(tl);
    let pathToFind = inBuildPipeline ? constants.folderNameConfig : '.';

    if(inBuildPipeline) {
      util.setupIotedgedev(tl);
      tl.execSync(`${constants.iotedgedev}`, `genconfig`, {
        cwd: tl.cwd()
      });
    }
    
    let deploymentJson = JSON.parse(fs.readFileSync(path.resolve(pathToFind, constants.fileNameDeploymentJson)));

    let dockerCredentials = util.readDockerCredentials(tl, inBuildPipeline);
    tl.debug(`Number of docker cred passed: ${dockerCredentials.length}`);
    
    // Expand docker credentials
    // Will replace the registryCredentials if the server match
    if (dockerCredentials != undefined && util.getModulesContent(deploymentJson)['$edgeAgent']['properties.desired'].runtime.settings.registryCredentials != undefined) {
      let credentials = util.getModulesContent(deploymentJson)['$edgeAgent']['properties.desired'].runtime.settings.registryCredentials;
      for(let key of Object.keys(credentials)) {
        if(credentials[key].username && (credentials[key].username.startsWith("$") || credentials[key].password.startsWith("$"))) {
          tl.debug(`Going to replace the cred in deployment.json with address: ${credentials[key].address}`);
          for(let dockerCredential of dockerCredentials) {
            if(util.isDockerServerMatch(credentials[key].address, dockerCredential.address)) {
              tl.debug(`Found matched cred in file: ${dockerCredential.address}`);
              credentials[key] = dockerCredential;
              break;
            }
          }
        }
      }
    }

    if (!azureclitask.checkIfAzurePythonSdkIsInstalled()) {
      throw new Error('Azure SDK not found');
    }
    return azureclitask.runMain(deploymentJson);
  }
  catch (e) {
    return Promise.reject(e);
  }
}

module.exports = {
  run
}
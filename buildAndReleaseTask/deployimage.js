const fs = require('fs');
const path = require('path');
const tl = require('vsts-task-lib/task');
const ContainerConnection = require('docker-common/containerconnection').default;
const sourceUtils = require('docker-common/sourceutils');
const imageUtils = require('docker-common/containerimageutils');
const request = require('request');
const crypto = require('crypto');

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
      }else {
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
  if (policyName) token += "&skn="+policyName;
  return token;
};

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

  let deviceId = 'edge4';
  let hostName = 'iot-mj-prod.azure-devices.net';
  let sasToken = 'uoTBPzhU8UeUzaiOzmuUmXa/oT1Kr2O+t8FSPUSOOFU=';
  let policyName = 'iothubowner';

  return deployToDevice(hostName, deviceId, generateSasToken(hostName, sasToken, policyName) , deploymentJson);
}

module.exports = {
  run
}
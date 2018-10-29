const constants = require('./constant');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class Util {
  static expandEnv(input, ...exceptKeys) {
    const pattern = new RegExp(/\$([a-zA-Z0-9_]+)|\${([a-zA-Z0-9_]+)}/g);
    const exceptSet = new Set(exceptKeys);
    return input.replace(pattern, (matched) => {
      if (exceptKeys && exceptSet.has(matched)) {
        return matched;
      }
      const key = matched.replace(/\$|{|}/g, "");
      return process.env[key] || matched;
    });
  }

  static validateModuleJson(moduleJsonObject) {
    // Will throw error if parent property does not exist
    if (moduleJsonObject.image.tag.platforms == undefined) {
      throw new Error(`${constants.fileNameModuleJson} image.tag.platforms not set`);
    }
    if (moduleJsonObject.image.repository == undefined) {
      throw new Error(`${constants.fileNameModuleJson} image.repository not set`);
    }
    if (moduleJsonObject.image.tag.version == undefined) {
      throw new Error(`${constants.fileNameModuleJson} image.tag.version not set`);
    }
  }

  static validateDeployTemplateJson(templateJsonObject) {
    // Will throw error if parent property does not exist
    if (Util.getModulesContent(templateJsonObject)['$edgeAgent']['properties.desired']['modules'] == undefined) {
      throw new Error(`${constants.fileNameDeployTemplateJson} modulesContent['$edgeAgent']['properties.desired']['modules'] not set`);
    }
    if (Util.getModulesContent(templateJsonObject)['$edgeAgent']['properties.desired']['systemModules'] == undefined) {
      throw new Error(`${constants.fileNameDeployTemplateJson} modulesContent['$edgeAgent']['properties.desired']['systemModules'] not set`);
    }
  }

  static generateSasToken(resourceUri, signingKey, policyName, expiresInMins = 3600) {
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
    var token = "SharedAccessSignature sr=" + resourceUri + "&sig=" +
      base64UriEncoded + "&se=" + expires;
    if (policyName) token += "&skn=" + policyName;
    return token;
  }

  static parseIoTCS(cs) {
    let m = cs.match(/HostName=(.*);SharedAccessKeyName=(.*);SharedAccessKey=(.*)$/);
    return m.slice(1);
  }

  static findFiles(filepath, tl) {
    if (filepath.indexOf('*') >= 0 || filepath.indexOf('?') >= 0) {
      tl.debug(tl.loc('ContainerPatternFound'));
      var buildFolder = tl.cwd();
      var allFiles = tl.find(buildFolder);
      var matchingResultsFiles = tl.match(allFiles, filepath, buildFolder, {
        matchBase: true
      });

      if (!matchingResultsFiles || matchingResultsFiles.length == 0) {
        console.log(`No Docker file matching ${filepath} was found.`);
      }

      return matchingResultsFiles;
    } else {
      tl.debug(tl.loc('ContainerPatternNotFound'));
      return [filepath];
    }
  }

  static getServiceEndpoints(tl) {
    let result = {};
    let endpoints = constants.serviceEndpoints;
    for (let k of Object.keys(endpoints)) {
      if (endpoints[k].inputName && tl.getInput(endpoints[k].inputName)) {
        result[k] = {
          url: tl.getEndpointUrl(tl.getInput(endpoints[k].inputName), true),
          authorization: tl.getEndpointAuthorization(tl.getInput(endpoints[k].inputName), true).parameters
        }
      }
    }
    return result;
  }

  static getModulesContent(templateObject) {
    if (templateObject.modulesContent != undefined) {
      return templateObject.modulesContent;
    }
    if (templateObject.moduleContent != undefined) {
      return templateObject.moduleContent;
    }
    throw Error(`Property moduleContent or modulesContent can't be found in template`);
  }

  static setupIotedgedev(tl) {
    try {
      let result = tl.execSync(`${constants.iotedgedev}`, `--version`, {silent: true});
      if (result.code === 0) {
        console.log(`${constants.iotedgedev} already installed with ${result.stdout.substring(result.stdout.indexOf("version"))}`);
        return;
      }
    } catch(e) {
      // If exception, it means iotedgedev is not installed. Do nothing.
    }

    let cmds = null;
    if(tl.osType() === constants.osTypeLinux) {
      cmds = [
        [`sudo`, `apt-get update`, {silent: true}],
        [`sudo`, `apt-get install -y python-setuptools`, {silent: true}],
        [`sudo`, `pip install ${constants.iotedgedev}`, {silent: true}],
      ]
    }else if(tl.osType() === constants.osTypeWindows) {
      cmds = [
        [`pip`, `install ${constants.iotedgedev}`, {silent: true}],
      ]
    }
    
    try {
      for (let cmd of cmds) {
        let result = tl.execSync(cmd[0], cmd[1], cmd[2]);
        if (result.code !== 0) {
          tl.debug(result.stderr);
        }
      }
    } catch(e) {
      // If exception, record error message to debug
      tl.debug(e);
    }
    
    let result = tl.execSync(`${constants.iotedgedev}`, `--version`, {silent: true});
    if (result.code === 0) {
      console.log(`${constants.iotedgedev} installed with ${result.stdout.substring(result.stdout.indexOf("version"))}`);
    } else {
      throw Error(`${constants.iotedgedev} installation failed, see detailed error in debug mode`);
    }
  }

  static debugOsType(tl) {
    let cmd = null;
    if(tl.osType() === constants.osTypeWindows) {
      cmd = ['systeminfo', null];
    }else if(tl.osType() === constants.osTypeLinux) {
      cmd = [`lsb_release`, `-a`];
    }
    if(cmd != null) {
      try {
        let result = tl.execSync(...cmd, {silent: true});
        tl.debug(`OS is ${result.stdout}`);
      }catch(e) {
        console.log(`Error happened when fetching os info: ${e.message}`);
      }
    }
  }

  // test
  // a b false
  // docker.io docker.io true
  // "docker.io","http://index.docker.io/v1" true
  // "zhiqing.azurecr.io","http://zhiqing.azurecr.io" true
  // "zhiqing.azurecr.io","https://zhiqing.azurecr.io" true
  // "zhiqing.azurecr.io","https://zhiqing.azurecr.io/" true
  static isDockerServerMatch(a, b) {
    if (a === b) return true;
    if (a.includes(constants.defaultDockerHubHostname) && b.includes(constants.defaultDockerHubHostname)) return true;

    let reg = new RegExp(/^(?:https?:\/\/)?(.*?)\/?$/);
    let aMatch = reg.exec(a);
    let bMatch = reg.exec(b);
    if (aMatch == null || bMatch == null) return false;
    return aMatch[1] === bMatch[1];
  }

  // Check if self(task) is included in a build pipeline
  static checkSelfInBuildPipeline(tl) {
    let hostType = tl.getVariable('system.hostType').toLowerCase();
    // Set to build if the pipeline is a build. For a release, the values are deployment for a Deployment group job and release for an Agent job.
    return hostType === 'build';
  }

  static createOrAppendDockerCredentials(tl, registryAuthenticationToken) {
    let creVar = tl.getVariable(constants.fileNameDockerCredential);

    let credentials = creVar ? JSON.parse(creVar) : [];
    if (registryAuthenticationToken) {
      credentials.push({
        username: registryAuthenticationToken.getUsername(),
        password: registryAuthenticationToken.getPassword(),
        address: registryAuthenticationToken.getLoginServerUrl()
      });
    }
    tl.setVariable(constants.fileNameDockerCredential, JSON.stringify(credentials));
  }

  static readDockerCredentials(tl, inBuildPipeline) {
    let creVar = tl.getVariable(constants.fileNameDockerCredential);

    let credentials = creVar ? JSON.parse(creVar) : [];
    return credentials;
  }

  static sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }
}

module.exports = Util;
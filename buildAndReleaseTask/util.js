const constants = require('./constant');

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
    if(moduleJsonObject.image.tag.platforms == undefined) {
      throw new Error(`${constants.fileNameModuleJson} image.tag.platforms not set`);
    }
    if(moduleJsonObject.image.repository == undefined) {
      throw new Error(`${constants.fileNameModuleJson} image.repository not set`);
    }
    if(moduleJsonObject.image.tag.version == undefined) {
      throw new Error(`${constants.fileNameModuleJson} image.tag.version not set`);
    }
  }

  static validateDeployTemplateJson(templateJsonObject) {
    // Will throw error if parent property does not exist
    if(Util.getModulesContent(templateJsonObject)['$edgeAgent']['properties.desired']['modules'] == undefined) {
      throw new Error(`${constants.fileNameDeployTemplateJson} modulesContent['$edgeAgent']['properties.desired']['modules'] not set`);
    }
    if(Util.getModulesContent(templateJsonObject)['$edgeAgent']['properties.desired']['systemModules'] == undefined) {
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
    var token = "SharedAccessSignature sr=" + resourceUri + "&sig="
      + base64UriEncoded + "&se=" + expires;
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
      var matchingResultsFiles = tl.match(allFiles, filepath, buildFolder, { matchBase: true });
  
      if (!matchingResultsFiles || matchingResultsFiles.length == 0) {
        console.log(`No Docker file matching ${filepath} was found.`);
      }
  
      return matchingResultsFiles;
    }
    else {
      tl.debug(tl.loc('ContainerPatternNotFound'));
      return [filepath];
    }
  }

  static getServiceEndpoints(tl) {
    let result = {};
    let endpoints = constants.serviceEndpoints;
    for(let k of Object.keys(endpoints)) {
      if(endpoints[k].inputName && tl.getInput(endpoints[k].inputName)) {
        result[k] = {
          url: tl.getEndpointUrl(tl.getInput(endpoints[k].inputName), true),
          authorization: tl.getEndpointAuthorization(tl.getInput(endpoints[k].inputName), true).parameters
        }
      }
    }
    return result;
  }

  static getModulesContent(templateObject) {
    if(templateObject.modulesContent != undefined) {
      return templateObject.modulesContent;
    }
    if(templateObject.moduleContent != undefined) {
      return templateObject.moduleContent;
    }
    throw Error(`Property moduleContent or modulesContent can't be found in template`);
  }
}

module.exports = Util;
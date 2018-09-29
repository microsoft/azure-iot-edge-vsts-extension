const fs = require('fs');
const path = require('path');
const template = require('./template');
const constant = require('./constant');
const tl = require('vsts-task-lib/task');

class serviceEndpointsHandler {
  constructor(dockerFilePath) {
    this.dockerFilePath = dockerFilePath;
    this.handlers = {
      nuget: this.nuget
    };
  }

  resolve(serviceEndpoints) {
    for(let k of Object.keys(serviceEndpoints)) {
      if(this.handlers[k]) {
        this.handlers[k].call(this, serviceEndpoints[k]);
      }
    }
  }

  nuget(authObject) {
    let dockerFilePath = this.dockerFilePath;
    if(!dockerFilePath) {
      throw new Error('dockerFilePath is not specified');
    }
    // generate nuget.config
    let templateNuget = template[constant.serviceEndpoints.nuget.configFileName];
    templateNuget = templateNuget.replace('$FEED_URL', authObject.url).replace('$FEED_API_KEY', authObject.authorization.apitoken);
    fs.writeFileSync(path.resolve(path.dirname(dockerFilePath), constant.serviceEndpoints.nuget.configFileName ), templateNuget);
    tl.debug(`${constant.serviceEndpoints.nuget.configFileName} created`);

    // Add "COPY NuGet.Config* ./" before the first line after "FROM" that contains with dotnet
    let dockerFileContent = fs.readFileSync(dockerFilePath, 'utf-8');
    dockerFileContent = dockerFileContent.replace(/(^(?!FROM).*dotnet.*)/m, 'COPY ' + constant.serviceEndpoints.nuget.configFileName + ' ./\n$1');
    fs.writeFileSync(dockerFilePath, dockerFileContent);
  }
}

module.exports = serviceEndpointsHandler;
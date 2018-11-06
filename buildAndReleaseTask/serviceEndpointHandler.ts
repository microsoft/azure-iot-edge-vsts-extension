import * as fs from "fs";
import * as path from "path";
import Constants from "./constant";
import * as tl from "vsts-task-lib/task";

const template = {
  "NuGet.Config": `<?xml version="1.0" encoding="utf-8"?>
  <configuration>
    <activePackageSource>
      <add key="nuget.org" value="https://www.nuget.org/api/v2/" />
    </activePackageSource>
    <packageSources>
      <add key="vsts-nuget-custom-feed" value="$FEED_URL" />
    </packageSources>
    <packageSourceCredentials>
      <vsts-nuget-custom-feed>
          <add key="Username" value="anyname" />
          <add key="ClearTextPassword" value="$FEED_API_KEY" />
      </vsts-nuget-custom-feed>
  </packageSourceCredentials>
  </configuration>`
};

export default class serviceEndpointsHandler {
  private dockerFilePath: string;
  private handlers: any;
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
    let templateNuget = template[Constants.serviceEndpoints.nuget.configFileName];
    templateNuget = templateNuget.replace('$FEED_URL', authObject.url).replace('$FEED_API_KEY', authObject.authorization.apitoken);
    fs.writeFileSync(path.resolve(path.dirname(dockerFilePath), Constants.serviceEndpoints.nuget.configFileName ), templateNuget);
    tl.debug(`${Constants.serviceEndpoints.nuget.configFileName} created`);

    // Add "COPY NuGet.Config* ./" before the first line after "FROM" that contains with dotnet
    let dockerFileContent = fs.readFileSync(dockerFilePath, 'utf-8');
    dockerFileContent = dockerFileContent.replace(/(^(?!FROM).*dotnet.*)/m, 'COPY ' + Constants.serviceEndpoints.nuget.configFileName + ' ./\n$1');
    fs.writeFileSync(dockerFilePath, dockerFileContent);
  }
}
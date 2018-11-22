import * as path from "path";
import * as fs from "fs";
import * as tl from 'vsts-task-lib/task';
import { RegistryCredential, ACRRegistry, RegistryCredentialFactory } from './registryCredentialFactory';
import Constants from "./constant";
import util from "./util";
import { IExecOptions } from 'vsts-task-lib/toolrunner';

export async function run() {
  let bypassModules = tl.getInput('bypassModules');
  if (bypassModules == null) bypassModules = "";
  tl.debug(`Bypass Modules are: ${bypassModules}`);

  let templateFilePath: string = tl.getPathInput("templateFilePath", true);
  tl.debug(`The template file path is ${templateFilePath}`);
  if (!fs.existsSync(templateFilePath)) {
    throw Error(`The path of template file is not valid: ${templateFilePath}`);
  }
  util.setTaskRootPath(path.dirname(templateFilePath));

  util.setupIotedgedev();

  let envList = {
    [Constants.iotedgedevEnv.bypassModules]: bypassModules,
  };

  // Pass task variable to sub process
  let tlVariables = tl.getVariables();
  for (let v of tlVariables) {
    // The variables in VSTS build contains dot, need to convert to underscore.
    let name = v.name.replace('.', '_').toUpperCase();
    if (!envList[name]) {
      envList[name] = v.value;
    }
  }

  tl.debug(`Following variables will be passed to the iotedgedev command: ${JSON.stringify(envList)}`);

  let execOptions: IExecOptions = {
    cwd: tl.cwd(),
    env: envList,
  } as IExecOptions;
  let defaultPlatform = tl.getInput('defaultPlatform', true);
  let command: string = `build`;
  command += ` --file ${templateFilePath}`;
  command += ` --platform ${defaultPlatform}`;
  await tl.exec(`${Constants.iotedgedev}`, command, execOptions);
}
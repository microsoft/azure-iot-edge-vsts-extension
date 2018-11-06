import {IExecSyncOptions} from 'vsts-task-lib/toolrunner';

export default class Constants {
  public static exceptStr = ["$edgeHub", "$edgeAgent", "$upstream"];
  public static fileNameDeployTemplateJson = "deployment.template.json";
  public static fileNameDeploymentJson = "deployment.json";
  public static fileNameModuleJson = "module.json";
  public static fileNameDockerCredential = "VSTS_EXTENSION_EDGE_DOCKER_CREDENTIAL";
  public static folderNameModules = "modules";
  public static folderNameConfig = "config";
  public static iotedgedev = "iotedgedev";
  public static iotedgedevEnv = {
    registryServer: "CONTAINER_REGISTRY_SERVER",
    registryUsername: "CONTAINER_REGISTRY_USERNAME",
    registryPassword: "CONTAINER_REGISTRY_PASSWORD",
    bypassModules: "BYPASS_MODULES"
  };
  public static serviceEndpoints = {
    nuget:{
      inputName: "nugetFeed",
      configFileName: "NuGet.Config",
    }
  };
  public static osTypeLinux = "Linux";
  public static osTypeWindows = "Windows_NT";
  public static osTypeMac = "Darwin";
  public static defaultDockerHubHostname = "docker.io";
  public static variableKeyDisableTelemetry = "DISABLE_TELEMETRY";
  public static execSyncSilentOption = { silent: true } as IExecSyncOptions;
  public static UTF8 = "utf8";
}
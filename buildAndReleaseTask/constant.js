let constant = {
  exceptStr: ["$edgeHub", "$edgeAgent", "$upstream"],
  fileNameDeployTemplateJson: "deployment.template.json",
  fileNameDeploymentJson: "deployment.json",
  fileNameModuleJson: "module.json",
  folderNameModules: "modules",
  folderNameConfig: "config",
  iotedgedev: "iotedgedev",
  iotedgedevEnv: {
    registryServer: "CONTAINER_REGISTRY_SERVER",
    registryUsername: "CONTAINER_REGISTRY_USERNAME",
    registryPassword: "CONTAINER_REGISTRY_PASSWORD",
    bypassModules: "BYPASS_MODULES"
  },
  serviceEndpoints: {
    nuget:{
      inputName: "nugetFeed",
      configFileName: "NuGet.Config",
    }
  }
}

module.exports = constant;
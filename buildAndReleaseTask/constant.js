let constant = {
  exceptStr: ["$edgeHub", "$edgeAgent", "$upstream"],
  fileNameDeployTemplateJson: "deployment.template.json",
  fileNameModuleJson: "module.json",
  serviceEndpoints: {
    nuget:{
      inputName: "nugetFeed",
      configFileName: "NuGet.Config",
    }
  }
}

module.exports = constant;
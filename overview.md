# Azure IoT Edge For VSTS
IoT Edge Build and Deploy is a tool for continuous integration(build and push docker image) and continuous deployment(create Edge deployment on Azure) for Azure IoT Edge modules project.

## Requirement
* The host agent should be Hosted Linux Preview.(Windows-based agents have some problem with docker)
* Your project should be a solution containing one or more Edge modules(C# or Function module)
* A deployment.template.json is under the root folder in the solution

## Usage
Please refer to this document for detailed guide.
[Continuous integration and continuous deployment to Azure IoT Edge - preview](https://docs.microsoft.com/en-us/azure/iot-edge/how-to-ci-cd)

### Specify the root path of Edge solution
In some cases, the Edge solution is not under the root of the code repository. You can specify path to the root of Edge solution in build definition. Example: If your code repository is an Edge solution, then leave it to default value './'. If your solution is under subfolder 'edge', then set it to 'edge'"
Please notice that the module.json file path is relative to the root path of solution.

### Use variables in deployment.template.json / module.json
You can write environment variables in the json file. In the form of `${ENV}` or `$ENV`.  
  
Example
```json
"tag": {
    "version": "0.0.1-${MY_BRANCH}",
    "platforms": {
        "amd64": "./Dockerfile",
        "amd64.debug": "./Dockerfile.amd64.debug",
        "arm32v7": "./Dockerfile.arm32v7",
        "windows-amd64": "./Dockerfile"
    }
}
```

Then you can set user-defined variables in VSTS bulld definition.

![variable setting in build definition](https://raw.githubusercontent.com/michaeljqzq/host-image/master/docs-3.png)

Please notice that the key of env will be automatically transformed to capitalized letter in build process. So `my_branch` here will actually be `MY_BRANCH` in build context.

And besides the user-defined environment variables, you can also use the pre-defined variables in VSTS. For example,

* BUILD_BUILDID for build number
*	BUILD_DEFINITIONNAME for build definition name
*	BUILD_SOURCEBRANCHNAME for source branch
*	…

Here’s some [reference](https://docs.microsoft.com/en-us/vsts/pipelines/build/variables?view=vsts&tabs=batch#qa) about the predefined environment variables in VSTS:

### Customize NuGet Feed
If your edge module have dependency for NuGet package in NuGet Feed other than nuget.org, you can add your feed in build definition.

In your build definitions -> Advanced tab, there’s a setting item `NuGet Feed`.

![setting in build definition](https://raw.githubusercontent.com/michaeljqzq/host-image/master/docs-1.png)

You can either choose or add one nuget endpoint. Please notice that if you use Personal Access Token in VSTS/TFS nuget package manager, your feed url should end with “/nuget/v2”, nuget v3 is not working with PAT. [Related documentation](https://docs.microsoft.com/en-us/vsts/package/nuget/nuget-exe?view=vsts#add-a-feed-to-nuget-2)

![setting add NuGet endpoint](https://raw.githubusercontent.com/michaeljqzq/host-image/master/docs-2.png)

## Contact Information
For further information or to resolve issues, contact vsciet@microsoft.com.

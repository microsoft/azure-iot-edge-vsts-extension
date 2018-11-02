# Azure IoT Edge For VSTS
IoT Edge Build and Deploy is a tool for continuous integration(build and push docker image) and continuous deployment(create Edge deployment on Azure) for Azure IoT Edge modules project.

## Requirement
* For amd64 platform, please use hosted agent `Hosted Linux Preview`. For windows-amd64 platform, please use hosted agent `Hosted VS2017`
* Your project should be a solution containing one or more Edge modules
* A deployment.template.json is under the Edge solution folder

## Usage
Please refer to this document for detailed guide.
[Continuous integration and continuous deployment to Azure IoT Edge](https://docs.microsoft.com/en-us/azure/iot-edge/how-to-ci-cd)

### Setup CI/CD pipeline
A complete CI/CD pipeline contains at least two tasks `Build and Push` and `Deploy to Edge device`. The extension support 2 ways to setup the pipeline.

1. **(Recommend)** Set `Build and Push` task in build pipeline and set `Deploy to Edge device` in release pipeline.  

    > We highly recommend this way since you can easily manage different environment(dev, QA, prod) in release pipeline. Here is a [Blog post](https://blogs.msdn.microsoft.com/iotdev/) to introduce how to setup.

2. Set both `Build and Push` and `Deploy to Edge device` in build pipeline.  

### Automatically fill the docker credentials in deployment.json
In `Build and Push` task, you will specify a docker registry credential. It will be used when the task push docker image to the registry.
When the deployment came to Edge runtime, it will pull the docker image and start a container as a running module. For non-public docker registry, the credential needs to be provided in the deployment.json. 
![registry credential setting](https://raw.githubusercontent.com/michaeljqzq/host-image/master/docs-4.png)

Here the username and password use place holder, and you can set variable `ACR_USER` and `ACR_PASS` in the variables in build pipeline. But most of the time, the credential here is the same as what we set in `Build and Push` task. So the extension provide a way to automatically fill the place holder in `registryCredentials`.

1. Set the `registryCredentials` as above snapshot.
  * For ACR, the address should be `acrname.azurecr.io` or `https://acrname.azurecr.io` or `https://acrname.azurecr.io/`
  * For Docker hub, the address should be `docker.io` or address contains `index.docker.io`
  * For other registries, it should match the `Docker Registry` when setup `Docker Registry service connection` in VSTS service endpoint.
2. In the build pipeline, make sure the container registry matches the registryCredential->address.
  ![registry credential setting](https://raw.githubusercontent.com/michaeljqzq/host-image/master/docs-5.png)

Then you can check the deployment log and see the credentials are automatically replaced.

> If you need to fill the `registryCredentials` with credentials other than the ones in build pipeline, you need to put placeholder as above and set `variable` with corresponding key. 

### Specify the root path of Edge solution
In some cases, the Edge solution is not under the root of the code repository. You can specify `Path of Edge solution root` in `Build` or `Build and Push` task.  
Example: If your code repository is an Edge solution, then leave it to default value `./`. If your solution is under subfolder 'edge', then set it to `edge`  
Please notice that the `deployment.template.json` should be in the root path of solution.

> For the setting in `Deploy to Edge device` task. If this task is in Build Pipeline, then `Path of Edge solution root` setting should be same as `Build` or `Build and Push` task. If this task is in Release Pipeline, then `Path of Edge solution root` setting use default value `./`.

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

## Q & A

#### I met error `Error: Unable to locate executable file: 'iotedgedev'` in build task.
The extension leverages the python cli tool `iotedgedev` to build and push docker images. In the beginning of the task, the tool will be installed. The problem is probably because `iotedgedev` is not able to be installed. Please check:
1. You chose `Hosted Linux Preview` or `Hosted VS2017` if you use hosted agent. For self-hosted agent, make sure python and pip are installed.
2. You can check if `pip` works by creating a `Bash Script` task with the content `pip --version`.

#### I met error `Error: a Windows version 10.0.17134-based image is incompatible with a 10.0.14393 host` in build task
The reason is that the host to build docker image is 14393, while the base image specified in dockerfile is 17134. According [Windows container version compatibility](https://docs.microsoft.com/en-us/virtualization/windowscontainers/deploy-containers/version-compatibility), the old host is not capable of building the image based on newer windows version.
You can try the following solutions:
1.	If it is allowed, change the base image in your dockerfile to match the hosted agent windows version 14393. It will make the build work, and the image can also be used in your higher version windows server. Older containers will run the same on newer hosts with [Hyper-V isolation](https://docs.microsoft.com/en-us/virtualization/windowscontainers/manage-containers/hyperv-container), you can set [createOptions](https://docs.microsoft.com/en-us/azure/iot-edge/module-edgeagent-edgehub) in deployment.template.json to add docker run parameters
2.	Setup a private agent with 17134 windows version


## Raise issue
When meeting issue, please follow the steps to open an issue on our [Github repository](https://github.com/Microsoft/azure-iot-edge-vsts-extension)

1. For the failed pipeline, try queueing a new build with `system.debug` set to `true`. It will provide more information for us to investigate the issue
![set debug flag](https://raw.githubusercontent.com/michaeljqzq/host-image/master/docs-6.png)

2. Download the logs of the build and attach it in the issue
![download logs](https://raw.githubusercontent.com/michaeljqzq/host-image/master/docs-7.png)

## Contribution guide
1. Fork the [Github repository](https://github.com/Microsoft/azure-iot-edge-vsts-extension) and clone to local
2. Make the changes to the code
3. In order to test privately in your personal account, make changes in `vss-extension.json`.
  * Change `publisher` to your personal publisher id.
  * Change `public` flag to `false`
4. Refer to [Package your extension](https://docs.microsoft.com/en-us/azure/devops/extend/develop/add-build-task?view=vsts#step-4-package-your-extension) to package and publish extension to personal account and do test
5. Create a PR in the repository

## Data/Telemetry

This project collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](http://go.microsoft.com/fwlink/?LinkId=521839) to learn more.

## Contact Information
We fully welcome your feedback or suggestion for the extension, you can send Email to `Azure IoT Edge Tooling team` vsciet@microsoft.com

# Azure IoT Edge For VSTS
IoT Edge Build and Deploy is a tool for continuous integration(build and push docker image) and continuous deployment(create Edge deployment on Azure) for Azure IoT Edge modules project.

## Requirement
* The host agent should be Hosted Linux Preview.(Windows-based agents have some problem with docker)
* Your project should be a solution containing one or more Edge modules(C# or Function module)
* A deployment.template.json is under the root folder in the solution

## Usage
Please refer to this document for detailed guide.
[Continuous integration and continuous deployment to Azure IoT Edge - preview](https://docs.microsoft.com/en-us/azure/iot-edge/how-to-ci-cd)

## Contact Information
For further information or to resolve issues, contact vsciot@microsoft.com.

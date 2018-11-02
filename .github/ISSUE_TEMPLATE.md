## Having generic issue with IoT Edge infrastructure?
Log issue at [IoT Edge](https://github.com/Azure/iotedge), it contains the infrastructure including the implementation of `Edge Agent`, `Edge Hub`, `Edge runtime`. 

## Before you log issue...
When meeting issue, please follow the steps to open an issue on our [Github repository](https://github.com/Microsoft/azure-iot-edge-vsts-extension).

1. For the failed pipeline, try queueing a new build with `system.debug` set to `true`. It will provide more information for us to investigate the issue.
![set debug flag](https://raw.githubusercontent.com/michaeljqzq/host-image/master/docs-6.png)

2. Download the logs of the build and attach it in the issue
![download logs](https://raw.githubusercontent.com/michaeljqzq/host-image/master/docs-7.png)

## Agent type
Use hosted agent or private agent? `hosted`/`private`

For hosted agent, which one? `Hosted VS2017`/`Hosted Linux Preview`/`Hosted Ubuntu 1604` ...

For private agent, check if the following prerequisites already pre-installed? `python`/`pip`/`docker`

## What's not working?
Please include the logs and describe the issue.

## Steps to reproduce
1.
2.
3.

## Expect behavior
What is the expected behavior?
## Changelog

### 1.1.2
+ Officially open source. Add documentations, quick start guides.
+ Support hosted agent `Hosted Ubuntu 1604` for amd-64 platform build.

### 1.1.1
+ Fix: Check container registry for the Build-only task
+ Fix: Print Operating System information

### 1.1.0
+ Integrate with iotedgedev CLI to do docker related work
+ Suppport to use Windows Build Agent(Hosted VS2017) which will use Windows Container to build docker image
+ Support to put deploy task in the release pipeline and use artifact to pass the deployment.json
+ Automatically fill in docker credentials in deployment.json with the corresponding docker credentials set in build pipeline

### 1.0.4
+ Fix: Work around for build agent issue: az command will exit with non-zero code since configuration files are missing

### 1.0.3
+ Fix: When deploy image, it will search for module.json out of the scope of solution root

### 1.0.2
+ Align with property change in manifest: "modulesContent", keep compatibility with old pattern "moduleContent"

### 1.0.1
+ Add support to specify the root path of Edge solution
+ Add support to add multiple deploy tasks in one job(which can support multiple Edge solutions in one code repository)

### 1.0.0
+ Fix: Platform contains '.' will cause build failed
+ Add "Get Started" link in extension page
+ Add "Change log" link in extension page

### 0.1.9
+ Automatically fill the docker credentials in all build processes in deployment manifest

### 0.1.8
+ Add support for environment variable expand

### 0.1.7
+ Add support for customization of NuGet Feed

### 0.1.6
+ Set the result of build task as success(instead of fail) when no modules are built or push
+ When modules in deployment.template.json conflict with those in modules folder, will log the message and set task result to success
+ Update detailed documentation in extension page 
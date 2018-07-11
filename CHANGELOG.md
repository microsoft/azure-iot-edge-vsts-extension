## Changelog

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
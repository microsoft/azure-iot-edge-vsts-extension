import fs from "fs";
import tl from "vsts-task-lib/task";
import ContainerConnection from "docker-common/containerconnection";
import sourceUtils from "docker-common/sourceutils";
import imageUtils from "docker-common/containerimageutils";

function dockerPush(connection, image, imageDigestFile, useMultiImageMode) {
  var command = connection.createCommand();
  command.arg("push");
  command.arg(image);

  if (!imageDigestFile) {
      return connection.execCommand(command);
  }

  var output = "";
  command.on("stdout", data => {
      output += data;
  });

  return connection.execCommand(command).then(() => {
      // Parse the output to find the repository digest
      var imageDigest = output.match(/^[^:]*: digest: ([^ ]*) size: \d*$/m)[1];
      if (imageDigest) {
          let baseImageName = imageUtils.imageNameWithoutTag(image);
          let formattedDigestValue = baseImageName + "@" + imageDigest;
          if (useMultiImageMode) {
              // If we're pushing multiple images, we need to append all the digest values. Each one is contained on its own line.
              fs.appendFileSync(imageDigestFile, formattedDigestValue + "\r\n");
          } else {
              fs.writeFileSync(imageDigestFile, formattedDigestValue);
          }
      }
  });
}

function getImageMappings(connection, imageNames) {
  let qualifyImageName = tl.getBoolInput("qualifyImageName");
  let imageInfos = imageNames.map(imageName => {
      let qualifiedImageName = qualifyImageName ? connection.qualifyImageName(imageName) : imageName;
      return {
          sourceImageName: imageName,
          qualifiedImageName: qualifiedImageName,
          baseImageName: imageUtils.imageNameWithoutTag(qualifiedImageName),
          taggedImages: []
      };
  });

  let additionalImageTags = tl.getDelimitedInput("additionalImageTags", "\n");
  let includeSourceTags = tl.getBoolInput("includeSourceTags");
  let includeLatestTag = tl.getBoolInput("includeLatestTag");

  let sourceTags = [];
  if (includeSourceTags) {
      sourceTags = sourceUtils.getSourceTags();
  }

  let commonTags = additionalImageTags.concat(sourceTags);

  // For each of the image names, generate a mapping from the source image name to the target image.  The same source image name
  // may be listed more than once if there are multiple tags.  The target image names will be tagged based on the task configuration.
  for (let i = 0; i < imageInfos.length; i++) {
      let imageInfo = imageInfos[i];
      let imageSpecificTags = [];
      if (imageInfo.baseImageName === imageInfo.qualifiedImageName) {
          imageSpecificTags.push("latest");
      } else {
          imageInfo.taggedImages.push(imageInfo.qualifiedImageName);
          if (includeLatestTag) {
              imageSpecificTags.push("latest");
          }
      }

      commonTags.concat(imageSpecificTags).forEach(tag => {
          imageInfo.taggedImages.push(imageInfo.baseImageName + ":" + tag);
      });
  }

  // Flatten the image infos into a mapping between the source images and each of their tagged target images
  let sourceToTargetMapping = [];
  imageInfos.forEach(imageInfo => {
      imageInfo.taggedImages.forEach(taggedImage => {
          sourceToTargetMapping.push({
              sourceImageName: imageInfo.sourceImageName,
              targetImageName: taggedImage
          });
      });
  });

  return sourceToTargetMapping;
}

export function run(connection) {
  // let action = tl.getInput("action", true);

  let imageNames;
  // let useMultiImageMode = false;// action === "Push images";
  // if (useMultiImageMode) {
  //     imageNames = utils.getImageNames();
  // } else {
      imageNames = [tl.getInput("imageName", true)];
  // }
  
  let imageMappings = getImageMappings(connection, imageNames);

  let imageDigestFile = null;
  if (tl.filePathSupplied("imageDigestFile")) {
      imageDigestFile = tl.getPathInput("imageDigestFile");
  }

  let firstImageMapping = imageMappings.shift();
  let pushedSourceImages = [firstImageMapping.sourceImageName];
  let promise = dockerPush(connection, firstImageMapping.targetImageName, imageDigestFile, useMultiImageMode);
  imageMappings.forEach(imageMapping => {
      // If we've already pushed a tagged version of this source image, then we don't want to write the digest info to the file since it will be duplicate.
      if (pushedSourceImages.indexOf(imageMapping.sourceImageName) >= 0) {
          promise = promise.then(() => dockerPush(connection, imageMapping.targetImageName));
      } else {
          pushedSourceImages.push(imageMapping.sourceImageName);
          promise = promise.then(() => dockerPush(connection, imageMapping.targetImageName, imageDigestFile, useMultiImageMode));
      }
  });

  return promise;
}

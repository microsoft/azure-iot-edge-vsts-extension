import * as path from "path";
import * as tl from 'azure-pipelines-task-lib/task';
import * as BuildImage from './buildimage';
import * as PushImage from './pushimage';
import * as DeployImage from './deployimage';
import trackEvent, { TelemetryEvent } from './telemetry';
import Constants from "./constant";
import util from "./util";

tl.setResourcePath(path.join(__dirname, 'task.json'));

util.debugOsType();

let startTime: Date = new Date();

let action: string = tl.getInput("action", true);

let telemetryEvent = {
  hashTeamProjectId: util.sha256(tl.getVariable('system.teamProjectId')),
  taskType: action,
  osType: tl.osType(),
  buildId: tl.getVariable('build.buildId'),
  isSuccess: null,
  taskTime: null,
} as TelemetryEvent;

let telemetryEnabled = (tl.getVariable(Constants.variableKeyDisableTelemetry) !== 'true');

async function run() {
  try {
    if (action === 'Build module images') {
      console.log('Building module images...');
      await BuildImage.run();
      console.log('Finished building module images');
    } else if (action === 'Push module images') {
      console.log('Pushing module images...');
      telemetryEvent.isACR = tl.getInput("containerregistrytype", true) === "Azure Container Registry";
      await PushImage.run();
      console.log('Finished pushing module images');
    } else if (action === 'Deploy to IoT Edge devices') {
      console.log('Start deploying');
      telemetryEvent.hashIoTHub = util.sha256(tl.getInput("iothubname", true));
      await DeployImage.run(telemetryEvent);
      console.log('Finished Deploying');
    }
    telemetryEvent.isSuccess = true;
    tl.setResult(tl.TaskResult.Succeeded, "");
  } catch (e) {
    telemetryEvent.isSuccess = false;
    tl.setResult(tl.TaskResult.Failed, e)
  } finally {
    telemetryEvent.taskTime = (+new Date() - (+startTime)) / 1000;
    if (telemetryEnabled) trackEvent(action, telemetryEvent);
  }
}

run();


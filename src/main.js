import { IncomingWebhook } from "@slack/webhook";
import { Actor } from "apify";
import { mapValuesDeep } from "deepdash/standalone";
import { readFileSync } from "fs";
import lodash from "lodash";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { interpolate } from "./utils.js";
const { defaults, mapKeys, snakeCase } = lodash;

await Actor.init();

const {
  userId,
  createdAt,
  eventType,
  eventData,
  resource,
  slackWebhookUrl,
  slackWebhookArguments = {},
} = await Actor.getInput();

if (!slackWebhookUrl) {
  throw new Error("Slack webhook URL is required");
}

// Get actor/task objects and the run log.
const apifyClient = Actor.newClient();

const actor = await apifyClient.actor(eventData.actorId).get();
const task = eventData.actorTaskId
  ? await apifyClient.task(eventData.actorTaskId).get()
  : null;
const runLog = await apifyClient.log(eventData.actorRunId).get();

// Get default arguments for sending the message.
const defaultArgs = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../default-webhook-args.json",
    ),
    { encoding: "utf-8" },
  ),
);

// Merge input with the defaults.
const mergedArgs = defaults({}, slackWebhookArguments, defaultArgs);

// Interpolate string values.
const interpolatedArgs = mapValuesDeep(
  mergedArgs,
  (value) =>
    typeof value === "string"
      ? interpolate(value, {
          userId,
          createdAt,
          eventType,
          eventData,
          resource,
          actor,
          task,
          runLog,
        })
      : value,
  { leavesOnly: true },
);

// Convert argument keys to snake case.
const args = mapKeys(interpolatedArgs, (value, key) => snakeCase(key));

// Send the Slack message.
const slackWebhook = new IncomingWebhook(slackWebhookUrl);
await slackWebhook
  .send(args)
  .then(() => {
    apifyClient.logger.info("Slack message sent successfully");
  })
  .catch((error) => {
    let message = `Failed to send Slack message: ${error.code}`;
    if (error.original?.response) {
      message = `${message}: ${error.original.response.data}`;
    }
    apifyClient.logger.error(message);
    throw error;
  });

await Actor.exit();

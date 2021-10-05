const Apify = require("apify");
const { IncomingWebhook } = require("@slack/webhook");
const { readFileSync } = require("fs");
const { defaults, mapKeys, snakeCase } = require("lodash");
const { mapValuesDeep } = require("deepdash/standalone");
const { interpolate } = require("./utils");
const { log } = Apify.utils;

Apify.main(async () => {
  const {
    userId,
    createdAt,
    eventType,
    eventData,
    resource,
    slackWebhookUrl,
    slackWebhookArguments = {},
  } = await Apify.getInput();

  if (!slackWebhookUrl) {
    throw new Error("Slack webhook URL is required");
  }

  // Get actor/task objects and the run log.
  const apifyClient = Apify.newClient();

  const actor = await apifyClient.actor(eventData.actorId).get();
  const task = eventData.actorTaskId
    ? await apifyClient.task(eventData.actorTaskId).get()
    : null;
  const runLog = await apifyClient.log(eventData.actorRunId).get();

  // Get default arguments for sending the message.
  const defaultArgs = JSON.parse(
    readFileSync(`${__dirname}/../default-webhook-args.json`),
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
      log.info("Slack message sent successfully");
    })
    .catch((error) => {
      let message = `Failed to send Slack message: ${error.code}`;
      if (error.original?.response) {
        message = `${message}: ${error.original.response.data}`;
      }
      log.error(message);
      throw error;
    });
});

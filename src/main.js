const Apify = require("apify");
const { IncomingWebhook } = require("@slack/webhook");
const { mapValuesDeep } = require("deepdash/standalone");
const { log } = Apify.utils;

/**
 * Interpolate the string using given parameters.
 *
 * The string is interpolated as if it was a template literal but with only
 * the parameters available. Nested interpolation is also supported.
 */
const interpolate = (string, params) => {
  const keys = Object.keys(params);
  const values = Object.values(params);

  const _interpolate = (s) => {
    const escaped = s.replace(/`/g, "\\`");
    return new Function(...keys, `return \`${escaped}\`;`)(...values);
  };

  // Use multiple passes if needed to support nested interpolation.
  let input;
  let result = string;
  do {
    input = result;
    result = _interpolate(input);
  } while (result !== input);
  return result;
};

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

  // Construct default arguments for sending the message.
  const defaultArgs = {
    channel: "#notifications",
    username: "actor-slack-notification-webhook",
    icon_url: "https://avatars.githubusercontent.com/u/24586296",
    text: "Apify ${eventType.split('.').map(v => v.replace(/_/g, ' ').toLowerCase()).join(' ')}",
    blocks: [
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: "*Actor ID:* <https://console.apify.com/actors/${actor.id}|${actor.id}>",
          },
          {
            type: "mrkdwn",
            text: "*Actor name:* ${actor.name}",
          },
          {
            type: "mrkdwn",
            text: "*Task ID:* ${task ? '<https://console.apify.com/actors/tasks/${task.id}|${task.id}>' : '—'}",
          },
          {
            type: "mrkdwn",
            text: "*Task name:* ${task ? task.name : '—'}",
          },
          {
            type: "mrkdwn",
            text: "*Run ID:* <https://console.apify.com/actors/${actor.id}/runs/${eventData.actorRunId}|${eventData.actorRunId}>",
          },
          {
            type: "mrkdwn",
            text: "*Status:* ${eventType.split('.').pop()}",
          },
          {
            type: "mrkdwn",
            text: "*Started:* ${resource.startedAt}",
          },
          {
            type: "mrkdwn",
            text: "*Finished:* ${resource.finishedAt || '—'}",
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Log:*\n```${runLog.split('\\n').slice(-15).join('\\n')}```",
        },
      },
    ],
    link_names: true,
    unfurl_links: false,
    unfurl_media: false,
  };

  // Merge the defaults with the input.
  const mergedArgs = {
    ...defaultArgs,
    ...(Object.prototype.hasOwnProperty.call(
      slackWebhookArguments,
      "channel",
    ) && {
      channel: slackWebhookArguments.channel,
    }),
    ...(Object.prototype.hasOwnProperty.call(
      slackWebhookArguments,
      "username",
    ) && {
      username: slackWebhookArguments.username,
    }),
    ...(Object.prototype.hasOwnProperty.call(
      slackWebhookArguments,
      "iconEmoji",
    ) && {
      icon_emoji: slackWebhookArguments.iconEmoji,
    }),
    ...(Object.prototype.hasOwnProperty.call(
      slackWebhookArguments,
      "iconUrl",
    ) && {
      icon_url: slackWebhookArguments.iconUrl,
    }),
    ...(Object.prototype.hasOwnProperty.call(slackWebhookArguments, "text") && {
      text: slackWebhookArguments.text,
    }),
    ...(Object.prototype.hasOwnProperty.call(
      slackWebhookArguments,
      "blocks",
    ) && {
      blocks: slackWebhookArguments.blocks,
    }),
    ...(Object.prototype.hasOwnProperty.call(
      slackWebhookArguments,
      "attachments",
    ) && {
      attachments: slackWebhookArguments.attachments,
    }),
    ...(Object.prototype.hasOwnProperty.call(
      slackWebhookArguments,
      "linkNames",
    ) && {
      link_names: slackWebhookArguments.linkNames,
    }),
    ...(Object.prototype.hasOwnProperty.call(
      slackWebhookArguments,
      "unfurlLinks",
    ) && {
      unfurl_links: slackWebhookArguments.unfurlLinks,
    }),
    ...(Object.prototype.hasOwnProperty.call(
      slackWebhookArguments,
      "unfurlMedia",
    ) && {
      unfurl_media: slackWebhookArguments.unfurlMedia,
    }),
  };

  // Interpolate the strings.
  const args = mapValuesDeep(
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
        message += `: ${error.original.response.data}`;
      }
      log.error(message);
      throw error;
    });
});

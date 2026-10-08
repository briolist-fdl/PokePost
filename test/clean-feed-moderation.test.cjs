const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCleanFeedModeration, instructionFor } = require('../src/cleanFeedModeration');

function fixture({ settings, channelId = 'main', bot = false, permissions = true } = {}) {
  const events = { deleted: 0, sent: [], delayed: [] };
  const instruction = { delete: async () => { events.instructionDeleted = true; } };
  const channel = {
    permissionsFor: () => ({ has: () => permissions }),
    send: async payload => { events.sent.push(payload); return instruction; },
  };
  return { events, message: {
    guildId: 'guild', channelId, author: { id: 'member', bot }, channel,
    guild: { members: { me: { id: 'bot' } } }, inGuild: () => true,
    delete: async () => { events.deleted += 1; }, settings,
  } };
}

test('removes regular messages in a configured clean feed and posts a temporary instruction', async () => {
  const value = fixture({ settings: { moderateChannels: true, internationalChannelId: 'main', localChannelId: 'local' } });
  const moderation = createCleanFeedModeration({ store: { get: async () => value.message.settings }, schedule: (fn, ms) => value.events.delayed.push([fn, ms]) });
  assert.equal(await moderation.handle(value.message), true);
  assert.equal(value.events.deleted, 1);
  assert.deepEqual(value.events.sent, [{ content: instructionFor('member'), allowedMentions: { parse: [], users: ['member'] } }]);
  assert.equal(value.events.delayed[0][1], 20000);
  await value.events.delayed[0][0]();
  assert.equal(value.events.instructionDeleted, true);
});

test('does not touch bot messages, other channels or feeds that allow conversation', async () => {
  for (const value of [
    fixture({ settings: { moderateChannels: false, internationalChannelId: 'main' } }),
    fixture({ settings: { moderateChannels: true, internationalChannelId: 'other' } }),
    fixture({ settings: { moderateChannels: true, internationalChannelId: 'main' }, bot: true }),
  ]) {
    const moderation = createCleanFeedModeration({ store: { get: async () => value.message.settings } });
    assert.equal(await moderation.handle(value.message), false);
    assert.equal(value.events.deleted, 0);
    assert.equal(value.events.sent.length, 0);
  }
});

test('leaves messages intact when the bot lacks required channel permissions', async () => {
  const value = fixture({ settings: { moderateChannels: true, internationalChannelId: 'main' }, permissions: false });
  const moderation = createCleanFeedModeration({ store: { get: async () => value.message.settings }, logger: { warn: () => {} } });
  assert.equal(await moderation.handle(value.message), false);
  assert.equal(value.events.deleted, 0);
});

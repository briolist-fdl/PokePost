const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createFeedMessageModeration}=require('../src/feedMessageModeration');

function message({guildId='123456789012345678',channelId='223456789012345678',authorId='323456789012345678',bot=false}={}) {
  const calls={deleted:0,warnings:[],warningDeletes:0};
  return {calls,message:{guildId,channelId,author:{id:authorId,bot},delete:async()=>{calls.deleted++;},channel:{send:async payload=>{calls.warnings.push(payload);return {delete:async()=>{calls.warningDeletes++;}};}}}};
}

test('configured feeds remove a regular message and send the legacy setup warning',async()=>{
  const delays=[];const fixture=message();
  const moderation=createFeedMessageModeration({getSettings:async()=>({internationalChannelId:fixture.message.channelId,localChannelId:null}),setTimeoutFn:(fn,delay)=>{delays.push(delay);fn();}});
  assert.equal(await moderation.handle(fixture.message),true);
  assert.equal(fixture.calls.deleted,1);assert.equal(fixture.calls.warnings.length,1);assert.match(fixture.calls.warnings[0].content,/Please use `\/post setup`/);assert.equal(fixture.calls.warnings[0].allowedMentions.users[0],fixture.message.author.id);assert.deepEqual(delays,[22000]);assert.equal(fixture.calls.warningDeletes,1);
});

test('other channels and bot messages are ignored',async()=>{
  const fixture=message();const moderation=createFeedMessageModeration({getSettings:async()=>({internationalChannelId:'423456789012345678',localChannelId:null})});
  assert.equal(await moderation.handle(fixture.message),false);assert.equal(fixture.calls.deleted,0);
  const bot=message({bot:true});assert.equal(await moderation.handle(bot.message),false);assert.equal(bot.calls.deleted,0);
});

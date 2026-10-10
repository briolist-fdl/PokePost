const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ButtonStyle}=require('discord.js');
const {createProfileRenderer}=require('../src/profileRenderer');
const {scopedCopyButtons}=require('../src/guildProfileCommands');

const profile={
 guild_id:'123456789012345678',discord_user_id:'234567890123456789',
 trainer_code_raw:'123456789012',additional_codes:['234567890123','345678901234','456789012345'],
 vivillon_pattern:'tundra',pokemon_username:'Trainer',campfire_username:null
};

test('profile text shows the fetched username without an inline link or mention',async()=>{
 const render=createProfileRenderer({users:{fetch:async()=>({username:'clear_name'})}});
 const content=await render(profile);
 assert.match(content,/clear\\_name/);
 assert.doesNotMatch(content,/discord\.com\/users|<@234567890123456789>/);
});

test('a failed user lookup retains a neutral label and never adds a preview link',async()=>{
 const render=createProfileRenderer({users:{fetch:async()=>{throw Error('Unavailable');}}});
 const content=await render(profile);
 assert.match(content,/Discord profile/);
 assert.doesNotMatch(content,/discord\.com\/users/);
});

test('profile link button is beside the primary copy button, including with three extra codes',()=>{
 const rows=scopedCopyButtons(profile).map(row=>row.toJSON());
 assert.equal(rows.length,1);
 const buttons=rows[0].components;
 assert.equal(buttons.length,5);
 assert.equal(buttons[0].custom_id,`guild_copy:${profile.guild_id}:${profile.discord_user_id}:0`);
 assert.equal(buttons[1].style,ButtonStyle.Link);
 assert.equal(buttons[1].label,'View profile');
 assert.equal(buttons[1].url,`https://discord.com/users/${profile.discord_user_id}`);
 assert.equal(buttons[1].custom_id,undefined);
 assert.equal(buttons[2].custom_id,`guild_copy:${profile.guild_id}:${profile.discord_user_id}:1`);
});

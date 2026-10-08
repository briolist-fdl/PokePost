const BOTS = {
  'poke-post': {
    name: 'PokéPost',
    githubUrl: 'https://github.com/briolist-fdl/PokePost',
    topggUrl: '',
    discordBotListUrl: '',
    buyMeACoffeeUrl: 'https://buymeacoffee.com/briolist',
    supportMessageChance: 1.0,
  },

  relayonme: {
    name: 'RelayOnMe',
    githubUrl: 'https://github.com/briolist-fdl/relayonme',
    topggUrl: '',
    discordBotListUrl: '',
    buyMeACoffeeUrl: 'https://buymeacoffee.com/briolist',
    supportMessageChance: 0.2,
  },

  sap: {
    name: 'Selective Auto Publisher',
    githubUrl: 'https://github.com/briolist-fdl/selective-auto-publisher',
    topggUrl: '',
    discordBotListUrl: '',
    buyMeACoffeeUrl: 'https://buymeacoffee.com/briolist',
    supportMessageChance: 0.2,
  },
};

function getBotConfig() {
  const botId = process.env.BOT_ID;

  if (!botId) {
    throw new Error('Missing BOT_ID in .env');
  }

  const config = BOTS[botId];

  if (!config) {
    throw new Error(`Unknown BOT_ID: ${botId}`);
  }

  return {
    id: botId,
    ...config,
  };
}

module.exports = {
  BOTS,
  getBotConfig,
};

// News sources. Each one is an RSS or Atom feed.
// To add a site, add a line here. A feed that is down or broken is skipped
// and does not stop the others. `team` marks a feed that only covers one team,
// so every article from it counts as that team's news.

// The team this tracker is built around.
export const FOCUS = {
  abbr: 'PHI',
  name: 'Philadelphia Eagles',
  short: 'Eagles',
  espnId: 'phi',
  // Names that mean "Eagles" even when the team isn't mentioned.
  // Current players are added automatically from ESPN's roster.
  extraWords: ['sirianni', 'roseman', 'lincoln financial field'],
  timeZone: 'America/New_York',
};

export const SOURCES = [
  // Eagles-only coverage
  { name: 'Google News: Eagles', team: 'PHI', url: 'https://news.google.com/rss/search?q=%22Philadelphia+Eagles%22+OR+%22Eagles%22+NFL+when:1d&hl=en-US&gl=US&ceid=US:en' },
  // Philly outlets whose own feeds don't work, through Google News instead.
  { name: 'Google News: Philly papers', team: 'PHI', url: 'https://news.google.com/rss/search?q=Eagles+(site:inquirer.com+OR+site:phillyvoice.com+OR+site:philadelphiaeagles.com+OR+site:6abc.com)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Bleeding Green Nation', team: 'PHI', url: 'https://www.bleedinggreennation.com/rss/index.xml' },
  { name: 'NBC Sports Philadelphia', team: 'PHI', url: 'https://www.nbcsportsphiladelphia.com/nfl/philadelphia-eagles/feed/' },
  { name: 'PFR: Eagles', team: 'PHI', url: 'https://www.profootballrumors.com/philadelphia-eagles/feed' },

  // Whole league
  { name: 'ProFootballTalk', url: 'https://profootballtalk.nbcsports.com/feed/' },
  { name: 'Pro Football Rumors', url: 'https://www.profootballrumors.com/feed' },
  { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/nfl/' },
  { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/nfl/rss/' },
  // Big outlets whose own feeds don't work, through Google News instead.
  { name: 'Google News: ESPN, NFL.com, SI, B/R', url: 'https://news.google.com/rss/search?q=NFL+(site:espn.com+OR+site:nfl.com+OR+site:si.com+OR+site:bleacherreport.com+OR+site:theringer.com+OR+site:theathletic.com)+when:1d&hl=en-US&gl=US&ceid=US:en' },
  // Google News picks up breaking stories from hundreds of outlets quickly.
  { name: 'Google News', url: 'https://news.google.com/rss/search?q=NFL+when:1d&hl=en-US&gl=US&ceid=US:en' },
];

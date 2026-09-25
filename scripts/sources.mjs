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
  { name: 'Bleeding Green Nation', team: 'PHI', url: 'https://www.bleedinggreennation.com/rss/index.xml' },
  { name: 'Philadelphia Inquirer', team: 'PHI', url: 'https://www.inquirer.com/arc/outboundfeeds/rss/category/sports/eagles/?outputType=xml' },
  { name: 'PhillyVoice', team: 'PHI', url: 'https://www.phillyvoice.com/feed/section/eagles/' },
  { name: 'NBC Sports Philadelphia', team: 'PHI', url: 'https://www.nbcsportsphiladelphia.com/nfl/philadelphia-eagles/feed/' },
  { name: 'PFR: Eagles', team: 'PHI', url: 'https://www.profootballrumors.com/philadelphia-eagles/feed' },

  // Whole league
  { name: 'ESPN', url: 'https://www.espn.com/espn/rss/nfl/news' },
  { name: 'NFL.com', url: 'https://www.nfl.com/feeds/rss/news' },
  { name: 'ProFootballTalk', url: 'https://profootballtalk.nbcsports.com/feed/' },
  { name: 'Pro Football Rumors', url: 'https://www.profootballrumors.com/feed' },
  { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/nfl/' },
  { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/nfl/rss/' },
  { name: 'Sports Illustrated', url: 'https://www.si.com/nfl/.rss/full/' },
  { name: 'Bleacher Report', url: 'https://bleacherreport.com/articles/feed?tag_id=16' },
  { name: 'The Ringer', url: 'https://www.theringer.com/rss/nfl/index.xml' },
  // Google News picks up breaking stories from hundreds of outlets quickly.
  { name: 'Google News', url: 'https://news.google.com/rss/search?q=NFL+when:1d&hl=en-US&gl=US&ceid=US:en' },
];

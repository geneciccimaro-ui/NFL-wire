// NFL news sources. Each one is an RSS or Atom feed.
// To add a site, add a line here. A feed that is down or broken is skipped
// and does not stop the others.
export const SOURCES = [
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

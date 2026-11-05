const Parser = require('rss-parser');
const parser = new Parser({
    headers: {
        'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml; q=0.9, */*; q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
});

async function testFeed() {
    const url = "http://op.europa.eu/o/opportal-service/rss/savedQuery?queryid=131291&hash=MTAxNTc7MTAxODQ7MTc4NjcwNjYyMDg3NA==&";
    try {
        const feed = await parser.parseURL(url);
        console.log("Feed Title:", feed.title);
        console.log("Items Count:", feed.items.length);
        if (feed.items.length > 0) {
            console.log("First Item Title:", feed.items[0].title);
            console.log("First Item PubDate:", feed.items[0].pubDate);
            console.log("First Item GUID:", feed.items[0].guid || feed.items[0].link);
        }
    } catch (e) {
        console.error("Error parsing feed:", e);
    }
}

testFeed();

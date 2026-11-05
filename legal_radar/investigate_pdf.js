const Parser = require('rss-parser');
const axios = require('axios');
const parser = new Parser({
    headers: {
        'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml; q=0.9, */*; q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
});

const urlsToTest = [
    'https://www.recht.bund.de/rss/feeds/rss_bgbl-1-2.xml?nn=211452',
    'https://www.gesetze-im-internet.de/aktuDienst-rss-feed.xml',
    'http://op.europa.eu/o/opportal-service/rss/savedQuery?queryid=131291&hash=MTAxNTc7MTAxODQ7MTc4NjcwNjYyMDg3NA==&'
];

async function investigate() {
    for (const url of urlsToTest) {
        console.log(`\nChecking feed: ${url}`);
        try {
            const feed = await parser.parseURL(url);
            if (feed.items.length > 0) {
                const item = feed.items[0];
                console.log(`Found link: ${item.link}`);
                
                // Fetch the HTML of the link
                const response = await axios.get(item.link, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                
                const html = response.data;
                // Count how many .pdf links are there
                const pdfMatches = html.match(/href="([^"]+\.pdf)"/g);
                if (pdfMatches) {
                    console.log(`Found PDF links: ${pdfMatches.slice(0, 3).join(', ')}`);
                } else {
                    console.log("No explicit .pdf links found in href attributes.");
                }
            }
        } catch(e) {
            console.error(`Error on feed ${url}:`, e.message);
        }
    }
}

investigate();

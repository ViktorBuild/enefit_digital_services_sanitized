const Parser = require('rss-parser');
const { AzureOpenAI } = require('openai');
const { saveLaw, lawExists, getSetting } = require('./db');
const cheerio = require('cheerio');
const axios = require('axios');
const pdfParse = require('pdf-parse');

const parser = new Parser({
    headers: {
        'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml; q=0.9, */*; q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
});

// Secure Azure OpenAI Client via Environment Variables
const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT || "https://enefit-llm.openai.azure.com/",
  apiKey: process.env.AZURE_OPENAI_KEY || process.env.AZURE_API_KEY,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4.1-nano",
});

const FEEDS = [
    { name: 'Recht Bund', url: 'https://www.recht.bund.de/rss/feeds/rss_bgbl-1-2.xml?nn=211452' },
    { name: 'Gesetze im Int.', url: 'https://www.gesetze-im-internet.de/aktuDienst-rss-feed.xml' },
    { name: 'Europa OP 1', url: 'https://op.europa.eu/o/opportal-service/rss/savedQuery?queryid=131289&hash=MTAxNTc7MTAxODQ7MTc4NjcwMTc5MjQ4Mw==&' },
    { name: 'Europa OP 2', url: 'http://op.europa.eu/o/opportal-service/rss/savedQuery?queryid=131291&hash=MTAxNTc7MTAxODQ7MTc4NjcwNjYyMDg3NA==&' }
];

const axiosConfig = {
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
};

async function extractPdfTextFromUrl(url) {
    try {
        console.log(`Fetching HTML from ${url} to search for PDF...`);
        const response = await axios.get(url, axiosConfig);
        const $ = cheerio.load(response.data);
        
        let pdfUrl = null;
        
        let pdfLink = $('a').filter((i, el) => {
            const href = $(el).attr('href') || '';
            return href.includes('.pdf') && !href.startsWith('javascript:');
        }).first();
        
        if (pdfLink.length === 0) {
            pdfLink = $('a.downloadItem[href*="format=PDF"]').first();
        }

        if (pdfLink.length > 0) {
            let href = pdfLink.attr('href');
            if (href.startsWith('/')) {
                const urlObj = new URL(url);
                href = `${urlObj.protocol}//${urlObj.host}${href}`;
            }
            pdfUrl = href;
        }

        if (pdfUrl) {
            console.log(`Downloading PDF from ${pdfUrl}...`);
            const pdfRes = await axios.get(pdfUrl, {
                ...axiosConfig,
                responseType: 'arraybuffer'
            });
            const data = await pdfParse(pdfRes.data);
            console.log(`Extracted ${data.text.length} characters from PDF.`);
            // Return first 3000 chars to save tokens
            return { text: data.text.substring(0, 3000), url: pdfUrl };
        }
    } catch (e) {
        console.error("PDF Extraction error:", e.message);
    }
    return { text: null, url: null };
}

async function categorizeLaw(title, description, pdfText) {
    const systemPrompt = `You are a legal assistant for companies.
Analyze the provided German law entry. Note that sometimes the real law name is in the 'Title' (e.g., 'Zweite Verordnung zur Änderung...'), but other times the 'Title' is just a reference (e.g., 'BGBl. 2026 I Nr. 233') and the actual law name is in the 'Description'.

Task:
1. Extract or clean up the actual law name in German.
2. Categorize the law into zero or more of the following categories (it can belong to multiple):
- Manufacturing & Production
- IT, Data Centers & Telecommunications
- Logistics, Transport & Warehousing
- Real Estate, Buildings & Construction
- Energy, Utilities & Circular Economy

3. Provide a short 1-2 sentence summary in English explaining what the law is about and its impact.

Respond ONLY with a valid JSON object in this format: 
{
  "cleanTitle": "The actual name of the law in German",
  "categories": ["Category 1", "Category 2"],
  "summary": "Your short summary in English."
}`;

    try {

        let content = `Title: ${title}\nDescription: ${description || ''}`;
        if (pdfText) {
            content += `\n\nFull PDF Text Preview:\n${pdfText}`;
        }

        const response = await client.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: content }
            ],
            model: "gpt-4.1-nano",
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        return {
            cleanTitle: result.cleanTitle || title,
            categories: Array.isArray(result.categories) ? result.categories : [],
            summary: result.summary || "No summary provided."
        };
    } catch (error) {
        console.error("OpenAI Error:", error);
        return { cleanTitle: title, categories: [], summary: "Failed to categorize due to an error." };
    }
}

async function scanFeeds() {
    console.log("Starting RSS Feed scan...");
    
    // Get cutoff date (ignore news older than 7 days to prevent processing old articles)
    const intervalDays = 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - intervalDays);
    console.log(`Filtering out news older than ${cutoffDate.toISOString()} (${intervalDays} days)`);

    let newLaws = [];

    for (const feedConfig of FEEDS) {
        try {
            const feed = await parser.parseURL(feedConfig.url);
            console.log(`Scanning feed: ${feed.title} (${feedConfig.name})`);

            const items = feed.items.slice(0, 10); 

            for (const item of items) {
                const pubDate = new Date(item.pubDate || new Date().toISOString());
                
                // Skip if older than cutoff
                if (pubDate < cutoffDate) {
                    console.log(`Skipping old news: ${item.title}`);
                    continue;
                }

                const id = item.guid || item.link;

                const exists = await lawExists(id);
                if (!exists) {
                    console.log(`New Law Found: ${item.title}`);
                    
                    const pdfData = await extractPdfTextFromUrl(item.link);
                    const { cleanTitle, categories, summary } = await categorizeLaw(item.title, item.contentSnippet || item.content, pdfData.text);
                    
                    const law = {
                        id: id,
                        title: cleanTitle,
                        link: item.link,
                        pubDate: pubDate.toISOString(),
                        category: categories,
                        summary: summary,
                        source: feedConfig.name,
                        pdf_url: pdfData.url,
                        is_sent: 0
                    };

                    await saveLaw({ ...law, category: JSON.stringify(categories) });
                    
                    if (categories.length > 0) {
                        newLaws.push(law);
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to parse feed ${feedConfig.url}:`, error);
        }
    }

    if (newLaws.length > 0) {
        console.log(`Found ${newLaws.length} new categorized laws.`);
        return newLaws;
    } else {
        console.log("No new relevant laws found.");
        return [];
    }
}

module.exports = { scanFeeds };

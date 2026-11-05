const cheerio = require('cheerio');
const axios = require('axios');
const pdfParse = require('pdf-parse');

const axiosConfig = {
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
};

async function testExtraction(url) {
    try {
        console.log(`\nFetching HTML from ${url}...`);
        const response = await axios.get(url, axiosConfig);
        const $ = cheerio.load(response.data);
        
        let pdfUrl = null;
        
        // 1. Look for explicit .pdf in href (used by recht.bund.de)
        let pdfLink = $('a').filter((i, el) => {
            const href = $(el).attr('href') || '';
            return href.includes('.pdf') && !href.startsWith('javascript:');
        }).first();
        
        // 2. Look for EUR-Lex / OP Europa direct download button class if possible
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

        console.log("Found PDF URL:", pdfUrl);

        if (pdfUrl) {
            console.log(`Downloading PDF from ${pdfUrl}...`);
            const pdfRes = await axios.get(pdfUrl, {
                ...axiosConfig,
                responseType: 'arraybuffer'
            });
            const data = await pdfParse(pdfRes.data);
            console.log("PDF Extracted text preview:");
            console.log(data.text.substring(0, 300).replace(/\n/g, ' '));
        } else {
            console.log("No PDF found, falling back to RSS summary.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

async function run() {
    await testExtraction('https://www.recht.bund.de/eli/bund/bgbl-1/2026/234');
    await testExtraction('https://op.europa.eu/en/publication-detail/-/publication/0f258499-9779-11f1-9262-01aa75ed71a1/language-en');
}

run();

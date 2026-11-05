const nodemailer = require('nodemailer');

async function sendPersonalizedDigests(subscribers, unsentLaws) {
    if (!subscribers || subscribers.length === 0) {
        console.log("No subscribers found.");
        return [];
    }
    
    if (!unsentLaws || unsentLaws.length === 0) {
        console.log("No new laws to send.");
        return [];
    }

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ionos.de',
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_NAME
    ? `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`
    : (process.env.EMAIL_FROM || process.env.SMTP_USER);

const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO;

    const previewUrls = [];

    for (const sub of subscribers) {
        // Filter laws based on subscriber's categories
        const subCategories = sub.categories || [];
        
        // If subscriber has no categories, maybe send everything, or skip. Let's skip.
        if (subCategories.length === 0) continue;

        const relevantLaws = unsentLaws.filter(law => {
            let lawCats = [];
            try {
                lawCats = JSON.parse(law.category);
            } catch (e) {
                lawCats = [law.category];
            }
            
            // Check if there is an intersection between lawCats and subCategories
            return lawCats.some(c => subCategories.includes(c));
        });

        if (relevantLaws.length === 0) continue;

        // Generate Email HTML
        let htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #dff45e 0%, #c7e03a 100%); color: #1f2937; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">Legal Radar</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Ihre personalisierten Gesetz-Updates</p>
                </div>
                <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #333; margin-bottom: 20px;">Hallo,</h2>
                    <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Hier sind die neu veröffentlichten Gesetze, die für Ihre ausgewählten Branchen relevant sind:</p>
                    <ul style="list-style-type: none; padding: 0;">
        `;

        relevantLaws.forEach(law => {
            let categoryTags = '';
            let lawCats = [];
            try { lawCats = typeof law.category === 'string' ? JSON.parse(law.category) : law.category; } catch (e) { lawCats = [law.category]; }
            
            lawCats.forEach(cat => {
                categoryTags += `<span style="display: inline-block; background: rgba(223, 244, 94, 0.3); color: #8aa833; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-bottom: 10px; margin-right: 5px;">${cat}</span>`;
            });

            htmlContent += `
                <li style="margin-bottom: 20px; background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #dff45e; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                    <h3 style="font-size: 18px; margin: 0 0 10px 0;"><a href="${law.link}" style="color: #1f2937; text-decoration: none;">${law.title}</a></h3>
                    <div>${categoryTags}</div>
                    <p style="font-size: 14px; margin: 0; color: #4b5563; line-height: 1.5;">${law.summary}</p>
                    <div style="margin-top: 15px; display: flex; gap: 10px; align-items: center;">
                        <a href="${law.link}" style="display: inline-block; padding: 6px 12px; background: #f0f9ff; color: #0369a1; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold;">Gesetz lesen</a>
                        ${law.pdf_url ? `<a href="${law.pdf_url}" style="display: inline-block; padding: 6px 12px; background: rgba(223, 244, 94, 0.2); color: #8aa833; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold;">PDF</a>` : ''}
                    </div>
                </li>
            `;
        });

        const base64Email = Buffer.from(sub.email).toString('base64');
        const baseUrl = process.env.BASE_URL || 'https://chatbot.enefit.ai';
        const unsubscribeLink = `${baseUrl}/legal_radar/unsubscribe?token=${base64Email}`;

        htmlContent += `
                    </ul>
                    <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">
                    <div style="text-align: center; font-size: 12px; color: #999;">
                        <p style="margin-bottom: 10px;">
                            Powered by Legal Radar & Azure OpenAI<br>
                            &copy; 2024 enefit
                        </p>
                        <p style="margin: 0;">
                            Möchten Sie diese Benachrichtigungen nicht mehr erhalten?<br>
                            <a href="${unsubscribeLink}" style="color: #0369a1; text-decoration: underline;">Hier abmelden</a>
                        </p>
                    </div>
                </div>
            </div>
        `;

        try {
            await transporter.sendMail({
                from: EMAIL_FROM_ADDRESS,
                to: sub.email, 
                replyTo: EMAIL_REPLY_TO,
                subject: "Legal Radar: Neue Gesetze für Ihre Branche",
                html: htmlContent,
            });
            console.log(`Real message sent to ${sub.email}`);
            previewUrls.push({ email: sub.email, url: '#' });
        } catch (e) {
            console.error(`Failed to send email to ${sub.email}:`, e);
        }
    }

    return previewUrls;
}

module.exports = { sendPersonalizedDigests };

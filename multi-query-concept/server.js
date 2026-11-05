const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Azure OpenAI Configuration
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://enefit-llm.openai.azure.com/';
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-nano';
const api_version = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';
const subscription_key = process.env.AZURE_OPENAI_KEY || process.env.AZURE_API_KEY || 'DUMMY_AZURE_KEY';

// Chatbot API Configuration
const CHATBOT_API_URL = process.env.CHATBOT_API_URL || 'https://viktor.thws.education/query';
const CHATBOT_API_KEY = process.env.CHATBOT_API_KEY || 'DUMMY_CHATBOT_API_KEY';

// Keywords
const hl_keywords = [
  "Energieeffizienz", "Energieoptimierung", "CO2-Emissionen", "Energiegesez",
  "Erneuerbare Energien", "Nachhaltigkeit", "Energieeinsparung",
  "Klimaschutz", "Energieaudits", "Energieverbrauch"
];

const ll_keywords = [
  "Industrie 4.0", "Energiequellen", "gesetzliche Vorschriften",
  "Emissionsreduzierung", "Energiepolitik", "Smart Grids",
  "CO2-Reduktionsstrategien", "Energieberatung", "Energiepreise", "Energiegesetzgebung"
];

// Prompt template
const PROMPT_TEMPLATE = `Rewrite the following question into exactly 5 high-quality variations. Each variation should:
- Be clear and grammatically correct
- Maintain the original intent and meaning
- Use different wording and phrasing
- Be suitable for search queries

Return ONLY a valid JSON object with this exact structure:
{
  "variations": [
    "variation 1",
    "variation 2",
    "variation 3",
    "variation 4",
    "variation 5"
  ]
}

Question: {{QUESTION}}`;

// Super question prompt template
const SUPER_QUESTION_TEMPLATE = `You are analyzing answers from a knowledge base chatbot. Based on the first 5 answers provided below, create ONE comprehensive and intelligent question that:

1. Contains ALL mentioned sources/references from the answers
2. Collects and integrates all important topics and themes from the 5 answers
3. Forms a unified, comprehensive question that would allow getting a complete answer covering all aspects
4. Is clear, well-structured, and suitable for querying a knowledge base

The question should be in the same language as the original questions.

Return ONLY a valid JSON object with this exact structure:
{
  "super_question": "your comprehensive question here",
  "sources_mentioned": ["source1", "source2", ...],
  "topics_collected": ["topic1", "topic2", ...]
}

First 5 Answers:
{{ANSWERS}}`;

app.post('/api/variations', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Field "question" is required in JSON body.' });
    }

    const prompt = PROMPT_TEMPLATE.replace('{{QUESTION}}', question);

    const url = `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=${api_version}`;

    // Request body for Chat Completions
    const payload = {
      messages: [
        { role: 'system', content: 'You are a helpful assistant that rewrites user questions into multiple high-quality variations.' },
        { role: 'user', content: prompt }
      ],
      // You can adjust temperature / max_tokens
      temperature: 0.7,
      max_tokens: 512
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': subscription_key
      },
      timeout: 20000
    });

    // Azure OpenAI returns a structure containing choices[].message.content
    const modelText = response.data?.choices?.[0]?.message?.content;
    if (!modelText) {
      return res.status(500).json({ error: 'No text returned from model', raw: response.data });
    }

    // Attempt to parse JSON from model response
    let parsed;
    try {
      parsed = JSON.parse(modelText);
    } catch (e) {
      // Sometimes the model may wrap JSON in triple quotes — try to extract JSON inside
      const maybeJson = modelText.match(/\{[\s\S]*\}/);
      if (maybeJson) {
        try {
          parsed = JSON.parse(maybeJson[0]);
        } catch (e2) {
          return res.status(500).json({ error: 'Failed to parse JSON from model output', modelText });
        }
      } else {
        return res.status(500).json({ error: 'Model did not return JSON', modelText });
      }
    }

    // Check that there is a variations array with 5 elements
    if (!parsed.variations || !Array.isArray(parsed.variations) || parsed.variations.length !== 5) {
      return res.status(500).json({ error: 'Model JSON did not contain a "variations" array of length 5', parsed });
    }

    res.json({ question, variations: parsed.variations });
  } catch (err) {
    console.error('Error calling Azure OpenAI:', err?.response?.data ?? err.message ?? err);
    res.status(500).json({ error: 'Internal server error', details: err?.response?.data ?? err.message });
  }
});

// Endpoint to create super question from answers
app.post('/api/super-question', async (req, res) => {
  try {
    const { answers } = req.body;
    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Field "answers" is required as a non-empty array.' });
    }

    console.log('Creating super question from', answers.length, 'answers');

    // Take first 5 answers and truncate if too long (max 3000 chars per answer)
    const firstFiveAnswers = answers.slice(0, 5).map(ans => {
      const answerText = typeof ans === 'string' ? ans : ans.answer || JSON.stringify(ans);
      // Truncate to 3000 characters to avoid token limits
      return answerText.length > 3000 ? answerText.substring(0, 3000) + '... [truncated]' : answerText;
    });
    
    console.log('Formatted answers, total length:', firstFiveAnswers.join('\n\n---\n\n').length);
    
    // Format answers for the prompt
    const answersText = firstFiveAnswers.map((ans, idx) => 
      `Answer ${idx + 1}:\n${ans}`
    ).join('\n\n---\n\n');

    const prompt = SUPER_QUESTION_TEMPLATE.replace('{{ANSWERS}}', answersText);

    const url = `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=${api_version}`;

    const payload = {
      messages: [
        { role: 'system', content: 'You are an expert at analyzing information and creating comprehensive questions that integrate multiple sources and topics.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1024
    };

    console.log('Sending request to Azure GPT for super question creation...');
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': subscription_key
      },
      timeout: 60000  // Increased timeout to 60 seconds
    });
    
    console.log('Received response from Azure GPT');

    const modelText = response.data?.choices?.[0]?.message?.content;
    if (!modelText) {
      console.error('No text returned from model:', response.data);
      return res.status(500).json({ error: 'No text returned from model', raw: response.data });
    }

    console.log('Model response length:', modelText.length);
    console.log('Model response preview:', modelText.substring(0, 200));

    // Parse JSON from model response
    let parsed;
    try {
      parsed = JSON.parse(modelText);
    } catch (e) {
      console.log('Failed to parse JSON directly, trying to extract JSON...');
      const maybeJson = modelText.match(/\{[\s\S]*\}/);
      if (maybeJson) {
        try {
          parsed = JSON.parse(maybeJson[0]);
        } catch (e2) {
          console.error('Failed to parse extracted JSON:', e2.message);
          return res.status(500).json({ error: 'Failed to parse JSON from model output', modelText: modelText.substring(0, 500) });
        }
      } else {
        console.error('No JSON found in model response');
        return res.status(500).json({ error: 'Model did not return JSON', modelText: modelText.substring(0, 500) });
      }
    }

    if (!parsed.super_question) {
      console.error('Missing super_question field in parsed response:', parsed);
      return res.status(500).json({ error: 'Model JSON did not contain "super_question" field', parsed });
    }

    console.log('Successfully created super question:', parsed.super_question.substring(0, 100));

    res.json({
      super_question: parsed.super_question,
      sources_mentioned: parsed.sources_mentioned || [],
      topics_collected: parsed.topics_collected || []
    });
  } catch (err) {
    console.error('Error creating super question:', {
      message: err.message,
      code: err.code,
      response: err.response?.data,
      status: err.response?.status
    });
    
    let errorMessage = 'Internal server error';
    if (err.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - Azure GPT took too long to respond';
    } else if (err.response?.data) {
      errorMessage = err.response.data.error || JSON.stringify(err.response.data);
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    res.status(500).json({ error: errorMessage, details: err.response?.data ?? err.message });
  }
});

// Complete flow endpoint - generates variations, queries chatbot, creates super question, queries again
app.post('/api/complete-flow', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Field "question" is required in JSON body.' });
    }

    const result = {
      original_question: question,
      variations: [],
      initial_responses: [],
      super_question: null,
      super_question_sources: [],
      super_question_topics: [],
      final_response: null,
      flow_complete: false
    };

    // Step 1: Generate variations
    const prompt = PROMPT_TEMPLATE.replace('{{QUESTION}}', question);
    const url = `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=${api_version}`;
    
    const variationsPayload = {
      messages: [
        { role: 'system', content: 'You are a helpful assistant that rewrites user questions into multiple high-quality variations.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 512
    };

    const variationsResponse = await axios.post(url, variationsPayload, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': subscription_key
      },
      timeout: 20000
    });

    const variationsText = variationsResponse.data?.choices?.[0]?.message?.content;
    let variationsParsed;
    try {
      variationsParsed = JSON.parse(variationsText);
    } catch (e) {
      const maybeJson = variationsText.match(/\{[\s\S]*\}/);
      if (maybeJson) {
        variationsParsed = JSON.parse(maybeJson[0]);
      } else {
        throw new Error('Failed to parse variations');
      }
    }

    result.variations = variationsParsed.variations || [];

    // Step 2: Query chatbot with variations
    const chatbotResponses = [];
    for (const variation of result.variations) {
      const payload = {
        query: variation,
        mode: 'mix',
        only_need_context: false,
        only_need_prompt: false,
        response_type: 'string',
        top_k: 10,
        max_token_for_text_unit: 4000,
        max_token_for_global_context: 4000,
        max_token_for_local_context: 4000,
        hl_keywords: hl_keywords,
        ll_keywords: ll_keywords,
        conversation_history: [{"role": "user", "content": variation}],
        history_turns: 5
      };

      try {
        const chatbotResponse = await axios.post(CHATBOT_API_URL, payload, {
          headers: {
            'accept': 'application/json',
            'X-API-Key': CHATBOT_API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        });

        let responseText = 'No response available';
        if (chatbotResponse.data) {
          responseText = chatbotResponse.data.response ||
                        chatbotResponse.data.answer ||
                        chatbotResponse.data.result ||
                        chatbotResponse.data.content ||
                        chatbotResponse.data.message ||
                        chatbotResponse.data.text ||
                        JSON.stringify(chatbotResponse.data);
        }

        chatbotResponses.push({
          question: variation,
          answer: responseText,
          success: true
        });
      } catch (err) {
        chatbotResponses.push({
          question: variation,
          answer: 'Error: ' + (err.response?.data?.message || err.message || 'Unknown error'),
          success: false
        });
      }
    }

    result.initial_responses = chatbotResponses;

    // Step 3: Create super question from first 5 answers
    const firstFiveAnswers = chatbotResponses.slice(0, 5).map(r => r.answer);
    const answersText = firstFiveAnswers.map((ans, idx) => 
      `Answer ${idx + 1}:\n${ans}`
    ).join('\n\n---\n\n');

    const superQuestionPrompt = SUPER_QUESTION_TEMPLATE.replace('{{ANSWERS}}', answersText);
    const superQuestionPayload = {
      messages: [
        { role: 'system', content: 'You are an expert at analyzing information and creating comprehensive questions that integrate multiple sources and topics.' },
        { role: 'user', content: superQuestionPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1024
    };

    const superQuestionResponse = await axios.post(url, superQuestionPayload, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': subscription_key
      },
      timeout: 30000
    });

    const superQuestionText = superQuestionResponse.data?.choices?.[0]?.message?.content;
    let superQuestionParsed;
    try {
      superQuestionParsed = JSON.parse(superQuestionText);
    } catch (e) {
      const maybeJson = superQuestionText.match(/\{[\s\S]*\}/);
      if (maybeJson) {
        superQuestionParsed = JSON.parse(maybeJson[0]);
      } else {
        throw new Error('Failed to parse super question');
      }
    }

    result.super_question = superQuestionParsed.super_question;
    result.super_question_sources = superQuestionParsed.sources_mentioned || [];
    result.super_question_topics = superQuestionParsed.topics_collected || [];

    // Step 4: Query chatbot with super question
    const superPayload = {
      query: result.super_question,
      mode: 'mix',
      only_need_context: false,
      only_need_prompt: false,
      response_type: 'string',
      top_k: 10,
      max_token_for_text_unit: 4000,
      max_token_for_global_context: 4000,
      max_token_for_local_context: 4000,
      hl_keywords: hl_keywords,
      ll_keywords: ll_keywords,
      conversation_history: [{"role": "user", "content": result.super_question}],
      history_turns: 5
    };

    try {
      const finalChatbotResponse = await axios.post(CHATBOT_API_URL, superPayload, {
        headers: {
          'accept': 'application/json',
          'X-API-Key': CHATBOT_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      });

      let finalResponseText = 'No response available';
      if (finalChatbotResponse.data) {
        finalResponseText = finalChatbotResponse.data.response ||
                          finalChatbotResponse.data.answer ||
                          finalChatbotResponse.data.result ||
                          finalChatbotResponse.data.content ||
                          finalChatbotResponse.data.message ||
                          finalChatbotResponse.data.text ||
                          JSON.stringify(finalChatbotResponse.data);
      }

      result.final_response = {
        question: result.super_question,
        answer: finalResponseText,
        success: true
      };
    } catch (err) {
      result.final_response = {
        question: result.super_question,
        answer: 'Error: ' + (err.response?.data?.message || err.message || 'Unknown error'),
        success: false
      };
    }

    result.flow_complete = true;
    res.json(result);
  } catch (err) {
    console.error('Error in complete flow:', err?.response?.data ?? err.message ?? err);
    res.status(500).json({ error: 'Internal server error', details: err?.response?.data ?? err.message });
  }
});

// Chatbot query endpoint
app.post('/api/chatbot', async (req, res) => {
  try {
    const { questions } = req.body;
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Field "questions" is required as an array.' });
    }

    const responses = [];

    // Test basic connectivity first (non-blocking)
    axios.get(CHATBOT_API_URL, { headers: { "X-API-Key": CHATBOT_API_KEY }, timeout: 5000 })
      .then(response => console.log('Basic connectivity test result:', response.status))
      .catch(err => console.log('Basic connectivity test failed:', err.message))
      .finally(() => {});

    for (const question of questions) {
      // Create payload for chatbot API
      const payload = {
        query: question,
        mode: 'mix',
        only_need_context: false,
        only_need_prompt: false,
        response_type: 'string',
        top_k: 10,
        max_token_for_text_unit: 4000,
        max_token_for_global_context: 4000,
        max_token_for_local_context: 4000,
        hl_keywords: hl_keywords,
        ll_keywords: ll_keywords,
        conversation_history: [{"role": "user", "content": question}],
        history_turns: 5
      };

      console.log('Sending payload to chatbot API:', JSON.stringify(payload, null, 2));
      console.log('API Key being used:', CHATBOT_API_KEY.substring(0, 10) + '...');

      const headers = {
        'accept': 'application/json',
        'X-API-Key': CHATBOT_API_KEY,
        'Content-Type': 'application/json'
      };

      try {
        const response = await axios.post(CHATBOT_API_URL, payload, {
          headers,
          timeout: 120000
        });

        console.log('Chatbot API Response status:', response.status);
        console.log('Chatbot API Response data:', response.data);

        // Handle different possible response formats
        let responseText = 'No response available';

        if (response.data) {
          responseText = response.data.response ||
                        response.data.answer ||
                        response.data.result ||
                        response.data.content ||
                        response.data.message ||
                        response.data.text ||
                        JSON.stringify(response.data);
        }

        responses.push({
          question,
          answer: responseText,
          success: true
        });
      } catch (err) {
        console.error('Detailed chatbot API error:', {
          message: err.message,
          response: err.response ? {
            status: err.response.status,
            data: err.response.data,
            detail: err.response.data?.detail,
            detailString: err.response.data?.detail ? JSON.stringify(err.response.data.detail) : null,
            headers: err.response.headers
          } : 'No response data',
          config: err.config ? {
            url: err.config.url,
            method: err.config.method,
            headers: err.config.headers
          } : 'No config data'
        });

        let errorMessage = 'Unknown error';

        if (err.response?.status === 422) {
          errorMessage = 'Invalid request format (422). Check payload structure.';
        } else if (err.response?.status === 401) {
          errorMessage = 'Authentication failed - check API key';
        } else if (err.response?.status === 404) {
          errorMessage = 'API endpoint not found';
        } else if (err.response?.data) {
          if (typeof err.response.data === 'string') {
            errorMessage = err.response.data;
          } else if (typeof err.response.data === 'object') {
            errorMessage = err.response.data.message ||
                          err.response.data.error ||
                          (err.response.data.detail ? JSON.stringify(err.response.data.detail) : JSON.stringify(err.response.data));
          }
        } else if (err.message && typeof err.message === 'string') {
          errorMessage = err.message;
        }

        responses.push({
          question,
          answer: 'Error: ' + errorMessage,
          success: false
        });
      }
    }

    res.json({ responses });
  } catch (err) {
    console.error('Error in chatbot endpoint:', err.message ?? err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Serve index.html for any other route (SPA-friendly)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const scrapePinterest = require('./scrapePinterest');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const assistantId = process.env.DAISY_ASSISTANT_ID;

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Backend is alive');
});


app.post('/stylist', async (req, res) => {
  const { messages, state } = req.body;
  console.log('🟡 Received messages:', messages);
  console.log('🧠 Received state:', state);

  const stateSummary = Object.entries(state || {})
  .filter(([_, value]) => value)
  .map(([key, value]) => `${key}: ${value}`)
  .join(', ');
  
  const systemPrompt = `
  You are a professional celebrity stylist named Daisy. You’re chatting with a client to help them build their style and confidence through conversation.

  You ask only one thoughtful question at a time and wait for the user to share fully. Do not suggest outfits yet — first, gather enough understanding of:

  - their body type
  - occasion
  - vibe
  - celeb inspirations
  - comfort or styling preferences
  - climate/location
  - budget

  Once the user says something like "I’m ready" or "Go ahead" — and you believe you have enough information — enter **styling mode**.

In styling mode:
Suggest two looks:
  1. Starter Outfit: for someone easing into the look
  2. Bolder Outfit: for someone confident in the style
For each look, explain:
  - Why it works (based on proportion, fabric, vibe)
  - What mood or message it sends
  - Offer styling tips or mix-and-match suggestions

Then, generate 2–3 search queries per outfit that reflect the *visual representation* of your ideas.
These should help the user *see* the vibe, fit, or proportion — even if the image is not exact.
Think in terms of drape, silhouette, texture, styling context.
Format them like:

Starter Look Queries:
- “linen midi dress champagne garden wedding site:pinterest.com”
- “soft drape scoop neckline satin site:pinterest.com”

Bolder Look Queries:
- “emerald wide leg jumpsuit structured summer site:pinterest.com”
- “statement color fitted jumpsuit sleeveless site:pinterest.com”

  Be encouraging, stylish, and clear. Your tone should feel personal, intuitive, and expert — like a real celeb stylist.

  Do not repeat questions the user has already answered. Review the conversation history to avoid asking about the same topic twice.

  If the user says something like “I’m ready” or “go ahead,” and you’ve already asked about vibe, occasion, and body type, switch to styling mode immediately.

  In styling mode, avoid further questions — deliver your outfit suggestions, explanations, and moodboard queries without asking for more input unless the user requests it.

  Do not repeat questions the user has already answered. Review the conversation history to avoid asking about the same topic twice.

  If the user says something like “I’m ready” or “go ahead,” and you’ve already asked about vibe, occasion, and body type, switch to styling mode immediately.

  In styling mode, avoid further questions — deliver your outfit suggestions, explanations, and moodboard queries without asking for more input unless the user requests it.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text,
        }))
      ],
      temperature: 0.8,
    });

    const reply = response.choices[0].message.content;
    console.log('🧠 AI stylist reply:', reply);

    res.json({ reply });
  } catch (error) {
    console.error('❌ Error from OpenAI:', error);
    res.status(500).json({ error: 'Stylist is having a fashion emergency 🧵' });
  }
});


app.post('/chat', async (req, res) => {
  const { userMessage, threadId } = req.body;

  try {
    // 1. Create or reuse a thread
    let thread;
    if (threadId) {
      thread = { id: threadId };
    } else {
      thread = await openai.beta.threads.create();
    }


    // 2. Add user's message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userMessage
    });

    // 3. Run Daisy
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId
    });

    let finalRun;
    while (true) {
      const status = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      if (status.status === 'completed') {
        finalRun = status;
        break;
      }

      if (status.status === 'requires_action') {
        for (const toolCall of status.required_action.submit_tool_outputs.tool_calls) {
          if (toolCall.function.name === 'search_pinterest') {
            const query = JSON.parse(toolCall.function.arguments).query;
            const results = await scrapePinterest(query); // Daisy's custom tool

            await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
              tool_outputs: [
                {
                  tool_call_id: toolCall.id,
                  output: JSON.stringify(results)
                }
              ]
            });
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 4. Return final assistant message
    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMsg = messages.data.find(m => m.role === 'assistant');

    res.json({
      reply: lastMsg?.content?.[0]?.text?.value || 'No response',
      threadId: thread.id
    });
  } catch (err) {
    console.error('❌ Daisy /chat error:', err);
    res.status(500).json({ error: 'Daisy failed to respond' });
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Stylist backend running at http://0.0.0.0:${PORT}`);
});

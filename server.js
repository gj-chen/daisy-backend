const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.DAISY_ASSISTANT_ID;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Backend is alive');
});

app.post('/chat', async (req, res) => {
  const { userMessage, threadId } = req.body;

  try {
    // 1. Create or reuse a thread
    let thread = threadId
      ? { id: threadId }
      : await openai.beta.threads.create();

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
        console.log('⚙️ Daisy requires action:', status.required_action);

        const toolOutputs = [];

        for (const toolCall of status.required_action.submit_tool_outputs.tool_calls) {
          if (toolCall.function.name === 'search_pinterest') {
            const query = JSON.parse(toolCall.function.arguments).query;
            console.log('🔍 Daisy wants to search Pinterest for:', query);

            try {
              const response = await fetch(`https://daisy-ai-pinterest-agent-production.up.railway.app/search-pinterest?q=${encodeURIComponent(query)}`);
              const data = await response.json();
              console.log('🖼️ Pinterest agent returned:', data);

              const results = Array.isArray(data.images) ? data.images : [];

              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify(results)
              });
            } catch (err) {
              console.error(`❌ Error fetching Pinterest results for "${query}":`, err);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify([]) // still respond to avoid breaking chain
              });
            }
          }
        }

        await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
          tool_outputs: toolOutputs
        });
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

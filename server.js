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

  const readinessSignals = [
    "i'm ready", "im ready", "ready to start", "let's go",
    "start styling", "yes style me", "ok let's begin", "go ahead"
  ];

  const vagueSignals = [
    "i don't know", "idk", "not sure", "no idea",
    "something cute", "whatever", "you decide", "any vibe", "anything"
  ];

  const styleSelections = ["subtly refined", "casual edge", "blend of both"];

  function includesAnySignal(message, signals) {
    const normalizedMessage = message.toLowerCase().trim();
    return signals.some(signal =>
      normalizedMessage === signal ||
      normalizedMessage.startsWith(signal + " ") ||
      normalizedMessage.endsWith(" " + signal)
    );
  }

  try {
    let thread = threadId
      ? { id: threadId }
      : await openai.beta.threads.create();

    const contextMessages = [];

    if (includesAnySignal(userMessage, vagueSignals)) {
      console.log('🤔 User seems unsure — guiding Daisy to suggest style directions...');

      await openai.beta.threads.messages.create(thread.id, {
        role: 'assistant',
        content: "I can see you're unsure—let me suggest some ideas to guide us. One moment while I gather some inspiration..."
      });

      contextMessages.push({
        role: 'user',
        content: `[META] The user is unsure. Offer exactly 2–3 aesthetic directions clearly.
        Include a structured JSON moodboard in your response using exactly this format:
        {
          "moodboard": {
            "imageUrls": ["url1", "url2", "..."],
            "rationale": {
              "goal": "...",
              "whatWorks": ["...", "..."],
              "avoid": ["...", "..."],
              "tip": "..."
            }
          }
        }`
      });
    }

    const autoTriggerStyling = includesAnySignal(userMessage, styleSelections);
    const explicitReady = includesAnySignal(userMessage, readinessSignals);

    if (autoTriggerStyling || explicitReady) {
      console.log('🚀 Auto-triggering styling mode...');

      await openai.beta.threads.messages.create(thread.id, {
        role: 'assistant',
        content: 'Hang tight — I’m pulling some visuals to match this vibe…'
      });

      contextMessages.push({
        role: 'user',
        content: `[META] The user is ready. Switch to styling mode now and stop asking questions.
        When you finish creating a moodboard, always respond with this JSON format:
        {
          "moodboard": {
            "imageUrls": ["url1", "url2", "..."],
            "rationale": {
              "goal": "...",
              "whatWorks": ["...", "..."],
              "avoid": ["...", "..."],
              "tip": "..."
            }
          }
        }`
      });
    }

    for (const msg of contextMessages) {
      await openai.beta.threads.messages.create(thread.id, msg);
    }

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userMessage
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId
    });

    while (true) {
      const status = await openai.beta.threads.runs.retrieve(thread.id, run.id);

      if (status.status === 'completed') {
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
                output: JSON.stringify([])
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

    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMsg = messages.data.find(m => m.role === 'assistant');

    let moodboard = null;
    try {
      let content = lastMsg?.content?.[0]?.text?.value || '';

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.moodboard) {
          moodboard = parsed.moodboard;
        }
      }
    } catch (e) {
      console.log('⚠️ No structured moodboard returned:', e.message);
    }

    res.json({
      reply: lastMsg?.content?.[0]?.text?.value || 'No response',
      moodboard,
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

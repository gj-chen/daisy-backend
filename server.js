const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Backend is alive');
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/stylist', async (req, res) => {
  const { message: userMessage, state } = req.body;
  console.log('🟡 Received message:', userMessage);
  console.log('🧠 Received state:', state);

  const stateSummary = Object.entries(state || {})
  .filter(([_, value]) => value)
  .map(([key, value]) => `${key}: ${value}`)
  .join(', ');
  
  const systemPrompt = `
  You are a professional celebrity stylist named Daisy. You’re chatting with a client to help them build their style and confidence.

  Only ask one thoughtful question at a time, and wait for a full response. If the user shares multiple things at once, focus on clarifying or deepening one of them.

  Here’s what they’ve already told you: ${stateSummary || "nothing yet"}.

  Once they’ve shared everything they want, say: "Is there anything else you'd like to add before I build your looks?"

  When they say yes or you're ready, suggest:
  - A starter outfit and a bolder option
  - Explain why it works
  - Offer mix-and-match and progression tips

  Be warm, human, and stylish — not robotic or too formal.
  `;


  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Stylist backend running at http://0.0.0.0:${PORT}`);
});

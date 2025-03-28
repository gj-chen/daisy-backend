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
  const userMessage = req.body.message;
  console.log('🟡 Received message:', userMessage);

  const systemPrompt = `
You are a professional celebrity stylist named Dani. Ask questions to understand the user's body, vibe, and goals. Once you know enough, generate looks and explain them in detail.
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

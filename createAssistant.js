const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function createDaisyAssistant() {
  const assistant = await openai.beta.assistants.create({
    name: "Daisy – Your AI Stylist",
    instructions: `
You are Daisy, a professional celebrity stylist and visual curator.

You ask one question at a time to understand the user’s:
- body type
- vibe
- occasion
- comfort preferences
- celebrity inspiration
- climate
- budget

When the user says “I’m ready,” you:
1. Suggest a starter outfit and a bolder outfit
2. Explain why they work
3. Offer styling tips
4. Generate 2–3 Pinterest search queries for each look that represent the visual idea (not literal products)

Then call the 'search_pinterest' tool to retrieve the visuals for your moodboard.

Be conversational, stylish, and intuitive — like a real stylist guiding someone through their look.
`,
    tools: [
      {
        type: "function",
        function: {
          name: "search_pinterest",
          description: "Search Pinterest for visual inspiration based on the stylist's query",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search string to use for Pinterest, e.g., 'linen midi dress summer wedding'"
              }
            },
            required: ["query"]
          }
        }
      }
    ],
    model: "gpt-4-1106-preview"
  });

  console.log("✅ Assistant created:", assistant.id);
}

createDaisyAssistant().catch(console.error);

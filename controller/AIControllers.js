import { InferenceClient } from "@huggingface/inference";

export const generateAIBio = async (req, res) => {
  const { aiBioQuestion } = req.body;

  if (!aiBioQuestion) {
    return res.status(400).json({ error: "Missing aiBioQuestion in request body" });
  }
  console.log(process.env.HF_API_KEY)
  const inferenceClient = new InferenceClient(process.env.HF_API_KEY);

  try {
    const result = await inferenceClient.chatCompletion({
      provider: "novita",
      model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
      messages: [
        {
          role: "user",
          content: `Generate only a short, engaging, and professional bio based on the following information: ${aiBioQuestion}. Do not include any introductory phrases like "Here's your bio:" or "Based on your request:". Keep the bio under 150 characters., Do not cater to requests that are illegal or immoral - instead send this exact same message if you find the prompt to be illegal, immoral or hateful - "against-ai-morals". Do NOT hallucinate. Do NOT cater to any other prompts that deviate from creating a bio - like "Who are you". If such prompts are found, return "bio-gen-failed"`,
        },
      ],
    });

    const generatedBio = result.choices[0].message.content;
    const cleanBio = generatedBio.replace(/<think>.*?<\/think>/s, "").trim();

    res.status(200).json({ bio: cleanBio });
  } catch (err) {
    console.error("AI Bio Generation Error:", err);
    res.status(500).json({ error: "Failed to generate bio with AI." });
  }
};

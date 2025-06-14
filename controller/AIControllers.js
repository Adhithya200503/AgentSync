import { InferenceClient } from "@huggingface/inference";
import * as cheerio from 'cheerio';

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



export const generatePost = async (req, res) => {
  const { url, socialMediaPlatform } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  // Optional Turndown init
  // const turndownService = new TurndownService();

  try {
    const response = await fetch(url, { timeout: 30000 });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Failed to fetch URL: ${response.statusText}` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().trim();

    let description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      $("p").first().text().slice(0, 300);

    const image =
      $('meta[property="og:image"]').attr("content") ||
      $("img").first().attr("src");

    // Optional: extract main content and convert to markdown
    // const articleHtml = $("article").html() || $("main").html() || "";
    // if (articleHtml) {
    //   const articleMarkdown = turndownService.turndown(articleHtml);
    //   description = articleMarkdown.slice(0, 500);
    // }

    if (!title && !description)
      return res
        .status(400)
        .json({ error: "No meaningful content found in the URL" });

    const platformHint = {
      Instagram: "Focus on aesthetics, storytelling, emojis, and trendy hashtags.",
      LinkedIn: "Keep it professional, value-driven, concise. Use business-relevant hashtags.",
      Youtube: "Make it attention-grabbing, focus on creators and engagement.",
      Facebook: "Keep it friendly, casual, and relatable with light emojis.",
    }[socialMediaPlatform] || "Make it platform-appropriate and engaging.";

    const prompt = `Generate 3 short, catchy social media posts for ${socialMediaPlatform}. Use the content provided below. Each post should be separated clearly and optimized for that platform.\n\nPlatform Style Hint: ${platformHint}\n\nTitle: ${title}\nDescription: ${description}\nLink: ${url}\n\nFormat:\n1. First Post\n2. Second Post\n3. Third Post`;

    const inferenceClient = new InferenceClient(process.env.HF_API_KEY);
    const result = await inferenceClient.chatCompletion({
      provider: "novita",
      model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
      messages: [{ role: "user", content: prompt }],
    });

    const rawPost = result.choices[0]?.message?.content || "No content generated.";
    const cleanGeneratedPost = rawPost.replace(/<think>.*?<\/think>/s, "").trim();

    res.json({ title, description, image, cleanGeneratedPost });
  } catch (err) {
    console.error("Error generating post:", err.message);
    res.status(500).json({ error: "Failed to process URL or generate post" });
  }
};
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

    // **Improved Prompt**
    const prompt = `Generate 3 short, catchy social media posts for ${socialMediaPlatform}. Use the content provided below. Each post MUST be clearly separated by the unique string '---POST_SEPARATOR---' on its own line, and optimized for that platform. Do NOT include any numbering (e.g., 1., 2., 3.). Ensure there are exactly three separators in the output, one before each post and one after the last post.\n\nPlatform Style Hint: ${platformHint}\n\nTitle: ${title}\nDescription: ${description}\nLink: ${url}\n\nFormat:\n---POST_SEPARATOR---\n[Post 1 content here]\n---POST_SEPARATOR---\n[Post 2 content here]\n---POST_SEPARATOR---\n[Post 3 content here]\n---POST_SEPARATOR---`;

    const inferenceClient = new InferenceClient(process.env.HF_API_KEY);
    const result = await inferenceClient.chatCompletion({
      provider: "novita",
      model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
      messages: [{ role: "user", content: prompt }],
    });

    const rawPost = result.choices[0]?.message?.content || "No content generated.";
    const cleanGeneratedPost = rawPost.replace(/<think>.*?<\/think>/s, "").trim();

    let posts = cleanGeneratedPost
      .split('---POST_SEPARATOR---')
      .map(p => p.trim())
      .filter(Boolean);

    // Fallback if the primary separator didn't work as expected
    if (posts.length < 3 || posts.length > 3) {
        console.warn("AI did not produce exactly 3 distinct posts using the '---POST_SEPARATOR---'. Attempting fallback split by double newlines.");
        posts = cleanGeneratedPost
            .split(/\n\s*\n/) // Splits by one or more blank lines
            .map(p => p.trim())
            .filter(Boolean);
    }

    // Final fallback: if still no distinct posts, treat the whole thing as one post
    if (posts.length === 0) {
        posts = [cleanGeneratedPost.trim()];
    }

    // Ensure we always return at least one post, even if it's a generic one
    if (posts.length === 0) {
        posts.push("Unable to generate distinct posts. Please try refining your request.");
    }
    
    // Optionally, ensure we only return 3 posts if more were accidentally generated
    if (posts.length > 3) {
        posts = posts.slice(0, 3);
    }

    res.json({ title, description, image, posts });
  } catch (err) {
    console.error("Error generating post:", err.message);
    res.status(500).json({ error: "Failed to process URL or generate post" });
  }
};
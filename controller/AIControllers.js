import { InferenceClient } from "@huggingface/inference";
import puppeteer from 'puppeteer';
import axios from 'axios';
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
  const { url , socialMediaPlatform } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let browser;

  try {
    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: 'new', // 'true' if deploying on server
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/90 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const html = await page.content();
    const $ = cheerio.load(html);

    // Extract title
    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('title').text()?.trim() ||
      '';

    // Extract description with fallback
    let description =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim();

    if (!description) {
      description = $('p').first().text().trim();
      if (description.length > 300) {
        description = description.slice(0, 300) + '...';
      }
    }

    // Extract image
    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('img').first().attr('src') ||
      '';

    if (!title && !description) {
      return res.status(400).json({ error: 'No meaningful content found in the URL' });
    }

    // Prepare DeepSeek prompt
    const prompt = `Create a short, catchy social media post based on this content:\n\nTitle: ${title}\nDescription: ${description}\nLink: ${url}\n\nAdd relevant hashtags and emojis for ${socialMediaPlatform}.`;
    const inferenceClient = new InferenceClient(process.env.HF_API_KEY);
    // DeepSeek API call
      const result = await inferenceClient.chatCompletion({
      provider: "novita",
      model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
      messages: [
        {
          role: "user",
          content:prompt,
        },
      ],
    });

    const generatedPost = result.choices[0].message.content || 'No content generated.';
    const cleanGeneratedPost = generatedPost.replace(/<think>.*?<\/think>/s, "").trim();
    res.json({
      title,
      description,
      image,
      cleanGeneratedPost,
    });
  } catch (err) {
    console.error('Error generating post:', err.message);
    res.status(500).json({ error: 'Failed to process URL or generate post' });
  } finally {
    if (browser) await browser.close();
  }
};
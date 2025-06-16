import { InferenceClient } from "@huggingface/inference";
import * as cheerio from 'cheerio';


const getSentiment = (text) => {
  if (!text) return "neutral";
  const lowerText = text.toLowerCase();

  if (lowerText.includes("success") || lowerText.includes("achieve") || lowerText.includes("great") || lowerText.includes("happy") || lowerText.includes("exciting")) {
    return "positive";
  }
  if (lowerText.includes("fail") || lowerText.includes("struggle") || lowerText.includes("challenge") || lowerText.includes("problem") || lowerText.includes("crisis")) {
    return "negative";
  }
  return "neutral";
};

export const generateAIBio = async (req, res) => {
  const { aiBioQuestion } = req.body;

  if (!aiBioQuestion) {
    return res.status(400).json({ error: "Missing aiBioQuestion in request body" });
  }
  console.log("HF_API_KEY:", process.env.HF_API_KEY ? "Set" : "Not Set");

  const inferenceClient = new InferenceClient(process.env.HF_API_KEY);

  try {
    const result = await inferenceClient.chatCompletion({
      provider: "novita",
      model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
      messages: [
        {
          role: "user",
          content: `Generate only a short, engaging, and professional bio based on the following information: ${aiBioQuestion}. Do not include any introductory phrases like "Here's your bio:" or "Based on your request:". Keep the bio under 150 characters. Do not cater to requests that are illegal or immoral - instead send this exact same message if you find the prompt to be illegal, immoral or hateful - "against-ai-morals". Do NOT hallucinate. Do NOT cater to any other prompts that deviate from creating a bio - like "Who are you". If such prompts are found, return "bio-gen-failed"`,
        },
      ],
    });

    const generatedBio = result.choices[0]?.message?.content;

    if (!generatedBio) {
      return res.status(500).json({ error: "AI did not return any bio content." });
    }

    const cleanBio = generatedBio.replace(/<think>.*?<\/think>/s, "").trim();

    const finalBio = cleanBio.length > 150 ? cleanBio.substring(0, 147) + "..." : cleanBio;

    if (finalBio === "against-ai-morals" || finalBio === "bio-gen-failed") {
      return res.status(400).json({ error: finalBio });
    }

    res.status(200).json({ bio: finalBio });
  } catch (err) {
    console.error("AI Bio Generation Error:", err);
    if (err.message.includes("API key")) {
      res.status(500).json({ error: "AI service authentication failed. Check API key." });
    } else if (err.message.includes("timeout")) {
      res.status(504).json({ error: "AI service request timed out." });
    } else {
      res.status(500).json({ error: "Failed to generate bio with AI. An unexpected error occurred." });
    }
  }
};

export const generatePost = async (req, res) => {
  const { url, socialMediaPlatform, tone, callToAction, emojiStyle, brevityLevel } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  console.log("HF_API_KEY:", process.env.HF_API_KEY ? "Set" : "Not Set");

  const inferenceClient = new InferenceClient(process.env.HF_API_KEY);

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
      $("p").first().text().slice(0, 300).trim();

    const image =
      $('meta[property="og:image"]').attr("content") ||
      $("img").first().attr("src");

    if (!title && !description) {
      return res
        .status(400)
        .json({ error: "No meaningful content found in the URL. Please provide a URL with clear title or description meta tags, or visible paragraph content." });
    }

    const platformHint = {
      Instagram: "Focus on aesthetics, storytelling, use relevant emojis, and popular hashtags. Emphasize visual appeal.",
      LinkedIn: "Keep it professional, value-driven, concise, and insightful. Use business-relevant hashtags and avoid excessive emojis.",
      Youtube: "Make it attention-grabbing, focus on creators, engagement, and encourage watching the video. Use engaging language.",
      Facebook: "Keep it friendly, casual, and relatable with light emojis. Encourage discussion and sharing.",
    }[socialMediaPlatform] || "Make it platform-appropriate and engaging.";

    const platformLimits = {
      Instagram: { charLimit: 2200, name: "Instagram" },
      LinkedIn: { charLimit: 1300, name: "LinkedIn" },
      Youtube: { charLimit: 5000, name: "YouTube" },
      Facebook: { charLimit: 63206, name: "Facebook" },
    };
    const currentPlatformLimit = platformLimits[socialMediaPlatform]?.charLimit;
    const platformName = platformLimits[socialMediaPlatform]?.name || "this platform";
    const limitHint = currentPlatformLimit
      ? `Each post should be concise and ideally under ${currentPlatformLimit} characters for ${platformName}.`
      : "Keep posts concise.";

    const detectedSentiment = getSentiment(title + " " + description);
    const finalTone = tone || (detectedSentiment === "positive" ? "optimistic and positive" :
      detectedSentiment === "negative" ? "serious and empathetic" :
        "informative and neutral");
    const toneHint = `The tone of each post should be ${finalTone}.`;

    let emojiHint = "";
    if (emojiStyle === "none") {
      emojiHint = "Do NOT use any emojis.";
    } else if (emojiStyle === "light") {
      emojiHint = "Use light and subtle emojis where appropriate.";
    } else if (emojiStyle === "moderate") {
      emojiHint = "Use a moderate amount of relevant emojis.";
    } else if (emojiStyle === "heavy") {
      emojiHint = "Feel free to use a generous amount of relevant emojis.";
    }

    let brevityHint = "";
    if (brevityLevel === "concise") {
      brevityHint = "Make each post very concise and to the point, focusing on key takeaways.";
    } else if (brevityLevel === "expanded") {
      brevityHint = "Generate slightly more detailed posts, while remaining suitable for the platform and engaging.";
    } else {
      brevityHint = "Keep each post short and catchy.";
    }

    let ctaHint = "";
    if (callToAction) {
      if (typeof callToAction === "string") {
        ctaHint = `Explicitly include "${callToAction}" as a clear call to action in each post.`;
      } else if (callToAction === true) {
        ctaHint = `Include a relevant call to action in each post that encourages engagement (e.g., "Learn more", "Shop now", "Watch here", "Read the full article").`;
      }
    }

    const prompt = `Generate 3 distinct, short, and catchy social media posts for ${socialMediaPlatform}.
${limitHint} ${toneHint} ${emojiHint} ${brevityHint} ${ctaHint}
Use the content provided below. Each post MUST be clearly separated by the unique string '---POST_SEPARATOR---' on its own line. Do NOT include any numbering (e.g., 1., 2., 3.). Ensure there are exactly three '---POST_SEPARATOR---' strings in the output, one before the first post, one between each post, and one after the last post.
For each post, also suggest 3-5 relevant and highly engaging hashtags. Place the hashtags on a new line directly after the post content.

Platform Style Hint: ${platformHint}

Title: ${title}
Description: ${description}
Link: ${url}

Format:
---POST_SEPARATOR---
[Post 1 content here]
#hashtag1 #hashtag2 #hashtag3
---POST_SEPARATOR---
[Post 2 content here]
#hashtag4 #hashtag5 #hashtag6
---POST_SEPARATOR---
[Post 3 content here]
#hashtag7 #hashtag8 #hashtag9
---POST_SEPARATOR---`;

    const result = await inferenceClient.chatCompletion({
      provider: "novita",
      model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
      messages: [{ role: "user", content: prompt }],
    });

    const rawPost = result.choices[0]?.message?.content || "No content generated.";
    const cleanGeneratedPost = rawPost.replace(/<think>.*?<\/think>/s, "").trim();

    let generatedParts = cleanGeneratedPost
      .split('---POST_SEPARATOR---')
      .map(p => p.trim())
      .filter(Boolean);

    const posts = [];
    for (const part of generatedParts) {
      const lines = part.split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length > 0) {
        let postContent = [];
        let hashtags = [];

        for (const line of lines) {
          if (line.startsWith('#') || line.startsWith('hashtags:')) {
            hashtags.push(...line.replace(/hashtags:/gi, '').split(' ').filter(tag => tag.startsWith('#')));
          } else {
            postContent.push(line);
          }
        }

        let postText = postContent.join('\n').trim();

        if (currentPlatformLimit && postText.length > currentPlatformLimit) {
          postText = postText.slice(0, currentPlatformLimit - 3) + "...";
        }

        posts.push({
          content: postText,
          hashtags: [...new Set(hashtags)]
        });
      }
    }

    if (posts.length < 3 || posts.length > 3) {
      console.warn("AI did not produce exactly 3 distinct posts using the '---POST_SEPARATOR---'. Attempting fallback split by double newlines.");
      const fallbackPosts = cleanGeneratedPost
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean);

      if (fallbackPosts.length >= 1 && fallbackPosts.length <= 3) {
        posts.length = 0;
        fallbackPosts.forEach(fp => {
          const lines = fp.split('\n').map(line => line.trim()).filter(Boolean);
          let postContent = [];
          let hashtags = [];
          for (const line of lines) {
            if (line.startsWith('#') || line.startsWith('hashtags:')) {
              hashtags.push(...line.replace(/hashtags:/gi, '').split(' ').filter(tag => tag.startsWith('#')));
            } else {
              postContent.push(line);
            }
          }
          let postText = postContent.join('\n').trim();
          if (currentPlatformLimit && postText.length > currentPlatformLimit) {
            postText = postText.slice(0, currentPlatformLimit - 3) + "...";
          }
          posts.push({ content: postText, hashtags: [...new Set(hashtags)] });
        });
      }
    }

    if (posts.length === 0) {
      posts.push({
        content: "Unable to generate distinct posts. Please try refining your request or the URL content.",
        hashtags: []
      });
    }

    if (posts.length > 3) {
      posts.splice(3);
    }

    const optimalPostingTimes = {
      Instagram: "Consider posting on weekdays, 11 AM - 1 PM and 7 PM - 9 PM (IST) for best reach and engagement.",
      LinkedIn: "Optimal times are typically Tuesday, Wednesday, and Thursday, 10 AM - 2 PM (IST).",
      Youtube: "Usually, weekends and mid-week afternoons (2 PM - 4 PM IST) see higher viewer engagement.",
      Facebook: "Weekdays, 1 PM - 4 PM (IST) often perform well, but evenings can also be good. Check your insights for specifics.",
    };

    const suggestedPostTime = optimalPostingTimes[socialMediaPlatform] || "Check your platform's analytics for personalized optimal posting times.";

    res.json({
      title,
      description,
      image,
      posts,
      suggestedPostTime,
      detectedContentSentiment: detectedSentiment
    });

  } catch (err) {
    console.error("Error generating post:", err);
    if (err.name === 'FetchError' || err.code === 'ETIMEDOUT') {
      res.status(504).json({ error: "Failed to fetch URL: Network timeout or inaccessible URL." });
    } else if (err.message.includes("API key") || err.message.includes("InferenceClient")) {
      res.status(500).json({ error: "AI service configuration error. Check API key or client setup." });
    } else if (err.message.includes("No content generated")) {
      res.status(500).json({ error: "AI model returned no content for the post generation request." });
    } else {
      res.status(500).json({ error: "An unexpected error occurred while processing your request for post generation." });
    }
  }
};
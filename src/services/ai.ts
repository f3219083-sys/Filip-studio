import { GoogleGenAI, Type } from "@google/genai";
import { Slide, PresentationRequest } from "../types";

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY || "";
  return new GoogleGenAI({ apiKey });
}

export async function generatePresentationContent(request: PresentationRequest): Promise<Slide[]> {
  const ai = getAI();
  const languageInstruction = `The language of the presentation MUST be ${request.language}.`;

  const systemInstruction = `You are an expert presentation creator. 
  Create a presentation about the given topic.
  The presentation should have exactly ${request.slideCount} slides.
  ${languageInstruction}
  The theme/style of the presentation is ${request.theme}. Adapt the tone and content to match this theme.
  Each slide must have a title and a list of 3-5 bullet points.
  CRITICAL: Each bullet point MUST be concise and fit on a single line if possible (max 15 words per point).
  If includeImages is true, provide a descriptive image prompt for an AI image generator for each slide.
  CRITICAL: The imagePrompt MUST be a literal, detailed description of the visual subject. If the slide mentions a specific landmark, person, or object (e.g., "The Parthenon"), the imagePrompt MUST start with that exact subject and describe it vividly. Do not use abstract or generic prompts.
  Return the data as a JSON array of objects.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Topic: ${request.topic}`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            imagePrompt: { type: Type.STRING }
          },
          required: ["title", "content"]
        }
      }
    }
  });

  try {
    const slides = JSON.parse(response.text || "[]") as Slide[];
    return slides;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw new Error("Failed to generate presentation content");
  }
}

export async function generateAdditionalSlide(topic: string, existingSlides: Slide[], language: 'English' | 'Greek'): Promise<Slide> {
  const ai = getAI();
  const languageInstruction = `The language of the presentation MUST be ${language}.`;
  
  const systemInstruction = `You are an expert presentation creator.
  Based on the existing presentation about "${topic}", generate ONE additional slide that logically follows or complements the current content.
  The slide must have a title and a list of 3-5 bullet points.
  CRITICAL: Each bullet point MUST be concise (max 15 words).
  Provide a descriptive image prompt for an AI image generator.
  CRITICAL: The imagePrompt MUST be a literal, detailed description of the visual subject.
  Return the data as a JSON object.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Topic: ${topic}\nExisting Slides: ${JSON.stringify(existingSlides.map(s => s.title))}`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          imagePrompt: { type: Type.STRING }
        },
        required: ["title", "content", "imagePrompt"]
      }
    }
  });

  try {
    const slide = JSON.parse(response.text || "{}") as Slide;
    return slide;
  } catch (e) {
    console.error("Failed to parse AI response for additional slide", e);
    throw new Error("Failed to generate additional slide");
  }
}

export async function generateSlideImage(prompt: string): Promise<string> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [{ text: prompt }]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      console.error("Gemini image generation quota exhausted. Please select a paid API key.");
    } else {
      console.error("Gemini image generation failed, falling back to placeholder", error);
    }
  }
  
  // Fallback to picsum.photos with a seed based on the prompt
  const seed = encodeURIComponent(prompt.slice(0, 20));
  return `https://picsum.photos/seed/${seed}/1280/720`;
}

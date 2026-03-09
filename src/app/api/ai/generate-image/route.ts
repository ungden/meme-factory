import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  generateMemeImage,
  generateCharacterPose,
  generateBackground,
} from "@/lib/gemini-image";

export const maxDuration = 60; // Allow up to 60s for image generation

export async function POST(request: NextRequest) {
  try {
    // Auth check — prevent unauthorized API credit consumption
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để sử dụng tính năng này" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type } = body;

    if (!type || !["meme", "character", "background"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'meme', 'character', or 'background'." },
        { status: 400 }
      );
    }

    let result: { image: string; text?: string };

    switch (type) {
      case "meme": {
        const {
          headline,
          subtext,
          tone,
          textPosition,
          characters,
          format,
          style,
          backgroundDescription,
          referenceImages,
        } = body;

        if (!headline) {
          return NextResponse.json(
            { error: "headline is required for meme generation" },
            { status: 400 }
          );
        }

        result = await generateMemeImage({
          headline,
          subtext,
          tone: tone || "hài hước",
          textPosition: textPosition || "top",
          characters: characters || [],
          format: format || "1:1",
          style,
          backgroundDescription,
          referenceImages,
        });
        break;
      }

      case "character": {
        const {
          characterName,
          characterDescription,
          emotion,
          style,
          existingPoseImages,
        } = body;

        if (!characterName || !characterDescription || !emotion) {
          return NextResponse.json(
            {
              error:
                "characterName, characterDescription, and emotion are required for character generation",
            },
            { status: 400 }
          );
        }

        result = await generateCharacterPose({
          characterName,
          characterDescription,
          emotion,
          style,
          existingPoseImages,
        });
        break;
      }

      case "background": {
        const { description, mood, format } = body;

        if (!description) {
          return NextResponse.json(
            { error: "description is required for background generation" },
            { status: 400 }
          );
        }

        result = await generateBackground({
          description,
          mood,
          format: format || "1:1",
        });
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown type" }, { status: 400 });
    }

    return NextResponse.json({
      image: result.image,
      text: result.text,
    });
  } catch (error) {
    console.error("Image generation error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to generate image";

    // Distinguish between config errors and generation failures
    if (message.includes("not configured")) {
      return NextResponse.json(
        { error: message, code: "NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

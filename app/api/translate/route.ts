import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

let enZhDict: Record<string, { zh: string; def: string; pinyin?: string }> | null = null;

function getDict() {
  if (!enZhDict) {
    const raw = readFileSync(join(process.cwd(), "public/dict/en-zh.json"), "utf-8");
    enZhDict = JSON.parse(raw);
  }
  return enZhDict!;
}

export async function GET(request: NextRequest) {
  const word = request.nextUrl.searchParams.get("word")?.toLowerCase().trim();

  if (!word) {
    return NextResponse.json({ error: "Missing word parameter" }, { status: 400 });
  }

  // Step 1: Look up in CC-CEDICT reverse dictionary
  const cedictEntry = getDict()[word];
  if (cedictEntry) {
    return NextResponse.json({
      word,
      translation: cedictEntry.zh,
      pinyin: cedictEntry.pinyin || null,
      source: "cedict",
    });
  }

  // Step 2: Fallback to MyMemory API for words not in CEDICT
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`,
      { next: { revalidate: 86400 } } // Cache for 24 hours
    );

    if (res.ok) {
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      if (translated && translated !== word) {
        return NextResponse.json({
          word,
          translation: translated,
          source: "mymemory",
        });
      }
    }
  } catch {
    // MyMemory failed, return without translation
  }

  return NextResponse.json({
    word,
    translation: null,
    source: null,
  });
}

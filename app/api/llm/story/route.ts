import { NextRequest, NextResponse } from "next/server";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

const rateMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 5;
}

const SYSTEM_PROMPT = `你是一名擅长写趣味科普的自然博物作家。
风格：口语化、有画面感、适合大众阅读、不要写成百科词条、不要列数字数据。
字数严格控制在 120 字以内。不要在结尾总结，直接讲故事。`;

function buildUserPrompt(body: {
  nameEn: string;
  scientificName: string;
  dangerStatus: string;
  primaryState: string;
}): string {
  return `为这种澳大利亚动物写一段有趣的科普小故事：
物种：${body.nameEn}（学名：${body.scientificName}）
保护状态：${body.dangerStatus}
主要分布：${body.primaryState}（澳大利亚）
要求：有细节、有画面感、有记忆点。`;
}

export async function POST(request: NextRequest) {
  if (!DEEPSEEK_API_KEY) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY is not configured. LLM story generation is unavailable." },
      { status: 503 }
    );
  }

  const ip = getClientIp(request);
  if (!checkRate(ip)) {
    return new NextResponse(
      JSON.stringify({ error: "Rate limit exceeded. Try again in 60 seconds." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      }
    );
  }

  let body: {
    nameEn: string;
    scientificName: string;
    dangerStatus: string;
    taxonomicClass?: string;
    primaryState: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.nameEn || !body.scientificName) {
    return NextResponse.json(
      { error: "Missing required fields: nameEn, scientificName" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(body) },
        ],
        stream: true,
        max_tokens: 300,
        temperature: 0.85,
      }),
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: `DeepSeek API error: ${res.status} - ${errText}` },
        { status: 502 }
      );
    }

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to DeepSeek API" },
      { status: 502 }
    );
  }
}

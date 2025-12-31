export async function onRequest(context) {
  const { request, env } = context;
  const sheetUrl = env.SHEET_WEBHOOK_URL;
  const apiKey = env.GEMINI_API_KEY;

  // 1. HANDLE HISTORY (GET REQUEST)
  if (request.method === "GET") {
    try {
      const res = await fetch(sheetUrl);
      const data = await res.text();
      return new Response(data, { 
        headers: { "Content-Type": "application/json" } 
      });
    } catch (e) {
      return new Response("[]", { status: 500 });
    }
  }

  // 2. HANDLE GENERATION (POST REQUEST)
  if (request.method === "POST") {
    try {
      const body = await request.json();
      
      // Security Check
      if (body.password !== env.APP_PASSWORD) {
        return new Response(JSON.stringify({ error: "⛔ INCORRECT" }), { status: 401 });
      }

      // Find Best AI Model
      const modelRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const modelData = await modelRes.json();
      const bestModel = modelData.models.find(m => m.supportedGenerationMethods.includes("generateContent")).name;

      // AI Generation
      const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${bestModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Create a JSON guitar preset for: "${body.song}". Return raw JSON only.` }] }]
        })
      });
      const genData = await genRes.json();
      const rawText = genData.candidates[0].content.parts[0].text.replace(/```json/g, "").replace(/```/g, "").trim();

      // Archive to Google Sheet
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ song: body.song, json: rawText }),
        redirect: "follow"
      });

      return new Response(JSON.stringify({ json: rawText }), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  }
}
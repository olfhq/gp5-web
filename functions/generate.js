export async function onRequest(context) {
  const { request, env } = context;

  // 1. Handle History (GET)
  if (request.method === "GET") {
    try {
      const res = await fetch(env.SHEET_WEBHOOK_URL);
      const data = await res.text();
      return new Response(data, { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response("[]", { status: 500 });
    }
  }

  // 2. Handle Generation (POST)
  try {
    const body = await request.json();
    if (body.password !== env.APP_PASSWORD) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // UPDATED: Using the absolute newest stable model ID
    const modelId = "gemini-2.5-flash"; 
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${env.GEMINI_API_KEY}`;

    const genRes = await fetch(apiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Generate a guitar JSON preset for: "${body.song}". RAW JSON ONLY.` }] }]
      })
    });

    const data = await genRes.json();

    // 3. Detailed Error Logging
    if (data.error) {
      throw new Error(`Google API: ${data.error.message} (Code: ${data.error.code})`);
    }

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("AI returned no results. This can happen if the prompt is flagged or model is busy.");
    }

    const rawText = data.candidates[0].content.parts[0].text.replace(/```json/g, "").replace(/```/g, "").trim();

    // 4. Background Save
    context.waitUntil(fetch(env.SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ song: body.song, json: rawText }),
      redirect: "follow"
    }));

    return new Response(JSON.stringify({ json: rawText }), { status: 200 });

  } catch (error) {
    // This sends the SPECIFIC error message to your browser alert
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

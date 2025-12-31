export async function onRequest(context) {
  const { request, env } = context;

  // Handle History (GET)
  if (request.method === "GET") {
    const res = await fetch(env.SHEET_WEBHOOK_URL);
    return new Response(await res.text(), { headers: { "Content-Type": "application/json" } });
  }

  // Handle Generation (POST)
  try {
    const body = await request.json(); // If this fails, the error is here
    
    if (body.password !== env.APP_PASSWORD) {
      return new Response(JSON.stringify({ error: "Wrong Password" }), { status: 401 });
    }

    // Call Gemini
    const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Create a JSON guitar preset for: "${body.song}". RAW JSON ONLY.` }] }]
      })
    });

    const genData = await genRes.json();
    const rawText = genData.candidates[0].content.parts[0].text.replace(/```json/g, "").replace(/```/g, "").trim();

    // Background Save (Don't wait, to prevent timeout)
    context.waitUntil(fetch(env.SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ song: body.song, json: rawText })
    }));

    return new Response(JSON.stringify({ json: rawText }), { status: 200 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

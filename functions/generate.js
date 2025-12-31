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

    // UPDATED: Using /v1 stable and gemini-1.5-flash explicitly
    const apiURL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

    const genRes = await fetch(apiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Create a professional guitar JSON preset for: "${body.song}". RAW JSON ONLY.` }] }]
      })
    });

    const data = await genRes.json();

    // 3. SAFETY CHECK: Fixes "reading '0'" error
    if (!data.candidates || data.candidates.length === 0) {
      const errorDetail = data.error ? data.error.message : "AI returned no content.";
      throw new Error(`AI Error: ${errorDetail}`);
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

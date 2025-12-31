export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "GET") {
    const res = await fetch(env.SHEET_WEBHOOK_URL);
    return new Response(await res.text(), { headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await request.json();
    if (body.password !== env.APP_PASSWORD) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    // We use the most stable model path for Cloudflare
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

    const genRes = await fetch(apiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Create a professional guitar JSON preset for: "${body.song}". RAW JSON ONLY.` }] }]
      })
    });

    const data = await genRes.json();

    // SAFETY CHECK: Prevents the "reading '0'" error
    if (!data.candidates || data.candidates.length === 0) {
      const errorMsg = data.error ? data.error.message : "AI returned no candidates. Check API Key/Quota.";
      throw new Error(errorMsg);
    }

    const rawText = data.candidates[0].content.parts[0].text.replace(/```json/g, "").replace(/```/g, "").trim();

    // Background Archive
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

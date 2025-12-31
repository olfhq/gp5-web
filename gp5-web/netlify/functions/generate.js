export const handler = async (event) => {
    // 1. Basic Setup & Security
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const body = JSON.parse(event.body);
        
        // Check Password
        if (body.password !== process.env.APP_PASSWORD) {
            return { statusCode: 401, body: JSON.stringify({ error: "⛔ INCORRECT PASSWORD" }) };
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "Server missing API Key" }) };

        // --- NEW: AUTO-DISCOVERY FUNCTION ---
        // Asks Google what models are actually available for this key
        const getValidModel = async () => {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const data = await response.json();
            
            if (!data.models) throw new Error("Could not list models. Check API Key permissions.");

            // Filter for models that support content generation
            const validModels = data.models.filter(m => 
                m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
            );

            if (validModels.length === 0) throw new Error("No valid generation models found for this key.");

            // Preference Logic: Try Flash -> Pro -> Anything else
            let best = validModels.find(m => m.name.includes("gemini-1.5-flash"));
            if (!best) best = validModels.find(m => m.name.includes("gemini-pro"));
            if (!best) best = validModels[0]; // Fallback to whatever exists

            // The API returns names like "models/gemini-pro", which is exactly what we need.
            // But we remove the "models/" prefix just in case the URL construction adds it later, 
            // OR we just use the full name if we build the URL manually. 
            // Let's just return the full name (e.g. "models/gemini-1.5-flash-001")
            return best.name;
        };

        // 2. Find the correct model name
        const modelName = await getValidModel();
        console.log("Selected Model:", modelName);

        // 3. Generate Content using the discovered model
        // Note: modelName already includes "models/", so we don't add it in the URL
        // URL format: https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent
        // If modelName is "models/gemini-pro", we need to remove the prefix for the URL construction below 
        // OR adjust the URL. The standard API expects: .../v1beta/{model}:generateContent
        
        // Let's clean it to be safe. If it has "models/", strip it.
        const cleanModelName = modelName.replace("models/", "");

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `You are a professional guitar tech. Create a JSON preset for: "${body.song}". Return raw JSON only. Structure: {"UsageNotes":"text","NR":{"Thresh":20},"PRE":{"Status":"On/Off","Model":"TS","P1":50,"P2":50,"P3":50},"DST":{"Status":"On/Off","Model":"DS1","Gain":50,"Tone":50,"Vol":50},"AMP":{"Status":"On","Model":"Recto","Gain":50,"Bass":50,"Mid":50,"Treble":50,"Vol":50},"CAB":{"Status":"On","Model":"4x12","Vol":80,"LowCut":0,"HighCut":0},"EQ":{"Status":"On/Off","Band1":0,"Band2":0,"Band3":0,"Band4":0,"Level":0},"MOD":{"Status":"On/Off","Model":"Chorus","Rate":50,"Depth":50,"Mix":30},"DLY":{"Status":"On/Off","Model":"Digital","Mix":30,"Fdbk":30,"Time":300},"REV":{"Status":"On/Off","Model":"Room","PreD":20,"Decay":40,"Mix":30}}` }] }]
            })
        });

        const data = await response.json();
        
        // Error Handling for the generation call
        if (data.error) {
            throw new Error(`Google Error (${data.error.code}): ${data.error.message}`);
        }

        let rawText = "";
        if (data.candidates && data.candidates[0].content) {
            rawText = data.candidates[0].content.parts[0].text;
            rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        } else {
            throw new Error("AI returned no content");
        }

        // 4. Save to Google Sheet (Fire and Forget)
        const sheetUrl = process.env.SHEET_WEBHOOK_URL;
        if (sheetUrl) {
            fetch(sheetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ song: body.song, json: rawText })
            }).catch(err => console.log("Sheet logging failed:", err));
        }

        return { statusCode: 200, body: JSON.stringify({ json: rawText }) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.toString() }) };
    }
};

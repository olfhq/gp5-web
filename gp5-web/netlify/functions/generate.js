export const handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const body = JSON.parse(event.body);
        const userPassword = body.password;
        const songName = body.song;

        // 1. Check Password
        if (userPassword !== process.env.APP_PASSWORD) {
            return { statusCode: 401, body: JSON.stringify({ error: "⛔ INCORRECT PASSWORD" }) };
        }

        // 2. Setup API Key
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "Server missing API Key" }) };

        // 3. Define the AI Call Function (So we can reuse it)
        const callGemini = async (modelName) => {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `You are a professional guitar tech. Create a JSON preset for: "${songName}". Return raw JSON only. Structure: {"UsageNotes":"text","NR":{"Thresh":20},"PRE":{"Status":"On/Off","Model":"TS","P1":50,"P2":50,"P3":50},"DST":{"Status":"On/Off","Model":"DS1","Gain":50,"Tone":50,"Vol":50},"AMP":{"Status":"On","Model":"Recto","Gain":50,"Bass":50,"Mid":50,"Treble":50,"Vol":50},"CAB":{"Status":"On","Model":"4x12","Vol":80,"LowCut":0,"HighCut":0},"EQ":{"Status":"On/Off","Band1":0,"Band2":0,"Band3":0,"Band4":0,"Level":0},"MOD":{"Status":"On/Off","Model":"Chorus","Rate":50,"Depth":50,"Mix":30},"DLY":{"Status":"On/Off","Model":"Digital","Mix":30,"Fdbk":30,"Time":300},"REV":{"Status":"On/Off","Model":"Room","PreD":20,"Decay":40,"Mix":30}}` }] }]
                })
            });
            const data = await response.json();
            
            // Check if Google sent an error back instead of data
            if (data.error) throw new Error(data.error.message);
            
            if (data.candidates && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text.replace(/```json/g, "").replace(/```/g, "").trim();
            }
            throw new Error("No candidates returned");
        };

        // 4. Try Model 1 (Flash), Fallback to Model 2 (Pro)
        let rawText = "";
        try {
            console.log("Attempting Gemini Flash...");
            rawText = await callGemini("gemini-1.5-flash");
        } catch (e) {
            console.log("Flash failed, switching to Pro...", e.message);
            try {
                rawText = await callGemini("gemini-pro");
            } catch (e2) {
                // If both fail, return the ACTUAL error message so we can debug
                return { statusCode: 500, body: JSON.stringify({ error: "Both models failed. Last error: " + e2.message }) };
            }
        }

        // 5. Save to Google Sheet (Background)
        const sheetUrl = process.env.SHEET_WEBHOOK_URL;
        if (sheetUrl && rawText) {
            fetch(sheetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ song: songName, json: rawText })
            }).catch(err => console.log("Sheet logging failed:", err));
        }

        return { statusCode: 200, body: JSON.stringify({ json: rawText }) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.toString() }) };
    }
};

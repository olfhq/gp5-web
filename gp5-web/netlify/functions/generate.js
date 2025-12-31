const fetch = require('node-fetch'); // Standard for older Netlify environments

exports.handler = async (event) => {
    // 1. Basic Security
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const body = JSON.parse(event.body);
        
        // Password Check
        if (body.password !== process.env.APP_PASSWORD) {
            return { statusCode: 401, body: JSON.stringify({ error: "⛔ INCORRECT PASSWORD" }) };
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const sheetUrl = process.env.SHEET_WEBHOOK_URL;
        if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "Server missing API Key" }) };

        // 2. Discover Best Model
        const modelRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const modelData = await modelRes.json();
        
        if (!modelData.models) throw new Error("Could not list models. Check API Key permissions.");

        const validModels = modelData.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
        let bestModel = validModels.find(m => m.name.includes("gemini-1.5-flash"))?.name 
                     || validModels.find(m => m.name.includes("gemini-pro"))?.name 
                     || validModels[0]?.name;

        if (!bestModel) throw new Error("No usable AI models found.");

        // 3. Generate Content
        const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${bestModel}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `You are a professional guitar tech. Create a JSON preset for: "${body.song}". Return raw JSON only. Structure: {"UsageNotes":"text","NR":{"Thresh":20},"PRE":{"Status":"On/Off","Model":"TS","P1":50,"P2":50,"P3":50},"DST":{"Status":"On/Off","Model":"DS1","Gain":50,"Tone":50,"Vol":50},"AMP":{"Status":"On","Model":"Recto","Gain":50,"Bass":50,"Mid":50,"Treble":50,"Vol":50},"CAB":{"Status":"On","Model":"4x12","Vol":80,"LowCut":0,"HighCut":0},"EQ":{"Status":"On/Off","Band1":0,"Band2":0,"Band3":0,"Band4":0,"Level":0},"MOD":{"Status":"On/Off","Model":"Chorus","Rate":50,"Depth":50,"Mix":30},"DLY":{"Status":"On/Off","Model":"Digital","Mix":30,"Fdbk":30,"Time":300},"REV":{"Status":"On/Off","Model":"Room","PreD":20,"Decay":40,"Mix":30}}` }] }]
            })
        });

        const genData = await genRes.json();
        if (genData.error) throw new Error(genData.error.message);

        const rawText = genData.candidates[0].content.parts[0].text.replace(/```json/g, "").replace(/```/g, "").trim();

        // 4. Archive to Sheet (Background Task)
        // We use fetch without 'await' here to prevent the function from timing out
        if (sheetUrl) {
            fetch(sheetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ song: body.song, json: rawText }),
                redirect: "follow"
            }).catch(e => console.log("Archive failed:", e.message));
        }

        return { statusCode: 200, body: JSON.stringify({ json: rawText }) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

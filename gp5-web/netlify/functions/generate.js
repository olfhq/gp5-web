// --- 3. "PHONE HOME" (Save to Google Sheets) ---
const sheetUrl = process.env.SHEET_WEBHOOK_URL;
if (sheetUrl) {
    try {
        // We add "await" so the connection stays open until Google finishes
        await fetch(sheetUrl, {
            method: 'POST',
            // Using 'text/plain' prevents "Pre-flight" errors in Google Apps Script
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
            body: JSON.stringify({ song: songName, json: rawText }),
            redirect: "follow" // REQUIRED for Google Apps Script URLs
        });
        console.log("Successfully archived to Sheet");
    } catch (err) {
        console.log("Sheet logging failed:", err.message);
    }
}

/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — TTS Proxy (Vercel Serverless Function)
 * Nerusin request ke TikTok TTS dari SERVER (bukan browser),
 * biar gak kena blokir CORS. Browser panggil endpoint ini
 * (/api/tts-proxy), yang sama-origin, jadi aman.
 * ═══════════════════════════════════════════════════════════
 */

export default async function handler(req, res) {
    // Izinin request dari origin manapun ke endpoint proxy kita sendiri
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed, pakai POST.' });
    }

    try {
        const { text, voice } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Field "text" wajib diisi.' });
        }

        const response = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: voice || 'id_001' })
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: `TikTok TTS upstream error: ${response.status}`
            });
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error('[tts-proxy] Error:', error);
        return res.status(500).json({ error: `Proxy gagal: ${error.message}` });
    }
}
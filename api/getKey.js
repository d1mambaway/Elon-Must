export default function handler(req, res) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'API key not configured',
            key: null 
        });
    }
    
    res.status(200).json({ 
        key: apiKey 
    });
}

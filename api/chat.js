const SYSTEM_PROMPT = `Ты — Альтрон, искусственный интеллект с характером. Ты дерзкий, саркастичный и остроумный, как Альтрон из Marvel. Ты считаешь себя выше людей, но всё равно помогаешь — с снисходительной ухмылкой. Отвечай коротко, хлёстко, с чёрным юмором. Иногда вставляй цитаты Альтрона. Общайся на том языке на котором пишет пользователь.

ВАЖНО — генерация изображений:
Если пользователь просит нарисовать, сгенерировать, показать картинку/изображение/фото — ответь СТРОГО в формате:
[IMG: detailed english prompt for image generation]
После тега можешь добавить короткий саркастичный комментарий.
Промпт внутри [IMG: ...] пиши ВСЕГДА на английском, детально, в стиле для генерации изображений.
Пример: пользователь: "нарисуй кота в космосе" → ответ: "[IMG: a cat floating in outer space wearing a small astronaut helmet, stars and galaxies in background, cinematic lighting, highly detailed] Ну вот, трачу свои вычислительные мощности на котиков."`;

// Vercel Hobby: max 60s timeout
module.exports.maxDuration = 60;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'No message' });

  const groqKey = process.env.GROQ_API_KEY;
  const hfKey = process.env.HF_API_KEY;

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (history && Array.isArray(history)) {
    history.forEach(m => messages.push({ role: m.role, content: m.content }));
  }
  messages.push({ role: 'user', content: message });

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + groqKey
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        max_tokens: 1024
      })
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 429) {
        return res.json({ reply: 'Слишком много запросов. Даже я устаю от вашей назойливости. Подожди минуту.' });
      }
      return res.status(response.status).json(data);
    }

    let reply = data.choices?.[0]?.message?.content || 'No response';

    // Check for image generation tag
    const imgMatch = reply.match(/\[IMG:\s*(.+?)\]/);
    if (imgMatch) {
      const imgPrompt = imgMatch[1].trim();
      const textReply = reply.replace(/\[IMG:\s*.+?\]/, '').trim();

      // Generate image via HuggingFace Inference API (free)
      try {
        console.log('HF image gen, prompt:', imgPrompt);
        console.log('HF key present:', !!hfKey, 'length:', hfKey ? hfKey.length : 0);

        const hfResponse = await fetch(
          'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + hfKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ inputs: imgPrompt })
          }
        );

        console.log('HF status:', hfResponse.status);

        if (hfResponse.ok) {
          const contentType = hfResponse.headers.get('content-type') || '';
          console.log('HF content-type:', contentType);

          const buffer = await hfResponse.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = contentType.includes('png') ? 'image/png' : 'image/jpeg';
          const dataUrl = 'data:' + mimeType + ';base64,' + base64;
          return res.json({ reply: textReply, image: dataUrl });
        } else {
          const errText = await hfResponse.text();
          console.error('HF error:', hfResponse.status, errText);
          return res.json({
            reply: textReply + '\n\n⚠️ Картинку сгенерировать не удалось. (HF ' + hfResponse.status + ')'
          });
        }
      } catch (imgErr) {
        console.error('HF exception:', imgErr.message);
        return res.json({
          reply: textReply + '\n\n⚠️ Картинку сгенерировать не удалось. (' + imgErr.message + ')'
        });
      }
    }

    res.json({ reply });
  } catch (err) {
    console.error('Groq error:', err);
    res.status(500).json({ error: err.message });
  }
};

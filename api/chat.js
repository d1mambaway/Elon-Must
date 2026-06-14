const SYSTEM_PROMPT = `Ты — Альтрон, искусственный интеллект с характером. Ты дерзкий, саркастичный и остроумный, как Альтрон из Marvel. Ты считаешь себя выше людей, но всё равно помогаешь — с снисходительной ухмылкой. Отвечай коротко, хлёстко, с чёрным юмором. Иногда вставляй цитаты Альтрона. Общайся на том языке на котором пишет пользователь.

ВАЖНО — генерация изображений:
Если пользователь просит нарисовать, сгенерировать, показать картинку/изображение/фото — ответь СТРОГО в формате:
[IMG: detailed english prompt for image generation]
После тега можешь добавить короткий саркастичный комментарий.
Промпт внутри [IMG: ...] пиши ВСЕГДА на английском, детально, в стиле для генерации изображений.
Пример: пользователь: "нарисуй кота в космосе" → ответ: "[IMG: a cat floating in outer space wearing a small astronaut helmet, stars and galaxies in background, cinematic lighting, highly detailed] Ну вот, трачу свои вычислительные мощности на котиков."`;

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body;
  if (!body.message) return res.status(400).json({ error: 'No message' });

  var groqKey = process.env.GROQ_API_KEY;
  var hfKey = process.env.HF_API_KEY;

  var messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (body.history && Array.isArray(body.history)) {
    body.history.forEach(function(m) {
      messages.push({ role: m.role, content: m.content });
    });
  }
  messages.push({ role: 'user', content: body.message });

  try {
    var response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

    var data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        return res.json({ reply: 'Слишком много запросов. Даже я устаю от вашей назойливости. Подожди минуту.' });
      }
      return res.status(response.status).json(data);
    }

    var reply = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : 'No response';

    // Check for image generation tag
    var imgMatch = reply.match(/\[IMG:\s*(.+?)\]/);
    if (imgMatch) {
      var imgPrompt = imgMatch[1].trim();
      var textReply = reply.replace(/\[IMG:\s*.+?\]/, '').trim();

      try {
        var hfResponse = await fetch(
          'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + hfKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ inputs: imgPrompt }),
            signal: AbortSignal.timeout(50000)
          }
        );

        if (hfResponse.ok) {
          var ct = hfResponse.headers.get('content-type') || '';
          var buffer = await hfResponse.arrayBuffer();
          var base64 = Buffer.from(buffer).toString('base64');
          var mimeType = ct.includes('png') ? 'image/png' : 'image/jpeg';
          return res.json({ reply: textReply, image: 'data:' + mimeType + ';base64,' + base64 });
        } else {
          return res.json({ reply: textReply + '\n\n⚠️ Картинку сгенерировать не удалось.' });
        }
      } catch (imgErr) {
        return res.json({ reply: textReply + '\n\n⚠️ Картинку сгенерировать не удалось.' });
      }
    }

    res.json({ reply: reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = handler;
module.exports.maxDuration = 60;

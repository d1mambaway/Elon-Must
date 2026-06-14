module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ key: process.env.GEMINI_API_KEY });
};

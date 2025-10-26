const path = require("path");
const fs = require("fs");
const blackListApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const filePath = path.join(__dirname, '../', 'data.txt');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Error reading file' });
    };
    let blacklistedKeys;
    try {
      blacklistedKeys = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ error: "Invalid blacklist file format" });
    }
    if(blacklistedKeys.includes(apiKey)){
      return res.status(403).json({error: 'Access denied'})
    }
    next();
  });
}

module.exports = blackListApiKey;
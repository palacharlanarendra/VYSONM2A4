const {User} = require("../db.js");
const timedMiddleware = require("./timedMiddleware.js");

const apiKeyAuth = timedMiddleware("Logger", async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if(!apiKey) {
      return res.status(400).send({error: 'Api key is not provided'});
    }
    const user = await User.findOne({ where: { api_key: apiKey } });
    if(!user) {
      return res.status(401).send({error: 'Invalid user or Invalid API key'});
    }
    if(user.tier != "enterprise" && req.originalUrl === '/shorten/bulk') {
      return res.status(403).json({ error: "You need to upgrade to enterprise tier" });
    }
    res.locals.user = user.get({plain: true});
    next();
  } catch (error) {
    return res.status(500).json({ error: error.message});
  }
});

module.exports = apiKeyAuth;

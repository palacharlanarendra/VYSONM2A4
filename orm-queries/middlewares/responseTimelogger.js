const responseTimelogger = (req, res, next) => {
  const start = process.hrtime.bigint(); // high precision timer

  const originalEnd = res.end;
  res.end = function (...args) {
    const end = process.hrtime.bigint();
    const elapsedMs = Number(end - start) / 1_000_000;

    // set header BEFORE response ends
    res.setHeader("X-Response-Time", `${elapsedMs.toFixed(2)} ms`);

    console.log(
      `[${req.method}] ${req.originalUrl} - ${elapsedMs.toFixed(2)} ms`
    );

    // call the original res.end to actually send the response
    return originalEnd.apply(this, args);
  };

  next();
};

module.exports = responseTimelogger;

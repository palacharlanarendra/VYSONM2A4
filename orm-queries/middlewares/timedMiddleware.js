const timedMiddleware = (name, fn) => {
  return (req, res, next) => {
    const start = process.hrtime.bigint();

    // when this middleware finishes its job
    fn(req, res, () => {
      const end = process.hrtime.bigint();
      const elapsedMs = Number(end - start) / 1_000_000;
      console.log(`[${name}] took ${elapsedMs.toFixed(3)} ms -> tm`);
      next();
    });
  };
};
module.exports = timedMiddleware;
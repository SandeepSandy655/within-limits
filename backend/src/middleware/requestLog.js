const { randomUUID } = require('node:crypto');

// Never log request bodies, query strings, tokens, card UIDs or passwords.
function requestLog(req, res, next) {
  const started = performance.now();
  const requestPath = req.path;
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  let finished = false;
  function record(aborted) {
    if (finished) return;
    finished = true;
    const durationMs = Math.round(performance.now() - started);
    if (req.path === '/health' && res.statusCode < 400 && !aborted) return;
    console.log(JSON.stringify({ time: new Date().toISOString(), event: 'http_request',
      requestId: req.requestId, method: req.method, path: requestPath,
      status: aborted ? 499 : res.statusCode, durationMs,
      level: aborted || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 || durationMs > 2000 ? 'warn' : 'info',
      ...(aborted ? { aborted: true } : {}) }));
  }
  res.once('finish', () => record(false));
  res.once('close', () => record(!res.writableFinished));
  next();
}
module.exports = requestLog;

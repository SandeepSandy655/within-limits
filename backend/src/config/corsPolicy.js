function corsOrigin(value = process.env.CORS_ORIGIN || '*') {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.includes('*')) return '*';
  return (origin, callback) => {
    // Native apps and hardware do not send an Origin header.
    if (!origin || origins.includes(origin)) return callback(null, true);
    callback(Object.assign(new Error('Origin is not allowed.'), { status: 403 }));
  };
}
module.exports = { corsOrigin };

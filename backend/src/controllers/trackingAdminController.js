const tracking = require("../services/trackingService");
function endpoint(handler) {
  return async (req, res, next) => {
    try { await handler(req, res); }
    catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "That tracking code is already assigned to a group." });
      next(error);
    }
  };
}
const getOverview = endpoint(async (req, res) => { res.set("Cache-Control", "no-store"); res.json(await tracking.getOverview(req.adminUser)); });
const createRoute = endpoint(async (req, res) => res.status(201).json({ success: true, id: await tracking.saveRoute(req.body, null, req.adminUser) }));
const updateRoute = endpoint(async (req, res) => res.json({ success: true, id: await tracking.saveRoute(req.body, req.params.routeId, req.adminUser) }));
const createGroup = endpoint(async (req, res) => res.status(201).json({ success: true, id: await tracking.createGroup(req.body, req.adminUser) }));
module.exports = { getOverview, createRoute, updateRoute, createGroup };

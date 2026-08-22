"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4174);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_BODY_BYTES = 18 * 1024 * 1024;

const sessions = new Map();

const rolePermissions = {
  super_admin: ["read", "write_stock", "write_intervention", "validate", "admin"],
  magasinier: ["read", "write_stock"],
  terrain: ["read", "write_intervention"],
  controleur: ["read", "validate"]
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    writeDb(seedDb());
  }
}

function seedDb() {
  return {
    users: [
      user("USR-001", "admin@itc.local", "demo123", "Aminata Kone", "super_admin"),
      user("USR-002", "depot@itc.local", "demo123", "Magasin Central", "magasinier"),
      user("USR-003", "terrain@itc.local", "demo123", "Equipe Terrain A", "terrain"),
      user("USR-004", "controle@itc.local", "demo123", "Controle Qualite", "controleur")
    ],
    projects: [
      { id: "CH-MOOV-A1", name: "MOOV - Axe Yopougon PK12", client: "MOOV", zone: "Abidjan Nord" },
      { id: "CH-CIE-B4", name: "CIE - Extension reseau B4", client: "CIE", zone: "Bouake Est" },
      { id: "CH-ORG-T2", name: "Orange - Fibre rurale T2", client: "Orange", zone: "Daloa Sud" }
    ],
    poles: [
      { id: "POT-2026-B9-001", type: "BETON", height: 12, effort: "400 daN", weight: 860, maker: "SIPREL / Lot B9", status: "En Stock", depot: "Depot Central" },
      { id: "POT-2026-B9-002", type: "BETON", height: 11, effort: "300 daN", weight: 790, maker: "SIPREL / Lot B9", status: "En Transit", depot: "Camion EQ-A" },
      { id: "POT-2026-M4-018", type: "METALLIQUE", height: 9, effort: "250 daN", weight: 235, maker: "METALCI / Lot M4", status: "Pose - En attente validation", depot: "Chantier MOOV", lat: 5.39231, lng: -4.03221 },
      { id: "POT-2026-M4-019", type: "METALLIQUE", height: 9, effort: "250 daN", weight: 236, maker: "METALCI / Lot M4", status: "Valide", depot: "Chantier MOOV", lat: 5.38875, lng: -4.02684 },
      { id: "POT-2026-B10-021", type: "BETON", height: 12, effort: "500 daN", weight: 920, maker: "SIPREL / Lot B10", status: "Anomalie", depot: "Chantier CIE", lat: 7.69592, lng: -5.03012 },
      { id: "POT-2026-M5-030", type: "METALLIQUE", height: 10, effort: "300 daN", weight: 280, maker: "METALCI / Lot M5", status: "En Stock", depot: "Depot Bouake" }
    ],
    interventions: [
      {
        id: "RPT-2026-0001",
        poleId: "POT-2026-M4-019",
        projectId: "CH-MOOV-A1",
        agent: "Equipe Terrain A",
        agentId: "USR-003",
        date: new Date(Date.now() - 86400000).toISOString(),
        lat: 5.38875,
        lng: -4.02684,
        soil: "Terre",
        depth: 1.25,
        validation: "Valide",
        notes: "Pose conforme, aplomb controle et massif cure.",
        teamSignature: "A. Konan",
        clientSignature: "Controle Qualite",
        photos: []
      }
    ],
    auditLog: []
  };
}

function user(id, email, password, name, role) {
  return { id, email, passwordHash: hashPassword(password), name, role };
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function readDb() {
  ensureStorage();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function publicUser(userRecord) {
  const { passwordHash, ...safeUser } = userRecord;
  return safeUser;
}

function hasPermission(userRecord, permission) {
  return rolePermissions[userRecord.role]?.includes(permission);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Payload trop volumineux"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}

function authenticate(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = sessions.get(token);
  if (!session) return null;
  return db.users.find(userRecord => userRecord.id === session.userId) || null;
}

function nextReportId(db) {
  const year = new Date().getFullYear();
  const max = db.interventions
    .map(item => /^RPT-\d{4}-(\d+)$/.exec(item.id)?.[1])
    .filter(Boolean)
    .map(Number)
    .reduce((acc, value) => Math.max(acc, value), 0);
  return `RPT-${year}-${String(max + 1).padStart(4, "0")}`;
}

function audit(db, actor, action, payload = {}) {
  db.auditLog.push({
    id: crypto.randomUUID(),
    actorId: actor.id,
    action,
    payload,
    date: new Date().toISOString()
  });
}

function savePhotos(reportId, photos = []) {
  const reportDir = path.join(UPLOAD_DIR, reportId);
  fs.mkdirSync(reportDir, { recursive: true });
  return photos.map((photo, index) => {
    if (!photo?.data?.startsWith("data:image/")) return photo;
    const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(photo.data);
    if (!match) return { ...photo, data: null };
    const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
    const filename = `${String(index + 1).padStart(2, "0")}-${slug(photo.step || "photo")}.${ext}`;
    fs.writeFileSync(path.join(reportDir, filename), Buffer.from(match[2], "base64"));
    return {
      step: photo.step,
      date: photo.date,
      lat: photo.lat,
      lng: photo.lng,
      url: `/uploads/${reportId}/${filename}`
    };
  });
}

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

async function handleApi(req, res, url) {
  const db = readDb();

  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "SuiviPoteaux Pro API", date: new Date().toISOString() });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const found = db.users.find(item => item.email === email && item.passwordHash === hashPassword(body.password));
    if (!found) return sendError(res, 401, "Identifiants invalides");
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { userId: found.id, createdAt: Date.now() });
    return sendJson(res, 200, { token, user: publicUser(found) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const allowedRoles = ["magasinier", "terrain", "controleur"];
    const role = allowedRoles.includes(body.role) ? body.role : "terrain";
    if (!name || !email || password.length < 6) {
      return sendError(res, 400, "Nom, email et mot de passe de 6 caracteres minimum requis");
    }
    if (db.users.some(item => item.email === email)) {
      return sendError(res, 409, "Un compte existe deja avec cet email");
    }
    const created = user(`USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, email, password, name, role);
    db.users.push(created);
    db.auditLog.push({
      id: crypto.randomUUID(),
      actorId: created.id,
      action: "auth.register",
      payload: { email, role },
      date: new Date().toISOString()
    });
    writeDb(db);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { userId: created.id, createdAt: Date.now() });
    return sendJson(res, 201, { token, user: publicUser(created) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || password.length < 6) {
      return sendError(res, 400, "Email et nouveau mot de passe de 6 caracteres minimum requis");
    }
    const found = db.users.find(item => item.email === email);
    if (!found) return sendError(res, 404, "Aucun compte trouve avec cet email");
    found.passwordHash = hashPassword(password);
    audit(db, found, "auth.password_reset", { email });
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true });
  }

  const actor = authenticate(req, db);
  if (!actor) return sendError(res, 401, "Authentification requise");

  if (req.method === "GET" && url.pathname === "/api/me") {
    return sendJson(res, 200, { user: publicUser(actor), permissions: rolePermissions[actor.role] || [] });
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    return sendJson(res, 200, {
      user: publicUser(actor),
      projects: db.projects,
      poles: db.poles,
      interventions: db.interventions,
      offlineQueue: []
    });
  }

  if (req.method === "GET" && url.pathname === "/api/poles") {
    return sendJson(res, 200, { poles: db.poles });
  }

  if (req.method === "POST" && url.pathname === "/api/poles") {
    if (!hasPermission(actor, "write_stock")) return sendError(res, 403, "Permission stock requise");
    const body = await readBody(req);
    if (!body.id || !body.type || !body.height) return sendError(res, 400, "Champs poteau incomplets");
    if (db.poles.some(item => item.id === body.id)) return sendError(res, 409, "Code poteau deja existant");
    const pole = {
      id: body.id,
      type: body.type,
      height: Number(body.height),
      effort: body.effort || "",
      weight: Number(body.weight || 0),
      maker: body.maker || "",
      status: body.status || "En Stock",
      depot: body.depot || "Depot Central"
    };
    db.poles.push(pole);
    audit(db, actor, "pole.create", { poleId: pole.id });
    writeDb(db);
    return sendJson(res, 201, { pole });
  }

  const poleMatch = /^\/api\/poles\/([^/]+)$/.exec(url.pathname);
  if (req.method === "PATCH" && poleMatch) {
    if (!hasPermission(actor, "write_stock")) return sendError(res, 403, "Permission stock requise");
    const pole = db.poles.find(item => item.id === decodeURIComponent(poleMatch[1]));
    if (!pole) return sendError(res, 404, "Poteau introuvable");
    Object.assign(pole, await readBody(req));
    audit(db, actor, "pole.update", { poleId: pole.id });
    writeDb(db);
    return sendJson(res, 200, { pole });
  }

  if (req.method === "POST" && url.pathname === "/api/requisitions") {
    if (!hasPermission(actor, "write_stock")) return sendError(res, 403, "Permission stock requise");
    const body = await readBody(req);
    const poleIds = Array.isArray(body.poleIds) ? body.poleIds : [];
    const moved = [];
    for (const pole of db.poles) {
      if (poleIds.includes(pole.id)) {
        pole.status = "En Transit";
        pole.depot = body.destination || "Camion equipe terrain";
        moved.push(pole.id);
      }
    }
    audit(db, actor, "requisition.create", { poleIds: moved });
    writeDb(db);
    return sendJson(res, 201, { moved, poles: db.poles });
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    return sendJson(res, 200, { projects: db.projects });
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    if (!hasPermission(actor, "admin")) return sendError(res, 403, "Permission administrateur requise");
    const body = await readBody(req);
    if (!body.id || !body.name) return sendError(res, 400, "Champs chantier incomplets");
    db.projects.push({ id: body.id, name: body.name, client: body.client || "", zone: body.zone || "" });
    audit(db, actor, "project.create", { projectId: body.id });
    writeDb(db);
    return sendJson(res, 201, { projects: db.projects });
  }

  if (req.method === "GET" && url.pathname === "/api/interventions") {
    return sendJson(res, 200, { interventions: db.interventions });
  }

  if (req.method === "POST" && url.pathname === "/api/interventions") {
    if (!hasPermission(actor, "write_intervention")) return sendError(res, 403, "Permission terrain requise");
    const body = await readBody(req);
    if (!body.poleId || !body.projectId || !body.lat || !body.lng) return sendError(res, 400, "Fiche de pose incomplete");
    const id = body.id && !db.interventions.some(item => item.id === body.id) ? body.id : nextReportId(db);
    const photos = savePhotos(id, body.photos || []);
    const intervention = {
      id,
      poleId: body.poleId,
      projectId: body.projectId,
      agent: body.agent || actor.name,
      agentId: actor.id,
      date: body.date || new Date().toISOString(),
      lat: Number(body.lat),
      lng: Number(body.lng),
      soil: body.soil,
      depth: Number(body.depth),
      validation: body.validation || "Pose - En attente validation",
      notes: body.notes || "",
      teamSignature: body.teamSignature || "",
      clientSignature: body.clientSignature || "",
      photos,
      draft: Boolean(body.draft)
    };
    db.interventions.push(intervention);
    const pole = db.poles.find(item => item.id === body.poleId);
    if (pole) {
      pole.status = intervention.draft ? "En Transit" : intervention.validation;
      pole.lat = intervention.lat;
      pole.lng = intervention.lng;
      pole.depot = "Implante terrain";
    }
    audit(db, actor, "intervention.create", { reportId: id, poleId: body.poleId });
    writeDb(db);
    return sendJson(res, 201, { intervention, poles: db.poles });
  }

  const validationMatch = /^\/api\/interventions\/([^/]+)\/validate$/.exec(url.pathname);
  if (req.method === "PATCH" && validationMatch) {
    if (!hasPermission(actor, "validate")) return sendError(res, 403, "Permission validation requise");
    const intervention = db.interventions.find(item => item.id === decodeURIComponent(validationMatch[1]));
    if (!intervention) return sendError(res, 404, "Rapport introuvable");
    const body = await readBody(req);
    intervention.validation = body.validation || "Valide";
    intervention.clientSignature = body.clientSignature || actor.name;
    intervention.validatedBy = actor.id;
    intervention.validatedAt = new Date().toISOString();
    const pole = db.poles.find(item => item.id === intervention.poleId);
    if (pole) pole.status = intervention.validation;
    audit(db, actor, "intervention.validate", { reportId: intervention.id, validation: intervention.validation });
    writeDb(db);
    return sendJson(res, 200, { intervention, poles: db.poles });
  }

  if (req.method === "POST" && url.pathname === "/api/sync") {
    const body = await readBody(req);
    const operations = Array.isArray(body.operations) ? body.operations : [];
    audit(db, actor, "sync.client", { count: operations.length });
    writeDb(db);
    return sendJson(res, 200, {
      accepted: operations.length,
      projects: db.projects,
      poles: db.poles,
      interventions: db.interventions,
      offlineQueue: []
    });
  }

  return sendError(res, 404, "Route API introuvable");
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    res.end(content);
  });
}

async function handle(req, res) {
  try {
    const url = parseUrl(req);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    return sendError(res, 500, error.message || "Erreur serveur");
  }
}

ensureStorage();
const server = http.createServer(handle);

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`Le port ${PORT} est deja utilise.`);
    console.error("Fermez l'autre serveur ou lancez celui-ci avec un autre port :");
    console.error("PowerShell : $env:PORT=4175; npm start");
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, () => {
  console.log(`SuiviPoteaux Pro backend listening on http://localhost:${PORT}`);
  console.log("Comptes demo: admin@itc.local / depot@itc.local / terrain@itc.local / controle@itc.local");
  console.log("Mot de passe demo: demo123");
});

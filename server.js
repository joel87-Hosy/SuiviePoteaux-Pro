"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
let createClient;
try {
  ({ createClient } = require("@supabase/supabase-js"));
} catch {
  createClient = null;
}

const PORT = Number(process.env.PORT || 4174);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_BODY_BYTES = 18 * 1024 * 1024;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "pole-photos";
const SUPABASE_ENABLED = Boolean(createClient && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
const ALLOW_PUBLIC_PASSWORD_RESET = process.env.ALLOW_PUBLIC_PASSWORD_RESET === "true";
const ALLOW_PUBLIC_REGISTRATION = process.env.ALLOW_PUBLIC_REGISTRATION === "true";
const MAX_PHOTOS_PER_REPORT = 6;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const MAX_PROFILE_PHOTO_BYTES = 1024 * 1024;
const DEFAULT_TENANT_ID = "tenant-demo";
const TENANT_STATUSES = ["active", "trial", "suspended"];
const PLATFORM_ROLES = ["platform_owner", "platform_support", "platform_billing", "platform_security"];
const PLAN_NAMES = ["starter", "pro", "enterprise"];
const BILLING_CYCLES = ["monthly", "annual"];
const DEFAULT_TENANT_MODULES = { production: false, sales: false, finance: false };
const tenantRoleAliases = {
  tenant_admin: "tenant_admin",
  depot_manager: "depot_manager",
  field_agent: "field_agent",
  quality_inspector: "quality_inspector"
};
const planDefaults = {
  starter: { priceMonthly: 99000, priceAnnual: 990000, maxDepots: 2, maxUsers: 8, maxStorageGb: 10, features: { offline: true, pdfExport: true, customPdf: false, apiAccess: false } },
  pro: { priceMonthly: 249000, priceAnnual: 2490000, maxDepots: 8, maxUsers: 35, maxStorageGb: 80, features: { offline: true, pdfExport: true, customPdf: true, apiAccess: false } },
  enterprise: { priceMonthly: 650000, priceAnnual: 6500000, maxDepots: 99, maxUsers: 250, maxStorageGb: 500, features: { offline: true, pdfExport: true, customPdf: true, apiAccess: true } }
};
const supabase = SUPABASE_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })
  : null;

const sessions = new Map();
const rateLimits = new Map();

const rolePermissions = {
  platform_admin: ["read", "write_stock", "write_intervention", "validate", "admin", "platform_admin"],
  super_admin: ["read", "write_stock", "write_intervention", "validate", "admin", "production", "sales", "finance"],
  tenant_admin: ["read", "write_stock", "write_intervention", "validate", "admin", "production", "sales", "finance"],
  chef_production: ["read", "write_stock", "production"],
  commercial: ["read", "sales"],
  direction_finance: ["read", "finance", "sales"],
  magasinier: ["read", "write_stock"],
  depot_manager: ["read", "write_stock"],
  terrain: ["read", "write_intervention"],
  field_agent: ["read", "write_intervention"],
  controleur: ["read", "validate"],
  quality_inspector: ["read", "validate"]
};
const OPERATORS = ["MOOV CI", "Orange CI", "MTN CI", "CIE"];
const DEFAULT_SETTINGS = {
  operators: OPERATORS,
  poleTypes: ["BETON", "METALLIQUE"],
  poleHeights: [7, 9, 10, 11, 12],
  depots: ["Depot Central", "Depot Bouake", "Depot Yopougon"],
  gpsMaxDistanceKm: 5
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
    fs.writeFileSync(DB_FILE, JSON.stringify(seedDb(), null, 2));
  }
}

function seedDb() {
  return {
    users: [
      user("USR-PLATFORM", "platform@itc.local", "demo123", "Equipe SaaS", "platform_admin", { depot: "Plateforme", team: "", tenantId: null }),
      user("USR-001", "admin@itc.local", "demo123", "Aminata Kone", "super_admin", { depot: "Direction", team: "" }),
      user("USR-002", "depot@itc.local", "demo123", "Magasin Central", "magasinier", { depot: "Depot Central", team: "" }),
      user("USR-003", "terrain@itc.local", "demo123", "Equipe Terrain A", "terrain", { depot: "Terrain", team: "Equipe Terrain A" }),
      user("USR-004", "controle@itc.local", "demo123", "Controle Qualite", "controleur", { depot: "Controle", team: "" })
    ],
    projects: [
      { id: "CH-MOOV-A1", name: "MOOV - Axe Yopougon PK12", client: "MOOV CI", zone: "Abidjan Nord", startDate: "2026-08-20", endDate: "2026-09-05", poleCount: 2, assignedTeam: "Equipe Terrain A", status: "Pris en main", requestStatus: "Validee", requirements: [{ type: "METALLIQUE", height: 9, quantity: 2 }], assignedPoleIds: ["POT-2026-M4-018", "POT-2026-M4-019"] },
      { id: "CH-CIE-B4", name: "CIE - Extension reseau B4", client: "CIE", zone: "Bouake Est", startDate: "2026-08-22", endDate: "2026-08-30", poleCount: 1, assignedTeam: "Equipe Terrain A", status: "En implantation", requestStatus: "Validee", requirements: [{ type: "BETON", height: 12, quantity: 1 }], assignedPoleIds: ["POT-2026-B10-021"] },
      { id: "CH-ORG-T2", name: "Orange - Fibre rurale T2", client: "Orange CI", zone: "Daloa Sud", poleCount: 0, assignedTeam: "", status: "Planifie", requestStatus: "Brouillon", requirements: [], assignedPoleIds: [] }
    ],
    poles: [
      { id: "POT-2026-B9-001", type: "BETON", height: 12, effort: "400 daN", weight: 860, maker: "SIPREL / Lot B9", status: "En Stock", depot: "Depot Central" },
      { id: "POT-2026-B9-002", type: "BETON", height: 11, effort: "300 daN", weight: 790, maker: "SIPREL / Lot B9", status: "En Transit", depot: "Terrain - Equipe Terrain A", assignedTeam: "Equipe Terrain A" },
      { id: "POT-2026-M4-018", type: "METALLIQUE", height: 9, effort: "250 daN", weight: 235, maker: "METALCI / Lot M4", status: "Pose - En attente validation", depot: "Chantier MOOV", assignedTeam: "Equipe Terrain A", projectId: "CH-MOOV-A1", lat: 5.39231, lng: -4.03221 },
      { id: "POT-2026-M4-019", type: "METALLIQUE", height: 9, effort: "250 daN", weight: 236, maker: "METALCI / Lot M4", status: "Valide", depot: "Chantier MOOV", assignedTeam: "Equipe Terrain A", projectId: "CH-MOOV-A1", lat: 5.38875, lng: -4.02684 },
      { id: "POT-2026-B10-021", type: "BETON", height: 12, effort: "500 daN", weight: 920, maker: "SIPREL / Lot B10", status: "Anomalie", depot: "Chantier CIE", assignedTeam: "Equipe Terrain A", projectId: "CH-CIE-B4", lat: 7.69592, lng: -5.03012 },
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
    stockMovements: [],
    auditLog: [],
    productionOrders: [],
    factoryQualityChecks: [],
    clients: [],
    sales: [],
    saleItems: [],
    tenants: [
      {
        id: DEFAULT_TENANT_ID,
        raisonSociale: "ITC Demo",
        slug: "itc-demo",
        secteurActivite: "BTP / Telecom",
        pays: "Cote d'Ivoire",
        ville: "Abidjan",
        logoUrl: "",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    subscriptions: [
      {
        id: "sub-demo",
        tenantId: DEFAULT_TENANT_ID,
        planName: "pro",
        status: "active",
        billingCycle: "monthly",
        currentPeriodStart: new Date(Date.now() - 15 * 86400000).toISOString(),
        currentPeriodEnd: new Date(Date.now() + 15 * 86400000).toISOString(),
        cancelAtPeriodEnd: false
      }
    ],
    tenantLimits: [
      { id: "limits-demo", tenantId: DEFAULT_TENANT_ID, maxDepots: 8, maxUsers: 35, maxStorageGb: 80 }
    ],
    platformPlans: planDefaults,
    coupons: [],
    transactions: [],
    systemBanners: [],
    activationEmails: [],
    platformAuditLogs: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

function user(id, email, password, name, role, details = {}) {
  return { id, email, passwordHash: hashPassword(password), name, role, phone: "", jobTitle: "", profilePhoto: "", ...details };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const digest = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${digest}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.startsWith("pbkdf2$")) {
    return crypto.createHash("sha256").update(String(password)).digest("hex") === storedHash;
  }
  const [, iterations, salt, digest] = storedHash.split("$");
  const candidate = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(digest, "hex"));
}

function strongPassword(password) {
  const value = String(password || "");
  return value.length >= 10 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value);
}

async function readDb() {
  if (SUPABASE_ENABLED) return readSupabaseDb();
  ensureStorage();
  return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
}

async function writeDb(db) {
  if (SUPABASE_ENABLED) return writeSupabaseDb(db);
  ensureStorage();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

async function readSupabaseDb() {
  const [users, projects, poles, interventions, photos, stockMovements, auditLog, appSettings, tenants, subscriptions, tenantLimits, platformPlansRows, coupons, transactions, systemBanners, activationEmails, platformAuditLogs, productionOrders, factoryQualityChecks, clients, sales, saleItems] = await Promise.all([
    selectTable("app_users"),
    selectTable("projects"),
    selectTable("poles"),
    selectTable("interventions"),
    selectTable("intervention_photos"),
    selectTable("stock_movements"),
    selectTable("audit_log"),
    selectTable("app_settings"),
    selectTable("tenants"),
    selectTable("subscriptions"),
    selectTable("tenant_limits"),
    selectTable("platform_plans"),
    selectTable("coupons"),
    selectTable("transactions"),
    selectTable("system_banners"),
    selectTable("activation_emails"),
    selectTable("platform_audit_logs"),
    selectTable("production_orders"),
    selectTable("factory_quality_checks"),
    selectTable("clients"),
    selectTable("sales"),
    selectTable("sale_items")
  ]);
  return normalizeDb({
    users: users.map(row => ({
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.name,
      role: row.role,
      active: row.active !== false,
      approved: row.approved !== false,
      depot: row.depot || "",
      team: row.team || "",
      phone: row.phone || "",
      jobTitle: row.job_title || row.jobTitle || "",
      profilePhoto: row.profile_photo || row.profilePhoto || "",
      tenantId: row.tenant_id || null,
      platformRole: row.platform_role || ""
    })),
    projects: projects.map(row => ({
      ...row,
      tenantId: row.tenant_id || null,
      poleCount: Number(row.pole_count || row.poleCount || 0),
      assignedTeam: row.assigned_team || row.assignedTeam || "",
      startDate: row.start_date || row.startDate || "",
      endDate: row.end_date || row.endDate || "",
      requestStatus: row.request_status || row.requestStatus || "",
      requirements: row.requirements || [],
      assignedPoleIds: row.assigned_pole_ids || row.assignedPoleIds || [],
      closureRequestedBy: row.closure_requested_by || row.closureRequestedBy || "",
      closureRequestedAt: row.closure_requested_at || row.closureRequestedAt || "",
      closedBy: row.closed_by || row.closedBy || "",
      closedAt: row.closed_at || row.closedAt || ""
    })),
    poles: poles.map(row => ({
      id: row.id,
      tenantId: row.tenant_id || null,
      type: row.type,
      height: Number(row.height),
      effort: row.effort,
      weight: Number(row.weight || 0),
      maker: row.maker,
      status: row.status,
      depot: row.depot,
      assignedTeam: row.assigned_team || "",
      projectId: row.project_id || "",
      lat: row.lat,
      lng: row.lng,
      productionOrderId: row.production_order_id || "",
      matricule: row.matricule || "",
      qrCode: row.qr_code || "",
      factoryStatus: row.factory_status || "",
      productionDate: row.production_date || "",
      resistanceClass: row.resistance_class || "",
      rawMaterialLot: row.raw_material_lot || "",
      factoryUnitCost: Number(row.factory_unit_cost || 0),
      soldAt: row.sold_at || "",
      soldToClientId: row.sold_to_client_id || "",
      saleId: row.sale_id || "",
      deliveryNoteNumber: row.delivery_note_number || ""
    })),
    interventions: interventions.map(row => ({
      id: row.id,
      tenantId: row.tenant_id || null,
      poleId: row.pole_id,
      projectId: row.project_id,
      agent: row.agent,
      agentId: row.agent_id,
      date: row.date,
      lat: row.lat,
      lng: row.lng,
      gpsAccuracy: row.gps_accuracy,
      soil: row.soil,
      depth: Number(row.depth || 0),
      validation: row.validation,
      notes: row.notes,
      teamSignature: row.team_signature,
      teamSignatureImage: row.team_signature_image || "",
      clientSignature: row.client_signature,
      validatedBy: row.validated_by,
      validatedAt: row.validated_at,
      anomalyReason: row.anomaly_reason || "",
      anomalyStatus: row.anomaly_status || "",
      draft: row.draft,
      photos: photos
        .filter(photo => photo.intervention_id === row.id)
        .sort((a, b) => a.position - b.position)
        .map(photo => ({
          step: photo.step,
          date: photo.date,
          lat: photo.lat,
          lng: photo.lng,
          url: photo.url
        }))
    })),
    stockMovements: stockMovements.map(row => ({
      id: row.id,
      tenantId: row.tenant_id || null,
      poleId: row.pole_id,
      movementType: row.movement_type,
      fromDepot: row.from_depot,
      toDepot: row.to_depot,
      actorId: row.actor_id,
      payload: row.payload || {},
      date: row.date
    })),
    auditLog: auditLog.map(row => ({
      id: row.id,
      tenantId: row.tenant_id || null,
      actorId: row.actor_id,
      action: row.action,
      payload: row.payload || {},
      date: row.date
    })),
    tenants: tenants.map(row => normalizeTenantRecord(row)),
    subscriptions: subscriptions.map(row => normalizeSubscriptionRecord(row)),
    tenantLimits: tenantLimits.map(row => normalizeLimitRecord(row)),
    platformPlans: platformPlansRows.length ? Object.fromEntries(platformPlansRows.map(row => [row.id, {
      priceMonthly: Number(row.price_monthly || 0),
      priceAnnual: Number(row.price_annual || 0),
      maxDepots: Number(row.max_depots || 0),
      maxUsers: Number(row.max_users || 0),
      maxStorageGb: Number(row.max_storage_gb || 0),
      features: row.features || {}
    }])) : planDefaults,
    coupons: coupons.map(row => ({
      id: row.id,
      code: row.code,
      discountPercent: Number(row.discount_percent || 0),
      planName: row.plan_name || "",
      expiresAt: row.expires_at || "",
      active: row.active !== false,
      createdAt: row.created_at
    })),
    transactions: transactions.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      provider: row.provider,
      amount: Number(row.amount || 0),
      currency: row.currency || "XOF",
      status: row.status || "",
      reference: row.reference || "",
      date: row.date
    })),
    systemBanners: systemBanners.map(row => ({
      id: row.id,
      message: row.message,
      severity: row.severity || "info",
      active: row.active !== false,
      startsAt: row.starts_at || "",
      endsAt: row.ends_at || "",
      createdAt: row.created_at
    })),
    activationEmails: activationEmails.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      email: row.email,
      subject: row.subject,
      status: row.status || "queued",
      payload: row.payload || {},
      createdAt: row.created_at,
      sentAt: row.sent_at || ""
    })),
    platformAuditLogs: platformAuditLogs.map(row => ({
      id: row.id,
      actorId: row.actor_id,
      targetTenantId: row.target_tenant_id,
      action: row.action,
      ipAddress: row.ip_address,
      timestamp: row.timestamp,
      payload: row.payload || {}
    })),
    productionOrders: productionOrders.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      orderNumber: row.order_number,
      poleType: row.pole_type,
      dimensions: row.dimensions || {},
      resistanceClass: row.resistance_class || "",
      rawMaterialLot: row.raw_material_lot || "",
      quantity: Number(row.quantity || 0),
      unitCost: Number(row.unit_cost || 0),
      status: row.status,
      createdBy: row.created_by || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    factoryQualityChecks: factoryQualityChecks.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      productionOrderId: row.production_order_id || "",
      poleId: row.pole_id || "",
      inspectorId: row.inspector_id || "",
      result: row.result,
      measurements: row.measurements || {},
      notes: row.notes || "",
      checkedAt: row.checked_at
    })),
    clients: clients.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      clientType: row.client_type || "",
      email: row.email || "",
      phone: row.phone || "",
      address: row.address || "",
      paymentTerms: row.payment_terms || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    sales: sales.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      clientId: row.client_id,
      saleNumber: row.sale_number,
      deliveryNoteNumber: row.delivery_note_number || "",
      status: row.status,
      paymentStatus: row.payment_status || "pending",
      paymentTerms: row.payment_terms || "",
      totalAmount: Number(row.total_amount || 0),
      totalCost: Number(row.total_cost || 0),
      marginAmount: Number(row.margin_amount || 0),
      currency: row.currency || "XOF",
      soldBy: row.sold_by || "",
      saleDate: row.sale_date,
      deliveryDate: row.delivery_date || "",
      createdAt: row.created_at
    })),
    saleItems: saleItems.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      saleId: row.sale_id,
      poleId: row.pole_id,
      unitPrice: Number(row.unit_price || 0),
      unitCost: Number(row.unit_cost || 0),
      quantity: Number(row.quantity || 1),
      createdAt: row.created_at
    })),
    settings: appSettings.find(row => row.id === "default")?.value || DEFAULT_SETTINGS
  });
}

async function selectTable(table) {
  const { data, error } = await supabase.from(table).select("*");
  if (error && error.code === "42P01") return [];
  if (error) throw error;
  return data || [];
}

async function writeSupabaseDb(db) {
  await Promise.all([
    upsertTable("app_users", db.users.map(row => ({
      id: row.id,
      tenant_id: row.tenantId || null,
      email: row.email,
      password_hash: row.passwordHash,
      name: row.name,
      role: row.role,
      active: row.active !== false,
      approved: row.approved !== false,
      depot: row.depot || null,
      team: row.team || null,
      phone: row.phone || null,
      job_title: row.jobTitle || null,
      profile_photo: row.profilePhoto || null,
      platform_role: row.platformRole || null
    }))),
    upsertTable("projects", db.projects.map(row => ({
      id: row.id,
      tenant_id: row.tenantId || DEFAULT_TENANT_ID,
      name: row.name,
      client: row.client || "",
      zone: row.zone || "",
      start_date: row.startDate || null,
      end_date: row.endDate || null,
      pole_count: row.poleCount || 0,
      assigned_team: row.assignedTeam || null,
      status: row.status || "Planifie",
      request_status: row.requestStatus || "Brouillon",
      requirements: row.requirements || [],
      assigned_pole_ids: row.assignedPoleIds || [],
      created_by: row.createdBy || null,
      created_at: row.createdAt || new Date().toISOString(),
      validated_by: row.validatedBy || null,
      validated_at: row.validatedAt || null,
      taken_by: row.takenBy || null,
      taken_at: row.takenAt || null,
      closure_requested_by: row.closureRequestedBy || null,
      closure_requested_at: row.closureRequestedAt || null,
      closed_by: row.closedBy || null,
      closed_at: row.closedAt || null
    }))),
    upsertTable("poles", db.poles.map(row => ({
      id: row.id,
      tenant_id: row.tenantId || DEFAULT_TENANT_ID,
      type: row.type,
      height: row.height,
      effort: row.effort,
      weight: row.weight,
      maker: row.maker,
      status: row.status,
      depot: row.depot,
      assigned_team: row.assignedTeam || null,
      project_id: row.projectId || null,
      lat: row.lat || null,
      lng: row.lng || null,
      production_order_id: row.productionOrderId || null,
      matricule: row.matricule || null,
      qr_code: row.qrCode || null,
      factory_status: row.factoryStatus || null,
      production_date: row.productionDate || null,
      resistance_class: row.resistanceClass || null,
      raw_material_lot: row.rawMaterialLot || null,
      factory_unit_cost: Number(row.factoryUnitCost || 0),
      sold_at: row.soldAt || null,
      sold_to_client_id: row.soldToClientId || null,
      sale_id: row.saleId || null,
      delivery_note_number: row.deliveryNoteNumber || null
    }))),
    upsertTable("interventions", db.interventions.map(row => ({
      id: row.id,
      tenant_id: row.tenantId || DEFAULT_TENANT_ID,
      pole_id: row.poleId,
      project_id: row.projectId,
      agent: row.agent,
      agent_id: row.agentId,
      date: row.date,
      lat: row.lat,
      lng: row.lng,
      gps_accuracy: row.gpsAccuracy || null,
      soil: row.soil,
      depth: row.depth,
      validation: row.validation,
      notes: row.notes,
      team_signature: row.teamSignature,
      team_signature_image: row.teamSignatureImage || null,
      client_signature: row.clientSignature,
      validated_by: row.validatedBy || null,
      validated_at: row.validatedAt || null,
      anomaly_reason: row.anomalyReason || null,
      anomaly_status: row.anomalyStatus || null,
      draft: Boolean(row.draft)
    }))),
    upsertTable("stock_movements", (db.stockMovements || []).map(row => ({
      id: row.id,
      tenant_id: row.tenantId || DEFAULT_TENANT_ID,
      pole_id: row.poleId || null,
      movement_type: row.movementType,
      from_depot: row.fromDepot || null,
      to_depot: row.toDepot || null,
      actor_id: row.actorId || null,
      payload: row.payload || {},
      date: row.date
    }))),
    upsertTable("audit_log", db.auditLog.map(row => ({
      id: row.id,
      tenant_id: row.tenantId || DEFAULT_TENANT_ID,
      actor_id: row.actorId,
      action: row.action,
      payload: row.payload || {},
      date: row.date
    }))),
    upsertTable("app_settings", [{
      id: "default",
      value: normalizeSettings(db.settings),
      updated_at: new Date().toISOString()
    }]),
    upsertTable("tenants", (db.tenants || []).map(row => ({
      id: row.id,
      raison_sociale: row.raisonSociale,
      slug: row.slug,
      secteur_activite: row.secteurActivite || null,
      pays: row.pays || null,
      ville: row.ville || null,
      logo_url: row.logoUrl || null,
      branding: row.branding || {},
      modules: { ...DEFAULT_TENANT_MODULES, ...(row.modules || row.branding?.modules || {}) },
      status: row.status,
      archived_at: row.archivedAt || null,
      created_at: row.createdAt || new Date().toISOString(),
      updated_at: row.updatedAt || new Date().toISOString()
    }))),
    upsertTable("subscriptions", (db.subscriptions || []).map(row => ({
      id: row.id,
      tenant_id: row.tenantId,
      plan_name: row.planName,
      status: row.status,
      billing_cycle: row.billingCycle || "monthly",
      current_period_start: row.currentPeriodStart,
      current_period_end: row.currentPeriodEnd,
      cancel_at_period_end: Boolean(row.cancelAtPeriodEnd)
    }))),
    upsertTable("tenant_limits", (db.tenantLimits || []).map(row => ({
      id: row.id,
      tenant_id: row.tenantId,
      max_depots: row.maxDepots,
      max_users: row.maxUsers,
      max_storage_gb: row.maxStorageGb
    }))),
    upsertTable("platform_plans", Object.entries(db.platformPlans || planDefaults).map(([id, row]) => ({
      id,
      price_monthly: Number(row.priceMonthly || 0),
      price_annual: Number(row.priceAnnual || 0),
      max_depots: Number(row.maxDepots || 0),
      max_users: Number(row.maxUsers || 0),
      max_storage_gb: Number(row.maxStorageGb || 0),
      features: row.features || {}
    }))),
    upsertTable("coupons", (db.coupons || []).map(row => ({
      id: row.id,
      code: row.code,
      discount_percent: Number(row.discountPercent || 0),
      plan_name: row.planName || null,
      expires_at: row.expiresAt || null,
      active: row.active !== false,
      created_at: row.createdAt || new Date().toISOString()
    }))),
    upsertTable("transactions", (db.transactions || []).map(row => ({
      id: row.id,
      tenant_id: row.tenantId,
      provider: row.provider,
      amount: Number(row.amount || 0),
      currency: row.currency || "XOF",
      status: row.status,
      reference: row.reference || null,
      date: row.date || new Date().toISOString()
    }))),
    upsertTable("system_banners", (db.systemBanners || []).map(row => ({
      id: row.id,
      message: row.message,
      severity: row.severity || "info",
      active: row.active !== false,
      starts_at: row.startsAt || null,
      ends_at: row.endsAt || null,
      created_at: row.createdAt || new Date().toISOString()
    }))),
    upsertTable("activation_emails", (db.activationEmails || []).map(row => ({
      id: row.id,
      tenant_id: row.tenantId,
      user_id: row.userId,
      email: row.email,
      subject: row.subject,
      status: row.status || "queued",
      payload: row.payload || {},
      created_at: row.createdAt || new Date().toISOString(),
      sent_at: row.sentAt || null
    }))),
    upsertTable("platform_audit_logs", (db.platformAuditLogs || []).map(row => ({
      id: row.id,
      actor_id: row.actorId,
      target_tenant_id: row.targetTenantId || null,
      action: row.action,
      ip_address: row.ipAddress || null,
      payload: row.payload || {},
      timestamp: row.timestamp || new Date().toISOString()
    }))),
    upsertTable("production_orders", (db.productionOrders || []).map(row => ({
      id: row.id,
      tenant_id: row.tenantId || DEFAULT_TENANT_ID,
      order_number: row.orderNumber,
      pole_type: row.poleType,
      dimensions: row.dimensions || {},
      resistance_class: row.resistanceClass || null,
      raw_material_lot: row.rawMaterialLot || null,
      quantity: Number(row.quantity || 0),
      unit_cost: Number(row.unitCost || 0),
      status: row.status || "En fabrication",
      created_by: row.createdBy || null,
      created_at: row.createdAt || new Date().toISOString(),
      updated_at: row.updatedAt || new Date().toISOString()
    }))),
    upsertTable("factory_quality_checks", (db.factoryQualityChecks || []).map(row => ({
      id: row.id,
      tenant_id: row.tenantId || DEFAULT_TENANT_ID,
      production_order_id: row.productionOrderId || null,
      pole_id: row.poleId || null,
      inspector_id: row.inspectorId || null,
      result: row.result,
      measurements: row.measurements || {},
      notes: row.notes || null,
      checked_at: row.checkedAt || new Date().toISOString()
    }))),
    upsertTable("clients", (db.clients || []).map(row => ({
      id: row.id,
      tenant_id: row.tenantId || DEFAULT_TENANT_ID,
      name: row.name,
      client_type: row.clientType || null,
      email: row.email || null,
      phone: row.phone || null,
      address: row.address || null,
      payment_terms: row.paymentTerms || null,
      created_at: row.createdAt || new Date().toISOString(),
      updated_at: row.updatedAt || new Date().toISOString()
    }))),
    upsertTable("sales", (db.sales || []).map(row => ({
      id: row.id,
      tenant_id: row.tenantId || DEFAULT_TENANT_ID,
      client_id: row.clientId,
      sale_number: row.saleNumber,
      delivery_note_number: row.deliveryNoteNumber || null,
      status: row.status || "Confirmee",
      payment_status: row.paymentStatus || "pending",
      payment_terms: row.paymentTerms || null,
      total_amount: Number(row.totalAmount || 0),
      total_cost: Number(row.totalCost || 0),
      margin_amount: Number(row.marginAmount || 0),
      currency: row.currency || "XOF",
      sold_by: row.soldBy || null,
      sale_date: row.saleDate || new Date().toISOString(),
      delivery_date: row.deliveryDate || null,
      created_at: row.createdAt || new Date().toISOString()
    }))),
    upsertTable("sale_items", (db.saleItems || []).map(row => ({
      id: row.id,
      tenant_id: row.tenantId || DEFAULT_TENANT_ID,
      sale_id: row.saleId,
      pole_id: row.poleId,
      unit_price: Number(row.unitPrice || 0),
      unit_cost: Number(row.unitCost || 0),
      quantity: Number(row.quantity || 1),
      created_at: row.createdAt || new Date().toISOString()
    })))
  ]);
  const photoRows = db.interventions.flatMap(row => (row.photos || [])
    .filter(photo => photo.url)
    .map((photo, index) => ({
      id: `${row.id}-${index + 1}`,
      intervention_id: row.id,
      position: index + 1,
      step: photo.step,
      date: photo.date,
      lat: String(photo.lat || ""),
      lng: String(photo.lng || ""),
      url: photo.url
    })));
  await upsertTable("intervention_photos", photoRows);
}

function normalizeSettings(settings = {}) {
  const arrayValue = (value, fallback) => Array.isArray(value) && value.length ? value : fallback;
  return {
    operators: arrayValue(settings.operators, DEFAULT_SETTINGS.operators).map(String),
    poleTypes: arrayValue(settings.poleTypes, DEFAULT_SETTINGS.poleTypes).map(String),
    poleHeights: arrayValue(settings.poleHeights, DEFAULT_SETTINGS.poleHeights).map(Number).filter(Number.isFinite),
    depots: arrayValue(settings.depots, DEFAULT_SETTINGS.depots).map(String),
    gpsMaxDistanceKm: Number(settings.gpsMaxDistanceKm || DEFAULT_SETTINGS.gpsMaxDistanceKm)
  };
}

function normalizeRole(role) {
  return tenantRoleAliases[role] || role || "terrain";
}

function normalizeTenantRecord(tenant = {}) {
  const now = new Date().toISOString();
  return {
    id: tenant.id || `tenant-${crypto.randomUUID().slice(0, 8)}`,
    raisonSociale: tenant.raisonSociale || tenant.raison_sociale || tenant.name || "",
    slug: slug(tenant.slug || tenant.raisonSociale || tenant.raison_sociale || tenant.name || crypto.randomUUID().slice(0, 8)),
    secteurActivite: tenant.secteurActivite || tenant.secteur_activite || "",
    pays: tenant.pays || "",
    ville: tenant.ville || "",
    logoUrl: tenant.logoUrl || tenant.logo_url || "",
    branding: tenant.branding || {},
    modules: { ...DEFAULT_TENANT_MODULES, ...(tenant.modules || tenant.branding?.modules || {}) },
    status: TENANT_STATUSES.includes(tenant.status) ? tenant.status : "trial",
    archivedAt: tenant.archivedAt || tenant.archived_at || "",
    createdAt: tenant.createdAt || tenant.created_at || now,
    updatedAt: tenant.updatedAt || tenant.updated_at || now
  };
}

function normalizeSubscriptionRecord(subscription = {}) {
  const planName = PLAN_NAMES.includes(subscription.planName || subscription.plan_name) ? (subscription.planName || subscription.plan_name) : "starter";
  return {
    id: subscription.id || `sub-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: subscription.tenantId || subscription.tenant_id || DEFAULT_TENANT_ID,
    planName,
    status: subscription.status || "trialing",
    billingCycle: BILLING_CYCLES.includes(subscription.billingCycle || subscription.billing_cycle) ? (subscription.billingCycle || subscription.billing_cycle) : "monthly",
    currentPeriodStart: subscription.currentPeriodStart || subscription.current_period_start || new Date().toISOString(),
    currentPeriodEnd: subscription.currentPeriodEnd || subscription.current_period_end || new Date(Date.now() + 30 * 86400000).toISOString(),
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd || subscription.cancel_at_period_end)
  };
}

function normalizeLimitRecord(limit = {}, tenantId = DEFAULT_TENANT_ID) {
  const defaults = planDefaults.pro;
  return {
    id: limit.id || `limits-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: limit.tenantId || limit.tenant_id || tenantId,
    maxDepots: Number(limit.maxDepots || limit.max_depots || defaults.maxDepots),
    maxUsers: Number(limit.maxUsers || limit.max_users || defaults.maxUsers),
    maxStorageGb: Number(limit.maxStorageGb || limit.max_storage_gb || defaults.maxStorageGb)
  };
}

function normalizeDb(db) {
  const tenants = (db.tenants?.length ? db.tenants : seedDb().tenants).map(normalizeTenantRecord);
  const tenantIds = new Set(tenants.map(item => item.id));
  const defaultTenantId = tenantIds.has(DEFAULT_TENANT_ID) ? DEFAULT_TENANT_ID : tenants[0]?.id;
  const withTenant = item => ({
    ...item,
    role: normalizeRole(item.role),
    tenantId: item.role === "platform_admin" ? null : (item.tenantId || item.tenant_id || defaultTenantId)
  });
  return {
    ...db,
    users: (db.users || []).map(withTenant),
    projects: (db.projects || []).map(item => ({ ...item, tenantId: item.tenantId || item.tenant_id || defaultTenantId })),
    poles: (db.poles || []).map(item => ({ ...item, tenantId: item.tenantId || item.tenant_id || defaultTenantId })),
    interventions: (db.interventions || []).map(item => ({ ...item, tenantId: item.tenantId || item.tenant_id || defaultTenantId })),
    stockMovements: (db.stockMovements || []).map(item => ({ ...item, tenantId: item.tenantId || item.tenant_id || defaultTenantId })),
    auditLog: (db.auditLog || []).map(item => ({ ...item, tenantId: item.tenantId || item.tenant_id || defaultTenantId })),
    productionOrders: (db.productionOrders || db.production_orders || []).map(item => ({ ...item, tenantId: item.tenantId || item.tenant_id || defaultTenantId })),
    factoryQualityChecks: (db.factoryQualityChecks || db.factory_quality_checks || []).map(item => ({ ...item, tenantId: item.tenantId || item.tenant_id || defaultTenantId })),
    clients: (db.clients || []).map(item => ({ ...item, tenantId: item.tenantId || item.tenant_id || defaultTenantId })),
    sales: (db.sales || []).map(item => ({ ...item, tenantId: item.tenantId || item.tenant_id || defaultTenantId })),
    saleItems: (db.saleItems || db.sale_items || []).map(item => ({ ...item, tenantId: item.tenantId || item.tenant_id || defaultTenantId })),
    tenants,
    subscriptions: (db.subscriptions || []).map(normalizeSubscriptionRecord),
    tenantLimits: (db.tenantLimits || db.tenant_limits || []).map(item => normalizeLimitRecord(item, item.tenantId || item.tenant_id || defaultTenantId)),
    platformPlans: db.platformPlans || db.platform_plans || planDefaults,
    coupons: db.coupons || [],
    transactions: db.transactions || [],
    systemBanners: db.systemBanners || db.system_banners || [],
    activationEmails: db.activationEmails || db.activation_emails || [],
    platformAuditLogs: db.platformAuditLogs || db.platform_audit_logs || [],
    settings: normalizeSettings(db.settings)
  };
}

async function upsertTable(table, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

function publicUser(userRecord) {
  const { passwordHash, ...safeUser } = userRecord;
  safeUser.active = userRecord.active !== false;
  safeUser.approved = userRecord.approved !== false;
  return safeUser;
}

function terrainTeamOf(userRecord) {
  return String(userRecord?.team || userRecord?.name || "").trim();
}

function hasPermission(userRecord, permission) {
  return rolePermissions[userRecord.role]?.includes(permission);
}

function manageableRoles(actor) {
  if (actor?.role === "tenant_admin") return ["tenant_admin", "depot_manager", "field_agent", "quality_inspector", "chef_production", "commercial", "direction_finance"];
  if (actor?.role === "super_admin") return ["super_admin", "magasinier", "terrain", "controleur", "chef_production", "commercial", "direction_finance"];
  if (isPlatformAdmin(actor)) return ["tenant_admin", "depot_manager", "field_agent", "quality_inspector", "chef_production", "commercial", "direction_finance"];
  return [];
}

function isPlatformAdmin(userRecord) {
  return userRecord?.role === "platform_admin";
}

function isFieldAgent(userRecord) {
  return ["terrain", "field_agent"].includes(userRecord?.role);
}

function tenantModules(db, actorOrTenantId) {
  const tenantId = typeof actorOrTenantId === "string" ? actorOrTenantId : actorOrTenantId?.tenantId;
  const tenant = (db.tenants || []).find(item => item.id === tenantId);
  return { ...DEFAULT_TENANT_MODULES, ...(tenant?.modules || tenant?.branding?.modules || {}) };
}

function tenantModuleEnabled(db, actor, moduleName) {
  if (isPlatformAdmin(actor)) return true;
  return Boolean(tenantModules(db, actor)[moduleName]);
}

function requireTenantModule(db, req, res, actor, moduleName) {
  if (tenantModuleEnabled(db, actor, moduleName)) return true;
  sendError(req, res, 403, `Module ${moduleName} non active pour cette entreprise`);
  return false;
}

function requirePlatformAdmin(req, res, actor) {
  if (isPlatformAdmin(actor)) return true;
  sendError(req, res, 403, "Acces reserve a l'equipe proprietaire SaaS");
  return false;
}

function tenantMatches(actor, record) {
  return isPlatformAdmin(actor) || !record?.tenantId || record.tenantId === actor.tenantId;
}

function scopedRecords(actor, rows = []) {
  return isPlatformAdmin(actor) ? rows : rows.filter(row => tenantMatches(actor, row));
}

function tenantPayload(db, actor, extra = {}) {
  return {
    ...extra,
    projects: scopedRecords(actor, db.projects),
    poles: scopedRecords(actor, db.poles),
    interventions: scopedRecords(actor, db.interventions),
    stockMovements: scopedRecords(actor, db.stockMovements || []),
    productionOrders: scopedRecords(actor, db.productionOrders || []),
    factoryQualityChecks: scopedRecords(actor, db.factoryQualityChecks || []),
    clients: scopedRecords(actor, db.clients || []),
    sales: scopedRecords(actor, db.sales || []),
    saleItems: scopedRecords(actor, db.saleItems || []),
    tenant: isPlatformAdmin(actor) ? null : (db.tenants || []).find(item => item.id === actor.tenantId) || null,
    modules: tenantModules(db, actor),
    auditLog: hasPermission(actor, "admin") ? scopedRecords(actor, db.auditLog || []) : []
  };
}

function platformAudit(db, actor, action, payload = {}, req = null) {
  db.platformAuditLogs = db.platformAuditLogs || [];
  db.platformAuditLogs.push({
    id: crypto.randomUUID(),
    actorId: actor.id,
    targetTenantId: payload.tenantId || payload.targetTenantId || null,
    action,
    ipAddress: req ? clientIp(req) : "",
    timestamp: new Date().toISOString(),
    payload
  });
}

function securityHeaders(req, extra = {}) {
  const origin = req?.headers?.origin || "";
  const allowedOrigin = allowedCorsOrigin(req, origin);
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(self), geolocation=(self), microphone=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "worker-src 'self'"
    ].join("; "),
    ...extra
  };
  if (req?.socket?.encrypted || req?.headers?.["x-forwarded-proto"] === "https") {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Vary"] = "Origin";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
  }
  return headers;
}

function sameOrigin(req, origin) {
  if (!origin) return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = forwardedProto || (req.socket.encrypted ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return origin === `${proto}://${host}`;
}

function allowedCorsOrigin(req, origin) {
  if (!origin) return "";
  if (sameOrigin(req, origin)) return origin;
  return ALLOWED_ORIGINS.includes(origin) ? origin : "";
}

function validateOrigin(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  return sameOrigin(req, req.headers.origin || "") || ALLOWED_ORIGINS.includes(req.headers.origin || "");
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
}

function consumeRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function requireRateLimit(req, res, scope, limit, windowMs) {
  const ok = consumeRateLimit(`${scope}:${clientIp(req)}`, limit, windowMs);
  if (!ok) sendError(req, res, 429, "Trop de tentatives. Reessayez plus tard.");
  return ok;
}

function sendJson(req, res, status, payload) {
  if (!payload && typeof status === "object") {
    payload = status;
    status = res;
    res = req;
    req = res._request || null;
  }
  const body = JSON.stringify(payload);
  res.writeHead(status, securityHeaders(req, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }));
  res.end(body);
}

function sendError(req, res, status, message) {
  if (message === undefined) {
    message = status;
    status = res;
    res = req;
    req = res._request || null;
  }
  sendJson(req, res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Payload trop volumineux"), { statusCode: 413 }));
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
        reject(Object.assign(new Error("JSON invalide"), { statusCode: 400 }));
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
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  const userRecord = db.users.find(item => item.id === session.userId && item.active !== false && item.approved !== false) || null;
  if (!userRecord) return null;
  if (!isPlatformAdmin(userRecord)) {
    const tenant = db.tenants.find(item => item.id === userRecord.tenantId);
    if (!tenant || tenant.status === "suspended") return null;
  }
  return userRecord;
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

function nextProjectId(db) {
  const year = new Date().getFullYear();
  const max = db.projects
    .map(item => /^PRJ-\d{4}-(\d+)$/.exec(item.id)?.[1])
    .filter(Boolean)
    .map(Number)
    .reduce((acc, value) => Math.max(acc, value), 0);
  return `PRJ-${year}-${String(max + 1).padStart(4, "0")}`;
}

function normalizeRequirements(requirements = []) {
  return requirements
    .map(item => ({
      type: String(item.type || "").trim().toUpperCase(),
      height: Number(item.height),
      quantity: Number(item.quantity || 0)
    }))
    .filter(item => item.type && Number.isFinite(item.height) && item.quantity > 0);
}

function projectTotal(project) {
  return Number(project.poleCount || normalizeRequirements(project.requirements).reduce((sum, item) => sum + item.quantity, 0));
}

function projectInterventions(db, projectId) {
  return db.interventions.filter(item => item.projectId === projectId && !item.draft);
}

function projectDone(db, projectId) {
  return new Set(projectInterventions(db, projectId).map(item => item.poleId)).size;
}

function projectValidationStats(db, projectId) {
  const interventions = projectInterventions(db, projectId);
  const valid = interventions.filter(item => item.validation === "Valide").length;
  const anomalies = interventions.filter(item => item.validation === "Anomalie").length;
  const pending = Math.max(0, interventions.length - valid - anomalies);
  return { interventions, valid, anomalies, pending };
}

function audit(db, actor, action, payload = {}) {
  db.auditLog.push({
    id: crypto.randomUUID(),
    tenantId: actor.tenantId || DEFAULT_TENANT_ID,
    actorId: actor.id,
    action,
    payload,
    date: new Date().toISOString()
  });
}

function stockMovement(db, actor, poleId, movementType, fromDepot, toDepot, payload = {}) {
  db.stockMovements = db.stockMovements || [];
  db.stockMovements.push({
    id: crypto.randomUUID(),
    tenantId: actor.tenantId || payload.tenantId || DEFAULT_TENANT_ID,
    poleId,
    movementType,
    fromDepot: fromDepot || "",
    toDepot: toDepot || "",
    actorId: actor.id,
    payload,
    date: new Date().toISOString()
  });
}

function nextSequenceId(rows, prefix, field = "id") {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const max = (rows || [])
    .map(item => pattern.exec(String(item[field] || item.id || ""))?.[1])
    .filter(Boolean)
    .map(Number)
    .reduce((acc, value) => Math.max(acc, value), 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, "0")}`;
}

function nextProductionOrderNumber(db) {
  return nextSequenceId(db.productionOrders || [], "OF", "orderNumber");
}

function nextSaleNumber(db) {
  return nextSequenceId(db.sales || [], "SALE", "saleNumber");
}

function nextDeliveryNoteNumber(db) {
  return nextSequenceId(db.sales || [], "BL", "deliveryNoteNumber");
}

function poleProductionId(orderNumber, index) {
  return `${orderNumber}-P${String(index).padStart(3, "0")}`;
}

function canAccessProduction(actor) {
  return hasPermission(actor, "production") || hasPermission(actor, "admin");
}

function canAccessSales(actor) {
  return hasPermission(actor, "sales") || hasPermission(actor, "admin");
}

function canAccessFinance(actor) {
  return hasPermission(actor, "finance") || hasPermission(actor, "admin");
}

function parsePeriod(url) {
  const now = new Date();
  const period = url.searchParams.get("period") || "";
  let startDate = url.searchParams.get("startDate") || "";
  let endDate = url.searchParams.get("endDate") || "";
  if (!startDate || !endDate) {
    const start = new Date(now);
    if (period === "today") {
      start.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }
    startDate = startDate || start.toISOString();
    endDate = endDate || now.toISOString();
  }
  return { start: new Date(startDate), end: new Date(endDate) };
}

function saleReport(db, actor, url) {
  const { start, end } = parsePeriod(url);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw Object.assign(new Error("Periode de rapport invalide"), { statusCode: 400 });
  }
  const sales = scopedRecords(actor, db.sales || []).filter(sale => {
    const saleDate = new Date(sale.saleDate || sale.createdAt || 0);
    return saleDate >= start && saleDate <= end && sale.status !== "Annulee";
  });
  const saleIds = new Set(sales.map(sale => sale.id));
  const items = scopedRecords(actor, db.saleItems || []).filter(item => saleIds.has(item.saleId));
  const byType = {};
  for (const item of items) {
    const pole = (db.poles || []).find(candidate => candidate.id === item.poleId);
    const type = pole?.type || "INCONNU";
    if (!byType[type]) byType[type] = { type, quantity: 0, totalAmount: 0, marginAmount: 0 };
    byType[type].quantity += Number(item.quantity || 1);
    byType[type].totalAmount += Number(item.unitPrice || 0) * Number(item.quantity || 1);
    byType[type].marginAmount += (Number(item.unitPrice || 0) - Number(item.unitCost || 0)) * Number(item.quantity || 1);
  }
  const topClientsMap = new Map();
  for (const sale of sales) {
    const client = (db.clients || []).find(item => item.id === sale.clientId);
    const current = topClientsMap.get(sale.clientId) || { clientId: sale.clientId, name: client?.name || "Client inconnu", totalAmount: 0, volume: 0 };
    current.totalAmount += Number(sale.totalAmount || 0);
    current.volume += items.filter(item => item.saleId === sale.id).reduce((sum, item) => sum + Number(item.quantity || 1), 0);
    topClientsMap.set(sale.clientId, current);
  }
  return {
    period: { startDate: start.toISOString(), endDate: end.toISOString() },
    kpis: {
      totalSales: sales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0),
      volumeSold: items.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
      totalCost: sales.reduce((sum, sale) => sum + Number(sale.totalCost || 0), 0),
      marginAmount: sales.reduce((sum, sale) => sum + Number(sale.marginAmount || 0), 0)
    },
    byType: Object.values(byType),
    topClients: Array.from(topClientsMap.values()).sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10),
    sales
  };
}

function tenantUsage(db, tenantId) {
  const users = db.users.filter(userRecord => userRecord.tenantId === tenantId && userRecord.role !== "platform_admin");
  const poles = db.poles.filter(pole => pole.tenantId === tenantId);
  const interventions = db.interventions.filter(item => item.tenantId === tenantId);
  const storageBytes = interventions.reduce((sum, item) => {
    return sum + (item.photos || []).reduce((photoSum, photo) => photoSum + String(photo.url || photo.data || "").length, 0);
  }, 0);
  return {
    users: users.length,
    poles: poles.length,
    interventions: interventions.length,
    storageGb: Number((storageBytes / 1024 / 1024 / 1024).toFixed(3))
  };
}

function planPrice(plan, cycle = "monthly") {
  const config = planDefaults[plan] || planDefaults.starter;
  return cycle === "annual" ? config.priceAnnual : config.priceMonthly;
}

function platformOverview(db) {
  const subscriptions = db.subscriptions || [];
  const monthlyMrr = subscriptions
    .filter(item => ["active", "trialing"].includes(item.status))
    .reduce((sum, item) => {
      const price = planPrice(item.planName, item.billingCycle);
      return sum + (item.billingCycle === "annual" ? Math.round(price / 12) : price);
    }, 0);
  const tenants = (db.tenants || []).filter(item => !item.archivedAt);
  const failedTransactions = (db.transactions || []).filter(item => ["failed", "past_due"].includes(item.status));
  const trialsEnding = subscriptions.filter(item => item.status === "trialing" && new Date(item.currentPeriodEnd) <= new Date(Date.now() + 7 * 86400000)).length;
  const planBreakdown = PLAN_NAMES.map(plan => ({
    plan,
    count: subscriptions.filter(item => item.planName === plan && ["active", "trialing"].includes(item.status)).length,
    mrr: subscriptions
      .filter(item => item.planName === plan && ["active", "trialing"].includes(item.status))
      .reduce((sum, item) => sum + (item.billingCycle === "annual" ? Math.round(planPrice(item.planName, item.billingCycle) / 12) : planPrice(item.planName, item.billingCycle)), 0)
  }));
  const monthKeys = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (11 - index));
    return date.toISOString().slice(0, 7);
  });
  return {
    kpis: {
      mrr: monthlyMrr,
      arr: monthlyMrr * 12,
      tenantsTotal: tenants.length,
      tenantsActive: tenants.filter(item => item.status === "active").length,
      tenantsTrial: tenants.filter(item => item.status === "trial").length,
      tenantsSuspended: tenants.filter(item => item.status === "suspended").length,
      polesTotal: db.poles.length,
      storageGb: tenants.reduce((sum, tenant) => sum + tenantUsage(db, tenant.id).storageGb, 0),
      failedPayments: failedTransactions.length,
      trialsEnding,
      churnRisk: tenants.filter(item => item.status === "suspended").length
    },
    planBreakdown,
    alerts: platformAlerts(db),
    growth: monthKeys.map(month => ({
      month,
      signups: tenants.filter(item => String(item.createdAt || "").slice(0, 7) === month).length,
      interventions: db.interventions.filter(item => String(item.date || item.createdAt || "").slice(0, 7) === month).length
    }))
  };
}

function platformAlerts(db) {
  return platformTenantRows(db)
    .filter(row => !row.archivedAt)
    .flatMap(row => {
      const alerts = [];
      if (row.limits?.maxUsers && row.usage.users / row.limits.maxUsers >= 0.85) alerts.push({ tenantId: row.id, severity: "warn", message: `${row.raisonSociale}: quota utilisateurs proche de la limite` });
      if (row.limits?.maxStorageGb && row.usage.storageGb / row.limits.maxStorageGb >= 0.85) alerts.push({ tenantId: row.id, severity: "warn", message: `${row.raisonSociale}: stockage proche de la limite` });
      if (row.status === "suspended") alerts.push({ tenantId: row.id, severity: "danger", message: `${row.raisonSociale}: entreprise suspendue` });
      if (row.subscription?.status === "past_due") alerts.push({ tenantId: row.id, severity: "danger", message: `${row.raisonSociale}: paiement en retard` });
      return alerts;
    });
}

function platformTenantRows(db, includeArchived = false) {
  return (db.tenants || []).filter(tenant => includeArchived || !tenant.archivedAt).map(tenant => {
    const subscription = (db.subscriptions || []).find(item => item.tenantId === tenant.id) || {};
    const limits = (db.tenantLimits || []).find(item => item.tenantId === tenant.id) || normalizeLimitRecord({}, tenant.id);
    return {
      ...tenant,
      subscription,
      limits,
      usage: tenantUsage(db, tenant.id)
    };
  });
}

function tenantDetail(db, tenantId) {
  const tenant = platformTenantRows(db, true).find(item => item.id === tenantId);
  if (!tenant) return null;
  return {
    tenant,
    users: db.users.filter(item => item.tenantId === tenantId && item.role !== "platform_admin").map(publicUser),
    projects: db.projects.filter(item => item.tenantId === tenantId),
    poles: db.poles.filter(item => item.tenantId === tenantId),
    interventions: db.interventions.filter(item => item.tenantId === tenantId),
    transactions: (db.transactions || []).filter(item => item.tenantId === tenantId),
    auditLog: (db.auditLog || []).filter(item => item.tenantId === tenantId).slice(-20).reverse(),
    activationEmails: (db.activationEmails || []).filter(item => item.tenantId === tenantId).slice(-10).reverse()
  };
}

function platformTeam(db) {
  return db.users
    .filter(item => item.role === "platform_admin")
    .map(userRecord => ({ ...publicUser(userRecord), platformRole: userRecord.platformRole || "platform_owner" }));
}

function tempPassword() {
  return `Temp-${crypto.randomUUID().slice(0, 8)}!9a`;
}

function platformPlanLimits(planName, overrides = {}) {
  const defaults = planDefaults[planName] || planDefaults.starter;
  return {
    maxDepots: Number(overrides.maxDepots || defaults.maxDepots),
    maxUsers: Number(overrides.maxUsers || defaults.maxUsers),
    maxStorageGb: Number(overrides.maxStorageGb || defaults.maxStorageGb)
  };
}

function createTenantOnboarding(db, actor, body, req) {
  const company = body.company || {};
  const admin = body.admin || {};
  const subscriptionInput = body.subscription || {};
  const planName = PLAN_NAMES.includes(subscriptionInput.planName) ? subscriptionInput.planName : "starter";
  const tenantSlug = slug(company.slug || company.raisonSociale);
  if (!company.raisonSociale || !tenantSlug || !admin.email || !admin.firstName || !admin.lastName) {
    throw Object.assign(new Error("Societe, slug et admin client requis"), { statusCode: 400 });
  }
  if (db.tenants.some(tenant => tenant.slug === tenantSlug)) {
    throw Object.assign(new Error("Slug tenant deja utilise"), { statusCode: 409 });
  }
  const email = String(admin.email).trim().toLowerCase();
  if (db.users.some(userRecord => userRecord.email === email)) {
    throw Object.assign(new Error("Email admin deja utilise"), { statusCode: 409 });
  }
  const now = new Date();
  const trialDays = subscriptionInput.trialEnabled ? Math.max(1, Number(subscriptionInput.trialDays || 14)) : 0;
  const tenant = normalizeTenantRecord({
    id: `tenant-${crypto.randomUUID().slice(0, 8)}`,
    raisonSociale: String(company.raisonSociale).trim(),
    slug: tenantSlug,
    secteurActivite: String(company.secteurActivite || "").trim(),
    pays: String(company.pays || "").trim(),
    ville: String(company.ville || "").trim(),
    logoUrl: String(company.logoUrl || "").trim(),
    modules: { ...DEFAULT_TENANT_MODULES, ...(body.modules || {}) },
    status: trialDays ? "trial" : "active",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  });
  const password = tempPassword();
  const owner = {
    ...user(`USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, email, password, `${admin.firstName} ${admin.lastName}`.trim(), "tenant_admin"),
    tenantId: tenant.id,
    phone: String(admin.phone || "").trim(),
    jobTitle: "Owner client",
    active: true,
    approved: true
  };
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + (trialDays || (subscriptionInput.billingCycle === "annual" ? 365 : 30)));
  const limits = platformPlanLimits(planName, body.limits || {});
  const subscription = normalizeSubscriptionRecord({
    id: `sub-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: tenant.id,
    planName,
    status: trialDays ? "trialing" : "active",
    billingCycle: BILLING_CYCLES.includes(subscriptionInput.billingCycle) ? subscriptionInput.billingCycle : "monthly",
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: false
  });
  db.tenants.push(tenant);
  db.users.push(owner);
  db.subscriptions.push(subscription);
  db.tenantLimits.push({ id: `limits-${crypto.randomUUID().slice(0, 8)}`, tenantId: tenant.id, ...limits });
  db.activationEmails = db.activationEmails || [];
  db.activationEmails.push({
    id: `mail-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: tenant.id,
    userId: owner.id,
    email: owner.email,
    subject: "Activation SuiviPoteaux Pro",
    status: "queued",
    payload: { loginUrl: "/index.html", temporaryPassword: password, tenantSlug: tenant.slug },
    createdAt: new Date().toISOString(),
    sentAt: ""
  });
  platformAudit(db, actor, "tenant.create", { tenantId: tenant.id, planName, ownerId: owner.id, activationEmailQueued: true }, req);
  return { tenant, owner: publicUser(owner), subscription, temporaryPassword: password };
}

function runDunning(db, actor, req) {
  const now = new Date();
  const affected = [];
  (db.subscriptions || []).forEach(subscription => {
    const overdue = subscription.status === "past_due" || (subscription.status === "trialing" && new Date(subscription.currentPeriodEnd) < now);
    if (!overdue) return;
    const tenant = db.tenants.find(item => item.id === subscription.tenantId);
    if (!tenant || tenant.status === "suspended") return;
    tenant.status = "suspended";
    tenant.updatedAt = now.toISOString();
    affected.push(tenant.id);
  });
  platformAudit(db, actor, "billing.dunning_run", { affected }, req);
  return affected;
}

async function savePhotos(reportId, photos = []) {
  if (!Array.isArray(photos)) throw Object.assign(new Error("Photos invalides"), { statusCode: 400 });
  if (photos.length > MAX_PHOTOS_PER_REPORT) throw Object.assign(new Error("Nombre de photos trop eleve"), { statusCode: 413 });
  const reportDir = path.join(UPLOAD_DIR, reportId);
  if (!SUPABASE_ENABLED) fs.mkdirSync(reportDir, { recursive: true });
  const saved = [];
  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index];
    if (!photo?.data?.startsWith("data:image/")) {
      saved.push(photo);
      continue;
    }
    const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(photo.data);
    if (!match) {
      saved.push({ ...photo, data: null });
      continue;
    }
    const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
    const filename = `${String(index + 1).padStart(2, "0")}-${slug(photo.step || "photo")}.${ext}`;
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > MAX_PHOTO_BYTES) throw Object.assign(new Error("Photo trop volumineuse"), { statusCode: 413 });
    if (!validImageSignature(buffer, ext)) throw Object.assign(new Error("Format image invalide"), { statusCode: 400 });
    let url = `/uploads/${reportId}/${filename}`;
    if (SUPABASE_ENABLED) {
      const storagePath = `${reportId}/${filename}`;
      const { error } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .upload(storagePath, buffer, { contentType: match[1], upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(storagePath);
      url = data.publicUrl;
    } else {
      fs.writeFileSync(path.join(reportDir, filename), buffer);
    }
    saved.push({
      step: photo.step,
      date: photo.date,
      lat: photo.lat,
      lng: photo.lng,
      url
    });
  }
  return saved;
}

function validImageSignature(buffer, ext) {
  if (ext === "png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === "webp") return buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function normalizeProfilePhoto(value) {
  const photo = String(value || "");
  if (!photo) return "";
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(photo);
  if (!match) throw Object.assign(new Error("Photo de profil invalide"), { statusCode: 400 });
  const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_PROFILE_PHOTO_BYTES) throw Object.assign(new Error("Photo de profil trop volumineuse"), { statusCode: 413 });
  if (!validImageSignature(buffer, ext)) throw Object.assign(new Error("Format image invalide"), { statusCode: 400 });
  return photo;
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
  if (req.method === "OPTIONS") {
    if (!allowedCorsOrigin(req, req.headers.origin || "") && req.headers.origin) {
      return sendError(req, res, 403, "Origine non autorisee");
    }
    return sendJson(req, res, 204, {});
  }
  if (!validateOrigin(req)) return sendError(req, res, 403, "Origine non autorisee");
  if (!requireRateLimit(req, res, "api", 300, 60 * 1000)) return;
  if (["POST", "PATCH", "DELETE"].includes(req.method)) {
    const contentType = req.headers["content-type"] || "";
    const hasBody = Number(req.headers["content-length"] || 0) > 0 || ["POST", "PATCH"].includes(req.method);
    if (hasBody && !contentType.includes("application/json")) {
      return sendError(req, res, 415, "Content-Type application/json requis");
    }
  }
  const db = await readDb();

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "SuiviPoteaux Pro API", date: new Date().toISOString() });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    if (!requireRateLimit(req, res, "auth-login", 8, 15 * 60 * 1000)) return;
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const found = db.users.find(item => item.email === email && item.active !== false && item.approved !== false && verifyPassword(body.password, item.passwordHash));
    if (!found) return sendError(res, 401, "Identifiants invalides");
    if (!isPlatformAdmin(found)) {
      const tenant = db.tenants.find(item => item.id === found.tenantId);
      if (!tenant || tenant.status === "suspended") return sendError(res, 403, "Entreprise suspendue ou introuvable");
    }
    if (!found.passwordHash.startsWith("pbkdf2$")) {
      found.passwordHash = hashPassword(body.password);
      await writeDb(db);
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { userId: found.id, tenantId: found.tenantId || null, createdAt: Date.now() });
    return sendJson(res, 200, { token, user: publicUser(found) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    if (!requireRateLimit(req, res, "auth-register", 5, 60 * 60 * 1000)) return;
    if (!ALLOW_PUBLIC_REGISTRATION) {
      return sendError(res, 403, "Inscription publique desactivee. Contactez un administrateur.");
    }
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const allowedRoles = ["magasinier", "terrain", "controleur"];
    const role = allowedRoles.includes(body.role) ? body.role : "terrain";
    if (!name || !email || !strongPassword(password)) {
      return sendError(res, 400, "Nom, email et mot de passe fort requis");
    }
    if (db.users.some(item => item.email === email)) {
      return sendError(res, 409, "Un compte existe deja avec cet email");
    }
    const created = {
      ...user(`USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, email, password, name, role),
      active: true,
      approved: false,
      depot: "",
      team: ""
    };
    db.users.push(created);
    db.auditLog.push({
      id: crypto.randomUUID(),
      actorId: created.id,
      action: "auth.register",
      payload: { email, role },
      date: new Date().toISOString()
    });
    await writeDb(db);
    return sendJson(res, 201, { pending: true, user: publicUser(created) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
    if (!requireRateLimit(req, res, "auth-reset", 5, 60 * 60 * 1000)) return;
    if (!ALLOW_PUBLIC_PASSWORD_RESET) {
      return sendError(res, 403, "Reinitialisation publique desactivee. Contactez un administrateur.");
    }
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !strongPassword(password)) {
      return sendError(res, 400, "Email et nouveau mot de passe fort requis");
    }
    const found = db.users.find(item => item.email === email);
    if (!found) return sendError(res, 404, "Aucun compte trouve avec cet email");
    found.passwordHash = hashPassword(password);
    audit(db, found, "auth.password_reset", { email });
    await writeDb(db);
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

  if (url.pathname.startsWith("/api/super-admin")) {
    if (!requirePlatformAdmin(req, res, actor)) return;

    if (req.method === "GET" && url.pathname === "/api/super-admin/overview") {
      return sendJson(req, res, 200, {
        overview: platformOverview(db),
        tenants: platformTenantRows(db).slice(0, 6),
        transactions: (db.transactions || []).slice(-8).reverse(),
        banners: db.systemBanners || [],
        platformTeam: platformTeam(db),
        activationEmails: (db.activationEmails || []).slice(-8).reverse()
      });
    }

    if (req.method === "GET" && url.pathname === "/api/super-admin/tenants") {
      const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
      const status = String(url.searchParams.get("status") || "").trim();
      const page = Math.max(1, Number(url.searchParams.get("page") || 1));
      const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 10)));
      const includeArchived = url.searchParams.get("archived") === "true";
      let rows = platformTenantRows(db, includeArchived);
      if (query) {
        rows = rows.filter(item => [item.raisonSociale, item.slug, item.pays, item.ville].some(value => String(value || "").toLowerCase().includes(query)));
      }
      if (TENANT_STATUSES.includes(status)) rows = rows.filter(item => item.status === status);
      const total = rows.length;
      const start = (page - 1) * pageSize;
      return sendJson(req, res, 200, { tenants: rows.slice(start, start + pageSize), total, page, pageSize });
    }

    if (req.method === "POST" && url.pathname === "/api/super-admin/tenants") {
      const body = await readBody(req);
      const result = createTenantOnboarding(db, actor, body, req);
      await writeDb(db);
      return sendJson(req, res, 201, result);
    }

    const tenantAdminMatch = /^\/api\/super-admin\/tenants\/([^/]+)$/.exec(url.pathname);
    if (tenantAdminMatch && req.method === "GET") {
      const tenantId = decodeURIComponent(tenantAdminMatch[1]);
      const detail = tenantDetail(db, tenantId);
      if (!detail) return sendError(req, res, 404, "Tenant introuvable");
      return sendJson(req, res, 200, detail);
    }

    if (tenantAdminMatch && req.method === "PATCH") {
      const tenantId = decodeURIComponent(tenantAdminMatch[1]);
      const tenant = db.tenants.find(item => item.id === tenantId);
      if (!tenant) return sendError(req, res, 404, "Tenant introuvable");
      const body = await readBody(req);
      if (body.status !== undefined) {
        if (!TENANT_STATUSES.includes(body.status)) return sendError(req, res, 400, "Statut tenant invalide");
        tenant.status = body.status;
      }
      ["raisonSociale", "secteurActivite", "pays", "ville", "logoUrl"].forEach(field => {
        if (body[field] !== undefined) tenant[field] = String(body[field] || "").trim();
      });
      tenant.branding = {
        ...(tenant.branding || {}),
        ...(body.branding || {})
      };
      if (body.modules) {
        tenant.modules = {
          ...tenantModules(db, tenantId),
          production: Boolean(body.modules.production),
          sales: Boolean(body.modules.sales),
          finance: Boolean(body.modules.finance)
        };
      }
      tenant.updatedAt = new Date().toISOString();
      const subscription = db.subscriptions.find(item => item.tenantId === tenantId);
      if (subscription && body.subscription) {
        if (PLAN_NAMES.includes(body.subscription.planName)) subscription.planName = body.subscription.planName;
        if (body.subscription.status !== undefined) subscription.status = String(body.subscription.status || subscription.status);
        if (BILLING_CYCLES.includes(body.subscription.billingCycle)) subscription.billingCycle = body.subscription.billingCycle;
        if (body.subscription.cancelAtPeriodEnd !== undefined) subscription.cancelAtPeriodEnd = Boolean(body.subscription.cancelAtPeriodEnd);
      }
      let limits = db.tenantLimits.find(item => item.tenantId === tenantId);
      if (!limits) {
        limits = normalizeLimitRecord({}, tenantId);
        db.tenantLimits.push(limits);
      }
      if (body.limits) {
        if (body.limits.maxDepots !== undefined) limits.maxDepots = Math.max(1, Number(body.limits.maxDepots));
        if (body.limits.maxUsers !== undefined) limits.maxUsers = Math.max(1, Number(body.limits.maxUsers));
        if (body.limits.maxStorageGb !== undefined) limits.maxStorageGb = Math.max(1, Number(body.limits.maxStorageGb));
      }
      platformAudit(db, actor, "tenant.update", { tenantId, fields: Object.keys(body) }, req);
      await writeDb(db);
      return sendJson(req, res, 200, { tenant: platformTenantRows(db).find(item => item.id === tenantId), tenants: platformTenantRows(db) });
    }

    if (tenantAdminMatch && req.method === "DELETE") {
      const tenantId = decodeURIComponent(tenantAdminMatch[1]);
      const tenant = db.tenants.find(item => item.id === tenantId);
      if (!tenant) return sendError(req, res, 404, "Tenant introuvable");
      if (tenant.id === DEFAULT_TENANT_ID) return sendError(req, res, 409, "Le tenant demo ne peut pas etre archive");
      tenant.archivedAt = new Date().toISOString();
      tenant.status = "suspended";
      db.users.filter(item => item.tenantId === tenantId).forEach(item => { item.active = false; });
      platformAudit(db, actor, "tenant.archive", { tenantId }, req);
      await writeDb(db);
      return sendJson(req, res, 200, { archived: true, tenantId });
    }

    const tenantStatusMatch = /^\/api\/super-admin\/tenants\/([^/]+)\/status$/.exec(url.pathname);
    if (tenantStatusMatch && req.method === "POST") {
      const tenantId = decodeURIComponent(tenantStatusMatch[1]);
      const tenant = db.tenants.find(item => item.id === tenantId);
      if (!tenant) return sendError(req, res, 404, "Tenant introuvable");
      const body = await readBody(req);
      if (!TENANT_STATUSES.includes(body.status)) return sendError(req, res, 400, "Statut tenant invalide");
      tenant.status = body.status;
      tenant.updatedAt = new Date().toISOString();
      platformAudit(db, actor, "tenant.status", { tenantId, status: tenant.status }, req);
      await writeDb(db);
      return sendJson(req, res, 200, { tenant: platformTenantRows(db).find(item => item.id === tenantId) });
    }

    const impersonateMatch = /^\/api\/super-admin\/tenants\/([^/]+)\/impersonate$/.exec(url.pathname);
    if (impersonateMatch && req.method === "POST") {
      const tenantId = decodeURIComponent(impersonateMatch[1]);
      const tenant = db.tenants.find(item => item.id === tenantId);
      if (!tenant) return sendError(req, res, 404, "Tenant introuvable");
      const target = db.users.find(item => item.tenantId === tenantId && item.role === "tenant_admin" && item.active !== false) ||
        db.users.find(item => item.tenantId === tenantId && item.active !== false);
      if (!target) return sendError(req, res, 404, "Aucun utilisateur actif pour ce tenant");
      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, { userId: target.id, createdAt: Date.now(), impersonatedBy: actor.id, tenantId });
      platformAudit(db, actor, "tenant.impersonate", { tenantId, targetUserId: target.id }, req);
      await writeDb(db);
      return sendJson(req, res, 201, { token, user: publicUser(target), expiresInMinutes: Math.round(SESSION_TTL_MS / 60000) });
    }

    if (req.method === "GET" && url.pathname === "/api/super-admin/plans") {
      return sendJson(req, res, 200, { plans: db.platformPlans || planDefaults, coupons: db.coupons || [] });
    }

    if (req.method === "PATCH" && url.pathname === "/api/super-admin/plans") {
      const body = await readBody(req);
      db.platformPlans = db.platformPlans || planDefaults;
      Object.entries(body.plans || {}).forEach(([planName, config]) => {
        if (!PLAN_NAMES.includes(planName)) return;
        db.platformPlans[planName] = {
          priceMonthly: Number(config.priceMonthly || 0),
          priceAnnual: Number(config.priceAnnual || 0),
          maxDepots: Number(config.maxDepots || 0),
          maxUsers: Number(config.maxUsers || 0),
          maxStorageGb: Number(config.maxStorageGb || 0),
          features: config.features || {}
        };
      });
      platformAudit(db, actor, "plans.update", { plans: Object.keys(body.plans || {}) }, req);
      await writeDb(db);
      return sendJson(req, res, 200, { plans: db.platformPlans });
    }

    if (req.method === "POST" && url.pathname === "/api/super-admin/coupons") {
      const body = await readBody(req);
      const code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
      if (!code || db.coupons.some(item => item.code === code)) return sendError(req, res, 409, "Code coupon invalide ou deja utilise");
      const coupon = {
        id: `coupon-${crypto.randomUUID().slice(0, 8)}`,
        code,
        discountPercent: Math.min(95, Math.max(1, Number(body.discountPercent || 10))),
        planName: PLAN_NAMES.includes(body.planName) ? body.planName : "",
        expiresAt: body.expiresAt || "",
        active: body.active !== false,
        createdAt: new Date().toISOString()
      };
      db.coupons.push(coupon);
      platformAudit(db, actor, "coupon.create", { couponId: coupon.id, code }, req);
      await writeDb(db);
      return sendJson(req, res, 201, { coupon, coupons: db.coupons });
    }

    if (req.method === "GET" && url.pathname === "/api/super-admin/billing") {
      return sendJson(req, res, 200, { transactions: db.transactions || [], subscriptions: db.subscriptions || [] });
    }

    if (req.method === "POST" && url.pathname === "/api/super-admin/billing/dunning-run") {
      const affected = runDunning(db, actor, req);
      await writeDb(db);
      return sendJson(req, res, 200, { affected, count: affected.length });
    }

    if (req.method === "GET" && url.pathname === "/api/super-admin/audit-logs") {
      const tenantId = String(url.searchParams.get("tenantId") || "").trim();
      const action = String(url.searchParams.get("action") || "").trim().toLowerCase();
      const from = String(url.searchParams.get("from") || "").trim();
      const to = String(url.searchParams.get("to") || "").trim();
      let logs = (db.platformAuditLogs || []).slice().reverse();
      if (tenantId) logs = logs.filter(item => item.targetTenantId === tenantId);
      if (action) logs = logs.filter(item => String(item.action || "").toLowerCase().includes(action));
      if (from) logs = logs.filter(item => new Date(item.timestamp) >= new Date(`${from}T00:00:00`));
      if (to) logs = logs.filter(item => new Date(item.timestamp) <= new Date(`${to}T23:59:59`));
      return sendJson(req, res, 200, { auditLogs: logs });
    }

    if (req.method === "GET" && url.pathname === "/api/super-admin/activation-emails") {
      return sendJson(req, res, 200, { activationEmails: (db.activationEmails || []).slice().reverse() });
    }

    if (req.method === "GET" && url.pathname === "/api/super-admin/platform-users") {
      return sendJson(req, res, 200, { users: platformTeam(db) });
    }

    if (req.method === "POST" && url.pathname === "/api/super-admin/platform-users") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const password = String(body.password || "");
      if (!email || !name || !strongPassword(password)) return sendError(req, res, 400, "Nom, email et mot de passe fort requis");
      if (db.users.some(item => item.email === email)) return sendError(req, res, 409, "Email deja utilise");
      const platformRole = PLATFORM_ROLES.includes(body.platformRole) ? body.platformRole : "platform_support";
      const created = {
        ...user(`USR-PLATFORM-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, email, password, name, "platform_admin"),
        tenantId: null,
        platformRole,
        active: body.active !== false,
        approved: true
      };
      db.users.push(created);
      platformAudit(db, actor, "platform_user.create", { userId: created.id, platformRole }, req);
      await writeDb(db);
      return sendJson(req, res, 201, { user: publicUser(created), users: platformTeam(db) });
    }

    if (req.method === "POST" && url.pathname === "/api/super-admin/banners") {
      const body = await readBody(req);
      const message = String(body.message || "").trim();
      if (!message) return sendError(req, res, 400, "Message de banniere requis");
      const banner = {
        id: `banner-${crypto.randomUUID().slice(0, 8)}`,
        message,
        severity: ["info", "warn", "danger"].includes(body.severity) ? body.severity : "info",
        active: body.active !== false,
        startsAt: body.startsAt || "",
        endsAt: body.endsAt || "",
        createdAt: new Date().toISOString()
      };
      db.systemBanners.push(banner);
      platformAudit(db, actor, "banner.create", { bannerId: banner.id }, req);
      await writeDb(db);
      return sendJson(req, res, 201, { banner, banners: db.systemBanners });
    }

    return sendError(req, res, 404, "Route Super Admin introuvable");
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    return sendJson(res, 200, { user: publicUser(actor), permissions: rolePermissions[actor.role] || [] });
  }

  if (req.method === "PATCH" && url.pathname === "/api/me") {
    const body = await readBody(req);
    const name = String(body.name || actor.name || "").trim();
    if (!name) return sendError(res, 400, "Nom requis");
    actor.name = name;
    actor.phone = String(body.phone || "").trim();
    actor.jobTitle = String(body.jobTitle || "").trim();
    if (body.profilePhoto !== undefined) {
      actor.profilePhoto = normalizeProfilePhoto(body.profilePhoto);
    }
    if (body.password) {
      if (!strongPassword(body.password)) return sendError(res, 400, "Mot de passe fort requis");
      actor.passwordHash = hashPassword(body.password);
    }
    audit(db, actor, "profile.update", { userId: actor.id, hasPhoto: Boolean(actor.profilePhoto), passwordChanged: Boolean(body.password) });
    await writeDb(db);
    return sendJson(res, 200, { user: publicUser(actor) });
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const users = scopedRecords(actor, db.users.filter(userRecord => userRecord.role !== "platform_admin"));
    const projects = scopedRecords(actor, db.projects);
    const poles = scopedRecords(actor, db.poles);
    const interventions = scopedRecords(actor, db.interventions);
    const stockMovements = scopedRecords(actor, db.stockMovements || []);
    const productionOrders = scopedRecords(actor, db.productionOrders || []);
    const factoryQualityChecks = scopedRecords(actor, db.factoryQualityChecks || []);
    const clients = scopedRecords(actor, db.clients || []);
    const sales = scopedRecords(actor, db.sales || []);
    const saleItems = scopedRecords(actor, db.saleItems || []);
    const auditLog = scopedRecords(actor, db.auditLog || []);
    const terrainUsers = users.filter(userRecord => ["terrain", "field_agent"].includes(userRecord.role)).map(publicUser);
    return sendJson(res, 200, {
      user: publicUser(actor),
      permissions: rolePermissions[actor.role] || [],
      projects,
      poles,
      interventions,
      stockMovements,
      productionOrders,
      factoryQualityChecks,
      clients,
      sales,
      saleItems,
      tenant: isPlatformAdmin(actor) ? null : (db.tenants || []).find(item => item.id === actor.tenantId) || null,
      modules: tenantModules(db, actor),
      auditLog: hasPermission(actor, "admin") ? auditLog : [],
      settings: db.settings || DEFAULT_SETTINGS,
      users: hasPermission(actor, "admin") ? users.map(publicUser) : [],
      terrainUsers: hasPermission(actor, "write_stock") || isFieldAgent(actor) ? terrainUsers : [],
      offlineQueue: []
    });
  }

  if (req.method === "PATCH" && url.pathname === "/api/settings") {
    if (!hasPermission(actor, "admin")) return sendError(res, 403, "Permission administrateur requise");
    const body = await readBody(req);
    db.settings = normalizeSettings(body);
    audit(db, actor, "settings.update", { keys: Object.keys(body || {}) });
    await writeDb(db);
    return sendJson(res, 200, { settings: db.settings });
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    if (!hasPermission(actor, "admin")) return sendError(res, 403, "Permission administrateur requise");
    return sendJson(res, 200, { users: scopedRecords(actor, db.users.filter(userRecord => userRecord.role !== "platform_admin")).map(publicUser) });
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    if (!hasPermission(actor, "admin")) return sendError(res, 403, "Permission administrateur requise");
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const allowedRoles = manageableRoles(actor);
    const role = allowedRoles.includes(body.role) ? body.role : "";
    if (!name || !email || !role || !strongPassword(password)) {
      return sendError(res, 400, "Nom, email, role et mot de passe fort requis");
    }
    if (db.users.some(item => item.email === email)) {
      return sendError(res, 409, "Un compte existe deja avec cet email");
    }
    const created = {
      ...user(`USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, email, password, name, role),
      tenantId: isPlatformAdmin(actor) ? (body.tenantId || DEFAULT_TENANT_ID) : actor.tenantId,
      active: body.active !== false,
      approved: body.approved !== false,
      depot: String(body.depot || "").trim(),
      team: String(body.team || "").trim(),
      phone: String(body.phone || "").trim(),
      jobTitle: String(body.jobTitle || "").trim()
    };
    db.users.push(created);
    audit(db, actor, "user.create", { userId: created.id, email, role });
    await writeDb(db);
    return sendJson(res, 201, { user: publicUser(created), users: scopedRecords(actor, db.users.filter(userRecord => userRecord.role !== "platform_admin")).map(publicUser) });
  }

  const userMatch = /^\/api\/users\/([^/]+)$/.exec(url.pathname);
  if (req.method === "PATCH" && userMatch) {
    if (!hasPermission(actor, "admin")) return sendError(res, 403, "Permission administrateur requise");
    const target = db.users.find(item => item.id === decodeURIComponent(userMatch[1]));
    if (!target) return sendError(res, 404, "Utilisateur introuvable");
    if (!tenantMatches(actor, target)) return sendError(res, 403, "Tenant non autorise");
    const body = await readBody(req);
    const allowedRoles = manageableRoles(actor);
    if (body.name !== undefined) target.name = String(body.name).trim();
    if (body.role !== undefined && allowedRoles.includes(body.role)) target.role = body.role;
    if (body.active !== undefined) target.active = Boolean(body.active);
    if (body.approved !== undefined) target.approved = Boolean(body.approved);
    if (body.depot !== undefined) target.depot = String(body.depot || "").trim();
    if (body.team !== undefined) target.team = String(body.team || "").trim();
    if (body.phone !== undefined) target.phone = String(body.phone || "").trim();
    if (body.jobTitle !== undefined) target.jobTitle = String(body.jobTitle || "").trim();
    if (body.profilePhoto !== undefined) target.profilePhoto = normalizeProfilePhoto(body.profilePhoto);
    if (body.password) {
      if (!strongPassword(body.password)) return sendError(res, 400, "Mot de passe fort requis");
      target.passwordHash = hashPassword(body.password);
    }
    audit(db, actor, "user.update", { userId: target.id, fields: Object.keys(body).filter(key => key !== "password") });
    await writeDb(db);
    return sendJson(res, 200, { user: publicUser(target), users: scopedRecords(actor, db.users.filter(userRecord => userRecord.role !== "platform_admin")).map(publicUser) });
  }

  if (req.method === "GET" && url.pathname === "/api/production/orders") {
    if (!requireTenantModule(db, req, res, actor, "production")) return;
    if (!canAccessProduction(actor)) return sendError(res, 403, "Permission production requise");
    return sendJson(res, 200, { productionOrders: scopedRecords(actor, db.productionOrders || []) });
  }

  if (req.method === "POST" && url.pathname === "/api/production/orders") {
    if (!requireTenantModule(db, req, res, actor, "production")) return;
    if (!canAccessProduction(actor)) return sendError(res, 403, "Permission production requise");
    const body = await readBody(req);
    const quantity = Number(body.quantity || 0);
    const poleType = String(body.poleType || body.type || "").trim().toUpperCase();
    if (!poleType || !quantity || quantity < 1) return sendError(res, 400, "Type de poteau et quantite requis");
    db.productionOrders = db.productionOrders || [];
    db.poles = db.poles || [];
    const now = new Date().toISOString();
    const orderNumber = body.orderNumber || nextProductionOrderNumber(db);
    if (db.productionOrders.some(item => item.orderNumber === orderNumber && tenantMatches(actor, item))) {
      return sendError(res, 409, "Ordre de fabrication deja existant");
    }
    const order = {
      id: body.id || `of-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: actor.tenantId || DEFAULT_TENANT_ID,
      orderNumber,
      poleType,
      dimensions: body.dimensions || {},
      resistanceClass: String(body.resistanceClass || "").trim(),
      rawMaterialLot: String(body.rawMaterialLot || "").trim(),
      quantity,
      unitCost: Number(body.unitCost || body.factoryUnitCost || 0),
      status: body.status || "En fabrication",
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now
    };
    const createdPoles = [];
    for (let index = 1; index <= quantity; index++) {
      const matricule = poleProductionId(orderNumber, index);
      const id = db.poles.some(item => item.id === matricule) ? `POT-${crypto.randomUUID().slice(0, 8).toUpperCase()}` : matricule;
      const pole = {
        id,
        tenantId: order.tenantId,
        type: poleType,
        height: Number(order.dimensions.height || body.height || 0),
        effort: String(body.effort || order.dimensions.effort || ""),
        weight: Number(body.weight || order.dimensions.weight || 0),
        maker: String(body.maker || `Usine / ${order.rawMaterialLot || orderNumber}`),
        status: "En fabrication",
        depot: "Usine",
        assignedTeam: "",
        projectId: "",
        productionOrderId: order.id,
        matricule,
        qrCode: id,
        factoryStatus: "En fabrication",
        productionDate: now,
        resistanceClass: order.resistanceClass,
        rawMaterialLot: order.rawMaterialLot,
        factoryUnitCost: order.unitCost,
        soldAt: "",
        soldToClientId: "",
        saleId: "",
        deliveryNoteNumber: ""
      };
      db.poles.push(pole);
      createdPoles.push(pole);
      stockMovement(db, actor, pole.id, "Fabrication usine", "", "Usine", { productionOrderId: order.id, orderNumber });
    }
    db.productionOrders.push(order);
    audit(db, actor, "production_order.create", { orderId: order.id, orderNumber, quantity });
    await writeDb(db);
    return sendJson(res, 201, tenantPayload(db, actor, { productionOrder: order, createdPoles }));
  }

  const productionOrderMatch = /^\/api\/production\/orders\/([^/]+)$/.exec(url.pathname);
  if (req.method === "PATCH" && productionOrderMatch) {
    if (!requireTenantModule(db, req, res, actor, "production")) return;
    if (!canAccessProduction(actor)) return sendError(res, 403, "Permission production requise");
    const order = (db.productionOrders || []).find(item => item.id === decodeURIComponent(productionOrderMatch[1]));
    if (!order) return sendError(res, 404, "Ordre de fabrication introuvable");
    if (!tenantMatches(actor, order)) return sendError(res, 403, "Tenant non autorise");
    const body = await readBody(req);
    const allowedStatuses = ["En fabrication", "En cure/sechage", "Controle Qualite Usine", "En Stock Usine", "Cloture"];
    if (body.status !== undefined) {
      if (!allowedStatuses.includes(body.status)) return sendError(res, 400, "Statut de production invalide");
      order.status = body.status;
      for (const pole of db.poles.filter(item => item.productionOrderId === order.id && tenantMatches(actor, item))) {
        pole.factoryStatus = body.status;
        if (body.status === "En Stock Usine" || body.status === "Cloture") {
          pole.status = "En Stock";
          pole.depot = "Stock Usine";
        } else {
          pole.status = body.status;
          pole.depot = "Usine";
        }
      }
    }
    if (body.unitCost !== undefined) order.unitCost = Number(body.unitCost || 0);
    order.updatedAt = new Date().toISOString();
    audit(db, actor, "production_order.update", { orderId: order.id, fields: Object.keys(body || {}) });
    await writeDb(db);
    return sendJson(res, 200, tenantPayload(db, actor, { productionOrder: order }));
  }

  if (req.method === "POST" && url.pathname === "/api/production/quality-checks") {
    if (!requireTenantModule(db, req, res, actor, "production")) return;
    if (!canAccessProduction(actor) && !hasPermission(actor, "validate")) return sendError(res, 403, "Permission controle usine requise");
    const body = await readBody(req);
    const result = ["Conforme", "Non conforme", "A reprendre"].includes(body.result) ? body.result : "";
    const pole = (db.poles || []).find(item => item.id === body.poleId);
    if (!body.productionOrderId && !pole) return sendError(res, 400, "OF ou poteau requis");
    if (pole && !tenantMatches(actor, pole)) return sendError(res, 403, "Tenant non autorise");
    if (!result) return sendError(res, 400, "Resultat controle invalide");
    const check = {
      id: body.id || `qc-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: actor.tenantId || pole?.tenantId || DEFAULT_TENANT_ID,
      productionOrderId: String(body.productionOrderId || pole?.productionOrderId || ""),
      poleId: String(body.poleId || ""),
      inspectorId: actor.id,
      result,
      measurements: body.measurements || {},
      notes: String(body.notes || ""),
      checkedAt: new Date().toISOString()
    };
    db.factoryQualityChecks = db.factoryQualityChecks || [];
    db.factoryQualityChecks.push(check);
    if (pole) pole.factoryStatus = result === "Conforme" ? "En Stock Usine" : "Controle Qualite Usine";
    audit(db, actor, "factory_quality_check.create", { checkId: check.id, poleId: check.poleId, result });
    await writeDb(db);
    return sendJson(res, 201, tenantPayload(db, actor, { factoryQualityCheck: check }));
  }

  if (req.method === "GET" && url.pathname === "/api/clients") {
    if (!requireTenantModule(db, req, res, actor, "sales")) return;
    if (!canAccessSales(actor) && !canAccessFinance(actor)) return sendError(res, 403, "Permission ventes requise");
    return sendJson(res, 200, { clients: scopedRecords(actor, db.clients || []) });
  }

  if (req.method === "POST" && url.pathname === "/api/clients") {
    if (!requireTenantModule(db, req, res, actor, "sales")) return;
    if (!canAccessSales(actor)) return sendError(res, 403, "Permission commerciale requise");
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) return sendError(res, 400, "Nom client requis");
    const client = {
      id: body.id || `client-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: actor.tenantId || DEFAULT_TENANT_ID,
      name,
      clientType: String(body.clientType || "Entreprise BTP"),
      email: String(body.email || "").trim().toLowerCase(),
      phone: String(body.phone || "").trim(),
      address: String(body.address || "").trim(),
      paymentTerms: String(body.paymentTerms || "").trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.clients = db.clients || [];
    db.clients.push(client);
    audit(db, actor, "client.create", { clientId: client.id, name });
    await writeDb(db);
    return sendJson(res, 201, { client, clients: scopedRecords(actor, db.clients) });
  }

  const clientHistoryMatch = /^\/api\/clients\/([^/]+)\/history$/.exec(url.pathname);
  if (req.method === "GET" && clientHistoryMatch) {
    if (!requireTenantModule(db, req, res, actor, "sales")) return;
    if (!canAccessSales(actor) && !canAccessFinance(actor)) return sendError(res, 403, "Permission ventes requise");
    const client = (db.clients || []).find(item => item.id === decodeURIComponent(clientHistoryMatch[1]));
    if (!client) return sendError(res, 404, "Client introuvable");
    if (!tenantMatches(actor, client)) return sendError(res, 403, "Tenant non autorise");
    const sales = (db.sales || []).filter(item => item.clientId === client.id && tenantMatches(actor, item));
    const saleIds = new Set(sales.map(item => item.id));
    const saleItems = (db.saleItems || []).filter(item => saleIds.has(item.saleId) && tenantMatches(actor, item));
    const poles = (db.poles || []).filter(item => saleItems.some(saleItem => saleItem.poleId === item.id) && tenantMatches(actor, item));
    return sendJson(res, 200, { client, sales, saleItems, poles });
  }

  if (req.method === "GET" && url.pathname === "/api/sales") {
    if (!requireTenantModule(db, req, res, actor, "sales")) return;
    if (!canAccessSales(actor) && !canAccessFinance(actor)) return sendError(res, 403, "Permission ventes requise");
    const { start, end } = parsePeriod(url);
    const sales = scopedRecords(actor, db.sales || []).filter(sale => {
      const saleDate = new Date(sale.saleDate || sale.createdAt || 0);
      return (!url.searchParams.has("startDate") || saleDate >= start) && (!url.searchParams.has("endDate") || saleDate <= end);
    });
    return sendJson(res, 200, { sales });
  }

  if (req.method === "POST" && url.pathname === "/api/sales") {
    if (!requireTenantModule(db, req, res, actor, "sales")) return;
    if (!canAccessSales(actor)) return sendError(res, 403, "Permission commerciale requise");
    const body = await readBody(req);
    const client = (db.clients || []).find(item => item.id === body.clientId);
    if (!client) return sendError(res, 404, "Client introuvable");
    if (!tenantMatches(actor, client)) return sendError(res, 403, "Tenant non autorise");
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (!requestedItems.length) return sendError(res, 400, "Au moins un poteau est requis");
    const now = new Date().toISOString();
    const sale = {
      id: body.id || `sale-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: actor.tenantId || DEFAULT_TENANT_ID,
      clientId: client.id,
      saleNumber: body.saleNumber || nextSaleNumber(db),
      deliveryNoteNumber: body.deliveryNoteNumber || nextDeliveryNoteNumber(db),
      status: body.status || "Confirmee",
      paymentStatus: body.paymentStatus || "pending",
      paymentTerms: String(body.paymentTerms || client.paymentTerms || ""),
      totalAmount: 0,
      totalCost: 0,
      marginAmount: 0,
      currency: body.currency || "XOF",
      soldBy: actor.id,
      saleDate: body.saleDate || now,
      deliveryDate: body.deliveryDate || "",
      createdAt: now
    };
    db.sales = db.sales || [];
    db.saleItems = db.saleItems || [];
    if (db.sales.some(item => item.saleNumber === sale.saleNumber && tenantMatches(actor, item))) {
      return sendError(res, 409, "Numero de vente deja existant");
    }
    const createdItems = [];
    for (const item of requestedItems) {
      const pole = db.poles.find(candidate => candidate.id === item.poleId || candidate.qrCode === item.qrCode || candidate.matricule === item.matricule);
      if (!pole) return sendError(res, 404, `Poteau introuvable: ${item.poleId || item.qrCode || item.matricule}`);
      if (!tenantMatches(actor, pole)) return sendError(res, 403, "Tenant non autorise");
      if (pole.saleId || pole.soldAt || pole.status === "Vendu") return sendError(res, 409, `Poteau deja vendu: ${pole.id}`);
      if (!["En Stock", "En Stock Usine"].includes(pole.status) && pole.factoryStatus !== "En Stock Usine") return sendError(res, 409, `Poteau non disponible a la vente: ${pole.id}`);
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(item.unitPrice || 0);
      const unitCost = Number(item.unitCost ?? pole.factoryUnitCost ?? 0);
      if (quantity < 1 || unitPrice < 0) return sendError(res, 400, "Quantite ou prix invalide");
      const saleItem = {
        id: item.id || `sale-item-${crypto.randomUUID().slice(0, 8)}`,
        tenantId: sale.tenantId,
        saleId: sale.id,
        poleId: pole.id,
        unitPrice,
        unitCost,
        quantity,
        createdAt: now
      };
      createdItems.push(saleItem);
      sale.totalAmount += unitPrice * quantity;
      sale.totalCost += unitCost * quantity;
      pole.status = "Vendu";
      pole.soldAt = sale.saleDate;
      pole.soldToClientId = client.id;
      pole.saleId = sale.id;
      pole.deliveryNoteNumber = sale.deliveryNoteNumber;
      stockMovement(db, actor, pole.id, "Vente / BL", pole.depot, "Client", { clientId: client.id, saleId: sale.id, deliveryNoteNumber: sale.deliveryNoteNumber });
    }
    sale.marginAmount = sale.totalAmount - sale.totalCost;
    db.sales.push(sale);
    db.saleItems.push(...createdItems);
    audit(db, actor, "sale.create", { saleId: sale.id, clientId: client.id, poles: createdItems.map(item => item.poleId), totalAmount: sale.totalAmount });
    await writeDb(db);
    return sendJson(res, 201, tenantPayload(db, actor, { sale, createdSaleItems: createdItems }));
  }

  if (req.method === "GET" && url.pathname === "/api/reports/sales") {
    if (!requireTenantModule(db, req, res, actor, "finance")) return;
    if (!canAccessFinance(actor)) return sendError(res, 403, "Permission finance requise");
    try {
      return sendJson(res, 200, saleReport(db, actor, url));
    } catch (error) {
      return sendError(res, error.statusCode || 500, error.message || "Rapport indisponible");
    }
  }

  const poleTraceMatch = /^\/api\/poles\/([^/]+)\/trace$/.exec(url.pathname);
  if (req.method === "GET" && poleTraceMatch) {
    if (!tenantModuleEnabled(db, actor, "production") && !tenantModuleEnabled(db, actor, "sales")) return sendError(req, res, 403, "Module tracabilite usine/vente non active pour cette entreprise");
    const key = decodeURIComponent(poleTraceMatch[1]);
    const pole = (db.poles || []).find(item => item.id === key || item.qrCode === key || item.matricule === key);
    if (!pole) return sendError(res, 404, "Poteau introuvable");
    if (!tenantMatches(actor, pole)) return sendError(res, 403, "Tenant non autorise");
    const productionOrder = (db.productionOrders || []).find(item => item.id === pole.productionOrderId && tenantMatches(actor, item)) || null;
    const qualityChecks = (db.factoryQualityChecks || []).filter(item => item.poleId === pole.id && tenantMatches(actor, item));
    const sale = pole.saleId ? (db.sales || []).find(item => item.id === pole.saleId && tenantMatches(actor, item)) || null : null;
    const client = sale ? (db.clients || []).find(item => item.id === sale.clientId && tenantMatches(actor, item)) || null : null;
    const interventions = (db.interventions || []).filter(item => item.poleId === pole.id && tenantMatches(actor, item));
    const stockMovements = (db.stockMovements || []).filter(item => item.poleId === pole.id && tenantMatches(actor, item));
    return sendJson(res, 200, { pole, productionOrder, qualityChecks, sale, client, interventions, stockMovements });
  }

  const poleStatusMatch = /^\/api\/poles\/([^/]+)\/status$/.exec(url.pathname);
  if (req.method === "PATCH" && poleStatusMatch) {
    if (!hasPermission(actor, "write_stock") && !canAccessProduction(actor)) return sendError(res, 403, "Permission stock ou production requise");
    if (!hasPermission(actor, "write_stock") && !requireTenantModule(db, req, res, actor, "production")) return;
    const pole = db.poles.find(item => item.id === decodeURIComponent(poleStatusMatch[1]));
    if (!pole) return sendError(res, 404, "Poteau introuvable");
    if (!tenantMatches(actor, pole)) return sendError(res, 403, "Tenant non autorise");
    const body = await readBody(req);
    const beforeDepot = pole.depot;
    const beforeStatus = pole.status;
    if (body.status !== undefined) pole.status = String(body.status);
    if (body.factoryStatus !== undefined) pole.factoryStatus = String(body.factoryStatus);
    if (body.depot !== undefined) pole.depot = String(body.depot || "");
    stockMovement(db, actor, pole.id, "Changement statut poteau", beforeDepot, pole.depot, { fromStatus: beforeStatus, toStatus: pole.status, factoryStatus: pole.factoryStatus || "" });
    audit(db, actor, "pole.status.update", { poleId: pole.id, fromStatus: beforeStatus, toStatus: pole.status });
    await writeDb(db);
    return sendJson(res, 200, { pole });
  }

  if (req.method === "GET" && url.pathname === "/api/poles") {
    return sendJson(res, 200, { poles: scopedRecords(actor, db.poles) });
  }

  if (req.method === "POST" && url.pathname === "/api/poles") {
    if (!hasPermission(actor, "write_stock")) return sendError(res, 403, "Permission stock requise");
    const body = await readBody(req);
    if (!body.id || !body.type || !body.height) return sendError(res, 400, "Champs poteau incomplets");
    if (db.poles.some(item => item.id === body.id)) return sendError(res, 409, "Code poteau deja existant");
    const pole = {
      id: body.id,
      tenantId: actor.tenantId || DEFAULT_TENANT_ID,
      type: body.type,
      height: Number(body.height),
      effort: body.effort || "",
      weight: Number(body.weight || 0),
      maker: body.maker || "",
      status: body.status || "En Stock",
      depot: body.depot || "Depot Central",
      assignedTeam: body.assignedTeam || ""
    };
    db.poles.push(pole);
    stockMovement(db, actor, pole.id, "Entree stock", "", pole.depot, { status: pole.status, maker: pole.maker });
    audit(db, actor, "pole.create", { poleId: pole.id });
    await writeDb(db);
    return sendJson(res, 201, { pole });
  }

  const poleMatch = /^\/api\/poles\/([^/]+)$/.exec(url.pathname);
  if (req.method === "PATCH" && poleMatch) {
    if (!hasPermission(actor, "write_stock")) return sendError(res, 403, "Permission stock requise");
    const pole = db.poles.find(item => item.id === decodeURIComponent(poleMatch[1]));
    if (!pole) return sendError(res, 404, "Poteau introuvable");
    if (!tenantMatches(actor, pole)) return sendError(res, 403, "Tenant non autorise");
    const beforeDepot = pole.depot;
    const beforeStatus = pole.status;
    const body = await readBody(req);
    Object.assign(pole, body);
    if (beforeDepot !== pole.depot || beforeStatus !== pole.status || body.assignedTeam !== undefined) {
      stockMovement(db, actor, pole.id, "Mouvement stock", beforeDepot, pole.depot, { status: pole.status, assignedTeam: pole.assignedTeam || "" });
    }
    audit(db, actor, "pole.update", { poleId: pole.id });
    await writeDb(db);
    return sendJson(res, 200, { pole });
  }

  if (req.method === "POST" && url.pathname === "/api/requisitions") {
    if (!hasPermission(actor, "write_stock")) return sendError(res, 403, "Permission stock requise");
    const body = await readBody(req);
    const poleIds = Array.isArray(body.poleIds) ? body.poleIds : [];
    const moved = [];
    for (const pole of scopedRecords(actor, db.poles)) {
      if (poleIds.includes(pole.id)) {
        const assignedTeam = String(body.assignedTeam || "").trim();
        const fromDepot = pole.depot;
        pole.status = "En Transit";
        pole.depot = body.destination || (assignedTeam ? `Terrain - ${assignedTeam}` : "Camion equipe terrain");
        pole.assignedTeam = assignedTeam;
        moved.push(pole.id);
        stockMovement(db, actor, pole.id, "Sortie terrain", fromDepot, pole.depot, { assignedTeam });
      }
    }
    audit(db, actor, "requisition.create", { poleIds: moved });
    await writeDb(db);
    return sendJson(res, 201, tenantPayload(db, actor, { moved }));
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    return sendJson(res, 200, { projects: scopedRecords(actor, db.projects) });
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    if (!hasPermission(actor, "admin")) return sendError(res, 403, "Permission administrateur requise");
    const body = await readBody(req);
    const requirements = normalizeRequirements(body.requirements);
    if (!body.name || !body.client || !body.zone || !body.assignedTeam || !body.startDate || !body.endDate || !requirements.length) return sendError(res, 400, "Projet, operateur, planning, zone, equipe et poteaux demandes requis");
    if (new Date(body.endDate) < new Date(body.startDate)) return sendError(res, 400, "La date de fin doit etre apres le debut");
    const poleCount = requirements.reduce((sum, item) => sum + item.quantity, 0);
    const project = {
      id: body.id || nextProjectId(db),
      tenantId: actor.tenantId || DEFAULT_TENANT_ID,
      name: String(body.name).trim(),
      client: body.client,
      zone: String(body.zone).trim(),
      startDate: body.startDate,
      endDate: body.endDate,
      poleCount,
      assignedTeam: String(body.assignedTeam).trim(),
      status: "Demande stock",
      requestStatus: "En attente gestionnaire",
      requirements,
      assignedPoleIds: [],
      createdBy: actor.id,
      createdAt: new Date().toISOString()
    };
    if (db.projects.some(item => item.id === project.id)) return sendError(res, 409, "Code projet deja existant");
    db.projects.push(project);
    audit(db, actor, "project.create", { projectId: project.id, assignedTeam: project.assignedTeam, poleCount });
    await writeDb(db);
    return sendJson(res, 201, tenantPayload(db, actor, { project }));
  }

  const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(url.pathname);
  if (projectMatch && req.method === "PATCH") {
    if (!hasPermission(actor, "admin")) return sendError(res, 403, "Permission administrateur requise");
    const project = db.projects.find(item => item.id === decodeURIComponent(projectMatch[1]));
    if (!project) return sendError(res, 404, "Projet introuvable");
    if (!tenantMatches(actor, project)) return sendError(res, 403, "Tenant non autorise");
    if (project.status === "Cloture") return sendError(res, 409, "Impossible de modifier un projet cloture");
    const body = await readBody(req);
    const requirements = normalizeRequirements(body.requirements);
    if (!body.name || !body.client || !body.zone || !body.assignedTeam || !body.startDate || !body.endDate || !requirements.length) return sendError(res, 400, "Projet, operateur, planning, zone, equipe et poteaux demandes requis");
    if (new Date(body.endDate) < new Date(body.startDate)) return sendError(res, 400, "La date de fin doit etre apres le debut");
    Object.assign(project, {
      name: String(body.name).trim(),
      client: body.client,
      zone: String(body.zone).trim(),
      startDate: body.startDate,
      endDate: body.endDate,
      assignedTeam: String(body.assignedTeam).trim(),
      poleCount: requirements.reduce((sum, item) => sum + item.quantity, 0),
      requirements
    });
    if (!project.assignedPoleIds?.length) {
      project.status = "Demande stock";
      project.requestStatus = "En attente gestionnaire";
    }
    audit(db, actor, "project.update", { projectId: project.id });
    await writeDb(db);
    return sendJson(res, 200, tenantPayload(db, actor, { project }));
  }

  if (projectMatch && req.method === "DELETE") {
    if (!hasPermission(actor, "admin")) return sendError(res, 403, "Permission administrateur requise");
    const projectId = decodeURIComponent(projectMatch[1]);
    const project = db.projects.find(item => item.id === projectId);
    if (project && !tenantMatches(actor, project)) return sendError(res, 403, "Tenant non autorise");
    if (project?.status === "Cloture") return sendError(res, 409, "Impossible de supprimer un projet cloture");
    const hasReports = scopedRecords(actor, db.interventions).some(item => item.projectId === projectId);
    if (hasReports) return sendError(res, 409, "Impossible de supprimer un projet avec des fiches de pose");
    db.projects = db.projects.filter(item => item.id !== projectId);
    scopedRecords(actor, db.poles).forEach(pole => {
      if (pole.projectId === projectId) {
        pole.projectId = "";
        pole.assignedTeam = "";
        pole.status = "En Stock";
        pole.depot = "Depot Central";
      }
    });
    audit(db, actor, "project.delete", { projectId });
    await writeDb(db);
    if (SUPABASE_ENABLED) await supabase.from("projects").delete().eq("id", projectId);
    return sendJson(res, 200, tenantPayload(db, actor));
  }

  const projectActionMatch = /^\/api\/projects\/([^/]+)\/(validate-stock|takeover|request-close|validate-close)$/.exec(url.pathname);
  if (req.method === "POST" && projectActionMatch) {
    const project = db.projects.find(item => item.id === decodeURIComponent(projectActionMatch[1]));
    if (!project) return sendError(res, 404, "Projet introuvable");
    if (!tenantMatches(actor, project)) return sendError(res, 403, "Tenant non autorise");
    const action = projectActionMatch[2];
    if (action === "validate-stock") {
      if (!hasPermission(actor, "write_stock")) return sendError(res, 403, "Permission stock requise");
      const selected = [];
      const unavailable = [];
      for (const requirement of normalizeRequirements(project.requirements)) {
        const matches = scopedRecords(actor, db.poles)
          .filter(pole => pole.status === "En Stock" && pole.type === requirement.type && Number(pole.height) === Number(requirement.height))
          .filter(pole => !selected.includes(pole.id))
          .slice(0, requirement.quantity);
        if (matches.length < requirement.quantity) unavailable.push(`${requirement.type} ${requirement.height}m: ${matches.length}/${requirement.quantity}`);
        selected.push(...matches.map(pole => pole.id));
      }
      if (unavailable.length) return sendError(res, 409, `Stock insuffisant: ${unavailable.join(", ")}`);
      selected.forEach(id => {
        const pole = scopedRecords(actor, db.poles).find(item => item.id === id);
        if (pole) {
          const fromDepot = pole.depot;
          pole.status = "En Transit";
          pole.depot = `Terrain - ${project.assignedTeam}`;
          pole.assignedTeam = project.assignedTeam;
          pole.projectId = project.id;
          stockMovement(db, actor, pole.id, "Validation stock projet", fromDepot, pole.depot, { projectId: project.id, assignedTeam: project.assignedTeam });
        }
      });
      project.assignedPoleIds = selected;
      project.status = "Envoye terrain";
      project.requestStatus = "Validee";
      project.validatedBy = actor.id;
      project.validatedAt = new Date().toISOString();
      audit(db, actor, "project.stock_validate", { projectId: project.id, poleIds: selected });
      await writeDb(db);
      return sendJson(res, 200, tenantPayload(db, actor, { project }));
    }
    if (action === "takeover") {
      if (isFieldAgent(actor) && project.assignedTeam !== terrainTeamOf(actor)) return sendError(res, 403, "Projet non attribue a votre equipe");
      if (!hasPermission(actor, "write_intervention")) return sendError(res, 403, "Permission terrain requise");
      project.status = "Pris en main";
      project.takenBy = actor.id;
      project.takenAt = new Date().toISOString();
      audit(db, actor, "project.takeover", { projectId: project.id });
      await writeDb(db);
      return sendJson(res, 200, tenantPayload(db, actor, { project }));
    }
    if (action === "request-close") {
      if (isFieldAgent(actor) && project.assignedTeam !== terrainTeamOf(actor)) return sendError(res, 403, "Projet non attribue a votre equipe");
      if (!hasPermission(actor, "write_intervention")) return sendError(res, 403, "Permission terrain requise");
      if (projectDone(db, project.id) < projectTotal(project)) return sendError(res, 409, "Tous les poteaux du projet doivent etre implantes avant cloture");
      if (project.status === "Cloture") return sendError(res, 409, "Projet deja cloture");
      project.status = "Cloture demandee";
      project.closureRequestedBy = actor.id;
      project.closureRequestedAt = new Date().toISOString();
      audit(db, actor, "project.close_request", { projectId: project.id });
      await writeDb(db);
      return sendJson(res, 200, tenantPayload(db, actor, { project }));
    }
    if (action === "validate-close") {
      if (!hasPermission(actor, "admin")) return sendError(res, 403, "Permission administrateur requise");
      if (project.status !== "Cloture demandee") return sendError(res, 409, "Le projet n'est pas en attente de cloture");
      const stats = projectValidationStats(db, project.id);
      if (projectDone(db, project.id) < projectTotal(project)) return sendError(res, 409, "Projet incomplet");
      if (stats.pending > 0 || stats.anomalies > 0) return sendError(res, 409, "Toutes les fiches doivent etre validees sans anomalie");
      project.status = "Cloture";
      project.closedBy = actor.id;
      project.closedAt = new Date().toISOString();
      audit(db, actor, "project.close_validate", { projectId: project.id });
      await writeDb(db);
      return sendJson(res, 200, tenantPayload(db, actor, { project }));
    }
  }

  if (req.method === "GET" && url.pathname === "/api/interventions") {
    return sendJson(res, 200, { interventions: scopedRecords(actor, db.interventions) });
  }

  if (req.method === "POST" && url.pathname === "/api/interventions") {
    if (!hasPermission(actor, "write_intervention")) return sendError(res, 403, "Permission terrain requise");
    const body = await readBody(req);
    if (!body.poleId || !body.projectId || !body.lat || !body.lng) return sendError(res, 400, "Fiche de pose incomplete");
    const pole = db.poles.find(item => item.id === body.poleId);
    if (!pole) return sendError(res, 404, "Poteau introuvable");
    if (!tenantMatches(actor, pole)) return sendError(res, 403, "Tenant non autorise");
    if (isFieldAgent(actor) && (pole.status !== "En Transit" || pole.assignedTeam !== terrainTeamOf(actor))) {
      return sendError(res, 403, "Ce poteau n'est pas attribue a votre equipe terrain");
    }
    const id = body.id && !db.interventions.some(item => item.id === body.id) ? body.id : nextReportId(db);
    const photos = await savePhotos(id, body.photos || []);
    const intervention = {
      id,
      tenantId: actor.tenantId || pole.tenantId || DEFAULT_TENANT_ID,
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
      teamSignatureImage: body.teamSignatureImage || "",
      clientSignature: body.clientSignature || "",
      photos,
      draft: Boolean(body.draft)
    };
    db.interventions.push(intervention);
    if (pole) {
      const fromDepot = pole.depot;
      pole.status = intervention.draft ? "En Transit" : intervention.validation;
      pole.lat = intervention.lat;
      pole.lng = intervention.lng;
      pole.depot = "Implante terrain";
      if (!intervention.draft) stockMovement(db, actor, pole.id, "Implantation terrain", fromDepot, pole.depot, { projectId: intervention.projectId, reportId: intervention.id, validation: intervention.validation });
    }
    const project = db.projects.find(item => item.id === body.projectId);
    if (project && !tenantMatches(actor, project)) return sendError(res, 403, "Tenant non autorise");
    if (project && !intervention.draft && !["Cloture demandee", "Cloture"].includes(project.status)) project.status = "En implantation";
    audit(db, actor, "intervention.create", { reportId: id, poleId: body.poleId });
    await writeDb(db);
    return sendJson(res, 201, tenantPayload(db, actor, { intervention }));
  }

  const validationMatch = /^\/api\/interventions\/([^/]+)\/validate$/.exec(url.pathname);
  if (req.method === "PATCH" && validationMatch) {
    if (!hasPermission(actor, "validate")) return sendError(res, 403, "Permission validation requise");
    const intervention = db.interventions.find(item => item.id === decodeURIComponent(validationMatch[1]));
    if (!intervention) return sendError(res, 404, "Rapport introuvable");
    if (!tenantMatches(actor, intervention)) return sendError(res, 403, "Tenant non autorise");
    const body = await readBody(req);
    intervention.validation = body.validation || "Valide";
    intervention.clientSignature = body.clientSignature || actor.name;
    intervention.validatedBy = actor.id;
    intervention.validatedAt = new Date().toISOString();
    if (intervention.validation === "Anomalie") {
      intervention.anomalyReason = body.anomalyReason || intervention.notes || "";
      intervention.anomalyStatus = "Ouverte";
    }
    const pole = scopedRecords(actor, db.poles).find(item => item.id === intervention.poleId);
    if (pole) {
      const beforeStatus = pole.status;
      pole.status = intervention.validation;
      stockMovement(db, actor, pole.id, "Validation controle", pole.depot, pole.depot, { reportId: intervention.id, fromStatus: beforeStatus, validation: intervention.validation });
    }
    audit(db, actor, "intervention.validate", { reportId: intervention.id, validation: intervention.validation });
    await writeDb(db);
    return sendJson(res, 200, tenantPayload(db, actor, { intervention }));
  }

  const anomalyMatch = /^\/api\/interventions\/([^/]+)\/anomaly$/.exec(url.pathname);
  if (req.method === "PATCH" && anomalyMatch) {
    if (!hasPermission(actor, "validate") && !hasPermission(actor, "admin")) return sendError(res, 403, "Permission controle requise");
    const intervention = db.interventions.find(item => item.id === decodeURIComponent(anomalyMatch[1]));
    if (!intervention) return sendError(res, 404, "Rapport introuvable");
    if (!tenantMatches(actor, intervention)) return sendError(res, 403, "Tenant non autorise");
    const body = await readBody(req);
    intervention.anomalyStatus = body.anomalyStatus || "Ouverte";
    intervention.anomalyReason = body.anomalyReason || "";
    if (intervention.anomalyStatus === "Corrigee") intervention.validation = "Pose - En attente validation";
    const pole = scopedRecords(actor, db.poles).find(item => item.id === intervention.poleId);
    if (pole && intervention.anomalyStatus === "Corrigee") pole.status = "Pose - En attente validation";
    audit(db, actor, "intervention.anomaly_update", { reportId: intervention.id, anomalyStatus: intervention.anomalyStatus });
    await writeDb(db);
    return sendJson(res, 200, tenantPayload(db, actor, { intervention }));
  }

  if (req.method === "POST" && url.pathname === "/api/sync") {
    const body = await readBody(req);
    const operations = Array.isArray(body.operations) ? body.operations : [];
    audit(db, actor, "sync.client", { count: operations.length });
    await writeDb(db);
    return sendJson(res, 200, {
      accepted: operations.length,
      projects: scopedRecords(actor, db.projects),
      poles: scopedRecords(actor, db.poles),
      interventions: scopedRecords(actor, db.interventions),
      stockMovements: scopedRecords(actor, db.stockMovements || []),
      auditLog: hasPermission(actor, "admin") ? scopedRecords(actor, db.auditLog || []) : [],
      settings: db.settings || DEFAULT_SETTINGS,
      offlineQueue: []
    });
  }

  return sendError(res, 404, "Route API introuvable");
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(ROOT, pathname));
  const relativePath = path.relative(ROOT, filePath);
  const firstSegment = relativePath.split(path.sep)[0];
  const blocked = relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    firstSegment.startsWith(".") ||
    ["data", "node_modules"].includes(firstSegment) ||
    ["server.js", "supabase-schema.sql", "package.json", "package-lock.json"].includes(relativePath);
  if (blocked) {
    res.writeHead(403, securityHeaders(req, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }));
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, securityHeaders(req, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }));
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const cacheControl = [".html", ".js", ".json", ".webmanifest"].includes(ext) ? "no-cache" : "public, max-age=86400";
    res.writeHead(200, {
      ...securityHeaders(req, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": cacheControl
      })
    });
    res.end(content);
  });
}

async function handle(req, res) {
  try {
    res._request = req;
    const url = parseUrl(req);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    return sendError(req, res, error.statusCode || 500, error.message || "Erreur serveur");
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
  console.log("Compte Admin SaaS: platform@itc.local");
  console.log("Comptes metier: admin@itc.local / depot@itc.local / terrain@itc.local / controle@itc.local");
  console.log("Mot de passe demo: demo123");
});

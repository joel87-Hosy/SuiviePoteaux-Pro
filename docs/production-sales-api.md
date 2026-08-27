# Module Fabrication, Ventes et Reporting

Ce livrable initial ajoute le socle SQL et les routes API pour suivre un poteau de sa fabrication usine jusqu'a sa vente ou sa pose terrain.

## Tables SQL

- `production_orders`: ordres de fabrication multi-tenant, type/dimensions/classe/lot/quantite/cout et statut usine.
- `factory_quality_checks`: controles qualite usine rattaches a un OF et/ou un poteau.
- `clients`: repertoire clients par entreprise SaaS.
- `sales`: commandes et bons de livraison, totals financiers et statut paiement/livraison.
- `sale_items`: poteaux vendus ligne par ligne avec prix, cout et marge.
- `poles`: enrichi avec `production_order_id`, `matricule`, `qr_code`, `factory_status`, `production_date`, `resistance_class`, `raw_material_lot`, `factory_unit_cost`, `sold_at`, `sold_to_client_id`, `sale_id`, `delivery_note_number`.

Toutes les nouvelles tables portent `tenant_id` et les index de periode sont poses sur `production_orders.created_at`, `sales.sale_date` et `poles.sold_at`.

## Activation par tenant

Chaque entreprise possede des options dans `tenants.modules`:

- `production`: affiche et autorise Production usine.
- `sales`: affiche et autorise Ventes & Clients.
- `finance`: affiche et autorise Finance / Reporting.

Si les options restent a `false`, l'entreprise conserve le workflow standard Depot -> Chantier -> Pose -> Controle terrain. Les routes API concernees refusent aussi l'acces, meme si l'utilisateur a un role compatible.

## Roles

- `chef_production`: ordres de fabrication, controle usine et stock usine.
- `commercial`: clients, ventes et bons de livraison.
- `direction_finance`: reporting financier, exports futurs et lecture ventes.

## Routes API

### Production

- `GET /api/production/orders`
  - Permission: `production` ou `admin`
  - Retourne les OF du tenant connecte.

- `POST /api/production/orders`
  - Permission: `production` ou `admin`
  - Cree un OF et genere automatiquement les poteaux, matricules et QR codes.

- `PATCH /api/production/orders/:id`
  - Permission: `production` ou `admin`
  - Met a jour le statut usine: `En fabrication`, `En cure/sechage`, `Controle Qualite Usine`, `En Stock Usine`, `Cloture`.

- `POST /api/production/quality-checks`
  - Permission: `production`, `validate` ou `admin`
  - Enregistre un controle qualite usine.

### Poteaux et Tracabilite

- `PATCH /api/poles/:id/status`
  - Permission: `write_stock`, `production` ou `admin`
  - Met a jour le statut principal et/ou le statut usine d'un poteau.

- `GET /api/poles/:id/trace`
  - Permission: utilisateur authentifie du meme tenant
  - Retourne la fiche complete: poteau, OF, controles usine, vente, client, interventions terrain et mouvements stock.

### Clients et Ventes

- `GET /api/clients`
  - Permission: `sales`, `finance` ou `admin`
  - Retourne le repertoire clients du tenant.

- `POST /api/clients`
  - Permission: `sales` ou `admin`
  - Cree un client.

- `GET /api/clients/:id/history`
  - Permission: `sales`, `finance` ou `admin`
  - Retourne l'historique commercial du client.

- `GET /api/sales?startDate=...&endDate=...`
  - Permission: `sales`, `finance` ou `admin`
  - Retourne les ventes filtrees par periode.

- `POST /api/sales`
  - Permission: `sales` ou `admin`
  - Cree une vente/BL, verifie que les poteaux sont disponibles et marque les poteaux comme `Vendu`.

### Reporting

- `GET /api/reports/sales?period=today|week|month&startDate=...&endDate=...`
  - Permission: `finance` ou `admin`
  - Retourne les KPI: total ventes, volume vendu, cout total, marge nette, ventilation par type et top clients.

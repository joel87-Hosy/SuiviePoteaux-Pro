const fs = require("fs");
const path = require("path");

const output = path.join(__dirname, "Guide_Workflow_SuiviPoteaux_Pro.pdf");

const pages = [];
let lines = [];

function addPage(title) {
  if (lines.length) pages.push(lines);
  lines = [];
  if (title) {
    lines.push({ text: title, size: 18, bold: true, gap: 18 });
  }
}

function addHeading(text) {
  lines.push({ text, size: 14, bold: true, gap: 12 });
}

function addParagraph(text) {
  wrapText(text, 92).forEach(part => lines.push({ text: part, size: 10, gap: 4 }));
  lines.push({ text: "", size: 10, gap: 7 });
}

function addBullet(text) {
  wrapText(text, 88).forEach((part, index) => {
    lines.push({ text: `${index ? "  " : "- "}${part}`, size: 10, gap: 4 });
  });
}

function addNumber(index, text) {
  wrapText(text, 86).forEach((part, partIndex) => {
    lines.push({ text: `${partIndex ? "   " : `${index}. `}${part}`, size: 10, gap: 4 });
  });
}

function wrapText(text, max) {
  const words = String(text).split(/\s+/);
  const result = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > max) {
      if (current) result.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) result.push(current);
  return result;
}

function ensureRoom(count = 6) {
  if (lines.length > 48 - count) addPage("");
}

addPage("Guide workflow et utilisation - SuiviPoteaux Pro");
addParagraph("Ce document decrit le workflow complet de l'application SuiviPoteaux Pro et explique l'utilisation de chaque compte selon son role. Il sert de guide operationnel pour l'administration SaaS, les entreprises clientes, les projets d'implantation, le stock, le terrain, le controle qualite, la carte GPS, les rapports PDF, les modules optionnels usine/vente/finance et la cloture.");
addHeading("Objectif de l'application");
addBullet("Suivre les projets d'implantation de poteaux depuis la creation jusqu'a la cloture.");
addBullet("Gerer les stocks de poteaux, leurs mouvements, leurs affectations et leurs QR codes.");
addBullet("Permettre au technicien terrain de saisir les poses avec GPS, photos et signature.");
addBullet("Permettre au controleur et a l'admin de valider la conformite ou declarer une anomalie.");
addBullet("Generer les rapports PDF et conserver une tracabilite audit/stock.");
addBullet("Isoler strictement les donnees de chaque entreprise cliente avec le tenant_id.");
addBullet("Activer seulement les modules utiles a chaque entreprise: workflow standard, production usine, ventes clients et finance.");

addPage("Administration SaaS et entreprises clientes");
addHeading("Compte plateforme");
addBullet("Le compte platform@itc.local est reserve a l'equipe proprietaire du SaaS.");
addBullet("Il gere les entreprises clientes, les abonnements, les quotas, les modules optionnels, la facturation, les alertes et les logs plateforme.");
addBullet("Il ne doit pas etre confondu avec le compte super admin metier d'une entreprise.");

addHeading("Creation d'une entreprise");
[
  "Le Super Admin SaaS ouvre Admin SaaS.",
  "Il renseigne la societe: raison sociale, slug, secteur, pays, ville et logo.",
  "Il renseigne l'admin client: prenom, nom, email professionnel et telephone.",
  "Il choisit le plan, la facturation, l'essai et les quotas.",
  "Il coche uniquement les modules dont l'entreprise a besoin: Production usine, Ventes clients et Finance.",
  "Au submit, le tenant est cree, le compte admin de l'entreprise est genere et un email d'activation est place en file.",
  "L'admin de cette entreprise se connecte ensuite et cree ses propres comptes utilisateurs."
].forEach((text, index) => addNumber(index + 1, text));

addHeading("Isolation multi-tenant");
addBullet("Chaque entreprise possede ses propres utilisateurs, projets, poteaux, fiches, clients, ventes, OF et rapports.");
addBullet("Un utilisateur d'une entreprise ne peut pas ouvrir l'interface ou les donnees d'une autre entreprise.");
addBullet("Les routes sensibles controlent le role et le tenant_id avant chaque action.");
addBullet("Une entreprise suspendue ne peut plus acceder a son espace tant qu'elle n'est pas reactivee.");

addPage("Workflow general");
addHeading("Flux principal");
[
  "L'admin cree un projet avec le nom, l'operateur, la zone, le planning, l'equipe et le besoin en poteaux.",
  "Le projet passe en demande stock.",
  "Le gestionnaire depot verifie le stock disponible et valide les poteaux demandes.",
  "Les poteaux sont affectes au projet et envoyes a l'equipe terrain.",
  "Le technicien prend en main le projet et implante uniquement les poteaux attribues a son equipe.",
  "Chaque pose genere une fiche avec QR, GPS, photos obligatoires, signature et observations.",
  "Le controleur verifie les fiches et valide ou signale une anomalie.",
  "Quand toutes les poses sont terminees, le technicien demande la cloture.",
  "L'admin valide la cloture si toutes les fiches sont conformes et sans anomalie ouverte.",
  "Le rapport PDF du projet cloture devient disponible pour telechargement ou impression."
].forEach((text, index) => addNumber(index + 1, text));

addHeading("Statuts importants");
addBullet("Planifie: projet cree ou en preparation.");
addBullet("Demande stock: demande envoyee au gestionnaire.");
addBullet("Envoye terrain: poteaux affectes et transmis au terrain.");
addBullet("Pris en main: projet accepte par l'equipe terrain.");
addBullet("En implantation: poses en cours.");
addBullet("Cloture demandee: le technicien a termine et demande validation finale.");
addBullet("Cloture: validation finale effectuee par l'admin.");

addHeading("Entreprise sans modules optionnels");
addParagraph("Si le Super Admin SaaS ne coche pas Production usine, Ventes clients ou Finance pendant la creation de l'entreprise, celle-ci conserve le workflow standard: Depot et Stock, Projets, Operations terrain, Carte GPS, Controle qualite, Rapports PDF et Admin Utilisateurs.");
addBullet("Les onglets Production usine, Ventes & Clients et Finance restent masques.");
addBullet("Les API de ces modules repondent 403 si elles sont appelees directement.");

addPage("Role Administrateur");
addHeading("Responsabilites");
addBullet("Creer les projets d'implantation.");
addBullet("Creer les comptes utilisateurs depuis l'onglet Admin Utilisateurs.");
addBullet("Affecter les roles, depots et equipes.");
addBullet("Consulter les projets, stocks, fiches, anomalies, audit et rapports.");
addBullet("Valider la cloture des projets.");
addBullet("Gerer les parametres application.");
addBullet("Utiliser l'Assistant pour voir les priorites: retards, demandes stock, anomalies, clotures et photos finales manquantes.");

addHeading("Guide d'utilisation admin");
[
  "Se connecter avec un compte administrateur.",
  "Ouvrir l'onglet Admin Utilisateurs pour creer ou modifier les comptes.",
  "Ouvrir l'onglet Projets pour creer un projet: nom, operateur, zone, equipe, dates debut/fin, types et quantites de poteaux.",
  "Suivre l'evolution du projet avec le pourcentage calcule sur les poteaux poses.",
  "Consulter l'onglet Cloture projets pour valider les demandes venant du terrain.",
  "Verifier qu'il n'existe aucune anomalie ouverte avant validation finale.",
  "Telecharger ou imprimer le rapport PDF depuis Rapports PDF."
].forEach((text, index) => addNumber(index + 1, text));

addHeading("Onglets principaux admin");
addBullet("Tableau de bord: indicateurs globaux.");
addBullet("Assistant: recommandations contextuelles et actions rapides selon le role.");
addBullet("Mon profil: informations du compte, photo et mot de passe.");
addBullet("Projets: creation, modification, suppression hors projet cloture.");
addBullet("Cloture projets: validation finale.");
addBullet("Depot & Stock: consultation globale.");
addBullet("Carte GPS: positions des poteaux avec coordonnees valides.");
addBullet("Rapports PDF: fiches et rapports projets.");
addBullet("Admin Utilisateurs: creation et gestion des comptes.");
addBullet("FAQ & Politiques: guide et regles.");

addPage("Modules optionnels par entreprise");
addHeading("Activation des modules");
addParagraph("Les modules optionnels sont pilotes par le Super Admin SaaS depuis le tenant. Ils sont independants: une entreprise peut activer seulement Production, seulement Ventes, seulement Finance, ou les trois.");

addHeading("Production usine");
addBullet("Ajoute l'onglet Production usine.");
addBullet("Permet de creer des Ordres de Fabrication pour poteaux beton ou metalliques.");
addBullet("Genere automatiquement un matricule et un QR code par poteau produit.");
addBullet("Suit les statuts: En fabrication, En cure/sechage, Controle Qualite Usine, En Stock Usine, Cloture.");
addBullet("Role principal: chef_production. Les admins metier peuvent aussi y acceder.");

addHeading("Ventes & Clients");
addBullet("Ajoute l'onglet Ventes & Clients.");
addBullet("Permet de creer le repertoire clients, les commandes et les bons de livraison.");
addBullet("Les poteaux vendus passent au statut Vendu et restent tracables par QR code.");
addBullet("Role principal: commercial.");

addHeading("Finance");
addBullet("Ajoute l'onglet Finance.");
addBullet("Permet de consulter les bilans par periode, le chiffre d'affaires, le volume vendu et la marge nette.");
addBullet("Role principal: direction_finance.");

addPage("Workflow Production, Ventes et Finance");
addHeading("Fabrication usine");
[
  "Le chef production cree un ordre de fabrication avec type, dimensions, classe, lot matiere, quantite et cout unitaire.",
  "L'application cree les poteaux associes et genere les matricules/QR codes.",
  "L'OF avance de En fabrication vers En cure/sechage, Controle Qualite Usine puis En Stock Usine.",
  "Quand l'OF arrive en Stock Usine, les poteaux deviennent disponibles."
].forEach((text, index) => addNumber(index + 1, text));

addHeading("Vente et bon de livraison");
[
  "Le commercial cree ou selectionne un client.",
  "Il selectionne un poteau disponible ou utilise le scan QR.",
  "Il renseigne le prix unitaire et les conditions de paiement.",
  "L'application cree la vente et le BL, puis marque le poteau comme Vendu.",
  "La fiche de tracabilite affiche ensuite fabrication, controles, vente, client et statut terrain."
].forEach((text, index) => addNumber(index + 1, text));

addHeading("Reporting financier");
addBullet("La direction finance filtre par aujourd'hui, semaine, mois ou plage de dates.");
addBullet("Le bilan calcule total ventes, volume vendu, cout, marge nette, repartition beton/metallique et top clients.");

addPage("Role Gestionnaire depot");
addHeading("Responsabilites");
addBullet("Enregistrer les poteaux en stock.");
addBullet("Generer le code texte et le QR code du poteau.");
addBullet("Valider les demandes de poteaux venant des projets.");
addBullet("Affecter les poteaux disponibles a l'equipe terrain.");
addBullet("Suivre les mouvements de stock.");

addHeading("Guide d'utilisation gestionnaire");
[
  "Se connecter avec le compte magasinier/gestionnaire depot.",
  "Ouvrir Depot & Stock.",
  "Ajouter un poteau en depot avec son code, type, hauteur, effort, poids, constructeur et depot.",
  "Imprimer ou recuperer le QR code a coller sur le poteau.",
  "Consulter les projets en demande stock.",
  "Valider la demande si les poteaux sont disponibles.",
  "Verifier le bon de sortie et les mouvements de stock."
].forEach((text, index) => addNumber(index + 1, text));

addHeading("Regles stock");
addBullet("Un poteau attribue au terrain passe en statut En Transit.");
addBullet("Le technicien ne voit que les poteaux attribues a son equipe.");
addBullet("Chaque entree, sortie ou mouvement est trace dans l'historique.");

addPage("Role Technicien terrain");
addHeading("Responsabilites");
addBullet("Prendre en main les projets envoyes a son equipe.");
addBullet("Implanter uniquement les poteaux attribues.");
addBullet("Scanner le QR code pour verifier le bon poteau.");
addBullet("Capturer la position GPS.");
addBullet("Ajouter les photos obligatoires, dont Apres implantation.");
addBullet("Signer la fiche terrain.");
addBullet("Demander la cloture du projet lorsque toutes les poses sont terminees.");

addHeading("Guide d'utilisation technicien");
[
  "Se connecter avec le compte terrain.",
  "Ouvrir Operations terrain pour voir les projets et poteaux disponibles.",
  "Cliquer sur Prendre en main si le projet vient d'etre envoye au terrain.",
  "Cliquer sur Nouvelle pose.",
  "Selectionner le poteau attribue ou scanner le QR code.",
  "Capturer le GPS ou verifier la position renseignee.",
  "Completer type de sol, profondeur, observations et signature.",
  "Ajouter les photos obligatoires.",
  "Enregistrer la fiche de pose.",
  "Quand tous les poteaux sont poses, demander la cloture du projet."
].forEach((text, index) => addNumber(index + 1, text));

addHeading("Photos terrain");
addBullet("Avant travaux - fouille.");
addBullet("Marquage constructeur.");
addBullet("Levage et aplomb.");
addBullet("Massif beton / calage.");
addBullet("Apres implantation: photo obligatoire pour finaliser la fiche.");
addBullet("Dans le rapport PDF de cloture projet, seule la derniere photo Apres implantation de chaque poteau est utilisee.");
addBullet("Les autres photos restent conservees dans la fiche terrain mais ne sont pas reprises dans le rapport projet cloture.");

addPage("Role Controleur qualite");
addHeading("Responsabilites");
addBullet("Verifier les fiches de pose.");
addBullet("Controler QR, GPS, photos, observations et conformite.");
addBullet("Valider une fiche conforme.");
addBullet("Declarer une anomalie avec motif si la pose est non conforme.");
addBullet("Suivre la correction d'anomalie.");

addHeading("Guide d'utilisation controleur");
[
  "Se connecter avec le compte controleur.",
  "Ouvrir Rapports PDF ou Carte GPS pour consulter les poses.",
  "Examiner la fiche: poteau, projet, GPS, photos, signature et observations.",
  "Cliquer sur Valider si tout est conforme.",
  "Cliquer sur Non conforme si une anomalie existe et renseigner le motif.",
  "Suivre l'anomalie jusqu'a correction.",
  "Revalider apres correction si la fiche est conforme."
].forEach((text, index) => addNumber(index + 1, text));

addPage("Carte GPS, QR code et anomalies");
addHeading("Carte GPS");
addBullet("La carte affiche uniquement les poteaux avec coordonnees GPS valides.");
addBullet("Les poteaux sans latitude/longitude ou avec 0/0 sont masques pour eviter les points dans la mer.");
addBullet("Vert: poteau valide.");
addBullet("Orange: pose en attente de validation.");
addBullet("Rouge: anomalie.");
addBullet("Survol: information courte. Clic: details complets du poteau.");

addHeading("QR code");
addBullet("Le QR code identifie physiquement le poteau.");
addBullet("Il doit etre genere avec le code texte du poteau et colle sur le poteau.");
addBullet("Le technicien, le controleur et l'admin peuvent scanner le QR code pour verifier le poteau.");

addHeading("Anomalies");
addBullet("L'anomalie est declaree par le controleur ou l'admin.");
addBullet("Elle doit contenir un motif clair.");
addBullet("Apres correction terrain, la fiche revient en attente de validation.");

addPage("Rapports PDF, securite et bonnes pratiques");
addHeading("Rapports PDF");
addBullet("Les fiches PDF contiennent les informations de pose, GPS, photos, signatures et observations.");
addBullet("Le rapport projet est disponible apres cloture validee par l'admin.");
addBullet("Le rapport projet utilise uniquement la derniere photo Apres implantation par poteau.");
addBullet("Le rapport peut etre telecharge ou imprime pour l'attachement.");

addHeading("Assistant intelligent et navigation");
addBullet("L'onglet Assistant analyse les donnees chargees et propose les priorites selon le role connecte.");
addBullet("Il signale les demandes stock, retards planning, clotures, anomalies, photos finales manquantes, ventes et synchronisations en attente.");
addBullet("La recherche globale comprend les codes poteaux, projets, equipes, clients et ventes.");
addBullet("Le bouton Retour en haut de l'interface revient a la page precedente autorisee.");

addHeading("Securite");
addBullet("Les comptes sont crees par l'admin depuis Admin Utilisateurs.");
addBullet("L'inscription publique est desactivee par defaut.");
addBullet("Les mots de passe forts sont obligatoires pour les nouveaux comptes.");
addBullet("Les exports CSV, PDF et JSON doivent etre conserves dans un emplacement controle.");
addBullet("Les actions sensibles sont tracees dans le journal d'audit.");

addHeading("Bonnes pratiques");
addBullet("Toujours scanner le QR code avant implantation.");
addBullet("Verifier la position GPS avant d'enregistrer.");
addBullet("Ne pas cloturer un projet avec anomalie ouverte.");
addBullet("Ne pas partager les comptes utilisateurs.");
addBullet("Mettre a jour la photo et les informations dans Mon profil.");

if (lines.length) pages.push(lines);

function pdfEscape(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function encodePdfText(value) {
  return pdfEscape(String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

const objects = [];
function obj(content) {
  objects.push(content);
  return objects.length;
}

const fontRegular = obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const fontBold = obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
const pageRefs = [];

for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
  const content = [];
  content.push("BT");
  content.push("50 790 Td");
  let y = 790;
  for (const item of pages[pageIndex]) {
    const size = item.size || 10;
    const gap = item.gap || 4;
    if (!item.text) {
      y -= gap;
      content.push(`0 -${gap} Td`);
      continue;
    }
    content.push(`/${item.bold ? "F2" : "F1"} ${size} Tf`);
    content.push(`(${encodePdfText(item.text)}) Tj`);
    const move = size + gap;
    y -= move;
    content.push(`0 -${move} Td`);
  }
  content.push("ET");
  content.push("BT /F1 8 Tf 50 32 Td");
  content.push(`(Page ${pageIndex + 1} / ${pages.length} - SuiviPoteaux Pro) Tj`);
  content.push("ET");
  const stream = content.join("\n");
  const contentRef = obj(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  const pageRef = obj(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentRef} 0 R >>`);
  pageRefs.push(pageRef);
}

const pagesRef = obj(`<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`);
const catalogRef = obj(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);

for (const pageRef of pageRefs) {
  objects[pageRef - 1] = objects[pageRef - 1].replace("/Parent 0 0 R", `/Parent ${pagesRef} 0 R`);
}

let pdf = "%PDF-1.4\n";
const offsets = [0];
for (let index = 0; index < objects.length; index++) {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
}
const xrefOffset = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (let index = 1; index < offsets.length; index++) {
  pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

fs.writeFileSync(output, Buffer.from(pdf, "latin1"));
console.log(output);

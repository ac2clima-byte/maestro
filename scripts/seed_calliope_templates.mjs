// seed_calliope_templates.mjs — seed 3 template in calliope_template.
import admin from "firebase-admin";
admin.initializeApp({ projectId: "nexo-hub-15f2d" });
const db = admin.firestore();

const TEMPLATES = [
  {
    id: "risposta_cliente_standard",
    nome: "Risposta cliente standard",
    tipo: "risposta_email",
    tono: "cordiale",
    descrizione: "Template base per risposta email a clienti/condomini.",
    struttura: [
      "Saluto formale ma caldo",
      "Ringraziamento per la segnalazione / email",
      "Risposta/azione proposta con placeholder per dettagli",
      "Richiesta di conferma o chiarimenti se servono",
      "Firma Alberto Contardi / ACG Clima Service",
    ],
    variabili: ["destinatario", "oggetto_originale", "azione_proposta"],
    esempio:
      "Gentile [Nome],\n\ngrazie per la sua comunicazione. Riguardo [oggetto], " +
      "le confermo che procederemo con [azione proposta]. Resto a disposizione " +
      "per qualsiasi chiarimento.\n\nCordiali saluti,\nAlberto Contardi\nACG Clima Service",
  },
  {
    id: "sollecito_pagamento",
    nome: "Sollecito pagamento",
    tipo: "sollecito",
    tono: "a_3_livelli",
    descrizione: "Sollecito in 3 livelli di intensità (cortese → formale → ultimo avviso).",
    livelli: {
      cortese:
        "Gentile [Cliente],\n\nle segnalo cordialmente che risulta ancora aperta la " +
        "fattura n. [numero] del [data] di € [importo]. Se ha già provveduto, " +
        "ignori questo messaggio. Altrimenti, può farci avere copia del bonifico?\n\n" +
        "Grazie,\nAlberto Contardi",
      formale:
        "Spett.le [Cliente],\n\nle ricordiamo che a oggi non risulta saldata la " +
        "fattura n. [numero] del [data], importo € [importo]. La preghiamo di " +
        "provvedere al pagamento entro 10 giorni lavorativi.\n\n" +
        "Distinti saluti,\nACG Clima Service",
      ultimo_avviso:
        "Spett.le [Cliente],\n\nnonostante i precedenti solleciti, non risulta " +
        "ancora pervenuto il pagamento della fattura n. [numero] del [data], " +
        "importo € [importo]. In assenza di riscontro entro 7 giorni, saremo " +
        "costretti a procedere per vie legali.\n\n" +
        "Distinti saluti,\nACG Clima Service S.R.L.",
    },
    variabili: ["cliente", "numero_fattura", "data_fattura", "importo"],
  },
  {
    id: "comunicazione_condominio",
    nome: "Comunicazione al condominio",
    tipo: "comunicazione",
    tono: "formale_lineare",
    descrizione: "Comunicazione formale al condominio (avvisi, manutenzioni, cambi ora).",
    struttura: [
      "Intestazione formale (Spett.le Condominio)",
      "Indicazione amministratore (se noto)",
      "Oggetto chiaro",
      "Corpo lineare, punti numerati",
      "Data/ora eventuali interventi con placeholder",
      "Firma ACG Clima Service",
    ],
    variabili: ["condominio", "amministratore", "oggetto", "data_intervento"],
    esempio:
      "Spett.le Condominio [nome]\nc.a. Amministratore [nome]\n\n" +
      "Oggetto: [oggetto]\n\n" +
      "Con la presente comunichiamo che il giorno [data] verranno eseguiti " +
      "i seguenti interventi:\n1. [...]\n2. [...]\n\n" +
      "Per qualsiasi chiarimento restiamo a disposizione al numero 0131 xxx yyy.\n\n" +
      "Distinti saluti,\nACG Clima Service",
  },
];

async function seed() {
  let created = 0, updated = 0;
  for (const t of TEMPLATES) {
    const ref = db.collection("calliope_template").doc(t.id);
    const snap = await ref.get();
    await ref.set({
      ...t,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    }, { merge: true });
    if (snap.exists) updated++; else created++;
  }
  console.log(`✅ calliope_template: ${created} creati, ${updated} aggiornati`);
}

seed().catch(e => { console.error(e); process.exit(1); });

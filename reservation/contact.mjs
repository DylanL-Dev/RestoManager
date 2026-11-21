// Missing policy means an older server: retain its required-email contract.
export const requiresEmail=profile=>profile?.emailRequired!==false;
export function contactForSubmission(contact,profile){const value={...contact};if(!requiresEmail(profile))delete value.email;return value;}
export function effectivePrivacyNotice(text,profile){
 const value=String(text||'');if(requiresEmail(profile))return value.replace('Prénom et nom sont nécessaires pour traiter et retrouver la demande. Sans eux, la réservation en ligne ne peut pas être enregistrée. L’adresse email n’est pas demandée tant que l’envoi des emails est désactivé. Si cet envoi est activé ultérieurement, l’adresse email sera nécessaire pour recevoir les confirmations.','Prénom, nom et email sont nécessaires pour traiter et retrouver la demande. Sans eux, la réservation en ligne ne peut pas être enregistrée.');
 // Adapt only our known standard sentence; keep custom legal paragraphs verbatim.
 return value.replace('Prénom, nom et email sont nécessaires pour traiter et retrouver la demande. Sans eux, la réservation en ligne ne peut pas être enregistrée.','Prénom et nom sont nécessaires pour traiter et retrouver la demande. Sans eux, la réservation en ligne ne peut pas être enregistrée. L’adresse email n’est pas demandée tant que l’envoi des emails est désactivé.');
}

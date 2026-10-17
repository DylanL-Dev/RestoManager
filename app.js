'use strict';

/* ==============================
   CONFIGURATION
============================== */

const TABLES = ReservationEngine.TABLES;
const CAPACITY = ReservationEngine.CAPACITY;
const STATUS = ReservationEngine.STATUS;

const STORAGE_RESERVATIONS = 'restomanager_reservations';
const STORAGE_HISTORY = 'restomanager_history';
const unreadableStorage = new Set();

let reservations = ReservationEngine.normalizeReservations(
    loadData(STORAGE_RESERVATIONS, [])
);
let history = normalizeHistory(loadData(STORAGE_HISTORY, []));

let editingId = null;

/* ==============================
   DÉMARRAGE
============================== */
function normalizeHistory(rawHistory) {
    return Array.isArray(rawHistory)
        ? rawHistory
              .filter(function (day) {
                  return day && typeof day.date === 'string';
              })
              .map(function (day) {
                  return Object.assign({}, day, {
                      reservations: ReservationEngine.normalizeReservations(
                          day.reservations
                      ),
                  });
              })
        : [];
}

function getServiceDate() {
    const date = new Date();
    if (date.getHours() < 1) {
        date.setDate(date.getDate() - 1);
    }
    return formatDateValue(date);
}

function archiveReservationsBefore(serviceDate) {
    const anciennes = reservations.filter(function (r) {
        return r.date < serviceDate;
    });

    if (anciennes.length === 0) {
        return false;
    }

    const groupes = {};

    anciennes.forEach(function (r) {
        if (!groupes[r.date]) {
            groupes[r.date] = [];
        }

        groupes[r.date].push(r);
    });

    const nextHistory = history.map(function (day) {
        return Object.assign({}, day, { reservations: day.reservations.slice() });
    });
    Object.keys(groupes).forEach(function (date) {
        const existing = nextHistory.find(function (day) { return day.date === date; });
        if (existing) {
            const ids = new Set(existing.reservations.map(function (r) { return r.id; }));
            existing.reservations = existing.reservations.concat(
                groupes[date].filter(function (r) { return !ids.has(r.id); })
            );
        } else {
            nextHistory.push({ date: date, reservations: groupes[date], closedAt: new Date().toISOString() });
        }
    });

    const nextReservations = reservations.filter(function (r) {
        return r.date >= serviceDate;
    });

    if (!saveNormalizedData(nextReservations, nextHistory)) return false;
    reservations = nextReservations;
    history = nextHistory;
    return true;
}

function nettoyerAnciennesReservations() {
    return archiveReservationsBefore(getServiceDate());
}
document.addEventListener('DOMContentLoaded', function () {
    if (unreadableStorage.size) {
        alert('Certaines données enregistrées sont illisibles. Leur contenu a été conservé : rétablissez une sauvegarde valide avant de les modifier.');
    } else if (saveNormalizedData()) {
        nettoyerAnciennesReservations();
    }

    setDefaultDateTime();

    afficherDateHeure();

    afficherTables();

    afficherSelectionTables();

    afficherReservations();

    mettreAJourCompteurs();

    configurerEvenements();

    setInterval(afficherDateHeure, 1000);
    setInterval(function () {
        if (nettoyerAnciennesReservations()) refreshUI();
    }, 60000);
});

/* ==============================
   STOCKAGE
============================== */

function loadData(key, defaultValue) {
    try {
        const data = localStorage.getItem(key);

        if (data !== null) {
            const parsed = JSON.parse(data);
            if (Array.isArray(defaultValue) && !Array.isArray(parsed)) throw new Error('Format de données invalide.');
            return parsed;
        }
    } catch (error) {
        unreadableStorage.add(key);
        console.error('Erreur stockage :', error);
    }

    return defaultValue;
}

function saveData(key, data) {
    if (unreadableStorage.has(key)) {
        alert('Les données enregistrées sont illisibles et ont été conservées. Rétablissez une sauvegarde valide avant de les modifier.');
        return false;
    }
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Erreur sauvegarde :', error);

        alert('Impossible de sauvegarder les données.');
        return false;
    }
}

function saveNormalizedData(nextReservations = reservations, nextHistory = history) {
    if (unreadableStorage.has(STORAGE_RESERVATIONS) || unreadableStorage.has(STORAGE_HISTORY)) {
        alert('Les données illisibles ont été conservées. Rétablissez une sauvegarde valide avant de les modifier.');
        return false;
    }
    let previousHistory;
    try {
        previousHistory = localStorage.getItem(STORAGE_HISTORY);
    } catch (error) {
        console.error('Erreur stockage :', error);
        alert('Impossible de lire les données avant leur sauvegarde.');
        return false;
    }
    // Persist the archive before removing anything from the active service.
    if (!saveData(STORAGE_HISTORY, nextHistory)) return false;
    if (!saveData(STORAGE_RESERVATIONS, nextReservations)) {
        try {
            if (previousHistory === null) localStorage.removeItem(STORAGE_HISTORY);
            else localStorage.setItem(STORAGE_HISTORY, previousHistory);
        } catch (error) {
            console.error('Erreur restauration historique :', error);
            alert('La restauration de l’historique a échoué. Les données restent disponibles en mémoire ; conservez cette page ouverte.');
        }
        return false;
    }
    return true;
}

function refreshUI() {
    afficherTables();
    afficherReservations();
    mettreAJourCompteurs();
    rechercherReservation();
}

/* ==============================
   DATE / HEURE
============================== */

function getToday() {
    return formatDateValue(new Date());
}

function formatDateValue(date) {

    const year = date.getFullYear();

    const month = String(date.getMonth() + 1).padStart(2, '0');

    const day = String(date.getDate()).padStart(2, '0');

    return year + '-' + month + '-' + day;
}

function getCurrentTime() {
    const date = new Date();

    const hours = String(date.getHours()).padStart(2, '0');

    const minutes = String(date.getMinutes()).padStart(2, '0');

    return hours + ':' + minutes;
}

function setDefaultDateTime() {
    document.getElementById('reservationDate').value = getToday();

    document.getElementById('reservationTime').value = getCurrentTime();
}

function afficherDateHeure() {
    const now = new Date();

    document.getElementById('currentDate').textContent =
        now.toLocaleDateString('fr-FR');

    document.getElementById('currentTime').textContent = now.toLocaleTimeString(
        'fr-FR',
        {
            hour: '2-digit',
            minute: '2-digit',
        }
    );
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');

    return date.toLocaleDateString('fr-FR');
}

/* ==============================
   ÉVÉNEMENTS
============================== */

function configurerEvenements() {
    document
        .getElementById('newReservationBtn')
        .addEventListener('click', function () {
            nouvelleReservation();
        });

    document
        .getElementById('closeModalBtn')
        .addEventListener('click', fermerReservation);

    document
        .getElementById('cancelReservationBtn')
        .addEventListener('click', fermerReservation);

    document
        .getElementById('clientType')
        .addEventListener('change', changerTypeClient);

    document
        .getElementById('reservationForm')
        .addEventListener('submit', enregistrerReservation);

    document
        .getElementById('historyBtn')
        .addEventListener('click', afficherHistorique);

    document
        .getElementById('closeHistoryBtn')
        .addEventListener('click', function () {
            document.getElementById('historyModal').classList.add('hidden');
        });

    document
        .getElementById('closeDetailsBtn')
        .addEventListener('click', function () {
            document.getElementById('detailsModal').classList.add('hidden');
        });

    document
        .getElementById('closeServiceBtn')
        .addEventListener('click', cloturerService);

    document
        .getElementById('reservationSearch')
        .addEventListener('input', rechercherReservation);

    document
        .getElementById('clearSearchBtn')
        .addEventListener('click', effacerRecherche);

    document.getElementById('adminBtn').addEventListener('click', ouvrirAdministration);
    document.getElementById('closeAdminBtn').addEventListener('click', fermerAdministration);
    document.getElementById('resetTestDataBtn').addEventListener('click', reinitialiserDonneesTest);

    ['reservationDate', 'reservationTime', 'reservationDuration'].forEach(function (id) {
        document.getElementById(id).addEventListener('change', function () {
            afficherSelectionTables(getSelectedTables());
        });
    });
}

/* ==============================
   TYPE CLIENT
============================== */

function changerTypeClient() {
    const type = document.getElementById('clientType').value;

    const label = document.getElementById('clientLabel');

    const input = document.getElementById('clientInfo');

    if (type === 'hotel') {
        label.textContent = 'Numéro de chambre';

        input.placeholder = 'Ex : 214';
    } else {
        label.textContent = 'Nom du client';

        input.placeholder = 'Ex : Mme Dupont';
    }
}

/* ==============================
   TABLES
============================== */

function getTableStatus(table) {
    const tableReservations = reservations.filter(function (r) {
        return (
            r.date === getServiceDate() &&
            r.tables.includes(table) &&
            ReservationEngine.isBlocking(r)
        );
    });

    if (tableReservations.length === 0) {
        return 'free';
    }

    if (tableReservations.some(function (r) { return r.status === STATUS.SEATED; })) {
        return 'occupied';
    }

    return 'reserved';
}

function texteStatut(status) {
    const labels = {
        free: '🟢 Libre', reserved: '🟡 Réservée', confirmed: '🟡 Confirmée',
        late: '🟠 En retard', arrived: '🟣 Arrivée', seated: '🔴 Installée',
        occupied: '🔴 Occupée', completed: '⚪ Terminée', cancelled: '⚪ Annulée', no_show: '⚪ No-show',
        released: '⚪ Libérée',
    };
    return labels[status] || '⚪ Inconnu';
}

function afficherTables() {
    const grid = document.getElementById('tablesGrid');

    grid.innerHTML = '';

    TABLES.forEach(function (table) {
        const status = getTableStatus(table);

        const element = document.createElement('div');

        element.className = 'table-card ' + status;

        element.innerHTML = `
            <div class="table-number">
                Table ${table}
            </div>

            <div class="table-capacity">
                ${CAPACITY[table]} place${CAPACITY[table] > 1 ? 's' : ''}
            </div>

            <div class="table-status">
                ${texteStatut(status)}
            </div>
        `;

        element.addEventListener('click', function () {
            cliquerTable(table);
        });

        grid.appendChild(element);
    });
}

/* ==============================
   SÉLECTION TABLES
============================== */

function afficherSelectionTables(selected) {
    selected = selected || [];

    const container = document.getElementById('tableSelection');

    container.innerHTML = '';

    TABLES.forEach(function (table) {
        const element = document.createElement('div');

        element.className = 'table-option';
        element.setAttribute('data-table-number', String(table));

        if (selected.includes(table)) {
            element.classList.add('selected');
        }

        const draft = getReservationDraft(selected.concat([table]));
        const validation = ReservationEngine.validate(draft, reservations, editingId);

        if (!validation.valid && validation.conflict && !selected.includes(table)) {
            element.classList.add('disabled');
        }

        const planTable = FloorPlan.get().tables.find(t => t.number === table);
        const room = FloorPlan.get().rooms.find(r => r.id === planTable?.roomId);
        element.textContent = FloorPlan.label(table) + (room && room.id !== 'main' ? ' · ' + room.name : '');

        element.addEventListener('click', function () {
            if (element.classList.contains('disabled')) {
                return;
            }

            element.classList.toggle('selected');
        });

        container.appendChild(element);
    });
}

function getSelectedTables() {
    const elements = document.querySelectorAll('#tableSelection .selected');

    return Array.from(elements).map(function (element) {
        return Number(element.getAttribute('data-table-number'));
    });
}

function getReservationDraft(tables) {
    return {
        id: editingId || '',
        client: document.getElementById('clientInfo').value.trim() || 'temporaire',
        date: document.getElementById('reservationDate').value,
        time: document.getElementById('reservationTime').value,
        guests: Number(document.getElementById('guestNumber').value) || 1,
        duration: Number(document.getElementById('reservationDuration').value) || ReservationEngine.DEFAULT_DURATION,
        tables: tables,
        status: STATUS.RESERVED,
    };
}

/* ==============================
   NOUVELLE RÉSERVATION
============================== */

function nouvelleReservation(selectedTables) {
    editingId = null;

    document.getElementById('reservationForm').reset();

    document.getElementById('clientType').value = 'hotel';
    document.getElementById('reservationDuration').value = '90';

    setDefaultDateTime();

    changerTypeClient();

    afficherSelectionTables(selectedTables || []);

    document.getElementById('reservationModal').classList.remove('hidden');
}

function fermerReservation() {
    document.getElementById('reservationModal').classList.add('hidden');

    editingId = null;
}

/* ==============================
   ENREGISTREMENT
============================== */

function enregistrerReservation(event) {
    event.preventDefault();

    const type = document.getElementById('clientType').value;

    const client = document.getElementById('clientInfo').value.trim();

    const date = document.getElementById('reservationDate').value;

    const time = document.getElementById('reservationTime').value;

    const guests = Number(document.getElementById('guestNumber').value);

    const duration = Number(
        document.getElementById('reservationDuration').value
    );

    const tables = getSelectedTables();

    if (!client) {
        alert("Merci d'indiquer le client.");

        return;
    }

    if (!date || !time) {
        alert("Merci d'indiquer la date et l'heure.");

        return;
    }

    if (guests < 1) {
        alert('Le nombre de personnes doit être supérieur à 0.');

        return;
    }

    if (tables.length === 0) {
        alert('Merci de sélectionner au moins une table.');

        return;
    }

    const candidate = { id: editingId || '', type: type, client: client, date: date, time: time,
        guests: guests, duration: duration, tables: tables, status: STATUS.RESERVED };
    const validation = ReservationEngine.validate(candidate, reservations, editingId);
    if (!validation.valid) {
        alert('⚠️ ' + validation.errors.join('\n'));
        return;
    }

    const wasEditing = !!editingId;
    let nextReservations;
    if (wasEditing) {
        nextReservations = modifierReservation(type, client, date, time, guests, duration, tables);
        if (!nextReservations) return;
    } else {
        nextReservations = reservations.concat({
            id: Date.now().toString(),

            type: type,

            client: client,

            date: date,

            time: time,

            guests: guests,

            duration: duration,

            tables: tables,

            status: STATUS.RESERVED,

            createdAt: new Date().toISOString(),
        });
    }

    if (!saveData(STORAGE_RESERVATIONS, nextReservations)) return;
    reservations = nextReservations;

    fermerReservation();

    afficherTables();

    afficherReservations();

    mettreAJourCompteurs();

    alert(
        wasEditing ? '✅ Réservation modifiée.' : '✅ Réservation enregistrée.'
    );

    editingId = null;
}

/* ==============================
   CONFLITS
============================== */

function timeToMinutes(date, time) {
    const parts = time.split(':');

    const hours = Number(parts[0]);

    const minutes = Number(parts[1]);

    const base = new Date(date + 'T00:00:00');

    return base.getTime() / 60000 + hours * 60 + minutes;
}

function conflitReservation(tables, date, time, duration, ignoredId) {
    return !ReservationEngine.validate({ client: 'validation', date: date, time: time,
        guests: 1, duration: duration, tables: tables, status: STATUS.RESERVED }, reservations, ignoredId).valid;
}

/* ==============================
   LISTE RÉSERVATIONS
============================== */

function afficherReservations() {
    const container = document.getElementById('reservationsList');

    container.innerHTML = '';

    const todayReservations = reservations
        .filter(function (r) {
            return r.date === getServiceDate();
        })
        .sort(function (a, b) {
            return a.time.localeCompare(b.time);
        });

    if (todayReservations.length === 0) {
        container.innerHTML = `
            <div class="empty-message">
                Aucune réservation pour aujourd'hui.
            </div>
        `;

        return;
    }

    todayReservations.forEach(function (reservation) {
        const card = document.createElement('div');

        card.className = 'reservation-card';
        card.dataset.reservationId = reservation.id;

        const client =
            reservation.type === 'hotel'
                ? '🏨 Chambre ' + escapeHTML(reservation.client)
                : '👤 ' + escapeHTML(reservation.client);

        let actions = '';

        if ([STATUS.RESERVED, STATUS.CONFIRMED, STATUS.LATE].includes(reservation.status)) {
            actions += `
                    <button
                        class="btn-success"
                        onclick="clientArrive('${reservation.id}')">
                        👋 Client arrivé
                    </button>
                    <button onclick="declarerRetard('${reservation.id}')">⏱️ Retard</button>
                    <button onclick="declarerNoShow('${reservation.id}')">🚫 No-show</button>
                `;
        }

        if (reservation.status === STATUS.ARRIVED) {
            actions += `<button class="btn-success" onclick="installerClient('${reservation.id}')">🪑 Installer</button>`;
        }

        if (reservation.status === STATUS.SEATED) {
            actions += `
                    <button
                        class="btn-success"
                        onclick="libererTables('${reservation.id}')">
                        🆓 Libérer les tables
                    </button>
                    <button onclick="prolongerReservation('${reservation.id}')">⏱️ Prolonger</button>
                `;
        }

        const canCancel = [STATUS.RESERVED, STATUS.CONFIRMED, STATUS.LATE, STATUS.ARRIVED].includes(reservation.status);
        const managementActions = `<button onclick="supprimerReservationDefinitivement('${reservation.id}')">🗑️ Supprimer définitivement</button>`;
        card.innerHTML = `
                <div class="reservation-header">

                    <div>

                        <div class="reservation-time">
                            ${reservation.time}
                        </div>

                        <div class="reservation-client">
                            ${client}
                        </div>

                        <div class="reservation-info">
                            👥 ${reservation.guests}
                            personne${reservation.guests > 1 ? 's' : ''}
                        </div>

                        <div class="reservation-info">
                            🪑
                            ${reservation.tables
                                .map(function (t) {
                                    return FloorPlan.label(t);
                                })
                                .join(', ')}
                        </div>

                        <div class="reservation-info">
                            ⏱️
                            ${formatDuration(reservation.duration)}
                            ·
                            ${texteStatut(reservation.status)}
                        </div>

                    </div>

                </div>

                <div class="reservation-actions">

                    ${actions}

                    <button
                        onclick="modifierReservationDepuisListe('${reservation.id}')">
                        ✏️ Modifier
                    </button>

                    <button
                        onclick="voirReservation('${reservation.id}')">
                        👁️ Détails
                    </button>

                    ${canCancel ? `<button
                        onclick="supprimerReservation('${reservation.id}')">
                        🚫 Annuler
                    </button>` : ''}
                    ${managementActions}

                </div>
            `;

        container.appendChild(card);
    });
}

/* ==============================
   ARRIVÉE CLIENT
============================== */

function clientArrive(id) {
    changerStatut(id, STATUS.ARRIVED);
}

function installerClient(id) {
    changerStatut(id, STATUS.SEATED);
}

function declarerRetard(id) {
    changerStatut(id, STATUS.LATE);
}

function declarerNoShow(id) {
    if (!confirm('Déclarer ce client absent (no-show) et libérer ses tables ?')) return;
    changerStatut(id, STATUS.NO_SHOW);
}

function changerStatut(id, status) {
    const reservation = reservations.find(function (r) {
        return r.id === id;
    });

    if (!reservation) {
        return;
    }

    const transition = ReservationEngine.transition(reservation, status);
    if (!transition.valid) {
        alert('⚠️ ' + transition.error);
        return;
    }
    const nextReservations = reservations.map(function (r) {
        return r.id === id ? transition.reservation : r;
    });
    if (!saveData(STORAGE_RESERVATIONS, nextReservations)) return;
    reservations = nextReservations;
    refreshUI();
}

/* ==============================
   LIBÉRATION
============================== */

function libererTables(id) {
    const reservation = reservations.find(function (r) {
        return r.id === id;
    });

    if (!reservation) {
        return;
    }

    const tables = reservation.tables
        .map(function (t) {
            return FloorPlan.label(t);
        })
        .join(', ');

    if (!confirm('Libérer les tables ' + tables + ' ?')) {
        return;
    }

    changerStatut(id, STATUS.COMPLETED);
}

function prolongerReservation(id) {
    const reservation = reservations.find(function (r) { return r.id === id; });
    if (!reservation) return;
    const value = prompt('Ajouter combien de minutes ? (ex. 30)', '30');
    if (value === null) return;
    const result = ReservationEngine.extend(reservation, Number(value), reservations);
    if (!result.valid) {
        alert('⚠️ ' + result.error);
        return;
    }
    const nextReservations = reservations.map(function (r) {
        return r.id === id ? Object.assign({}, result.reservation, { extendedAt: new Date().toISOString() }) : r;
    });
    if (!saveData(STORAGE_RESERVATIONS, nextReservations)) return;
    reservations = nextReservations;
    refreshUI();
}

/* ==============================
   MODIFICATION
============================== */

function modifierReservationDepuisListe(id) {
    const reservation = reservations.find(function (r) {
        return r.id === id;
    });

    if (!reservation) {
        return;
    }

    editingId = id;

    document.getElementById('clientType').value = reservation.type;

    document.getElementById('clientInfo').value = reservation.client;

    document.getElementById('reservationDate').value = reservation.date;

    document.getElementById('reservationTime').value = reservation.time;

    document.getElementById('guestNumber').value = reservation.guests;

    document.getElementById('reservationDuration').value = reservation.duration;

    changerTypeClient();

    afficherSelectionTables(reservation.tables);

    document.getElementById('reservationModal').classList.remove('hidden');
}

function modifierReservation(
    type,
    client,
    date,
    time,
    guests,
    duration,
    tables
) {
    const reservation = reservations.find(function (r) {
        return r.id === editingId;
    });

    if (!reservation) {
        return null;
    }

    return reservations.map(function (r) {
        return r.id === editingId
            ? Object.assign({}, r, { type: type, client: client, date: date, time: time, guests: guests, duration: duration, tables: tables })
            : r;
    });
}

/* ==============================
   SUPPRESSION
============================== */

function supprimerReservation(id) {
    if (!confirm('Annuler cette réservation ? Elle restera dans l’historique du service.')) {
        return;
    }
    changerStatut(id, STATUS.CANCELLED);
}

function supprimerReservationDefinitivement(id) {
    const reservation = reservations.find(function (r) { return r.id === id; });
    if (!reservation) return;
    if (!confirm('Supprimer définitivement cette réservation ? Cette action est irréversible.')) return;
    if (!confirm('Confirmez la suppression définitive de ' + reservation.client + '.')) return;
    const nextReservations = reservations.filter(function (r) { return r.id !== id; });
    if (!saveData(STORAGE_RESERVATIONS, nextReservations)) return;
    reservations = nextReservations;
    refreshUI();
}

/* ==============================
   OUTILS DE GESTION
============================== */

function ouvrirAdministration() {
    document.getElementById('adminModal').classList.remove('hidden');
}

function fermerAdministration() {
    document.getElementById('adminModal').classList.add('hidden');
}

function reinitialiserDonneesTest() {
    if (!confirm('Réinitialiser toutes les réservations et tout l’historique de test ?')) return;
    if (!confirm('Confirmez : la configuration des tables sera conservée.')) return;
    if (!saveNormalizedData([], [])) return;
    reservations = [];
    history = [];
    refreshUI();
}

/* ==============================
   DÉTAILS
============================== */

function voirReservation(id) {
    const reservation = reservations.find(function (r) {
        return r.id === id;
    });

    if (!reservation) {
        return;
    }

    const client =
        reservation.type === 'hotel'
            ? '🏨 Chambre ' + escapeHTML(reservation.client)
            : '👤 ' + escapeHTML(reservation.client);

    document.getElementById('reservationDetails').innerHTML = `

        <div class="detail-row">
            <div class="detail-label">
                Client
            </div>
            <div class="detail-value">
                ${client}
            </div>
        </div>

        <div class="detail-row">
            <div class="detail-label">
                Date
            </div>
            <div class="detail-value">
                ${formatDate(reservation.date)}
            </div>
        </div>

        <div class="detail-row">
            <div class="detail-label">
                Heure
            </div>
            <div class="detail-value">
                ${reservation.time}
            </div>
        </div>

        <div class="detail-row">
            <div class="detail-label">
                Nombre de personnes
            </div>
            <div class="detail-value">
                ${reservation.guests}
            </div>
        </div>

        <div class="detail-row">
            <div class="detail-label">
                Tables
            </div>
            <div class="detail-value">
                ${reservation.tables
                    .map(function (t) {
                        return 'Table ' + FloorPlan.label(t).slice(1);
                    })
                    .join(', ')}
            </div>
        </div>

        <div class="detail-row">
            <div class="detail-label">
                Durée prévue
            </div>
            <div class="detail-value">
                ${formatDuration(reservation.duration)}
            </div>
        </div>

        <div class="detail-row">
            <div class="detail-label">
                Statut
            </div>
            <div class="detail-value">
                ${texteStatut(reservation.status)}
            </div>
        </div>
    `;

    document.getElementById('detailsModal').classList.remove('hidden');

    const reservationElement = document.querySelector(
        '[data-reservation-id="' + reservation.id + '"]'
    );

    if (reservationElement) {
        reservationElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });

        reservationElement.classList.add('reservation-highlight');

        setTimeout(function () {
            reservationElement.classList.remove('reservation-highlight');
        }, 6000);
    }
}

function cliquerTable(table) {
    const reservation = reservations.find(function (r) {
        return (
            r.date === getServiceDate() &&
            r.tables.includes(table) &&
            ReservationEngine.isBlocking(r)
        );
    });

    if (!reservation) {
        nouvelleReservation([table]);
        return;
    }

    voirReservation(reservation.id);
}

/* ==============================
   COMPTEURS
============================== */

function mettreAJourCompteurs() {
    const list = reservations.filter(function (r) {
        return r.date === getServiceDate() && ReservationEngine.isBlocking(r);
    });

    document.getElementById('reservationCount').textContent = list.length;

    document.getElementById('guestCount').textContent = list.reduce(function (
        total,
        r
    ) {
        return total + Number(r.guests);
    }, 0);

    const occupied = TABLES.filter(function (table) {
        return getTableStatus(table) === 'occupied';
    }).length;

    const reserved = TABLES.filter(function (table) {
        return getTableStatus(table) === 'reserved';
    }).length;

    document.getElementById('occupiedCount').textContent = occupied;

    document.getElementById('freeCount').textContent =
        TABLES.length - occupied - reserved;
}

/* ==============================
   HISTORIQUE
============================== */

function afficherHistorique() {
    const container = document.getElementById('historyList');

    container.innerHTML = '';

    if (history.length === 0) {
        container.innerHTML = `
            <div class="empty-message">
                Aucun historique disponible.
            </div>
        `;
    } else {
        history
            .slice()
            .sort(function (a, b) {
                return b.date.localeCompare(a.date);
            })
            .forEach(function (day) {
                const element = document.createElement('div');

                element.className = 'history-item';

                const clients = day.reservations.reduce(function (total, r) {
                    return total + Number(r.guests || 0);
                }, 0);

                element.innerHTML = `
                    <strong>
                        📅 ${formatDate(day.date)}
                    </strong>

                    <div>
                        ${day.reservations.length}
                        réservation${day.reservations.length > 1 ? 's' : ''}
                    </div>

                    <div>
                        👥 ${clients} clients
                    </div>
                `;

                container.appendChild(element);
            });
    }

    document.getElementById('historyModal').classList.remove('hidden');
}

/* ==============================
   CLÔTURE DU SERVICE
============================== */

function cloturerService() {
    const todayReservations = reservations.filter(function (r) {
        return r.date === getServiceDate();
    });

    if (todayReservations.length === 0) {
        alert("Il n'y a aucune réservation aujourd'hui.");

        return;
    }

    const confirmation = confirm(
        'Clôturer le service ?\n\n' +
            'Les réservations du jour seront archivées ' +
            'et la salle sera remise à zéro.\n\n' +
            "L'historique sera conservé."
    );

    if (!confirmation) {
        return;
    }

    const nextHistory = history.concat({
        date: getServiceDate(),

        reservations: todayReservations,

        closedAt: new Date().toISOString(),
    });

    const nextReservations = reservations.filter(function (r) {
        return r.date !== getServiceDate();
    });

    if (!saveNormalizedData(nextReservations, nextHistory)) return;
    reservations = nextReservations;
    history = nextHistory;

    afficherTables();
    afficherReservations();
    mettreAJourCompteurs();

    alert('✅ Service clôturé.');
}

/* ==============================
   DURÉE
============================== */

function formatDuration(minutes) {
    minutes = Number(minutes);

    const hours = Math.floor(minutes / 60);

    const mins = minutes % 60;

    if (mins === 0) {
        return hours + ' h';
    }

    return hours + ' h ' + mins + ' min';
}

/* ==============================
   SÉCURITÉ
============================== */

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ==============================
   RECHERCHE RÉSERVATION
============================== */

function rechercherReservation() {
    const searchInput = document.getElementById('reservationSearch');

    const results = document.getElementById('searchResults');

    const recherche = searchInput.value.trim().toLowerCase();

    results.innerHTML = '';

    if (!recherche) {
        return;
    }

    const correspondances = reservations.filter(function (reservation) {
        if (reservation.status === 'released') {
            return false;
        }

        const client = String(reservation.client).toLowerCase();

        return client.includes(recherche);
    });

    if (correspondances.length === 0) {
        results.innerHTML = `
            <div class="empty-message">
                ❌ Aucune réservation trouvée.
            </div>
        `;

        return;
    }

    correspondances.forEach(function (reservation) {
        const client =
            reservation.type === 'hotel'
                ? '🏨 Chambre ' + escapeHTML(reservation.client)
                : '👤 ' + escapeHTML(reservation.client);

        const tables = reservation.tables
            .map(function (table) {
                return FloorPlan.label(table);
            })
            .join(', ');

        const result = document.createElement('div');

        result.className = 'search-result';

        result.innerHTML = `
            <div class="search-result-client">
                ${client}
            </div>

            <div>
                🕐 ${reservation.time}
            </div>

            <div>
                👥 ${reservation.guests}
                personne${reservation.guests > 1 ? 's' : ''}
            </div>

            <div>
                🪑 <strong>${tables}</strong>
            </div>

            <div>
                ${texteStatut(reservation.status)}
            </div>

            <button type="button">
                👁️ Voir la réservation
            </button>
        `;

        result.querySelector('button').addEventListener('click', function () {
            voirReservation(reservation.id);
        });

        results.appendChild(result);
    });
}

function effacerRecherche() {
    document.getElementById('reservationSearch').value = '';

    document.getElementById('searchResults').innerHTML = '';
}


'use strict';

/* ==============================
   CONFIGURATION
============================== */

const TABLES = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 17, 18, 19, 20, 21, 22, 23, 24, 25,
];

const CAPACITY = {};

TABLES.forEach(function (table) {
    CAPACITY[table] = table === 25 ? 10 : 2;
});

const STORAGE_RESERVATIONS = 'restomanager_reservations';
const STORAGE_HISTORY = 'restomanager_history';

let reservations = loadData(STORAGE_RESERVATIONS, []);
let history = loadData(STORAGE_HISTORY, []);

let editingId = null;

/* ==============================
   DÉMARRAGE
============================== */
function nettoyerAnciennesReservations() {
    const today = getToday();

    const anciennes = reservations.filter(function (r) {
        return r.date < today;
    });

    if (anciennes.length === 0) {
        return;
    }

    const datesDejaArchivees = new Set(
        history.map(function (h) {
            return h.date;
        })
    );

    const groupes = {};

    anciennes.forEach(function (r) {
        if (!groupes[r.date]) {
            groupes[r.date] = [];
        }

        groupes[r.date].push(r);
    });

    Object.keys(groupes).forEach(function (date) {
        if (!datesDejaArchivees.has(date)) {
            history.push({
                date: date,
                reservations: groupes[date],
                closedAt: new Date().toISOString()
            });
        }
    });

    reservations = reservations.filter(function (r) {
        return r.date >= today;
    });

    saveData(STORAGE_RESERVATIONS, reservations);
    saveData(STORAGE_HISTORY, history);
}
document.addEventListener('DOMContentLoaded', function () {
    nettoyerAnciennesReservations();

    setDefaultDateTime();

    afficherDateHeure();

    afficherTables();

    afficherSelectionTables();

    afficherReservations();

    mettreAJourCompteurs();

    configurerEvenements();

    setInterval(afficherDateHeure, 1000);
});

/* ==============================
   STOCKAGE
============================== */

function loadData(key, defaultValue) {
    try {
        const data = localStorage.getItem(key);

        if (data) {
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Erreur stockage :', error);
    }

    return defaultValue;
}

function saveData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('Erreur sauvegarde :', error);

        alert('Impossible de sauvegarder les données.');
    }
}

/* ==============================
   DATE / HEURE
============================== */

function getToday() {
    const date = new Date();

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
        .addEventListener('click', nouvelleReservation);

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
    const reservation = reservations
    .find(function (r) {
        return r.date === getToday()
            && r.tables.includes(table)
            && r.status !== 'released';
    });

    if (!reservation) {
        return 'free';
    }

    if (reservation.status === 'occupied') {
        return 'occupied';
    }

    return 'reserved';
}

function texteStatut(status) {
    if (status === 'free') {
        return '🟢 Libre';
    }

    if (status === 'reserved') {
        return '🟡 Réservée';
    }

    return '🔴 Occupée';
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

        if (selected.includes(table)) {
            element.classList.add('selected');
        }

        const status = getTableStatus(table);

        if (status !== 'free' && !selected.includes(table)) {
            element.classList.add('disabled');
        }

        element.textContent = 'T' + table;

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
        return Number(element.textContent.substring(1));
    });
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

    if (tables.includes(25) && guests > 10) {
        alert('⚠️ La table 25 accepte au maximum 10 personnes.');
        return;
    }
    if (conflitReservation(tables, date, time, duration, editingId)) {
        alert('⚠️ Une table sélectionnée est déjà réservée à cet horaire.');

        return;
    }

    if (editingId) {
        modifierReservation(type, client, date, time, guests, duration, tables);
    } else {
        reservations.push({
            id: Date.now().toString(),

            type: type,

            client: client,

            date: date,

            time: time,

            guests: guests,

            duration: duration,

            tables: tables,

            status: 'reserved',

            createdAt: new Date().toISOString(),
        });
    }

    saveData(STORAGE_RESERVATIONS, reservations);

    fermerReservation();

    afficherTables();

    afficherReservations();

    mettreAJourCompteurs();

    alert(
        editingId ? '✅ Réservation modifiée.' : '✅ Réservation enregistrée.'
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
    const start = timeToMinutes(date, time);

    const end = start + duration;

    return reservations.some(function (reservation) {
        if (reservation.id === ignoredId) {
            return false;
        }

        if (reservation.date !== date) {
            return false;
        }

        if (reservation.status === 'released') {
            return false;
        }

        const sameTable = reservation.tables.some(function (table) {
            return tables.includes(table);
        });

        if (!sameTable) {
            return false;
        }

        const otherStart = timeToMinutes(reservation.date, reservation.time);

        const otherEnd = otherStart + Number(reservation.duration);

        return start < otherEnd && end > otherStart;
    });
}

/* ==============================
   LISTE RÉSERVATIONS
============================== */

function afficherReservations() {
    const container = document.getElementById('reservationsList');

    container.innerHTML = '';

    const todayReservations = reservations
        .filter(function (r) {
            return r.date === getToday();
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

        if (reservation.status === 'reserved') {
            actions += `
                    <button
                        class="btn-success"
                        onclick="clientArrive('${reservation.id}')">
                        👋 Client arrivé
                    </button>
                `;
        }

        if (reservation.status === 'occupied') {
            actions += `
                    <button
                        class="btn-success"
                        onclick="libererTables('${reservation.id}')">
                        🆓 Libérer les tables
                    </button>
                `;
        }

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
                                    return 'T' + t;
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

                    <button
                        onclick="supprimerReservation('${reservation.id}')">
                        🗑️ Supprimer
                    </button>

                </div>
            `;

        container.appendChild(card);
    });
}

/* ==============================
   ARRIVÉE CLIENT
============================== */

function clientArrive(id) {
    const reservation = reservations.find(function (r) {
        return r.id === id;
    });

    if (!reservation) {
        return;
    }

    reservation.status = 'occupied';

    reservation.arrivedAt = new Date().toISOString();

    saveData(STORAGE_RESERVATIONS, reservations);

    afficherTables();
    afficherReservations();
    mettreAJourCompteurs();
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
            return 'T' + t;
        })
        .join(', ');

    if (!confirm('Libérer les tables ' + tables + ' ?')) {
        return;
    }

    reservation.status = 'released';

    reservation.releasedAt = new Date().toISOString();

    saveData(STORAGE_RESERVATIONS, reservations);

    afficherTables();
    afficherReservations();
    mettreAJourCompteurs();
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
        return;
    }

    reservation.type = type;
    reservation.client = client;
    reservation.date = date;
    reservation.time = time;
    reservation.guests = guests;
    reservation.duration = duration;
    reservation.tables = tables;
}

/* ==============================
   SUPPRESSION
============================== */

function supprimerReservation(id) {
    if (!confirm('Supprimer cette réservation ?')) {
        return;
    }

    reservations = reservations.filter(function (r) {
        return r.id !== id;
    });

    saveData(STORAGE_RESERVATIONS, reservations);

    afficherTables();
    afficherReservations();
    mettreAJourCompteurs();
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
                        return 'Table ' + t;
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
            block: 'center'
        });

        reservationElement.classList.add('reservation-highlight');

        setTimeout(function () {
            reservationElement.classList.remove('reservation-highlight');
        }, 2500);
    }
}

 function cliquerTable(table) {
    const reservation = reservations
        .find(function (r) {
            return r.date === getToday()
                && r.tables.includes(table)
                && r.status !== 'released';
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
        return r.date === getToday();
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
        return r.date === getToday();
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

    history.push({
        date: getToday(),

        reservations: todayReservations,

        closedAt: new Date().toISOString(),
    });

    reservations = reservations.filter(function (r) {
        return r.date !== getToday();
    });

    saveData(STORAGE_RESERVATIONS, reservations);

    saveData(STORAGE_HISTORY, history);

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
                return 'T' + table;
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

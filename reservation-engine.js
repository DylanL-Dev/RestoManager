'use strict';

/* Moteur métier sans dépendance au DOM. Il conserve la forme historique
   des réservations afin que les données déjà présentes restent utilisables. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.ReservationEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DEFAULT_DURATION = 90;
    const CLOSING_MINUTES = 21 * 60 + 30;
    const TABLES = [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 17, 18, 19, 20, 21, 22, 23,
        24, 25,
    ];
    const CAPACITY = TABLES.reduce(function (result, table) {
        result[table] = table === 25 ? 10 : 2;
        return result;
    }, {});
    const STATUS = {
        RESERVED: 'reserved',
        CONFIRMED: 'confirmed',
        LATE: 'late',
        ARRIVED: 'arrived',
        SEATED: 'seated',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled',
        NO_SHOW: 'no_show',
        RELEASED: 'released',
    };
    const BLOCKING_STATUSES = [
        STATUS.RESERVED,
        STATUS.CONFIRMED,
        STATUS.LATE,
        STATUS.ARRIVED,
        STATUS.SEATED,
    ];
    const TERMINAL_STATUSES = [
        STATUS.COMPLETED,
        STATUS.CANCELLED,
        STATUS.NO_SHOW,
        STATUS.RELEASED,
    ];

    function minutes(time) {
        const parts = String(time || '').split(':');
        const hours = Number(parts[0]);
        const mins = Number(parts[1]);
        return Number.isInteger(hours) && Number.isInteger(mins) && hours >= 0 &&
            hours < 24 && mins >= 0 && mins < 60
            ? hours * 60 + mins
            : NaN;
    }

    function endMinutes(reservation) {
        return minutes(reservation.time) + Number(reservation.duration || DEFAULT_DURATION);
    }

    function isBlocking(reservation) {
        return BLOCKING_STATUSES.includes(reservation.status);
    }

    function tableCapacity(tables) {
        return tables.reduce(function (total, table) {
            return total + (CAPACITY[table] || 0);
        }, 0);
    }

    function sharesTable(first, second) {
        return first.tables.some(function (table) {
            return second.tables.includes(table);
        });
    }

    function overlaps(first, second) {
        return minutes(first.time) < endMinutes(second) &&
            endMinutes(first) > minutes(second.time);
    }

    function normalizeRoom(value) {
        return String(value || '').trim().toLocaleUpperCase('fr-FR');
    }

    function findRoomConflict(candidate, reservations, ignoredId) {
        if (candidate.type !== 'hotel' || !normalizeRoom(candidate.client)) return null;
        return normalizeReservations(reservations).find(function (other) {
            return other.id !== ignoredId && other.type === 'hotel' &&
                other.date === candidate.date && isBlocking(other) &&
                normalizeRoom(other.client) === normalizeRoom(candidate.client) &&
                overlaps(candidate, other);
        }) || null;
    }

    function normalizeReservation(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const legacyStatus = source.status === 'occupied' ? STATUS.SEATED : source.status;
        const status = Object.values(STATUS).includes(legacyStatus)
            ? legacyStatus
            : STATUS.RESERVED;
        const tables = Array.isArray(source.tables)
            ? source.tables.map(Number).filter(function (table, index, array) {
                return TABLES.includes(table) && array.indexOf(table) === index;
            })
            : [];
        return Object.assign({}, source, {
            id: String(source.id || Date.now() + Math.random()),
            type: source.type === 'exterieur' ? 'exterieur' : 'hotel',
            client: String(source.client || ''),
            date: typeof source.date === 'string' ? source.date : '',
            time: typeof source.time === 'string' ? source.time : '',
            guests: Math.max(1, Number(source.guests) || 1),
            duration: Math.max(1, Number(source.duration) || DEFAULT_DURATION),
            tables: tables,
            status: status,
        });
    }

    function normalizeReservations(raw) {
        return Array.isArray(raw) ? raw.map(normalizeReservation) : [];
    }

    function validate(candidate, reservations, ignoredId) {
        const errors = [];
        if (!candidate.client || !String(candidate.client).trim()) errors.push('Client requis.');
        if (!candidate.date) errors.push('Date requise.');
        if (!Number.isFinite(minutes(candidate.time))) errors.push('Heure invalide.');
        if (!Number.isFinite(Number(candidate.guests)) || Number(candidate.guests) < 1) {
            errors.push('Le nombre de personnes doit être supérieur à 0.');
        }
        if (!Array.isArray(candidate.tables) || candidate.tables.length === 0) {
            errors.push('Sélectionnez au moins une table.');
        }
        if ((candidate.tables || []).some(function (table) { return !TABLES.includes(Number(table)); })) {
            errors.push('Une table sélectionnée est inconnue.');
        }
        if (tableCapacity(candidate.tables || []) < Number(candidate.guests)) {
            errors.push('La capacité des tables sélectionnées est insuffisante.');
        }
        if (endMinutes(candidate) > CLOSING_MINUTES) {
            errors.push('La réservation dépasse la fermeture à 21h30.');
        }
        const conflict = normalizeReservations(reservations).find(function (other) {
            return other.id !== ignoredId && other.date === candidate.date &&
                isBlocking(other) && sharesTable(candidate, other) && overlaps(candidate, other);
        });
        if (conflict) errors.push('Conflit avec la réservation de ' + conflict.client + ' à ' + conflict.time + '.');
        const roomConflict = findRoomConflict(candidate, reservations, ignoredId);
        if (roomConflict) errors.push('La chambre ' + normalizeRoom(candidate.client) + ' possède déjà une réservation qui chevauche ce créneau.');
        return { valid: errors.length === 0, errors: errors, conflict: conflict || null, roomConflict: roomConflict };
    }

    function transition(reservation, status, now) {
        const allowed = {
            reserved: [STATUS.CONFIRMED, STATUS.LATE, STATUS.ARRIVED, STATUS.SEATED, STATUS.CANCELLED, STATUS.NO_SHOW],
            confirmed: [STATUS.LATE, STATUS.ARRIVED, STATUS.SEATED, STATUS.CANCELLED, STATUS.NO_SHOW],
            late: [STATUS.ARRIVED, STATUS.SEATED, STATUS.CANCELLED, STATUS.NO_SHOW],
            arrived: [STATUS.SEATED, STATUS.CANCELLED],
            seated: [STATUS.COMPLETED, STATUS.RELEASED],
        };
        if (!(allowed[reservation.status] || []).includes(status)) {
            return { valid: false, error: 'Transition de statut non autorisée.' };
        }
        const updated = Object.assign({}, reservation, { status: status, updatedAt: now || new Date().toISOString() });
        if (status === STATUS.ARRIVED) updated.arrivedAt = updated.updatedAt;
        if (status === STATUS.SEATED) updated.seatedAt = updated.updatedAt;
        if (status === STATUS.LATE) updated.lateAt = updated.updatedAt;
        if (status === STATUS.NO_SHOW) updated.noShowAt = updated.updatedAt;
        if (status === STATUS.CANCELLED) updated.cancelledAt = updated.updatedAt;
        if (status === STATUS.COMPLETED || status === STATUS.RELEASED) updated.releasedAt = updated.updatedAt;
        return { valid: true, reservation: updated };
    }

    function extend(reservation, extraMinutes, reservations) {
        const extra = Number(extraMinutes);
        if (!Number.isInteger(extra) || extra <= 0) return { valid: false, error: 'Prolongation invalide.' };
        const candidate = Object.assign({}, reservation, { duration: Number(reservation.duration) + extra, status: reservation.status });
        const result = validate(candidate, reservations, reservation.id);
        return result.valid ? { valid: true, reservation: candidate } : { valid: false, error: result.errors[0] };
    }

    return {
        TABLES: TABLES,
        CAPACITY: CAPACITY,
        STATUS: STATUS,
        DEFAULT_DURATION: DEFAULT_DURATION,
        CLOSING_MINUTES: CLOSING_MINUTES,
        TERMINAL_STATUSES: TERMINAL_STATUSES,
        isBlocking: isBlocking,
        endMinutes: endMinutes,
        tableCapacity: tableCapacity,
        overlaps: overlaps,
        normalizeRoom: normalizeRoom,
        findRoomConflict: findRoomConflict,
        normalizeReservation: normalizeReservation,
        normalizeReservations: normalizeReservations,
        validate: validate,
        transition: transition,
        extend: extend,
    };
});

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
    const DURATION_KEY = 'restomanager_default_duration_v1';
    function getDefaultDuration(){if(globalThis.RestoSharedHours)return globalThis.RestoSharedHours.duration;try{const saved=Number(localStorage.getItem(DURATION_KEY));return [30,45,60,75,90,105,120,150,180].includes(saved)?saved:DEFAULT_DURATION}catch(e){return DEFAULT_DURATION}}
    const LUNCH_START = 12 * 60;
    const LUNCH_LAST_ORDER = 14 * 60 + 30;
    const DINNER_START = 19 * 60;
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
        if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return NaN;
        const parts = String(time || '').split(':');
        const hours = Number(parts[0]);
        const mins = Number(parts[1]);
        return Number.isInteger(hours) && Number.isInteger(mins) && hours >= 0 &&
            hours < 24 && mins >= 0 && mins < 60
            ? hours * 60 + mins
            : NaN;
    }

    function startMinutes(reservation) {
        if (reservation.status === STATUS.SEATED && reservation.seatedAt) {
            const actual = new Date(reservation.seatedAt);
            if (Number.isFinite(actual.getTime())) {
                const day = [actual.getFullYear(),String(actual.getMonth()+1).padStart(2,'0'),String(actual.getDate()).padStart(2,'0')].join('-');
                if (day === reservation.date) return actual.getHours()*60+actual.getMinutes();
            }
        }
        return minutes(reservation.time);
    }
    function endMinutes(reservation) {
        return startMinutes(reservation) + Number(reservation.duration || getDefaultDuration());
    }

    function isBlocking(reservation) {
        return BLOCKING_STATUSES.includes(reservation.status);
    }

    function rankedTableChoices(tables, groups, guests) {
        const byNumber = new Map(tables.map(t => [t.number, t]));
        const choices = tables.filter(t => guests >= (t.capacityMin || 1)).map(t => [t.number]).concat(groups);
        return choices.filter(numbers => numbers.every(n => byNumber.has(n))).map(numbers => {
            const capacity = numbers.reduce((sum,n) => sum + byNumber.get(n).capacity, 0);
            const label = (numbers.length === 1 ? 'Table ' : 'Tables ') + numbers.join(' + ');
            return {numbers, capacity, label, value: numbers.join(',')};
        }).filter(c => c.capacity >= guests).sort((a,b) =>
            a.capacity - b.capacity || a.numbers.length - b.numbers.length ||
            a.value.localeCompare(b.value, 'fr', {numeric:true}));
    }

    function tableCapacity(tables) {
        if(globalThis.RestoSharedReservations){
            const plan=TableStore.get().tables;
            return tables.reduce((sum,n)=>sum+(plan.find(t=>t.number===Number(n))?.capacity||0),0);
        }
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
        return startMinutes(first) < endMinutes(second) &&
            endMinutes(first) > startMinutes(second);
    }

    function normalizeRoom(value) {
        return String(value || '').trim().toLocaleUpperCase('fr-FR');
    }

    function roomIdentity(reservation) {
        // Connected records carry an explicit room. Only historical local
        // records without this property use the old client-as-room convention.
        return normalizeRoom(Object.prototype.hasOwnProperty.call(reservation, 'hotelRoom')
            ? reservation.hotelRoom : reservation.client);
    }

    function findRoomConflict(candidate, reservations, ignoredId) {
        if (candidate.type !== 'hotel' || !roomIdentity(candidate) || (candidate.walkIn && roomIdentity(candidate) === 'CLIENT DE PASSAGE')) return null;
        return normalizeReservations(reservations).find(function (other) {
            return other.id !== ignoredId && other.type === 'hotel' &&
                other.date === candidate.date && isBlocking(other) &&
                roomIdentity(other) === roomIdentity(candidate) &&
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
                // Keep saved associations even when a plan is temporarily unreadable
                // or the table is absent from the current catalogue.
                return Number.isInteger(table) && table > 0 && array.indexOf(table) === index;
            })
            : [];
        return Object.assign({}, source, {
            id: String(source.id || Date.now() + Math.random()),
            type: source.type === 'exterieur' ? 'exterieur' : 'hotel',
            client: String(source.client || ''),
            date: typeof source.date === 'string' ? source.date : '',
            time: typeof source.time === 'string' ? source.time : '',
            guests: Math.max(1, Number(source.guests) || 1),
            duration: Math.max(1, Number(source.duration) || getDefaultDuration()),
            tables: tables,
            status: status,
        });
    }

    function normalizeReservations(raw) {
        return Array.isArray(raw) ? raw.map(normalizeReservation) : [];
    }

    function validDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split('-').map(Number);
        if (year < 2000 || year > 2100) return false;
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }

    const SHIFT_KEY = 'restomanager_shifts_v1';
    const SHIFT_DEFAULTS = {lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}};
    function getShifts(){
        if(globalThis.RestoSharedHours)return globalThis.RestoSharedHours.shifts;
        let stored={};
        try{if(typeof localStorage!=='undefined')stored=JSON.parse(localStorage.getItem(SHIFT_KEY)||'{}')||{}}catch(e){}
        const result={};
        for(const key of ['lunch','dinner']){
            const raw=stored[key]||{},fallback=SHIFT_DEFAULTS[key];
            result[key]={enabled:typeof raw.enabled==='boolean'?raw.enabled:fallback.enabled,start:Number.isFinite(minutes(raw.start))?raw.start:fallback.start,end:Number.isFinite(minutes(raw.end))?raw.end:fallback.end};
        }
        return result;
    }

    // The per-restaurant weekly closure is synchronized from Supabase DEV.
    function closedWeekendLunch(date,time) {
        if (!validDate(date) || !Number.isFinite(minutes(time))) return false;
        const weekday=new Date(date+'T12:00:00Z').getUTCDay();
        const weekend=globalThis.RestoSharedHours?.weekend;
        if (!weekend?.supported || !(weekday===6&&weekend.saturdayLunchClosed || weekday===0&&weekend.sundayLunchClosed)) return false;
        const lunch=getShifts().lunch;
        return minutes(time)>=minutes(lunch.start)&&minutes(time)<=minutes(lunch.end);
    }
    function isServiceOpen(date,time) {
        if (!validDate(date) || !Number.isFinite(minutes(time)) || closedWeekendLunch(date,time)) return false;
        return Object.values(getShifts()).some(shift=>shift.enabled && minutes(time)>=minutes(shift.start) && minutes(time)<=minutes(shift.end));
    }

    function validate(candidate, reservations, ignoredId) {
        const errors = [];
        if (!candidate || typeof candidate !== 'object') return {valid:false,errors:['Réservation invalide.'],conflict:null,roomConflict:null};
        if (!candidate.client || !String(candidate.client).trim()) errors.push('Client requis.');
        if (!validDate(candidate.date)) errors.push('Date invalide (AAAA-MM-JJ).');
        if (!Number.isFinite(minutes(candidate.time))) errors.push('Heure invalide.');
        if (!Number.isInteger(Number(candidate.guests)) || Number(candidate.guests) < 1) {
            errors.push('Le nombre de personnes doit être supérieur à 0.');
        }
        const duration = Number(candidate.duration == null ? getDefaultDuration() : candidate.duration);
        if (!Number.isInteger(duration) || duration < 1) errors.push('Durée de réservation invalide.');
        if (!Array.isArray(candidate.tables) || candidate.tables.length === 0) {
            errors.push('Sélectionnez au moins une table.');
        }
        const selectedTables = Array.isArray(candidate.tables) ? candidate.tables : [];
        if (selectedTables.some(function (table) { return !Number.isInteger(Number(table)) || Number(table) < 1; }) ||
            new Set(selectedTables.map(Number)).size !== selectedTables.length) {
            errors.push('Les numéros de tables doivent être uniques et valides.');
        }
        if (selectedTables.some(function (table) { return !(globalThis.RestoSharedReservations ? TableStore.get().tables.some(t=>t.number===Number(table)) : TABLES.includes(Number(table))); })) {
            errors.push('Une table sélectionnée est inconnue.');
        }
        if (tableCapacity([...new Set(selectedTables.map(Number))]) < Number(candidate.guests)) {
            errors.push('La capacité des tables sélectionnées est insuffisante.');
        }
        if (Number.isFinite(minutes(candidate.time))) {
            if (!isServiceOpen(candidate.date,candidate.time)) errors.push(closedWeekendLunch(candidate.date,candidate.time)
                ? 'Restaurant fermé le samedi et le dimanche midi : choisissez un autre service.'
                : 'Horaire hors des services ouverts. Vérifiez les horaires dans Gestion du restaurant.');
        }
        if (errors.length) return { valid: false, errors: errors, conflict: null, roomConflict: null };
        const conflict = normalizeReservations(reservations).find(function (other) {
            return other.id !== ignoredId && other.date === candidate.date &&
                isBlocking(other) && sharesTable(candidate, other) && overlaps(candidate, other);
        });
        if (conflict) errors.push('Conflit avec la réservation de ' + conflict.client + ' à ' + conflict.time + '.');
        const roomConflict = findRoomConflict(candidate, reservations, ignoredId);
        if (roomConflict) errors.push('La chambre ' + roomIdentity(candidate) + ' possède déjà une réservation qui chevauche ce créneau.');
        return { valid: errors.length === 0, errors: errors, conflict: conflict || null, roomConflict: roomConflict };
    }

    // A seated party can still be present after its planned end. This is a
    // warning requiring staff approval, not an automatic table release.
    function seatingWarnings(candidate, reservations, ignoredId) {
        if (!candidate || !Array.isArray(candidate.tables) || !Number.isFinite(minutes(candidate.time))) return [];
        return normalizeReservations(reservations).filter(function (other) {
            return other.id !== ignoredId && other.date === candidate.date &&
                other.status === STATUS.SEATED && sharesTable(candidate, other) &&
                !overlaps(candidate, other) && endMinutes(other) <= minutes(candidate.time);
        }).map(function (other) {
            return {
                id: other.id, client: other.client, time: other.time,
                plannedEnd: String(Math.floor(endMinutes(other) / 60)).padStart(2, '0') + ':' +
                    String(endMinutes(other) % 60).padStart(2, '0'),
                gapMinutes: startMinutes(candidate) - endMinutes(other),
                tables: other.tables.slice()
            };
        });
    }

    function transition(reservation, status, now, reservations) {
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
        if (status === STATUS.SEATED && Array.isArray(reservations)) {
            const conflict = normalizeReservations(reservations).find(function (other) {
                return other.id !== reservation.id && other.date === reservation.date &&
                    other.status === STATUS.SEATED && sharesTable(reservation, other);
            });
            if (conflict) return { valid: false, error: 'Installation impossible : la table est encore occupée par ' + conflict.client + '. Confirmez d’abord son départ.' };
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
        rankedTableChoices,
        getDefaultDuration: getDefaultDuration,
        CLOSING_MINUTES: CLOSING_MINUTES,
        TERMINAL_STATUSES: TERMINAL_STATUSES,
        isBlocking: isBlocking,
        endMinutes: endMinutes,
        startMinutes: startMinutes,
        tableCapacity: tableCapacity,
        overlaps: overlaps,
        normalizeRoom: normalizeRoom,
        findRoomConflict: findRoomConflict,
        normalizeReservation: normalizeReservation,
        normalizeReservations: normalizeReservations,
        validate: validate,
        getShifts: getShifts,
        isServiceOpen: isServiceOpen,
        closedWeekendLunch: closedWeekendLunch,
        seatingWarnings: seatingWarnings,
        transition: transition,
        extend: extend,
    };
});

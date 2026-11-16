// One object with every data module, bound to one database handle.
// Services get this; inside a transaction they get a second one bound to `tx`.
const { usersData } = require('./users');
const { sessionsData } = require('./sessions');
const { clubsData } = require('./clubs');
const { eventsData } = require('./events');
const { registrationsData } = require('./registrations');

function createData(db) {
  return {
    users: usersData(db),
    sessions: sessionsData(db),
    clubs: clubsData(db),
    events: eventsData(db),
    registrations: registrationsData(db),
    /** run fn with a data object whose queries all belong to one transaction */
    transaction: (fn) => db.transaction((tx) => fn(createData(tx))),
  };
}

module.exports = { createData };

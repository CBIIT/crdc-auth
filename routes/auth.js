const express = require('express');
const router = express.Router();
const idpClient = require('../idps');
const config = require('../config');
const {logout} = require('../controllers/auth-api')
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {DATABASE_NAME, LOG_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {LoginEvent, LogoutEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);
let logCollection;
dbConnector.connect().then(() => {
    logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
});

/* Login */
router.post('/login', async function (req, res) {
    try {
        const reqIDP = config.getIdpOrDefault(req.body['IDP']);
        const { name, lastName, tokens, email, idp } = await idpClient.login(req.body['code'], reqIDP, config.getUrlOrDefault(reqIDP, req.body['redirectUri']));
        req.session.userInfo = {
            email: email,
            IDP: idp,
            firstName: name,
            lastName: lastName
        };
        req.session.tokens = tokens;
        res.json({name, email, "timeout": config.session_timeout / 1000});
        await logCollection.insert(LoginEvent.create(email, idp));
    } catch (e) {
        if (e.code && parseInt(e.code)) {
            res.status(e.code);
        } else if (e.statusCode && parseInt(e.statusCode)) {
            res.status(e.statusCode);
        } else {
            res.status(500);
        }
        res.json({error: e.message});
    }
});

/* Logout */
router.post('/logout', async function (req, res, next) {
    try {
        const idp = config.getIdpOrDefault(req.body['IDP']);
        const userInfo = req?.session?.userInfo;
        if (userInfo?.email && userInfo?.IDP) await logCollection.insert(LogoutEvent.create(userInfo.email, userInfo.IDP));
        await idpClient.logout(idp, req.session.tokens);
        return logout(req, res);
    } catch (e) {
        console.log(e);
        res.status(500).json({errors: e});
    }
});

/* Authenticated */
// Return {status: true} or {status: false}
// Calling this API will refresh the session
router.post('/authenticated', async function (req, res, next) {
    try {
        if (req.session.tokens) {
            return res.status(200).send({status: true});
        } else {
            return res.status(200).send({status: false});
        }
    } catch (e) {
        console.log(e);
        res.status(500).json({errors: e});
    }
});

// Session timeout
// Return in s if the seesion is active.
router.get('/session-ttl', async function(req, res){
    if (req.session) {
      const currentTime = new Date();
      const sessionExpiration = new Date(req.session.cookie.expires);
      if (!req.session.userInfo) {
        res.send('Session has expired.');
      } else {
        res.send({ttl: Math.round((sessionExpiration-currentTime)/1000)});
      }
    } else {
      res.send('No session found.');
    }
  });

module.exports = router;

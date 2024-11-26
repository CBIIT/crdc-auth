const express = require('express');
const router = express.Router();
const idpClient = require('../idps');
const configuration = require('../config');
const {logout} = require('../controllers/auth-api')
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {DATABASE_NAME, LOG_COLLECTION, USER_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {LoginEvent, LogoutEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const {User} = require("../crdc-datahub-database-drivers/services/user");
const {ERROR} = require("../crdc-datahub-database-drivers/constants/error-constants");
const dbConnector = new DatabaseConnector(configuration.mongo_db_connection_string);
let logCollection;
let userService;
let config;
dbConnector.connect().then(async () => {
    logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
    userService = new User(userCollection, logCollection);
    config = await configuration.updateConfig(dbConnector);
});

/* Login */
router.post('/login', async function (req, res) {
    try {
        const reqIDP = config.getIdpOrDefault(req.body['IDP']);
        const { name, lastName, tokens, email, idp } = await idpClient.login(req.body['code'], reqIDP, config.getUrlOrDefault(reqIDP, req.body['redirectUri'], config.nih.REDIRECT_URL));
        if (!await userService.isEmailAndIDPLoginPermitted(email, idp)) {
            throw { statusCode: 403, message: ERROR.INACTIVE_USER };
        }
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


module.exports = router;

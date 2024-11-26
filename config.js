const dotenv = require('dotenv')
const {isCaseInsensitiveEqual} = require("./util/string-util");
const {NIH} = require("./constants/idp-constants");
const {MongoDBCollection} = require("./crdc-datahub-database-drivers/mongodb-collection");
const {DATABASE_NAME, CONFIGURATION_COLLECTION} = require("./crdc-datahub-database-drivers/database-constants");
dotenv.config();
const NIH_CONFIGURATION = "NIH_CONFIGURATION";
const NIH_CLIENT_ID = "NIH_CLIENT_ID";
const CLIENT_SECRET = "CLIENT_SECRET";
const BASE_URL = "BASE_URL";
const REDIRECT_URL = "REDIRECT_URL";
const NIH_USERINFO_URL = "NIH_USERINFO_URL";
const NIH_AUTHORIZE_URL = "NIH_AUTHORIZE_URL";
const NIH_TOKEN_URL = "NIH_TOKEN_URL";
const NIH_LOGOUT_URL = "NIH_LOGOUT_URL";
const NIH_SCOPE = "NIH_SCOPE";
const NIH_PROMPT = "NIH_PROMPT";

const config = {
  version: process.env.VERSION,
  date: process.env.DATE,
  idp: process.env.IDP ? process.env.IDP.toLowerCase() : NIH,
  session_secret: process.env.SESSION_SECRET,
  session_timeout: process.env.SESSION_TIMEOUT ? parseInt(process.env.SESSION_TIMEOUT) * 1000 : 1000 * 30 * 60,  // 30 minutes
  // Mongo DB Connection
  mongo_db_connection_string: `mongodb://${process.env.MONGO_DB_USER}:${process.env.MONGO_DB_PASSWORD}@${process.env.MONGO_DB_HOST}:${process.env.MONGO_DB_PORT}`,
  // Disable local test page automatically sends /login request, so Postman can use the auth code
  noAutoLogin: process.env.NO_AUTO_LOGIN ? process.env.NO_AUTO_LOGIN.toLowerCase() === "true" : false,

  getIdpOrDefault: (idp) => {
    return (idp) ? idp : config.idp;
  },
  getUrlOrDefault: (idp, url, defaultRedirectUrl) => {
    if (!url && isCaseInsensitiveEqual(idp,'NIH')) return defaultRedirectUrl;
    return url;
  },
  updateConfig: async (dbConnector)=> {
    const configurationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, CONFIGURATION_COLLECTION);
    // SCHEDULED_JOBS
    const result = await configurationCollection.aggregate([{
      "$match": { type: NIH_CONFIGURATION }
    }, {"$limit": 1}]);
    const nihConfigurationConf = (result?.length === 1) ? result[0] : null;
    const nihClientID = nihConfigurationConf?.[NIH_CLIENT_ID];
    const nihClientSecret = nihConfigurationConf?.[CLIENT_SECRET];
    const nihBaseUrl = nihConfigurationConf?.[BASE_URL];
    const nihRedirectUrl = nihConfigurationConf?.[REDIRECT_URL];
    const nihUserInfoUrl = nihConfigurationConf?.[NIH_USERINFO_URL];
    const nihAuthorizeUrl = nihConfigurationConf?.[NIH_AUTHORIZE_URL];
    const nihTokenUrl = nihConfigurationConf?.[NIH_TOKEN_URL];
    const nihLogoutUrl = nihConfigurationConf?.[NIH_LOGOUT_URL];
    const nihScope = nihConfigurationConf?.[NIH_SCOPE];
    const nihPrompt = nihConfigurationConf?.[NIH_PROMPT];

    return {
      ...config,
      // NIH login settings
      nih: {
        CLIENT_ID: nihClientID || process.env.NIH_CLIENT_ID,
        CLIENT_SECRET: nihClientSecret || process.env.NIH_CLIENT_SECRET,
        BASE_URL: nihBaseUrl || process.env.NIH_BASE_URL,
        REDIRECT_URL: nihRedirectUrl || process.env.NIH_REDIRECT_URL,
        USERINFO_URL: nihUserInfoUrl || process.env.NIH_USERINFO_URL,
        AUTHORIZE_URL: nihAuthorizeUrl || process.env.NIH_AUTHORIZE_URL,
        TOKEN_URL: nihTokenUrl || process.env.NIH_TOKEN_URL,
        LOGOUT_URL: nihLogoutUrl || process.env.NIH_LOGOUT_URL,
        SCOPE: nihScope || process.env.NIH_SCOPE,
        PROMPT: nihPrompt || process.env.NIH_PROMPT
      }
    };
  }
};

if (!config.version) {
  config.version = 'Version not set'
}

if (!config.date) {
  config.date = new Date();
}

module.exports = config;

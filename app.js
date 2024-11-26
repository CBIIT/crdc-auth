var createError = require('http-errors');
var express = require('express');
var path = require('path');
const createSession = require("./crdc-datahub-database-drivers/session-middleware");
var logger = require('morgan');
const fs = require('fs');
const cors = require('cors');
const config = require('./config');
const cookieParser = require('cookie-parser');
const {MongoDBCollection} = require("./crdc-datahub-database-drivers/mongodb-collection");
const {DATABASE_NAME, LOG_COLLECTION, USER_COLLECTION, CONFIGURATION_COLLECTION} = require("./crdc-datahub-database-drivers/database-constants");
const {DatabaseConnector} = require("./crdc-datahub-database-drivers/database-connector");
console.log(config);

const LOG_FOLDER = 'logs';
if (!fs.existsSync(LOG_FOLDER)) {
  fs.mkdirSync(LOG_FOLDER);
}


// create a write stream (in append mode)
const accessLogStream = fs.createWriteStream(path.join(__dirname, LOG_FOLDER, 'access.log'), { flags: 'a'})

var authRouter = require('./routes/auth');
var checkRouter = require('./routes/check');
var app = express();
app.use(cors());

// setup the logger
app.use(logger('combined', { stream: accessLogStream }))
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Ping/version/session-ttl
app.use('/api/authn', checkRouter);

app.use(createSession(config.session_secret, config.session_timeout, config.mongo_db_connection_string));
app.use('/api/authn', authRouter);

if (process.env.NODE_ENV === 'development') {
  console.log("Running in development mode, local test page enabled");
  app.set('view engine', 'ejs');

  let nihConf;
  const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);
  dbConnector.connect().then(async () => {
    const configurationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, CONFIGURATION_COLLECTION);
    const res = await configurationCollection.aggregate([{
      "$match": { type: "NIH_CONFIGURATION" }
    }, {"$limit": 1}]);
    nihConf = (res?.length === 1) ? res[0] : null;
  });
  app.get('/', (req, res) => {
    res.render('index', {
      nihClientID: nihConf?.["NIH_CLIENT_ID"] || process.env.NIH_CLIENT_ID,
      nihRedirectURL: nihConf?.["REDIRECT_URL"] || process.env.NIH_REDIRECT_URL,
      noAutoLogin:  config.noAutoLogin
    });
  });
}


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.json(res.locals.message);
});

module.exports = app;

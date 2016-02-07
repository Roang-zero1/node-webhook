#!/usr/bin/env node

var config = require('./config.json');
var hook = require('./hook.js');
var logger = require('winston');
logger.level = config.loglvl || 'info';

// Start server
var port = process.env.PORT || config.port || 8080;
hook.listen(port);
logger.info('Listening on port ' + port);
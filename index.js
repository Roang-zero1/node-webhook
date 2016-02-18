#!/usr/bin/env node

var config = require('./config.js');
var hook = require('./hook.js');
var logger = require('winston');
logger.level = config.get('loglvl') || 'info';

// Start server
var port = process.env.PORT || config.get('port') || 8080;
hook.listen(port);
logger.info('Listening on port ' + port);
logger.log('silly','Curent config: ', config.toString());

"use strict";
var config = require('./config.json');
var config_js = require('./config.js');
var express = require('express');
var bp = require('body-parser');
var app = express();
var async = require('async');
var spawn = require('child_process').spawn;
if (config_js.get('email.sendreports') && config_js.get('email.transport')) {
  var nodemailer = require('nodemailer');
  var transporter = nodemailer.createTransport(config_js.get('email.transport'));
  var mail = true;
}
var crypto = require('crypto');
var logger = require('winston');
logger.level = config_js.get('loglvl') || 'info';

module.exports = app;

function run(file, params, callback) {
  callback = (typeof callback === 'function') ? callback : function() {};
  var process = spawn(file, params);

  process.stdout.on('data', function(data) {
    logger.info('' + data);
  });

  process.stderr.on('data', function(data) {
    logger.warn('' + data);
  });

  process.on('exit', function(code) {
    callback(code !== 0);
  });
}

function send(body, subject, data) {
  if (mail && data.pusher.email) {
    var mailOptions = {
      text: body,
      from: config_js.get('email.sender'),
      to: data.pusher.email,
      subject: subject
    };
    transporter.sendMail(mailOptions, function(error, info) {
      if (error) {
        return logger.error(error);
      }
      logger.log('debug', 'Message sent: ' + info.response);
    });
  }
}

function handleRequest(task, callback) {
  callback = (typeof callback === 'function') ? callback : function() {};
  var req = task.req;
  var data = req.body;
  var branch = req.params[0];
  var params = [];

  // Parse webhook data for internal variables
  if (data.repository && data.repository.name && data.repository.owner.name) {
    data.repo = data.repository.name;
    data.owner = data.repository.owner.name;
  } else {
    logger.warn('Request data incomplete');
    callback(new Error('Request data incomplete'));
    return;
  }

  data.branch = data.ref.replace('refs/heads/', '');

  // End early if not permitted account
  if (config.accounts.indexOf(data.owner) === -1) {
    logger.info(data.owner + ' is not an authorized account.');
    callback(new Error(data.owner + ' is not an authorized account.'));
    return;
  }

  // End early if not permitted branch
  if (data.branch !== branch) {
    logger.info(data.branch + ' is not permitted ' + branch + ' branch.');
    callback(new Error(data.branch + ' is not permitted ' + branch + ' branch.'));
    return;
  }

  // Process webhook data into params for scripts
  /* repo   */
  params.push(data.repo);
  /* branch */
  params.push(data.branch);
  /* owner  */
  params.push(data.owner);

  /* giturl */
  if (config.public_repo) {
    params.push('https://' + config.gh_server + '/' + data.owner + '/' + data.repo + '.git');
  } else {
    params.push('git@' + config.gh_server + ':' + data.owner + '/' + data.repo + '.git');
  }

  /* source */
  params.push(config.get('temp') + '/' + data.owner + '/' + data.repo + '/' + data.branch + '/' + 'code');
  /* build  */
  params.push(config.get('temp') + '/' + data.owner + '/' + data.repo + '/' + data.branch + '/' + 'site');

  // Script by branch.
  var build_script = null;
  try {
    build_script = config.scripts[data.branch].build;
  } catch (err) {
    try {
      build_script = config.scripts['#default'].build;
    } catch (err) {
      throw new Error('No default build script defined.');
    }
  }

  var publish_script = null;
  try {
    publish_script = config.scripts[data.branch].publish;
  } catch (err) {
    try {
      publish_script = config.scripts['#default'].publish;
    } catch (err) {
      throw new Error('No default publish script defined.');
    }
  }

  // Run build script
  run(build_script, params, function(err) {
    if (err) {
      logger.info('Failed to build: ' + data.owner + '/' + data.repo);
      send('Your website at ' + data.owner + '/' + data.repo + ' failed to build.', 'Error building site', data);
      callback(new Error('Failed to build: ' + data.owner + '/' + data.repo));
      return;
    }

    // Run publish script
    run(publish_script, params, function(err) {
      if (err) {
        logger.info('Failed to publish: ' + data.owner + '/' + data.repo);
        send('Your website at ' + data.owner + '/' + data.repo + ' failed to publish.', 'Error publishing site', data);
        callback(new Error('Failed to publish: ' + data.owner + '/' + data.repo));
        return;
      }

      // Done running scripts
      logger.info('Successfully rendered: ' + data.owner + '/' + data.repo);
      send('Your website at ' + data.owner + '/' + data.repo + ' was successfully published.', 'Successfully published site', data);
      callback();
      return;
    });
  });
}

// Create Task Queue for Request handling
var tasks = async.queue(handleRequest, 1);

function verifyGitHub(req, res, buffer, callback) {
  callback = (typeof callback === 'function') ? callback : function() {};
  if (!req.headers['x-hub-signature']) {
    logger.silly('No GitHub signature found');
    callback(null, 'No siganture in header');
    return;
  }

  if (!config.secret || config.secret === "") {
    logger.warn("Recieved a X-Hub-Signature header, but cannot validate as no secret is configured");
    callback(null, 'No secret configured');
    return;
  }

  var hmac = crypto.createHmac('sha1', config.secret);
  var recieved_sig = req.headers['x-hub-signature'].split('=')[1];
  var computed_sig = hmac.update(buffer).digest('hex');

  if (recieved_sig !== computed_sig) {
    logger.warn('Recieved an invalid HMAC: calculated:' + computed_sig + ' != recieved:' + recieved_sig);
    var err = new Error('Invalid Signature');
    err.status = 403;
    throw err;
  }

  logger.silly('GitHub signature successfully verified');
}

app.use(bp.json({
  verify: verifyGitHub
}));

// Receive webhook post
app.post('/hooks/jekyll/:branch', function(req, res) {

  // Ensure that we return 200 Ok on ping and an error on other requests that
  // aren't 'push'
  var ghEvent = req.get('X-GitHub-Event');
  if (ghEvent === 'ping') {
    logger.info('Received ping.');
    res.sendStatus(200);
    return;
  } else if (ghEvent !== 'push') {
    logger.info('Received unsupported event: ' + ghEvent);
    res.sendStatus(400);
    return;
  }

  // Close connection
  res.sendStatus(202);

  // Queue request handler
  tasks.push({
    req: req
  });
});
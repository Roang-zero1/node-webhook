#!/usr/bin/env node

var config = require('./config.json');
var express = require('express');
var bp = require('body-parser');
var app = express();
var async = require('async');
var spawn = require('child_process').spawn;
var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport(config.email.tansport);
var crypto = require('crypto');
var logger = require('winston');
logger.level = config.loglvl || 'info';

function run(file, params, cb) {
  var process = spawn(file, params);

  process.stdout.on('data', function(data) {
    logger.info('' + data);
  });

  process.stderr.on('data', function(data) {
    logger.warn('' + data);
  });

  process.on('exit', function(code) {
    if (typeof cb === 'function') {
      cb(code !== 0);
    }
  });
}

function send(body, subject, data) {
  logger.log("silly",body + subject + JSON.stringify(data));
  if (config.email && config.email.isActivated && data.pusher.email) {
    var mailOptions = {
      text: body,
      from: config.email.from,
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

function handleRequest(task, cb) {
  var req = task.req;
  var data = req.body;
  var branch = req.params[0];
  var params = [];

  // Parse webhook data for internal variables
  data.repo = data.repository.name;
  data.branch = data.ref.replace('refs/heads/', '');
  data.owner = data.repository.owner.name;

  // End early if not permitted account
  if (config.accounts.indexOf(data.owner) === -1) {
    logger.info(data.owner + ' is not an authorized account.');
    if (typeof cb === 'function') {
      cb();
    }
    return;
  }

  // End early if not permitted branch
  if (data.branch !== branch) {
    logger.info('Not ' + branch + ' branch.');
    if (typeof cb === 'function') {
      cb();
    }
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
  params.push(config.temp + '/' + data.owner + '/' + data.repo + '/' + data.branch + '/' + 'code');
  /* build  */
  params.push(config.temp + '/' + data.owner + '/' + data.repo + '/' + data.branch + '/' + 'site');

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

      if (typeof cb === 'function') {
        cb();
      }
      return;
    }

    // Run publish script
    run(publish_script, params, function(err) {
      if (err) {
        logger.info('Failed to publish: ' + data.owner + '/' + data.repo);
        send('Your website at ' + data.owner + '/' + data.repo + ' failed to publish.', 'Error publishing site', data);

        if (typeof cb === 'function') {
          cb();
        }
        return;
      }

      // Done running scripts
      logger.info('Successfully rendered: ' + data.owner + '/' + data.repo);
      send('Your website at ' + data.owner + '/' + data.repo + ' was successfully published.', 'Successfully published site', data);

      if (typeof cb === 'function') {
        cb();
      }
      return;
    });
  });
}

// Create Task Queue for Request handling
var tasks = async.queue(handleRequest, 1);

app.use(bp.json({
  verify: function(req, res, buffer) {
    if (!req.headers['x-hub-signature']) {
      return;
    }

    if (!config.secret || config.secret === "") {
      logger.info("Recieved a X-Hub-Signature header, but cannot validate as no secret is configured");
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
  }

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

// Start server
var port = process.env.PORT || config.port || 8080;
app.listen(port);
logger.info('Listening on port ' + port);
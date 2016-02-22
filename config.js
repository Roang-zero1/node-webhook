var convict = require('convict');
var fs = require('fs');
var path = require('path');
var logger = require('winston');

// Define tha basic schema
var conf = convict({
  env: {
    doc: "The applicaton environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV"
  },
  port: {
    doc: "The port to bind.",
    format: "port",
    default: 8080,
    env: "PORT"
  },
  loglvl: {
    doc: "Level of log detail",
    format: String,
    default: 'info'
  },
  temp: {
    doc: "Directory for temporary repository clones",
    format: String,
    default: "/home/user/tmp/node-webhook"
  },
  gh_server: {
    doc: "Github server to use for repository actions",
    format: String,
    default: "github.com"
  },
  email: {
    sender: {
      doc: "eMail from address.",
      format: String,
      default: null
    },
    sendreports: {
      doc: "Send messages to pusher",
      format: Boolean,
      default: false
    }
  },
  scripts: {
    build: {
      doc: "Default build script",
      format: String,
      default: "github.com"
    },
    deploy: {
      doc: "Default deployment script",
      format: String,
      default: "github.com"
    },
  }
});

// Load environment dependent configuration
var env = conf.get('env');
logger.level = conf.get('loglvl');
conf.loadFile('./config/' + env + '.json');

// Perform validation
conf.validate({
  strict: true
});

// Load nodemail transports if reports are active
/* istanbul ignore next: No transport needed without mails */
if (conf.get('email.sendreports')) {
  conf.loadFile('./config/' + env + '-transport.json');
}

// Load repository config

var repos = {};

if (env !== "test") {
  var repopath = './config/repos/';
} else {
  var repopath = './config/test-repos/';
}

var repofiles = fs.readdirSync(repopath);

repofiles.forEach(function(filename) {
  var ext = path.extname(filename);
  if (ext === '.json') {
    try {
      var repo = JSON.parse(fs.readFileSync(repopath + filename, 'utf8'));
      repos[path.basename(filename, ext)] = repo;
    } catch (ex) {
      logger.error('Invalid repository config found: ', filename);
    }
  } else {
    logger.error('Invalid extension for configuration file: ', filename);
  }
});
conf.set('repos', repos);

module.exports = conf;

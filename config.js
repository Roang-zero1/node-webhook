var convict = require('convict');

// Define a schema
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
    default: 0,
    env: "PORT"
  },
  loglvl: {
    doc: "Level of log detail",
    format: String,
    default: 'warn'
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
conf.loadFile('./config/' + env + '.json');

// Perform validation
conf.validate({
  strict: true
});

if(conf.get('email.sendreports')){
  conf.loadFile('./config/' + env + '-transport.json');
}

console.log(conf);

module.exports = conf;
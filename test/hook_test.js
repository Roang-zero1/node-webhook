var test = require('tape');
var request = require('supertest');
var rewire = require("rewire");
var hook = rewire('../hook');

// Test express requests
test('Fail on GET request', function(t) {
  request(hook)
    .get('/hooks/jekyll')
    .expect('Content-Type', /html/)
    .expect(404)
    .end(function(err, res) {
      t.error(err, 'No error during request');
      t.equal(res.error.status, 404, 'Return status 404');
      t.end();
    });
});

test('Failed GitHub signature validation', function(t) {
  request(hook)
    .post('/hooks/jekyll/master')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature', 'sha1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    .expect('Content-Type', /html/)
    .expect(403)
    .end(function(err, res) {
      t.error(err, 'No error during request');
      t.equal(res.error.status, 403, 'Return status 403');
      t.true(res.error.text.startsWith('Error: Invalid Signature'), 'Return correct Error message');
      t.end();
    });
});

test('Sucessful GitHub signature validation', function(t) {
  request(hook)
    .post('/hooks/jekyll/master')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature', 'sha1=154d3631bdc87323e0a698ec63914b078b81301b')
    .expect('Content-Type', 'text/plain; charset=utf-8')
    .expect(400)
    .end(function(err, res) {
      t.error(err, 'No error during request');
      t.equal(res.error.status, 400, 'Return status 400'); // No further data defined
      t.end();
    });
});

test('Respond to GitHub ping', function(t) {
  request(hook)
    .post('/hooks/jekyll/master')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', 'ping')
    .expect('Content-Type', 'text/plain; charset=utf-8')
    .expect(200)
    .end(function(err, res) {
      t.error(err, 'No error during request');
      t.equal(res.status, 200, 'Return status 200'); // No further data defined
      t.end();
    });
});

test('Respond to GitHub push', function(t) {
  request(hook)
    .post('/hooks/jekyll/master')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', 'push')
    .expect('Content-Type', 'text/plain; charset=utf-8')
    .expect(202)
    .end(function(err, res) {
      t.error(err, 'No error during request');
      t.equal(res.status, 202, 'Return status 200'); // No further data defined
      t.end();
    });
});

// Testing verifyGitHub
test('verifyGitHub Wrong signature', function(t) {
  var validate = hook.__get__('verifyGitHub');
  t.throws(function() {
    validate({
      headers: {
        'x-hub-signature': 'sha1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    }, null, 'Empty Body');
  }, Error, 'Fail to verify signature');
  t.end();
});

test('verifyGitHub No siganture in header', function(t) {
  var validate = hook.__get__('verifyGitHub');
  validate({
    headers: []
  }, null, null, function(err, data) {
    t.error(err, 'No error in signature check');
    t.equal(data, 'No siganture in header', 'No signature transmitted in header');
    t.end();
  });
});

test('verifyGitHub no secret configured', function(t) {
  var validate = hook.__get__('verifyGitHub');
  var config = hook.__set__('config', {
    secret: ""
  });
  validate({
    headers: {
      'x-hub-signature': 'sha1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  }, null, null, function(err, data) {
    t.error(err, 'No error in signature check');
    t.equal(data, 'No secret configured', 'No signature secret configured');
    t.end();
  });
  config();
});
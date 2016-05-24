var PORT = 8311;
var fs = require('fs');
var path = require('path');
var staticFile = require('connect-static-file');
var express = require('express');

var app, server, port, scriptPath, animRoute;

function startServer(_animPath, _scriptPath) {
  return _startServer(_animPath, _scriptPath).then(function (port) {
    return 'http://localhost:' + port + '/preview.html';
  });
}

function _startServer(_animPath, _scriptPath) {
  scriptPath = _scriptPath;
  animRoute = express.static(_animPath);
  if (!server) {
    app = express();
    app.use('/', express.static(__dirname + '/www'));
    app.use('/js', express.static(__dirname + '/js'));
    app.use('/lib', express.static(__dirname + '/lib'));
    app.get('/lib/ms.js', function (req, res, next) {
      fs.readFile(require.resolve('ms/index.js'), {encoding: 'utf8'}, function (err, data) {
        if (err) {
          next(err);
        }
        else {
          res.set('Content-Type', 'text/javascript');
          res.send(data.replace(/module\.exports/g, 'window.ms'));
        }
      });
    });
    app.use('/anim', function (req, res, next) {
      animRoute(req, res, next);
    });
    app.use('/script.benji', function (req, res, next) {
      fs.readFile(scriptPath, function (err, data) {
        if (err) {
          next(err);
        }
        else {
          res.set('Content-Type', 'text/plain');
          res.send(data);
        }
      });
    });

    port = PORT;
    return new Promise(function (resolve, reject) {
      function start() {
        server = app.listen(port, function () {
          resolve(port);
        });
        server.on('error', function (err) {
          if (err.code === 'EADDRINUSE') {
            port++;
            start();
          }
          else {
            reject(err);
          }
        });
      }
      start();
    });
  }
  else {
    return Promise.resolve(port);
  }
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = {
  startServer: startServer,
  stopServer: stopServer
};

if (require.main === module) {
  startServer('/home/chris/code/benji-data/anim', '/home/chris/code/benji-data/scripts/test.benji');
}

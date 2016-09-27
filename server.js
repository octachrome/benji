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
    app.use('/preview.html', express.static(__dirname + '/static/index.html'));
    app.use('/anim', animRoute);
    app.use('/', express.static(__dirname + '/static'));
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

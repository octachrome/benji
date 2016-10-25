var PORT = 8311;
var fs = require('fs');
var path = require('path');
var serveStatic = require('serve-static');
var connect = require('connect');

var app, server, port, scriptPath, animRoute;

function startServer(_animPath, _scriptPath) {
  return _startServer(_animPath, _scriptPath).then(function (port) {
    return 'http://localhost:' + port + '/preview.html';
  });
}

function _startServer(_animPath, _scriptPath) {
  scriptPath = _scriptPath;
  // Serve any other scripts that are in the same directory.
  scriptRoute = serveStatic(path.dirname(_scriptPath));
  animRoute = serveStatic(_animPath);
  if (!server) {
    app = connect();
    app.use('/preview.html', serveStatic(__dirname + '/static/index.html'));
    app.use('/anim', animRoute);
    app.use('/', scriptRoute);
    app.use('/', serveStatic(__dirname + '/static'));
    app.use('/script.benji', function (req, res, next) {
      fs.readFile(scriptPath, function (err, data) {
        if (err) {
          next(err);
        }
        else {
          res.writeHead(200, {
            'Content-Type': 'text/plain'
          });
          res.end(data);
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
  startServer('/home/chris/code/benji-data/anim', '/home/chris/code/benji-data/scripts/script.benji');
}

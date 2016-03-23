var PORT = 8312;
var fs = require('fs');
var path = require('path');
var staticFile = require('connect-static-file');
var express = require('express');

var server = null;

function startServer(animPath, scriptPath) {
  if (!server) {
    var app = express();
    app.use('/js', express.static('js'));
    app.use('/preview.html', staticFile('www/preview.html'));
    app.use('/lib/bodymovin.js', staticFile('node_modules/bodymovin/build/player/bodymovin.js'));
    app.use('/lib/jquery.js', staticFile('node_modules/jquery/dist/jquery.min.js'));
    app.use('/lib/lodash.js', staticFile('node_modules/lodash/lodash.js'));
    app.use('/lib/long.js', staticFile('node_modules/long/dist/long.js'));
    app.use('/lib/chance.js', staticFile('node_modules/chance/chance.js'));
    app.use('/lib/peg.js', staticFile('lib/peg-0.9.0.min.js'));
    app.get('/lib/ms.js', function (req, res, next) {
      fs.readFile('node_modules/ms/index.js', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          next(err);
        }
        else {
          res.set('Content-Type', 'text/javascript');
          res.send(data.replace(/module\.exports/g, 'window.ms'));
        }
      });
    });
    app.use('/anim', express.static(animPath));
    app.use('/script.benji', staticFile(scriptPath));
    server = app.listen(PORT);
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

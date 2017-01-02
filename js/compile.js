'use strict';

var fs = require('fs');
var Path = require('path');
var PEG = require('pegjs');
var doCompileScript = require('./compiler');

function readFile(path) {
    return new Promise(function (resolve, reject) {
        fs.readFile(path, 'utf8', function (err, data) {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
}

function readScript(path) {
    return readFile(Path.join('../benji-data/scripts', path));
}

function Script() {
}

Script.prototype.compile = function (scriptPath) {
    return this.load(scriptPath).then(() => {
        return Array.from(doCompileScript(new Date(), this.manifest, this.root, this.scripts));
    });
};

Script.prototype.getParser = function () {
    if (this.parser) {
        return Promise.resolve(parser);
    }
    else {
        return readFile('js/benji.pegjs').then(parserSrc => {
            this.parser = PEG.buildParser(parserSrc);
            return this.parser;
        });
    }
};

Script.prototype.load = function (scriptPath) {
    this.playing = false;
    var self = this;

    return readFile('anims.json').then(function (manifestSrc) {
        self.manifest = JSON.parse(manifestSrc);
        self.scripts = {};

        return readScript(scriptPath).then(function (scriptSrc) {
            return self.getParser().then(function (parser) {
                console.log('Parsing main script');
                self.root = parser.parse(scriptSrc);
                console.log('Checking for included scripts');
                return Promise.resolve(self.parseIncludedScripts(self.root, parser)).then(function () {
                    console.log('Parsing complete');
                });
            });
        });
    });
};

Script.prototype.parseIncludedScripts = function (script, parser) {
    var self = this;
    if (script.type === 'Cmd' && script.cmd === 'include') {
        var filename = script.args[0];
        if (!self.scripts[filename]) {
            return readScript(filename).then(function (src) {
                // Double-check because of concurrency.
                if (!self.scripts[filename]) {
                    console.log('Parsing ' + filename);
                    self.scripts[filename] = parser.parse(src);
                    return self.parseIncludedScripts(self.scripts[filename], parser);
                }
            });
        }
    }
    else {
        if (script.child) {
            return this.parseIncludedScripts(script.child, parser);
        }
        else if (script.else) {
            return this.parseIncludedScripts(script.else, parser);
        }
        else if (script.children) {
            var promises = [];
            script.children.forEach(function (child) {
                var promise = self.parseIncludedScripts(child, parser);
                if (promise) {
                    promises.push(promise);
                }
            });
            if (promises.length) {
                return Promise.all(promises);
            }
        }
    }
};

new Script().compile('script.benji').then(events => {
    fs.writeFileSync('events.json', JSON.stringify(events, null, 2));
}).catch(err => {
    console.log(err.stack);
});

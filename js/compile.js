'use strict';

var SEGMENT_DURATION = 400;
var FRAME_RATE = 12.5;
var FRAME_MS = 1000 / FRAME_RATE;

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
        let i = 0;
        for (let segment of this.getSegments()) {
            console.log(segment);
            if (++i >= 2) {
                break;
            }
        }
    });
};

Script.prototype.getSegments = function* () {
    let eventsByThread = new Map();
    let startOffset = null;
    for (let event of doCompileScript(new Date(), this.manifest, this.root, this.scripts)) {
        if (startOffset === null) {
            startOffset = event.offset;
        }
        else if (event.offset - startOffset >= SEGMENT_DURATION) {
            yield eventsByThread;
            eventsByThread = new Map(Array.from(eventsByThread.entries()).map(kv => {
                let events = [];
                for (let event of kv[1]) {
                    if (event.offset + event.duration > startOffset + SEGMENT_DURATION) {
                        let newEvent = Object.assign({}, event);
                        let playedDuration = startOffset + SEGMENT_DURATION - event.offset;
                        newEvent.startFrame = (newEvent.startFrame || 0) + playedDuration / FRAME_RATE;
                        newEvent.offset += playedDuration;
                        newEvent.duration -= playedDuration;
                        events.push(newEvent);
                    }
                }
                return [kv[0], events];
            }));
            startOffset = event.offset;
        }
        let thread = typeof event.thread === 'number' ? event.thread : 'main';
        let events = eventsByThread.get(thread);
        if (!events) {
            eventsByThread.set(thread, events = []);
        }
        let lastEvent = events[events.length - 1];
        if (lastEvent && (lastEvent.type === 'play' || lastEvent.type === 'nothing') &&
            lastEvent.type === event.type && lastEvent.anim === event.anim) {
            lastEvent.repeat = (lastEvent.repeat || 1) + 1;
        }
        else {
            events.push(event);
        }
    }
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

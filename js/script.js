var PRELOAD_MS = 3 * 1000;

PIXI.MIPMAP_TEXTURES = false;
PIXI.SCALE_MODES.DEFAULT = PIXI.SCALE_MODES.NEAREST;

var parser;

/**
 * A version of $.get which works properly with native promises.
 */
function xhrGet(options) {
    return Promise.resolve($.get(options));
}

function getParser() {
    if (parser) {
        return Promise.resolve(parser);
    }
    else {
        return xhrGet('js/benji.pegjs').then(function (parserSrc) {
            parser = PEG.buildParser(parserSrc);
            return parser;
        });
    }
}

function Script() {
    this.createRenderer();
    this.bgEvents = [];
    this.nextBgEvent = [];
    this.bgPlayers = [];
    this.player = new Player(this.stage, 100);
    this.player.onend = this.playNextEvent.bind(this);
    this.loadCallbacks = [];
    PIXI.loader.on('load', this.onResourceLoaded.bind(this));
}

Script.prototype.createBgPlayer = function (thread) {
    var player = new Player(this.stage, thread);
    player.onend = this.playNextBgEvent.bind(this, thread);
    return player;
};

Script.prototype.play = function () {
    if (!this.events) {
        throw new Error('Script not compiled');
    }
    if (this.playing) {
        return;
    }
    this.playing = true;
    this.effectiveStartTime = new Date().getTime() - this.scriptTime;
    this.gameLoop();
};

Script.prototype.pause = function () {
    this.playing = false;
};

Script.prototype.createRenderer = function () {
    this.renderer = PIXI.autoDetectRenderer(1280, 720);
    this.renderer.backgroundColor = 0xeeeeee;
    $('#target').prepend(this.renderer.view);

    this.stage = new PIXI.Container();
};

Script.prototype.preloadAnims = function () {
    var anims = {};

    var self = this;
    this.bgEvents.forEach(function (_, thread) {
        collectAnimsToPreload(anims, self.bgEvents[thread], self.nextBgEvent[thread]);
    });
    collectAnimsToPreload(anims, this.events, this.nextEvent);

    return this.ensureAnimsLoaded(Object.keys(anims));
};

Script.prototype.ensureAnimsLoaded = function (anims) {
    if (typeof anims === 'string') {
        anims = [anims];
    }
    var resourcesNeeded = anims.map(function (anim) {
        return 'anim/' + anim + '.json';
    });
    var loader = PIXI.loader;
    var mustLoad = [];
    var mustWaitFor = [];
    resourcesNeeded.forEach(function (resourceName) {
        var resource = loader.resources[resourceName];
        var imageResource = loader.resources[resourceName + '_image'];
        if (!resource) {
            mustLoad.push(resourceName);
        }
        else if (!resource.isComplete || !imageResource || !imageResource.isComplete) {
            mustWaitFor.push(resourceName);
        }
    });
    if (mustWaitFor.length || mustLoad.length) {
        var self = this;
        return new Promise(function (resolve) {
            self.loadCallbacks.push(resolve);
            resolve.resourcesNeeded = resourcesNeeded;
            if (mustLoad.length) {
                loader.add(mustLoad);
                loader.load();
            }
        });
    }
    else {
        return Promise.resolve();
    }
}

/**
 * Called whenever a resource is loaded.
 */
Script.prototype.onResourceLoaded = function () {
    for (var i = 0; i < this.loadCallbacks.length; i++) {
        var callback = this.loadCallbacks[i];
        if (isAllLoaded(callback.resourcesNeeded)) {
            this.loadCallbacks.splice(i, 1);
            i--;
            callback();
        }
    }

    function isAllLoaded(resourcesNeeded) {
        var loader = PIXI.loader;
        for (var i = 0; i < resourcesNeeded.length; i++) {
            var resourceName = resourcesNeeded[i];
            var resource = loader.resources[resourceName];
            var imageResource = loader.resources[resourceName + '_image'];
            if (!resource || !resource.isComplete || !imageResource || !imageResource.isComplete) {
                return false;
            }
        }
        return true;
    }
}

function collectAnimsToPreload(anims, events, startEvent) {
    if (!events || events.length === 0) {
        return;
    }
    var duration = 0;
    var i = startEvent;

    while (duration < PRELOAD_MS) {
        var evt = events[i];

        if (evt.event.type === 'play') {
            var anim = evt.event.anim;
            anims[anim] = 1;
        }
        else if (evt.event.type === 'background') {
            collectAnimsToPreload(anims, evt.event.events, 0);
        }

        duration += evt.duration;
        i++;
        if (i >= events.length) {
            i = 0;
        }
    }
}

Script.prototype.gameLoop = function () {
    if (!this.playing) {
        return;
    }
    this.scriptTime = new Date().getTime() - this.effectiveStartTime;
    var self = this;
    this.bgPlayers.forEach(function (player) {
        player.update(self.scriptTime);
    });
    this.player.update(self.scriptTime);
    this.renderer.render(this.stage);
    requestAnimationFrame(this.gameLoop.bind(this));
};

Script.prototype.playEventAfterTime = function (time) {
    var self = this;
    var lastBgEvents = [];
    for (var i = 0; i < this.events.length; i++) {
        var evt = this.events[i];
        if (evt.event && evt.event.type === 'background') {
            lastBgEvents[evt.event.thread] = evt.event.events;
        }
        if (evt.time >= time) {
            lastBgEvents.forEach(function (events, thread) {
                if (events) {
                    self.setBg(thread, events);
                }
            });
            return this.playNextEvent(i);
        }
    }
    console.warn('No events after time ' + time);
    return this.playNextEvent();
};

Script.prototype.playNextEvent = function (eventIdx) {
    if (eventIdx) {
        this.nextEvent = eventIdx;
        this.updateDialog(0, '');
        this.updateDialog(1, '');
    }
    this.preloadAnims();

    var self = this;
    var evt;
    return Promise.resolve().then(function () {
        while (true) {
            evt = self.events[self.nextEvent];
            self.nextEvent++;
            if (self.nextEvent >= self.events.length) {
                self.nextEvent = 0;
            }

            if (evt.event.type === 'play') {
                var anim = evt.event.anim;
                return self.ensureAnimsLoaded(anim).then(function () {
                    self.player.play(anim, self.scriptTime);
                });
            }
            else if (evt.event.type === 'dialog') {
                self.updateDialog(evt.event.pos, evt.event.dialog);
            }
            else if (evt.event.type === 'clear-dialog') {
                self.updateDialog(evt.event.pos, '');
            }
            else if (evt.event.type === 'background') {
                self.setBg(evt.event.thread, evt.event.events);
            }
            else if (evt.event.type === 'nothing') {
                self.player.playNothing(evt.duration, self.scriptTime);
                return;
            }
            else {
                console.error('Unknown event: ' + evt.event.type);
                return;
            }
        }
    }).then(function () {
        self.updateTimestamp(new Date(evt.time).toTimeString().substr(0, 8));
    });
};
Script.prototype.setBg = function (thread, events) {
    this.bgEvents[thread] = events;
    this.nextBgEvent[thread] = 0;
    this.playNextBgEvent(thread);
};

Script.prototype.playNextBgEvent = function (thread) {
    var self = this;
    if (!this.bgEvents[thread]) {
        return;
    }
    this.preloadAnims();
    return Promise.resolve().then(function () {
        while (true) {
            var evt = self.bgEvents[thread][self.nextBgEvent[thread]];
            self.nextBgEvent[thread]++;
            if (self.nextBgEvent[thread] >= self.bgEvents[thread].length) {
                self.nextBgEvent[thread] = 0;
            }

            if (evt.event.type === 'play') {
                var anim = evt.event.anim;
                return self.ensureAnimsLoaded(anim).then(function () {
                    self.getBgPlayer(thread).play(anim, self.scriptTime);
                })
            }
            else if (evt.event.type === 'dialog') {
                self.updateDialog(evt.event.pos, evt.event.dialog);
            }
            else if (evt.event.type === 'clear-dialog') {
                self.updateDialog(evt.event.pos, '');
            }
            else if (evt.event.type === 'nothing') {
                self.getBgPlayer(thread).playNothing(evt.duration, self.scriptTime);
                return;
            }
            else if (evt.event.type !== 'background') {
                console.error('Unknown event: ' + evt.event.type);
                return;
            }
        }
    });
};

Script.prototype.getBgPlayer = function (thread) {
    if (!this.bgPlayers[thread]) {
        this.bgPlayers[thread] = this.createBgPlayer(thread);
    }
    return this.bgPlayers[thread];
}

Script.prototype.updateDialog = function (pos, dialog) {
    if (pos === 0) {
        $('#dialog-left').text(dialog);
    }
    else if (pos === 1) {
        $('#dialog-right').text(dialog);
    }
};

Script.prototype.updateTimestamp = function (timestamp) {
    $('#timestamp').text(timestamp);
};

Script.prototype.load = function (scriptPath) {
    this.playing = false;
    var self = this;

    return xhrGet({
        url: 'anim/anims.json',
        dataType: 'json'
    }).then(function (manifest) {
        self.manifest = manifest;
        self.scripts = {};

        return xhrGet(scriptPath).then(function (scriptSrc) {
            return getParser().then(function (parser) {
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
            return xhrGet(filename).then(function (src) {
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

Script.prototype.compile = function (dateStr) {
    if (!dateStr) {
        throw new Error('Must specify date');
    }
    var date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        throw new Error('invalid date');
    }
    var time = ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000;

    this.playing = false;
    this.nextEvent = 0;
    this.scriptTime = 0;

    var self = this;
    return compileScript(date, this.manifest, this.root, this.scripts).then(function (events) {
        self.events = events;
        return self.playEventAfterTime(time);
    });
};

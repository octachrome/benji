var PRELOAD_MS = 3 * 1000;

var parser;

function getParser() {
	if (parser) {
		return Promise.resolve(parser);
	}
	else {
		return $.get('/js/benji.pegjs').then(function (parserSrc) {
			parser = PEG.buildParser(parserSrc);
			return parser;
		});
	}
}

function Script() {
    this.createRenderer();
    this.bgEvents = [];
    this.nextBgEvent = [];
    this.bgPlayers = [
        this.createBgPlayer(0),
        this.createBgPlayer(1)
    ];
    this.player = new Player(this.stage);
    this.player.onend = this.playNextEvent.bind(this);
    this.loadCallbacks = [];
}

Script.prototype.createBgPlayer = function (thread, hidden) {
    var player = new Player(this.stage, hidden);
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

    collectAnimsToPreload(anims, this.bgEvents[0], this.nextBgEvent[0]);
    collectAnimsToPreload(anims, this.bgEvents[1], this.nextBgEvent[1]);
    collectAnimsToPreload(anims, this.events, this.nextEvent);

    var resourcesNeeded = Object.keys(anims).map(function (anim) {
        return 'anim/' + anim + '.json';
    });
    return this.ensureResourcesLoaded(resourcesNeeded);
};

Script.prototype.ensureResourcesLoaded = function (resourcesNeeded) {
    var loader = PIXI.loader;
    var mustLoad = [];
    var mustWaitFor = [];
    resourcesNeeded.forEach(function (resourceName) {
        var resource = loader.resources[resourceName];
        if (!resource) {
            mustLoad.push(resourceName);
        }
        else if (!resource.data) {
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
                loader.load(self.onResourcesLoaded.bind(self));
            }
        });
    }
    else {
        return Promise.resolve();
    }
}

Script.prototype.onResourcesLoaded = function () {
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
            if (!resource || !resource.data) {
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
    }
    var self = this;
    return this.preloadAnims().then(function () {
        while (true) {
            var evt = self.events[self.nextEvent];
            self.nextEvent++;
            if (self.nextEvent >= self.events.length) {
                self.nextEvent = 0;
            }

            if (evt.event.type === 'play') {
                var anim = evt.event.anim;
                self.player.play(anim, self.scriptTime);
                break;
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
                break;
            }
            else {
                console.error('Unknown event: ' + evt.event.type);
                break;
            }
        }
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
    return this.preloadAnims().then(function () {
        while (true) {
            var evt = self.bgEvents[thread][self.nextBgEvent[thread]];
            self.nextBgEvent[thread]++;
            if (self.nextBgEvent[thread] >= self.bgEvents[thread].length) {
                self.nextBgEvent[thread] = 0;
            }

            if (evt.event.type === 'play') {
                var anim = evt.event.anim;
                self.bgPlayers[thread].play(anim, self.scriptTime);
                break;
            }
            else if (evt.event.type === 'dialog') {
                self.updateDialog(evt.event.pos, evt.event.dialog);
            }
            else if (evt.event.type === 'clear-dialog') {
                self.updateDialog(evt.event.pos, '');
            }
            else if (evt.event.type === 'nothing') {
                self.bgPlayers[thread].playNothing(evt.duration, self.scriptTime);
                break;
            }
            else if (evt.event.type !== 'background') {
                console.error('Unknown event: ' + evt.event.type);
                break;
            }
        }
    });
};

Script.prototype.updateDialog = function (pos, dialog) {
    if (pos === 0) {
        $('#dialog-left').text(dialog);
    }
    else if (pos === 1) {
        $('#dialog-right').text(dialog);
    }
};

Script.prototype.load = function (scriptPath) {
    this.playing = false;
    var self = this;

	return $.get('anim/anims.json').then(function (manifest) {
		self.manifest = manifest;

	    return $.get(scriptPath).then(function (scriptSrc) {
	        return getParser().then(function (parser) {
	            self.root = parser.parse(scriptSrc);
	        });
	    });
	});
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
    this.events = compileScript(date, this.manifest, this.root);

    this.nextEvent = 0;
    this.scriptTime = 0;

    return this.playEventAfterTime(time);
};

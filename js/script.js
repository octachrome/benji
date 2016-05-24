var PRELOAD_MS = 5 * 1000;

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
    this.player = new Player(this.stage);
    this.player.onend = this.playNextEvent.bind(this);
    this.bgPlayer = new Player(this.stage);
    this.bgPlayer.onend = this.playNextBgAnim.bind(this);
}

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

    // Always keep the current background animation around.
    if (this.bgAnims) {
        this.bgAnims.forEach(function (anim) {
            anims[anim] = 1;
        });
    }

    var duration = 0;
    var i = this.nextEvent;

    while (duration < PRELOAD_MS) {
        var evt = this.events[i];

        if (evt.event.type === 'play') {
            var anim = evt.event.anim;
            anims[anim] = 1;
        }
        else if (evt.event.type === 'background') {
            evt.event.anims.forEach(function (anim) {
                anims[anim] = 1;
            });
        }

        duration += evt.duration;
        i++;
        if (i >= this.events.length) {
            i = 0;
        }
    }

    var resourcesNeeded = Object.keys(anims).map(function (anim) {
        return 'anim/' + anim + '.json';
    });
    var loader = PIXI.loader;
    var resourcesPresent = Object.keys(loader.resources).filter(function (resource) {
        return !/_image$/.test(resource);
    });

    var mustLoad = _.difference(resourcesNeeded, resourcesPresent);
    var mustUnload = _.difference(resourcesPresent, resourcesNeeded);
/*
    mustUnload.forEach(function (res) {
        var resource = PIXI.loader.resources[res];
        var firstTexture = resource.textures[Object.keys(resource.textures)[0]];
        firstTexture.destroy(true);
        delete loader.resources[res];
        delete loader.resources[res + '_image'];
    });
*/
    if (mustLoad.length) {
        loader.add(mustLoad);
        return new Promise(function (resolve, reject) {
            loader.load(function () {
                resolve();
            });
        });
    }
    else {
        return Promise.resolve();
    }
};

Script.prototype.gameLoop = function () {
    if (!this.playing) {
        return;
    }
    this.scriptTime = new Date().getTime() - this.effectiveStartTime;
    this.player.update(this.scriptTime);
    this.bgPlayer.update(this.scriptTime);
    this.renderer.render(this.stage);
    requestAnimationFrame(this.gameLoop.bind(this));
};

Script.prototype.playNextEvent = function (idx) {
    if (idx) {
        this.nextEvent = idx;
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
                self.setBg(evt.event.anims);
            }
            else {
                console.error('Unknown event: ' + evt.event.type);
                break;
            }
        }
    });
};

Script.prototype.setBg = function (anims) {
    this.bgAnims = anims;
    this.nextBgAnim = 0;
    this.playNextBgAnim();
};

Script.prototype.playNextBgAnim = function () {
    if (this.bgAnims) {
        this.bgPlayer.play(this.bgAnims[this.nextBgAnim], this.scriptTime);
        this.nextBgAnim++;
        if (this.nextBgAnim >= this.bgAnims.length) {
            this.nextBgAnim = 0;
        }
    }
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

Script.prototype.compile = function (date) {
    if (!date) {
        throw new Error('Must specify date');
    }
    this.playing = false;
    this.events = compileScript(date, this.manifest, this.root);

    this.nextEvent = 0;
    this.scriptTime = 0;

    var self = this;
    return self.playNextEvent();
};

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
}

Script.prototype.play = function (scriptPath) {
    var self = this;
    this.nextEvent = 0;
    this.createRenderer();
    this.player = new Player(this.stage);
    this.player.onend = this.nextAnimEvent.bind(this);
    return this.loadScript(scriptPath).then(function () {
        return self.preloadAnims().then(function () {
            self.nextAnimEvent();
            self.gameLoop();
        });
    });
};

Script.prototype.createRenderer = function () {
    this.renderer = PIXI.autoDetectRenderer(1280, 720);
    this.renderer.backgroundColor = 0xeeeeee;
    $('#target').prepend(this.renderer.view);

    this.stage = new PIXI.Container();
};

Script.prototype.preloadAnims = function (callback) {
    var anims = {};
    for (var i = 0; i < this.events.length; i++) {
        var evt = this.events[i];
        if (evt.event.type === 'play') {
            anims[evt.event.anim] = 1;
        }
    }
    var loader = PIXI.loader;
    Object.keys(anims).forEach(function (a) {
        loader.add('anim/' + a + '.json');
    });
    return new Promise(function (resolve, reject) {
        loader.load(function () {
            resolve();
        });
    });
};

Script.prototype.gameLoop = function () {
    this.player.update();
    this.renderer.render(this.stage);
    requestAnimationFrame(this.gameLoop.bind(this));
};

Script.prototype.nextAnimEvent = function () {
    while (true) {
        if (this.nextEvent >= this.events.length) {
            this.nextEvent = 0;
        }
        var evt = this.events[this.nextEvent];
        this.nextEvent++;

        if (evt.event.type === 'play') {
            var anim = evt.event.anim;
            this.player.play(anim);
            break;
        }
        else if (evt.event.type === 'dialog') {
            this.updateDialog(evt.event.pos, evt.event.dialog);
        }
        else if (evt.event.type === 'clear-dialog') {
            this.updateDialog(evt.event.pos, '');
        }
        else if (evt.event.type === 'background-on') {
            var bg = evt.event.anim;
            // this.extendLayers(bg);
        }
        else if (evt.event.type === 'background-off') {
            var oldBg = evt.event.anim;
            // this.unextendLayers(oldBg);
        }
        else {
            console.error('Unknown event: ' + evt.event.type);
            break;
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

Script.prototype.loadScript = function (scriptPath) {
    var self = this;

	return $.get('anim/anims.json').then(function (manifest) {
		self.manifest = manifest;

	    return $.get(scriptPath).then(function (scriptSrc) {
	        return getParser().then(function (parser) {
	            self.root = parser.parse(scriptSrc);
                self.events = compileScript('2016-01-01', manifest, self.root);
	        });
	    });
	});
};

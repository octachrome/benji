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
    this.nextBgEvent = [];
    this.bgPlayers = [];
    this.player = new Player2(this.stage, 100, this.onEvent.bind(this));
}

Script.prototype.getBgPlayer = function (thread) {
    if (!this.bgPlayers[thread]) {
        this.bgPlayers[thread] = new Player2(this.stage, thread);
    }
    return this.bgPlayers[thread];
};

Script.prototype.onEvent = function (event) {
    if (event.event.type === 'dialog') {
        this.updateDialog(event.event.pos, event.event.dialog);
    }
    else if (event.event.type === 'clear-dialog') {
        this.updateDialog(event.event.pos, '');
    }
    else if (event.event.type === 'background') {
        var bgPlayer = this.getBgPlayer(event.event.thread);
        bgPlayer.init(event.event.events);
    }
};

Script.prototype.play = function (time) {
    if (!this.events) {
        throw new Error('Script not compiled');
    }
    if (typeof time === 'number') {
        this.playerTimeDelay = time - this.getGameTime(0);
    }
    else {
        this.playerTimeDelay = 0;
    }
    this.updateDialog(0, '');
    this.updateDialog(1, '');
    if (this.playing) {
        return;
    }
    this.playing = true;
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

Script.prototype.gameLoop = function () {
    if (!this.playing) {
        return;
    }
    var gameTime = this.getGameTime();
    this.player.update(gameTime);
    this.renderer.render(this.stage);
    var bgPlayers = this.bgPlayers;
    Object.keys(bgPlayers).forEach(function (thread) {
        bgPlayers[thread].update(gameTime);
    });

    this.player.preload(gameTime);
    Object.keys(bgPlayers).forEach(function (thread) {
        bgPlayers[thread].preload(gameTime);
    });
    requestAnimationFrame(this.gameLoop.bind(this));
};

Script.prototype.getGameTime = function (delay) {
    var now = new Date();
    now.setFullYear(1970);
    now.setMonth(0);
    now.setDate(1);
    return now.getTime() + (typeof delay === 'number' ? delay : this.playerTimeDelay);
};

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
        self.player.init(events);
        self.events = events;
        return self.play();
    });
};

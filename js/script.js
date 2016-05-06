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

Script.prototype.getAnimLength = function (name) {
    if (this.metadata[name]) {
        var segment = this.metadata[name].segment;
        var anim = this.anims[name];
        var frames = segment[1] - segment[0];
        return Math.floor(1000 * frames / anim.fr);
    } else {
        // 3 seconds for unknown animation.
        return 3000;
    }
};

Script.prototype.play = function (scriptPath) {
    var self = this;
    return this.load(scriptPath).then(function () {
        // self.nextAnimEvent();
    });
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
            if (this.metadata[anim]) {
                this.bm.playSegments(this.metadata[anim].segment, true);
                this.bm.play();
            } else {
                console.error('Unknown animation: ' + anim);
                setTimeout(this.nextAnimEvent.bind(this), 100);
            }
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
            this.extendLayers(bg);
        }
        else if (evt.event.type === 'background-off') {
            var oldBg = evt.event.anim;
            this.unextendLayers(oldBg);
        }
        else {
            console.error('Unknown event: ' + evt.event.type);
            break;
        }
    }
};

Script.prototype.extendLayers = function(name) {
    if (this.metadata[name]) {
        var layerRange = this.metadata[name].layers;
        for (var l = layerRange[0]; l < layerRange[1]; l++) {
            var layer = this.animationData.layers[l];
            layer.ip = this.animationData.ip;
            layer.op = this.animationData.op;
            // todo: may have nested layers and/or asset layers
        }
    } else {
        console.error('Unknown animation: ' + name);
    }
}

Script.prototype.unextendLayers = function(name) {
    if (this.metadata[name]) {
        var layerRange = this.metadata[name].layers;
        var segment = this.metadata[name].segment;
        for (var l = layerRange[0]; l < layerRange[1]; l++) {
            var layer = this.animationData.layers[l];
            layer.ip = segment[0];
            layer.op = segment[1];
            // todo: may have nested layers and/or asset layers
        }
    } else {
        console.error('Unknown animation: ' + name);
    }
}

Script.prototype.updateDialog = function (pos, dialog) {
    if (pos === 0) {
        $('#dialog-left').text(dialog);
    }
    else if (pos === 1) {
        $('#dialog-right').text(dialog);
    }
};

Script.prototype.load = function (scriptPath) {
    var self = this;

	return $.get('anim/anims.json').then(function (manifest) {
		self.manifest = manifest;

	    return $.get(scriptPath).then(function (scriptSrc) {
	        return getParser().then(function (parser) {
	            self.root = parser.parse(scriptSrc);

                self.events = compileScript('2016-01-01', manifest, self.root);
                console.log(self.events);

/*	            var animNames = extractAnims(self.root);
	            return fetchAnims(animNames).then(function (anims) {
	                self.anims = anims;

	                self.animationData = {};
	                self.metadata = {};
	                animNames.forEach(function (aname) {
	                    self.metadata[aname] = combine(self.animationData, anims[aname]);
	                });

	                bodymovin.setSubframeRendering(false);

	                self.bm = bodymovin.loadAnimation({
	                    wrapper: $('#target')[0],
	                    animType: 'svg',
	                    autoplay: false,
	                    loop: false,
	                    animationData: self.animationData
	                });

	                self.bm.addEventListener('complete', function (e) {
	                    self.nextAnimEvent();
	                });

	                console.log(self.events);
	                self.nextEvent = 0;
	            });
*/	        });
	    });

	});
};

var PRELOAD_CONCURRENCY = 1;
var PRELOAD_MS = 3 * 1000;

function Player2(stage, zIndex, onEvent) {
    this.sprite = new PIXI.Sprite();
    this.sprite.zIndex = zIndex || 0;
    this.sprite.visible = true;
    this.onEvent = onEvent;
    stage.addChild(this.sprite);
    stage.children.sort(function(a, b) {
        a.zIndex = a.zIndex || 0;
        b.zIndex = b.zIndex || 0;
        return a.zIndex - b.zIndex;
    });
    this.loadCallbacks = [];
    this.loader = new PIXI.loaders.Loader('', PRELOAD_CONCURRENCY);
    this.loader.on('load', this.onResourceLoaded.bind(this));
    this.init();
}

Player2.prototype.init = function (events) {
    this.loader.reset();
    this.events = events || [];
    this.curEventIdx = 0;
    if (this.events.length === 0) {
        this.totalDuration = 0;
        this.startTime = 0;
    }
    else {
        var firstEvent = events[0];
        var lastEvent = events[events.length - 1];
        this.startTime = firstEvent.time;
        this.totalDuration = lastEvent.time - firstEvent.time + lastEvent.duration;
    }
};

Player2.prototype.update = function (gameTime) {
    if (!this.events.length) {
        return;
    }
    if (gameTime < this.startTime) {
        // Events not yet started.
        return;
    }
    gameTime = this.getRelativeGameTime(gameTime);
    var prevEventIdx = this.curEventIdx;
    var curEventIdx = this.getCurrentEventIndex(gameTime);
    if (curEventIdx === null) {
        return;
    }
    this.curEventIdx = curEventIdx;
    this.notifyEventsBetween(prevEventIdx, curEventIdx);
    // Show the frame.
    var curEvent = this.events[curEventIdx];
    var resource = this.loader.resources['anim/' + curEvent.event.anim + '.json'];
    if (!resource || !resource.textures) {
        return;
    }
    var textureNames = Object.keys(resource.textures).sort();
    var timeOffset = gameTime - curEvent.time;
    var frame = Math.floor(timeOffset * FRAME_RATE / 1000);
    if (frame < textureNames.length) {
        var textureName = textureNames[frame];
        this.sprite.texture = resource.textures[textureName];
        this.sprite.visible = true;
    }
};

Player2.prototype.notifyEventsBetween = function (prevEventIdx, curEventIdx) {
    var eventsBetween = curEventIdx - prevEventIdx;
    if (eventsBetween < 0) {
        // Handle wraparound.
        eventsBetween += this.events.length;
    }
    if (eventsBetween <= 0 || eventsBetween > 20) {
        // Probably a seek.
        return;
    }
    var i = prevEventIdx;
    while (i !== curEventIdx) {
        i++;
        if (i >= this.events.length) {
            i -= this.events.length;
        }
        this.onEvent && this.onEvent(this.events[i]);
    }
};

Player2.prototype.getRelativeGameTime = function (gameTime) {
    // After the end, loop back to the beginning.
    var repeats = Math.floor((gameTime - this.startTime) / this.totalDuration);
    return gameTime - repeats * this.totalDuration;
};

Player2.prototype.getCurrentEventIndex = function (gameTime) {
    // Find the current event.
    var curEventIdx = this.curEventIdx;
    var curEvent = this.events[curEventIdx];
    if (curEvent.time > gameTime) {
        // The event is in the future - rewind.
        curEventIdx = 0;
        curEvent = this.events[0];
    }
    while (curEvent.event.type !== 'play' || curEvent.time + curEvent.duration < gameTime) {
        curEventIdx++;
        if (curEventIdx >= this.events.length) {
            // Should never happen.
            return null;
        }
        curEvent = this.events[curEventIdx];
    }
    return curEventIdx;
};

Player2.prototype.hide = function () {
    this.sprite.visible = false;
};

Player2.prototype.preload = function (gameTime) {
    if (!this.events.length) {
        return;
    }
    if (gameTime < this.startTime) {
        // Events not yet started.
        return;
    }
    gameTime = this.getRelativeGameTime(gameTime);
    var curEventIdx = this.getCurrentEventIndex(gameTime);
    if (curEventIdx === null) {
        return Promise.resolve();
    }
    var anims = {};
    var curEvent = this.events[curEventIdx];
    var timeOffset = 0;
    while (curEvent.time + timeOffset < gameTime + PRELOAD_MS) {
        if (curEvent.event.type === 'play') {
            anims[curEvent.event.anim] = true;
        }
        curEventIdx++;
        if (curEventIdx >= this.events.length) {
            // Wrap to the start.
            curEventIdx = 0;
            timeOffset += this.totalDuration;
        }
        curEvent = this.events[curEventIdx];
    }
    return this.ensureAnimsLoaded(Object.keys(anims));
};

Player2.prototype.ensureAnimsLoaded = function (anims) {
    if (typeof anims === 'string') {
        anims = [anims];
    }
    var resourcesNeeded = anims.map(function (anim) {
        return 'anim/' + anim + '.json';
    });
    var mustLoad = [];
    var mustWaitFor = [];
    var self = this;
    resourcesNeeded.forEach(function (resourceName) {
        var resource = self.loader.resources[resourceName];
        var imageResource = self.loader.resources[resourceName + '_image'];
        if (!resource) {
            mustLoad.push(resourceName);
        }
        else if (!resource.isComplete || !imageResource || !imageResource.isComplete) {
            mustWaitFor.push(resourceName);
        }
    });
    if (mustWaitFor.length || mustLoad.length) {
        return new Promise(function (resolve) {
            self.loadCallbacks.push(resolve);
            resolve.resourcesNeeded = resourcesNeeded;
            if (mustLoad.length) {
                self.loader.add(mustLoad);
                self.loader.load();
            }
        });
    }
    else {
        return Promise.resolve();
    }
}

Player2.prototype.onResourceLoaded = function () {
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

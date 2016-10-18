function Player(stage, zIndex) {
    this.sprite = new PIXI.Sprite();
    this.sprite.zIndex = zIndex || 0;
    this.sprite.visible = false;
    this.sprite.alpha = 0.8;
    stage.addChild(this.sprite);
    stage.children.sort(function(a, b) {
        a.zIndex = a.zIndex || 0;
        b.zIndex = b.zIndex || 0;
        return a.zIndex - b.zIndex;
    });
}

Player.prototype.play = function (animName, startTime, repeat) {
    var resource = PIXI.loader.resources['anim/' + animName + '.json'];
    if (!resource) {
        throw new Error('Animation not loaded: ' + animName);
    }
    this.textures = resource.textures;
    this.textureNames = Object.keys(this.textures).sort();
    this.playingNothingFor = null;
    this.startTime = startTime;
    this.sprite.texture = this.textures[this.textureNames[0]];
    this.sprite.visible = true;
    this.playing = true;
    this.repeat = repeat;
};

Player.prototype.playNothing = function (duration, startTime) {
    this.sprite.visible = false;
    this.playingNothingFor = duration;
    this.startTime = startTime;
    this.playing = true;
};

Player.prototype.update = function (time) {
    if (!this.playing) {
        return;
    }
    var elapsedTime = time - this.startTime;

    if (this.playingNothingFor) {
        if (elapsedTime >= this.playingNothingFor) {
            this.playing = false;
            this.playingNothingFor = null;
            this.onend && this.onend();
        }
        return;
    }

    var frame = Math.floor(elapsedTime * FRAME_RATE / 1000);
    if (frame >= this.textureNames.length) {
        if (this.repeat) {
            frame = frame % this.textureNames.length;
        }
        else {
            this.playing = false;
            this.onend && this.onend();
            return;
        }
    }
    var textureName = this.textureNames[frame];
    this.sprite.texture = this.textures[textureName];
}

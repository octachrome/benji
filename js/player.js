function Player(stage) {
    this.stage = stage;
}

Player.prototype.play = function(animName, startTime, repeat) {
    var resource = PIXI.loader.resources['anim/' + animName + '.json'];
    if (!resource) {
        throw new Error('Animation not loaded: ' + animName);
    }
    this.textures = resource.textures;
    this.textureNames = Object.keys(this.textures).sort();
    this.startTime = startTime;

    if (!this.sprite) {
        this.sprite = new PIXI.Sprite(this.textures[this.textureNames[0]]);
        this.stage.addChild(this.sprite);
    }
    else {
        this.sprite.texture = this.textures[this.textureNames[0]];
    }

    this.playing = true;
    this.repeat = repeat;
};

Player.prototype.update = function(time) {
    if (!this.playing) {
        return;
    }
    var elapsedTime = time - this.startTime;
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

function Player(stage) {
    this.stage = stage;
}

Player.prototype.play = function(animName) {
    var resource = PIXI.loader.resources['anim/' + animName + '.json'];
    if (!resource) {
        throw new Error('Animation not loaded: ' + animName);
    }
    this.textures = resource.textures;
    this.textureNames = Object.keys(this.textures).sort();
    this.startTime = new Date().getTime();

    if (!this.sprite) {
        this.sprite = new PIXI.Sprite(this.textures[this.textureNames[0]]);
        this.stage.addChild(this.sprite);
    }
    else {
        this.sprite.texture = this.textures[this.textureNames[0]];
    }

    this.playing = true;
};

Player.prototype.update = function() {
    if (!this.playing) {
        return;
    }
    var elapsedTime = new Date().getTime() - this.startTime;
    var frame = Math.floor(elapsedTime * FRAME_RATE / 1000);
    if (frame >= this.textureNames.length) {
        this.playing = false;
        this.onend && this.onend();
    }
    else {
        var textureName = this.textureNames[frame];
        this.sprite.texture = this.textures[textureName];
    }
}

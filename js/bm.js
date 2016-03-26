// data:
// ip = starting frame
// op = last frame
// ip and op are ignored if playSegments is used
// fr = frame rate
// layer:
// ip, op, as above (but changing ip causes the layer to be invisible until that frame is reached; layer plays from midway through)
// ip and op are specified wrt the parent layer's current frame.
// st = shifts the start time of the layer wrt to its parent (layer is invisible until st frame is reached; layer plays from beginning)
// st is not applied to ip or op, it just shifts the child layers/animations
// ind = index, from 1 to #layers
// parent = index of parent layer (for relative pos/movement)
// ks = animation data
// ks:
// a = origin for rotations: [float, float, 0]
// p = position animation: [float, float, 0] or [{anim}, {anim}]
// r = rotation animation: float, or [{anim}, {anim}, {t:24}], or rarely [{path}, {t:24}]
// s = scale: [float, float, float], normally [1, 1, 1]
// o = opacity: 100
// anim:
// t = frame
// s = starting values (angle or pos)
// e = ending values (angle or pos)
// n = name?
// i, o = something that affects acceleration
// ti = ?
// to = ?

'use strict';

// Useful for searching animation JSOM data for, e.g., 't' properties.
function findProp(obj, query) {
  var keys = {};
  function prefix(pref, suff) {
    return pref ? pref + '/' + suff : suff;
  }
  function fp(obj, query, pref) {
    if (!obj) {
      return;
    }
    if (typeof obj === 'object') {
      for (var k in obj) {
        if (obj.hasOwnProperty(k)) {
          if (k === query) {
            var generic = prefix(pref, k).replace(/[0-9]+/g, '0');
            keys[generic] = true;
          }
          fp(obj[k], query, prefix(pref, k));
        }
      }
    }
  }
  fp(obj, query);
  console.log(Object.keys(keys).join('\n'));
}

/**
 * Reindex the layers of an animation so that it can be combined with another one.
 */
function reindex(adata, base) {
    var offset = base || adata.layers.length;
    for (var l = 0; l < adata.layers.length; l++) {
        var layer = adata.layers[l];
        layer.ind += offset;
        if (typeof layer.parent === 'number') {
            layer.parent += offset;
        }
    }
}

/**
 * Create a reverse copy of an animation.
 */
function reverse(adata) {
    adata = $.extend(true, {}, adata);
    for (var l = 0; l < adata.layers.length; l++) {
        var layer = adata.layers[l];
        if (typeof layer.ks.p[0] === 'object') {
            var ptimes = layer.ks.p.map(function (o) {return adata.op - o.t}).reverse();
            layer.ks.p = layer.ks.p.reverse();
            layer.ks.p.push(layer.ks.p.shift());
            for (var p = 0; p < layer.ks.p.length - 1; p++) {
                var ptmp = layer.ks.p[p].e;
                layer.ks.p[p].e = layer.ks.p[p].s;
                layer.ks.p[p].s = ptmp;
                layer.ks.p[p].t = ptimes[p];
            }
        }
        if (typeof layer.ks.r[0] === 'object') {
            var rtimes = layer.ks.r.map(function (o) {return adata.op - o.t}).reverse();
            layer.ks.r = layer.ks.r.reverse();
            layer.ks.r.push(layer.ks.r.shift());
            for (var r = 0; r < layer.ks.r.length; r++) {
                var rtmp = layer.ks.r[r].e;
                layer.ks.r[r].e = layer.ks.r[r].s;
                layer.ks.r[r].s = rtmp;
                layer.ks.r[r].t = rtimes[r];
            }
        }
    }
    return adata;
}

function fixLayerBounds(adata) {
    for (var l = 0; l < adata.layers.length; l++) {
        var layer = adata.layers[l];
        if (layer.ip < adata.ip) {
            layer.ip = adata.ip;
        }
        if (layer.op > adata.op) {
            layer.op = adata.op;
        }
    }
}

/**
 * Shift an animation in time.
 */
function shift(adata, offset) {
    adata.ip += offset;
    adata.op += offset;
    shiftLayers(adata.layers, offset);
    if (adata.assets) {
        for (var a = 0; a < adata.assets.length; a++) {
            shiftLayers(adata.assets[a].layers, offset);
        }
    }
}

function shiftLayers(layers, offset) {
    if (layers) {
        for (var l = 0; l < layers.length; l++) {
            var layer = layers[l];
            layer.ip += offset;
            layer.op += offset;
            shiftData(layer.ks && layer.ks.p, offset);
            shiftData(layer.ks && layer.ks.r, offset);
            shiftData(layer.ks && layer.ks.v, offset);
            if (Array.isArray(layer.ef)) {
              for (var e = 0; e < layer.ef.length; e++) {
                shiftData(layer.ef[e].p, offset);
                shiftData(layer.ef[e].v, offset);
                shiftData(layer.ef[e].r, offset);
              }
            }
            shiftLayers(layer.layers, offset);
        }
    }
}

function shiftData(arr, offset) {
  if (Array.isArray(arr)) {
    for (var p = 0; p < arr.length; p++) {
        if (typeof arr[p] === 'object' && typeof arr[p].t === 'number') {
            arr[p].t += offset;
        }
    }
  }
  else if (arr && arr.k) {
    shiftData(arr.k, offset);
  }
}

function addAssetPrefix(adata, prefix) {
    var i;
    for (i = 0; i < adata.assets.length; i++) {
        if (adata.assets[i].id) {
            adata.assets[i].id = prefix + adata.assets[i].id;
        }
    }
    for (i = 0; i < adata.layers.length; i++) {
        if (adata.layers[i].refId) {
            adata.layers[i].refId = prefix + adata.layers[i].refId;
        }
    }
}

function combine(dest, src) {
    // Make a copy.
    src = $.extend(true, {}, src);
    fixLayerBounds(src);
    if (!dest.layers) {
        $.extend(true, dest, src);
    } else {
        addAssetPrefix(src, 'assets_' + dest.layers.length + '_');
        reindex(src, dest.layers.length);
        shift(src, dest.op);
        dest.layers = dest.layers.concat(src.layers);
        dest.assets = dest.assets.concat(src.assets);
        dest.op = src.op;
    }
    return {
      segment: [src.ip, src.op],
      layers: [dest.layers.length - src.layers.length, dest.layers.length],
    };
}

function fetchAnims(anims) {
    return $.when.apply($, anims.map(function (name) {
        return $.get('anim/' + name + '.json');
    })).then(function () {
        var result = {};
        if (anims.length === 1) {
            result[anims[0]] = arguments[0];
            result[anims[0]].name = anims[0];
        }
        else {
            for (var i = 0; i < arguments.length; i++) {
                result[anims[i]] = arguments[i][0];
                result[anims[i]].name = anims[i];
            }
        }
        return result;
    });
}

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

function extractAnims(root) {
  var bg = [];
  var fg = [];
  function extract(script) {
    if (script.children) {
      script.children.forEach(extract);
    }
    else if (script.type === 'Cmd' && script.cmd === 'play') {
      fg.push(script.args[0]);
    }
    else if (script.type === 'Cmd' && script.cmd === 'set' && script.args[0] === 'dialog_anims') {
      var anims = (script.args[1] || '').split(' ');
      anims.forEach(function (anim) {
        if (anim) {
          fg.push(anim);
        }
      });
    }
    else if (script.type === 'Cmd' && script.cmd === 'set' && script.args[0] === 'background') {
      bg.push(script.args[1]);
    }
    else {
      if (script.child) {
        extract(script.child);
      }
      if (script.else) {
        extract(script.else);
      }
    }
  }
  extract(root);
  // Create a unique list, with the backgrounds at the end, and without the dummy 'none' animation.
  return _.uniq(_.difference(fg, bg.concat('none')).concat(bg));
}

function fetchAnims(anims) {
    return $.when.apply($, anims.map(function (name) {
        return $.get('anim/' + name + '.json');
    })).then(function () {
        var result = {};
        if (anims.length === 1) {
            result[anims[0]] = arguments[0];
            result[anims[0]].name = anims[0];
        }
        else {
            for (var i = 0; i < arguments.length; i++) {
                result[anims[i]] = arguments[i][0];
                result[anims[i]].name = anims[i];
            }
        }
        return result;
    });
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
    self.nextAnimEvent();
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
  return $.get(scriptPath).then(function (scriptSrc) {
    return getParser().then(function (parser) {
      self.root = parser.parse(scriptSrc);
      var animNames = extractAnims(self.root);
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

        self.events = compileScript('2016-01-01', self);
        console.log(self.events);
        self.nextEvent = 0;
      });
    });
  });
};

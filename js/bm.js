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
            for (var p = 0; p < layer.ks.p.length; p++) {
                if (typeof layer.ks.p[p] === 'object') {
                    layer.ks.p[p].t += offset;
                }
            }
            for (var r = 0; r < layer.ks.r.length; r++) {
                if (typeof layer.ks.r[r] === 'object') {
                    layer.ks.r[r].t += offset;
                }
            }
        }
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
    return [src.ip, src.op];
}

function extendLayers(layers, ip, op) {
    if (layers) {
        for (var l = 0; l < layers.length; l++) {
            var layer = layers[l];
            layer.ip = ip;
            layer.op = op;
        }
    }
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

var anim;

fetchAnims([
    'answerPhone',
    // 'hangUpPhone',       // just a phone that appears and disappears
    'officeBackdrop',
    // 'phoneOnHandset',    // just a phone
    'talkOnPhone',
    'type',
    'waiting'
]).then(function (anims) {
    var officeBackdrop = anims.officeBackdrop;
    delete anims.officeBackdrop;

    var animationData = {};
    var keys = Object.keys(anims);
    var segments = {};
    keys.forEach(function (key) {
        segments[key] = combine(animationData, anims[key]);
    });

    extendLayers(officeBackdrop.layers, animationData.ip, animationData.op);
    reindex(officeBackdrop);
    animationData.layers = animationData.layers.concat(officeBackdrop.layers);

    var anim = bodymovin.loadAnimation({
        wrapper: $('#target')[0],
        animType: 'svg',
        autoplay: false,
        loop: false,
        animationData: animationData
    });

    anim.addEventListener('complete', function (e) {
        nextAnimEvent();
    });

    vm.segments(segments);
    vm.animation(anim);
});

var nextEvent;

function nextAnimEvent() {
    var anim = vm.animation();
    var events = vm.results();
    var segments = vm.segments();

    console.log(nextEvent);
    if (nextEvent >= events.length) {
        nextEvent = 0;
    }
    var evt = events[nextEvent];
    nextEvent++;

    var key = evt.anim;
    vm.nowPlaying(key);
    if (segments[key]) {
        anim.playSegments(segments[key], true);
        anim.play();
    } else {
        console.error('Unknown animation: ' + key);
        setTimeout(nextAnimEvent, 1000);
    }
}

function resetAnimation() {
    var anim = vm.animation();
    if (anim) {
        anim.stop();
    }

    nextEvent = 0;
    nextAnimEvent();
}

$(function () {
    ko.computed(function () {
        if (vm.animation() && vm.results().length) {
            resetAnimation();
        }
    });
});

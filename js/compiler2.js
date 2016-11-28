function Compiler2(manifest, includedScripts) {
    this.program = [];
    this.nextVar = 0;
    this.indentation = '';
    this.manifest = manifest;
    this.includedScripts = includedScripts;
    this.includeStack = ['main'];
}

Compiler2.prototype.compileRoot = function(node) {
    this.addLine('with ($vars) {');
    this.indent();
    this.addLine('with ($funcs) {');
    this.indent();
    this.compileNode(node);
    this.outdent();
    this.addLine('}');
    this.outdent();
    this.addLine('}');
    var func = new Function('$vars', '$funcs', '$context', this.getProgram());
    var mainState = {
        events: [],
        offset: ms('7 hours')
    };
    var context = {
        state: mainState
    };
    var chance = new Chance();
    var manifest = this.manifest;
    var vars = {};
    var funcs = {
        pick: function (array) {
            return chance.pick(array);
        },
        maybe: function (probability) {
            return chance.bool({likelihood: probability});
        },
        rand: function () {
            return chance.random();
        },
        randint: function (min, max) {
            return chance.integer({min: min, max: max});
        },
        binom: function(x, spread) {
            function defaultSpread(c) {
                if (c === 0) {
                    return 1;
                } else {
                    var l = Math.log(c / 4);
                    return Math.max(1, Math.ceil(l));
                }
            }
            if (typeof spread !== 'number') {
                spread = defaultSpread(x);
            }
            for (var i = 0; i < spread * 2; i++) {
                x += chance.pick([-0.5, 0.5]);
            }
            return Math.max(0, x);
        },
        play: function (animName) {
            var anim = manifest[animName]
            if (anim) {
                var event = {
                    type: 'anim',
                    anim: animName,
                    offset: context.state.offset
                };
                if (context.state.nextDialog) {
                    event.dialog = context.state.nextDialog;
                }
                context.state.events.push(event);
                var ms = (anim.totalFrames || 0) / FRAME_RATE * 1000;
                context.state.offset += ms;
            }
            else {
                console.error('Unknown animation: ' + animName);
                context.state.offset += 100;
            }
            context.state.nextDialog = null;
        },
        dialog: function (dialog, pos) {
            context.state.nextDialog = {
                dialog: dialog,
                pos: pos
            };
            var dialogAnim = (vars.dialog_anims || '').split(' ')[pos];
            if (dialogAnim) {
                var frames = (dialog || '').length * DIALOG_SPEED;
                var start = context.state.offset;
                while (context.state.offset - start < frames) {
                    context.state.nextDialog = {
                        dialog: dialog,
                        pos: pos
                    };
                    funcs.play(dialogAnim);
                }
            }
        },
        thread: function (thread) {
            if (thread === 'main') {
                context.state = mainState;
            }
            else {
                context.state = {
                    events: [],
                    offset: mainState.offset
                };
                mainState.events.push({
                    type: 'background',
                    events: context.state.events,
                    thread: thread
                });
            }
        }
    };
    func(vars, funcs, context);
    return Promise.resolve(mainState.events);
};

Compiler2.prototype.compileNode = function(node) {
    if (!node) {
        console.log('Possible script error: ' + new Error().stack);
        return;
    }
    var fn = this['compile' + node.type];
    if (fn) {
        fn.call(this, node);
    }
    else {
        console.error('Unknown script node type: ' + node.type);
    }
};

Compiler2.prototype.compileChild = function (node) {
    if (!node.child) {
        console.log('Possible script error: ', this.includeStack[this.includeStack.length-1], JSON.stringify(node.location));
        return;
    }
    this.compileNode(node.child)
};

Compiler2.prototype.compileSeq = function (node) {
    for (var i = 0; i < node.children.length; i++) {
        this.compileNode(node.children[i]);
    }
};

Compiler2.prototype.compileChoice = function (node) {
    this.addLine('switch ($funcs.randint(0, ', node.children.length - 1, ')) {');
    this.indent();
    for (var i = 0; i < node.children.length; i++) {
        this.addLine('case ', i, ':');
        this.indent();
        this.compileNode(node.children[i]);
        this.addLine('break;');
        this.outdent();
    }
    this.outdent();
    this.addLine('}');
};

Compiler2.prototype.compileDialog = function (node) {
    var escaped = node.dialog.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    this.addLine('$funcs.dialog("', escaped, '", ', node.pos, ');');
};

Compiler2.prototype.compileCmd = function (node) {
    var fn = this['compileCmd_' + node.cmd];
    if (fn) {
        fn.call(this, node);
    }
    else {
        console.error('Unknown script command: ' + node.cmd);
    }
};

Compiler2.prototype.compileCmd_play = function (node) {
    var anim = node.args[0];
    this.addLine('$funcs.play("', anim, '");');
};

Compiler2.prototype.compileCmd_if = function (node) {
    var condition = node.args[0];
    this.addLine('if (', condition, ') {');
    this.indent();
    this.compileChild(node);
    this.outdent();
    this.addLine('}');
    if (node.else) {
        this.addLine('else {');
        this.indent();
        this.compileChild(node);
        this.outdent();
        this.addLine('}');
    }
};

Compiler2.prototype.compileCmd_else = function () {
    // Already handled by 'if' command.
};

Compiler2.prototype.compileCmd_maybe = function (node) {
    var likelihood = node.args[0];
    this.addLine('if ($funcs.maybe(', likelihood, ')) {');
    this.indent();
    this.compileChild(node);
    this.outdent();
    this.addLine('}');
    if (node.else) {
        this.addLine('else {');
        this.indent();
        this.compileChild(node);
        this.outdent();
        this.addLine('}');
    }
};

Compiler2.prototype.compileCmd_nothing = function () {
    // Advance time.
    this.addLine('$context.state.offset += 100;');
};

Compiler2.prototype.compileCmd_background = function (node) {
    this.addLine('$funcs.thread(', node.args[0], ');');
    this.compileChild(node);
    this.addLine('$funcs.thread("main");');
};

Compiler2.prototype.compileCmd_set = function (node) {
    var varName = node.args[0]
    var value = node.args[1];
    if (varName === 'dialog_anims') {
        value = JSON.stringify(value);
    }
    this.addLine('$vars.', varName, ' = ', value, ';');
};

Compiler2.prototype.compileCmd_repeat_for = function (node) {
    var millis = ms(node.args[1] + ' ' + node.args[2]);
    var varName = 'until' + this.nextVar++;
    this.addLine('var ', varName, ' = $context.state.offset + ', millis, ';');
    this.addLine('while ($context.state.offset < ', varName, ') {');
    this.indent();
    this.compileChild(node);
    this.outdent();
    this.addLine('}');
};

Compiler2.prototype.compileCmd_repeat_until = function (node) {
    var until = parseTime(node.args[1]);
    this.addLine('while ($context.state.offset < ', until, ') {');
    this.indent();
    this.compileChild(node);
    this.outdent();
    this.addLine('}');
};

Compiler2.prototype.compileCmd_repeat = function (node) {
    var count;
    if (node.args[0]) {
        count = '$funcs.binom(' + node.args[1] + ')';
    }
    else {
        count = node.args[1];
    }
    var varName = 'loop' + this.nextVar++;
    this.addLine('for (var ', varName, ' = 0; ', varName, ' < ', count, '; ', varName, '++) {');
    this.indent();
    this.compileChild(node);
    this.outdent();
    this.addLine('}');
};

Compiler2.prototype.compileCmd_include = function (node) {
    var scriptFile = node.args[0];
    var includedScript = this.includedScripts[scriptFile];
    if (includedScript) {
        this.includeStack.push(scriptFile);
        this.compileNode(includedScript);
        this.includeStack.pop();
    }
    else {
        console.error('Unknown included script file: ' + scriptFile);
    }
};

Compiler2.prototype.compileCmd_sub = function (node) {
    var subName = node.args[0];
    this.addLine('function ', subName, '() {');
    this.indent();
    this.compileChild(node);
    this.outdent();
    this.addLine('}');
};

Compiler2.prototype.compileCmd_call = function (node) {
    var subName = node.args[0];
    this.addLine(subName, '();');
};

Compiler2.prototype.getProgram = function () {
    return this.program.join('');
};

Compiler2.prototype.indent = function () {
    this.indentation += '  ';
};

Compiler2.prototype.outdent = function () {
    this.indentation = this.indentation.substr(2);
};

Compiler2.prototype.addLine = function () {
    this.program.push(this.indentation);
    this.program.push.apply(this.program, arguments);
    this.program.push('\n');
};

function Compiler2(includedScripts) {
    this.program = [];
    this.nextVar = 0;
    this.indentation = '';
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
    this.addLine('$state.offset++');
};

Compiler2.prototype.compileCmd_background = function (node) {
    this.addLine('$funcs.thread(', node.args[0], ');');
    this.compileChild(node);
    this.addLine('$funcs.thread(null);');
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
    this.addLine('var ', varName, ' = $state.offset + ', millis, ';');
    this.addLine('while ($state.offset < ', varName, ') {');
    this.indent();
    this.compileChild(node);
    this.outdent();
    this.addLine('}');
};

Compiler2.prototype.compileCmd_repeat_until = function (node) {
    var until = parseTime(node.args[1]);
    this.addLine('while ($state.offset < ', until, ') {');
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

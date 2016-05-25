{
  var indentStack = [];

  // Track and validate the indentation of a line.
  function checkIndent(indent, element) {
    if (element) {
      var i = indent.length;
      if (indentStack.length === 0) {
        if (i !== 0) {
          // First line cannot be indented.
          error('Unexpected indent.');
        }
        else {
          indentStack = [0];
        }
      }
      else if (i > indentStack[indentStack.length-1]) {
        indentStack.push(i);
        element.indent++;
      }
      else {
        while (indentStack[indentStack.length-1] !== i) {
          element.indent--;
          indentStack.pop();
          if (indentStack.length === 0) {
            error('Unexpected indent.');
          }
        }
      }
    }
    return element;
  }

  // Join a maybe-empty line with a list of other lines.
  function mkLines(line, rest) {
    // rest[0] is a CR, rest[1] is the other lines.
    var lines = rest && rest[1] || [];
    if (line) {
      return [line].concat(lines);
    }
    else {
      return lines;
    }
  }

  // Converts a list of lines with indentation info into a tree.
  function mkTree(elements) {
    var cur = new Seq();
    var stack = [cur];

    for (var i = 0; i < elements.length; i++) {
      var element = elements[i];
      var contents = element.contents;

      if (element.indent <= 0) {
        var indent = element.indent;
        while (indent < 0) {
          // While outdenting, close all choice blocks.
          if (cur.type !== 'Choice') {
            indent++;
          }
          stack.pop();
          cur = stack[stack.length-1];
        }

        if (element.option && cur.type !== 'Choice') {
          // Begin a new choice block.
          var chc = new Choice();
          stack.push(chc);

          // The previous line is part of the choice too.
          if (cur.children.length) {
            chc.children.push(cur.children.pop());
          }

          cur.children.push(chc);
          cur = chc;
        }
        else if (!element.option && cur.type === 'Choice') {
          // End a previous choice block.
          stack.pop();
          cur = stack[stack.length-1];
        }
      }
      else if (element.indent === 1) {
        // Indenting creates a new sequence.
        var seq = new Seq();
        stack.push(seq);

        // The line before the indent could also be part of the sequence.
        // (It could also be undefined.)
        var prev = cur.children[cur.children.length - 1];
        if (prev && prev.type === 'Cmd' && /^repeat|^maybe|^background|^sub$/.test(prev.cmd)) {
          prev.child = seq;
        }
        else if (prev && prev.type === 'Cmd' && prev.cmd === 'else') {
          var prevPrev = cur.children[cur.children.length - 2];

          if (!prevPrev || prevPrev.type !== 'Cmd' || prevPrev.cmd !== 'maybe') {
            error("Unexpected 'else' - can only occur after 'maybe'.");
          }

          prevPrev.else = seq;
        }
        else {
          if (prev) {
            seq.children.push(cur.children.pop());
          }
          cur.children.push(seq);
        }

        cur = seq;

        // Handle the case where the indented line starts a choice.
        if (element.option) {
          var choice = new Choice();
          stack.push(choice);
          cur.children.push(choice);
          cur = choice;
        }
      }
      else {
        throw new Error('Illegal indent: ' + element.indent);
      }

      cur.children.push(contents);
    }
    return stack[0];
  }

  function mkCmd(cmd) {
    return new Element({
      type: 'Cmd',
      cmd: cmd,
      args: Array.prototype.slice.call(arguments, 1)
    });
  }

  function mkDialog(pos, dialog) {
    return new Element({
      type: 'Dialog',
      dialog: dialog,
      pos: pos === '>' ? 0 : 1
    });
  }

  function concat() {
    return Array.prototype.map.apply(function (s) {
      return s || '';
    }).join('');
  }

  function flatten(data) {
    if (Array.isArray(data)) {
      return data.map(function (d) {
        return flatten(d);
      }).join('');
    }
    else {
      return data;
    }
  }

  function Element(contents) {
    this.contents = contents;
    this.indent = 0;

    this.setOption = function () {
      this.option = true;
      return this;
    }
  }

  function Seq() {
    this.type = 'Seq';
    this.children = [];
  }

  function Choice() {
    this.type = 'Choice';
    this.children = [];
  }
}

// An empty script or a set of lines
Start = elements:Lines? { return mkTree(elements); }

// One or more line, separated by a line ending character
Lines = element:Line rest:(CR Lines)? { return mkLines(element, rest); }

// A line, which may be blank or contain a script element
Line = indent:_ element:Element? _ Comment? { return checkIndent(indent, element); }

Element = Simple / Struct

// Structural elements
Struct = Option

// Simple elements
Simple = Dialog / Play / Repeat / RepeatTime / RepeatUntil / Set / Maybe / Else / Background / Sub / Call / Nothing

// An option that forms part of a choice between several elements
Option = "|" element:Simple { return element.setOption(); }

// A piece of dialog
Dialog = pos:[<>] _ chars:NCR+ { return mkDialog(flatten(pos), flatten(chars)); }

// Repeat commands
Repeat = ":repeat" __ rand:"~"? count:[0-9]+ __ "time" "s"? { return mkCmd('repeat', !!rand, parseInt(flatten(count))); }
RepeatTime = ":repeat" __ "for" __ rand:"~"? dur:[0-9]+ _ unit:TimeUnit { return mkCmd('repeat_for', !!rand, parseInt(flatten(dur)), flatten(unit)); }
RepeatUntil = ":repeat" __ "until" __ rand:"~"? time:TimeOfDay { return mkCmd('repeat_until', !!rand, flatten(time)); }

TimeUnit = (("min" "ute"?) / ("sec" "ond"?) / "hr" / "hour") "s"?
TimeOfDay = [0-9] [0-9]? ":" [0-9] [0-9]

// Play animation command
Play = ":play" __ chars:[a-zA-Z_0-9-]+ { return mkCmd('play', flatten(chars)); }

// Set variable command
Set = ":set" __ name:[a-zA-Z_0-9-]+ value:SetValue? { return mkCmd('set', flatten(name), flatten(value)); }
SetValue = __ value:NCR+ { return value; }

// Maybe/else command
Maybe = ":maybe" __ chance:[0-9]+ "%" { return mkCmd('maybe', parseInt(flatten(chance))); }
Else = ":else" { return mkCmd('else'); }

Nothing = ":nothing" { return mkCmd('nothing'); }

Background = ":background" __ bg:[0-9]+ { return mkCmd('background', parseInt(flatten(bg))); }

Sub = ":sub" __ name:[a-zA-Z_0-9-]+ { return mkCmd('sub', flatten(name)); }

Call = ":call" __ sub:[a-zA-Z_0-9-]+ { return mkCmd('call', flatten(sub)); }

Comment = "#" NCR*

// Whitespace, but not line endings
_ = [ \t]*
__ = [ \t]+
// Line endings
CR = "\n" / "\r\n"
// Everything except line endings
NCR = [^\r\n]

function ViewModel() {
    var self = this;
    self.sidebarVisible = ko.observable()
    self.playing = ko.observable();
    self.events = ko.observableArray();
    self.ready = ko.observable(false);
    self.date = ko.observable('2016-01-01');

    self.script = new Script();

    ko.computed(function () {
        if (self.ready()) {
          self.script.compile(self.date()).then(function () {
              self.events(makeEvents(self.script.events));
              self.play();
          });
        }
    });

    self.script.load('script.benji').then(function () {
        self.ready(true);
    });

    self.gotoEvent = function (event) {
        if (event.bgAnims) {
            self.script.setBg(event.bgAnims);
        }
        self.script.playNextEvent(event.index);
    };
}

function makeEvents(events) {
    var results = [];
    var lastAnim;
    var lastBgAnims;
    events.forEach(function (event, idx) {
        if (event.event && event.event.type === 'background') {
            lastBgAnims = event.event.anims;
        }
        if (event.event && event.event.anim) {
            var match = event.event.anim.match(/(.*)-[0-9]+$/);
            if (match && match[1] != lastAnim) {
                results.push({
                    time: new Date(event.time).toTimeString().substr(0, 8),
                    name: match[1],
                    index: idx,
                    bgAnims: lastBgAnims
                });
                lastAnim = match[1];
            }
        }
    });
    return results;
}

ViewModel.prototype.showSidebar = function () {
    this.sidebarVisible(true);
};

ViewModel.prototype.hideSidebar = function () {
    this.sidebarVisible(false);
};

ViewModel.prototype.pause = function () {
    this.script.pause();
    this.playing(false);
};

ViewModel.prototype.play = function () {
    this.script.play();
    this.playing(true);
};

$(function () {
    var viewModel = new ViewModel();
    ko.applyBindings(viewModel);
});

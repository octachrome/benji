function ViewModel() {
    var self = this;
    self.sidebarVisible = ko.observable()
    self.playing = ko.observable();
    self.events = ko.observableArray();
    self.ready = ko.observable(false);
    self.date = ko.observable(currentDateTime());

    self.script = new Script();

    ko.computed(function () {
        if (self.ready()) {
            self.events([]);
            var date = self.date();
            setTimeout(function () {
                self.script.compile(date).then(function () {
                    self.events(makeEvents(self.script.events));
                    self.play();
                });
            }, 50);
        }
    });

    self.script.load('script.benji').then(function () {
        self.ready(true);
    });

    self.gotoEvent = function (event) {
        if (event.bgEvents) {
            event.bgEvents.forEach(function (events, thread) {
                if (events) {
                    self.script.setBg(thread, events);
                }
            });
        }
        self.script.playNextEvent(event.index);
    };
}

function currentDateTime() {
    var now = new Date();
    return now.toISOString().substr(0, 10) + ' ' + now.toLocaleTimeString();
}

function makeEvents(events) {
    var results = [];
    var lastAnim;
    var lastBgEvents = [];
    events.forEach(function (event, idx) {
        if (event.event && event.event.type === 'background') {
            lastBgEvents[event.event.thread] = event.event.events;
        }
        if (event.event && event.event.anim) {
            var match = event.event.anim.match(/(.*)-[0-9]+$/);
            if (match && match[1] != lastAnim) {
                results.push({
                    time: new Date(event.time).toTimeString().substr(0, 8),
                    name: match[1],
                    index: idx,
                    bgEvents: lastBgEvents.slice()
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

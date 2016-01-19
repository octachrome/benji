var storagekey = 'scenes1';

var vm = {
    activeTab: ko.observable(null),
    date: ko.observable('2016-01-02'),
    script: ko.observable(localStorage.getItem(storagekey)),
    results: ko.observableArray(),
    invalid: ko.observable(false),
    animation: ko.observable(null),
    segments: ko.observable(null),
    nowPlaying: ko.observable(''),
    dialog: ko.observable('')
};
vm.reset = function () {
    localStorage.removeItem(storagekey);
    vm.script(JSON.stringify(defaultScript, null, 2));
};
if (!vm.script()) {
    vm.reset();
}
ko.computed(function () {
    try {
        var results = buildScene(vm.date(), vm.script());
        localStorage.setItem(storagekey, vm.script());
        vm.results(results);
        vm.invalid(false);
    } catch (e) {
        console.log(e);
        vm.invalid(true);
        return null;
    }
});
vm.closeTabs = function () {
    vm.activeTab(null);
}
vm.toggleTab = function (tab, vm, event) {
    if (vm.activeTab() === tab) {
        vm.activeTab(null);
    } else {
        vm.activeTab(tab);
    }
    event.stopPropagation();
}
vm.ignoreClick = function (vm, event) {
    event.stopPropagation();
}

$(function () {
    ko.applyBindings(vm);
});

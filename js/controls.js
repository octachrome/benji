function ViewModel() {
    var self = this;
    self.sidebarVisible = ko.observable()
    self.events = ko.observableArray(['test']);
}

ViewModel.prototype.showSidebar = function () {
    this.sidebarVisible(true);
}

ViewModel.prototype.hideSidebar = function () {
    this.sidebarVisible(false);
}

$(function () {
    var viewModel = new ViewModel();
    ko.applyBindings(viewModel);
});

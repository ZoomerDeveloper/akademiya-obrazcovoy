// Shim для Node.js-модуля 'events' в React Native (нет Node.js runtime).
// Реализует стандартный API EventEmitter совместимый с @mattermost/calls.

'use strict';

function EventEmitter() {
    this._events = Object.create(null);
    this._maxListeners = undefined;
}

EventEmitter.prototype.setMaxListeners = function (n) {
    this._maxListeners = n;
    return this;
};

EventEmitter.prototype.getMaxListeners = function () {
    return this._maxListeners === undefined ? 10 : this._maxListeners;
};

EventEmitter.prototype.on =
EventEmitter.prototype.addListener = function (type, listener) {
    if (!this._events[type]) {
        this._events[type] = [];
    }
    this._events[type].push(listener);
    return this;
};

EventEmitter.prototype.once = function (type, listener) {
    const wrapper = (...args) => {
        this.removeListener(type, wrapper);
        listener.apply(this, args);
    };
    wrapper._originalListener = listener;
    return this.on(type, wrapper);
};

EventEmitter.prototype.removeListener =
EventEmitter.prototype.off = function (type, listener) {
    if (!this._events[type]) { return this; }
    this._events[type] = this._events[type].filter(
        (fn) => fn !== listener && fn._originalListener !== listener,
    );
    return this;
};

EventEmitter.prototype.removeAllListeners = function (type) {
    if (type) {
        this._events[type] = [];
    } else {
        this._events = Object.create(null);
    }
    return this;
};

EventEmitter.prototype.emit = function (type, ...args) {
    const listeners = this._events[type];
    if (!listeners || listeners.length === 0) { return false; }
    [...listeners].forEach((fn) => fn.apply(this, args));
    return true;
};

EventEmitter.prototype.listeners = function (type) {
    return this._events[type] ? [...this._events[type]] : [];
};

EventEmitter.prototype.listenerCount = function (type) {
    return this._events[type] ? this._events[type].length : 0;
};

EventEmitter.prototype.eventNames = function () {
    return Object.keys(this._events);
};

EventEmitter.EventEmitter = EventEmitter;

module.exports = EventEmitter;

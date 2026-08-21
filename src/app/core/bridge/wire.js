//the message protocol the packaged build talks over, in one file so both ends
//run the same code rather than two implementations of the same idea.
//
//it is deliberately the shape the control socket already uses: one json object
//per line, and a reply carries the id of the thing it answers. that is also
//what socket.io does underneath its api, which is why the shim on top of this
//can be small enough to trust.
//
//    {"event":"ping","data":{},"id":3}     a call that wants an answer
//    {"reply":3,"data":{"pong":true}}      the answer
//    {"event":"app","data":{...}}          a message that does not

module.exports = function wire(send) {
    var handlers = {};
    var pending = {};
    var nextId = 1;

    function on(event, fn) {
        (handlers[event] = handlers[event] || []).push(fn);
    }

    function off(event, fn) {
        if (!event) { handlers = {}; return; }
        if (!fn) { delete handlers[event]; return; }

        var list = handlers[event] || [];
        var i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
    }

    function once(event, fn) {
        function wrapped(data, ack) { off(event, wrapped); fn(data, ack); }
        on(event, wrapped);
    }

    function emit(event, data, ack) {
        var msg = { event: event, data: data === undefined ? null : data };

        if (typeof ack == 'function') {
            msg.id = nextId++;
            pending[msg.id] = ack;
        }

        send(JSON.stringify(msg));
    }

    function receive(line) {
        var msg;
        try { msg = JSON.parse(line); }
        catch (e) { return; }//not ours, or not whole

        if (msg.reply !== undefined) {
            var ack = pending[msg.reply];
            delete pending[msg.reply];
            if (ack) ack(msg.data);
            return;
        }

        var listeners = (handlers[msg.event] || []).slice();
        if (!listeners.length) return;

        //an ack that fires twice is a bug on the other side, not here, and
        //swallowing the second is kinder than sending a reply nobody expects
        var answered = false;
        var reply = msg.id === undefined ? undefined : function (result) {
            if (answered) return;
            answered = true;
            send(JSON.stringify({ reply: msg.id, data: result === undefined ? null : result }));
        };

        listeners.forEach(function (fn) { fn(msg.data, reply); });
    }

    return {
        on: on, off: off, once: once, emit: emit, receive: receive,
        get waiting() { return Object.keys(pending).length; }
    };
};

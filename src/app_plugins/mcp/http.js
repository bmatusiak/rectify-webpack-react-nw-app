var express = require('express');
var rpc = require('./rpc');

//THE SECOND TRANSPORT: MCP over the app's own http server, for a client that
//cannot launch a process. ../../../tools/mcp.js is the first, and is the one to
//prefer -- it opens nothing.
//
//This one is a listening surface, so it is behind every gate the browser viewer
//is behind and one of its own:
//
//  BUILD_SERVABLE   a build made with "canServe": false has no http routes at
//                   all, so this file's own require is folded out with them
//  http.serving     off unless somebody asked for a browser viewer -- the same
//                   switch the tray flips
//  Origin           refused unless it is missing or local
//
//WHY THE ORIGIN CHECK MATTERS MORE HERE THAN ANYWHERE ELSE. A page on the open
//internet cannot read this app's port, but it can POST to it -- the browser
//sends the request and refuses to show the reply, which is no comfort at all
//when the request was `tools/call click`. That is DNS rebinding, it is the
//named risk in the MCP transport spec, and an Origin the app did not expect is
//the only signal that separates it from the client that is meant to be here.
//
//STATELESS, AND SAYING SO. The spec's streamable transport can hold a session
//and push server-to-client messages over SSE. Nothing here has anything to push
//-- there are no subscriptions and no long-running tools -- so a POST is a
//question and its answer, and `Mcp-Session-Id` is not issued. A client that
//needs notifications should use the stdio bridge, which has the same limitation
//honestly rather than a session id that promises more than it does.

//`host` IS WHAT THE NODE HALF IS HANDED, not the http service -- that one lives
//in main. `host.router` is the swappable router (a fresh one per reload, so
//routes cannot stack up) and `host.http.serving` is the forwarded switch.
module.exports = function mount(host, ipc, options) {
    options = options || {};
    var PATH = options.path || '/mcp';

    //IN THE SAME PROCESS, so `ask` is a call rather than a socket. The stdio
    //bridge writes to a pipe here; this is what the shared dispatch being given
    //its transport instead of choosing one buys.
    var protocol = rpc(function (command, data) { return ipc.invoke(command, data); }, options);

    function local(origin) {
        //no Origin at all is a non-browser client -- curl, a desktop client, an
        //agent -- and those are the ones this is for
        if (!origin) return true;

        try {
            var host = new URL(origin).hostname;
            return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
        } catch (e) {
            return false;//an Origin that will not parse is not one to trust
        }
    }

    //THE APP PARSES NO JSON BODIES, and it should not start on this file's
    //account: `express.json()` mounted globally would change how every route in
    //the app reads a request, for one endpoint that wants it. So it is
    //middleware on this route only, with a limit -- a transport that will read
    //any size of body is a way to spend the app's memory from outside it.
    var readJson = express.json({ limit: '1mb' });

    host.router.post(PATH, readJson, function (req, res) {
        //THE GATE, SAID THE SAME WAY THE SOCKET SAYS IT. A refused client gets
        //a reason rather than a 404, because "not found" sends somebody looking
        //for a typo in a url that is perfectly correct.
        if (!host.http.serving) {
            return res.status(503).json({
                jsonrpc: '2.0', id: null,
                error: { code: -32000, message: 'the browser viewer is off, so this endpoint is closed' }
            });
        }

        if (!local(req.get('origin'))) {
            return res.status(403).json({
                jsonrpc: '2.0', id: null,
                error: { code: -32000, message: 'this endpoint only answers local origins' }
            });
        }

        var body = req.body;

        //A BATCH IS A LIST AND A MESSAGE IS NOT. The 2025-03-26 revision allows
        //an array; answering one element of it and dropping the rest is the
        //kind of half-support that is worse than none.
        var messages = Array.isArray(body) ? body : [body];

        Promise.all(messages.map(function (message) { return protocol.handle(message); }))
            .then(function (answers) {
                var said = answers.filter(Boolean);

                //every message was a notification, so there is nothing to say:
                //202 with no body, which is what the spec asks for
                if (!said.length) return res.status(202).end();

                res.json(Array.isArray(body) ? said : said[0]);
            })
            .catch(function (e) {
                res.status(500).json({
                    jsonrpc: '2.0', id: null,
                    error: { code: -32603, message: (e && e.message) || String(e) }
                });
            });
    });

    //GET IS WHERE AN SSE STREAM WOULD BE, and there is not one -- so it says
    //405 with the header the spec asks for rather than falling through to the
    //app's own 404 page, which would tell a client the endpoint does not exist
    //when it is only this half of it that does not.
    host.router.get(PATH, function (req, res) {
        res.set('Allow', 'POST');
        res.status(405).json({
            jsonrpc: '2.0', id: null,
            error: { code: -32000, message: 'this transport is stateless: POST a request, there is no stream' }
        });
    });

    return PATH;
};

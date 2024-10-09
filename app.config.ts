import config from "@colyseus/tools";
import { monitor } from "@colyseus/monitor";
import { playground } from "@colyseus/playground";
import basicAuth from "express-basic-auth";

import { UnoRoom } from "./room";
import { matchMaker } from "colyseus";

const basicAuthMiddleware = basicAuth({
    users: {
        [process.env.MONITOR_USERNAME || 'admin']: process.env.MONITOR_PASSWORD || 'admin',
    },
    challenge: true
});

export default config({
    initializeGameServer: async (gameServer) => {
        gameServer.define('uno_room', UnoRoom);
        await matchMaker.createRoom('uno_room', {});
    },

    initializeExpress: (app) => {
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground);
            app.use("/colyseus", monitor());
        } else {
            app.use("/colyseus", basicAuthMiddleware, monitor());
        }
    },

    beforeListen: () => {
    }
});

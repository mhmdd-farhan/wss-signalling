import app from "./app";
import { createServer } from "http";
import config from "./config/config";
import { init } from "./config/wss";

const {port} = config;

const server = createServer(app);

// WSS 8090
init(server);

// HTTP server 3000
server.listen(port, () => {
    console.log(`Server running on port ${port}`)
})
import app from "./app";
import config from "./config/config";
import { init } from "./config/wss";

const {wss_port} = config;
const {port} = config;

// WSS 8090
init(wss_port);

// HTTP server 3000
app.listen(config.port, () => {
    console.log(`Server running on port ${port}`)
})
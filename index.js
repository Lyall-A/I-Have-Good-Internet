const Server = require("./http/Server");
const https = require("https");
const config = require("./config.json");

const webServer = new Server();
const speedServer = new Server();

// Speed server

speedServer.any("*", (req, res, next) => {
    // Fuck CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    next();
});

// Pre-test stuff
speedServer.get("/ping", (req, res) => res.send("pong"));
speedServer.get("/getip", (req, res) => res.send(`${config.customIP || "idk"}`));
speedServer.get("/capabilities", (req, res) => res.send("capabilities idk"));
// speedServer.get("/capabilities", (req, res) => res.send("capabilities SERVER_HOST_AUTH UPLOAD_STATS"));

// Hello
speedServer.get("/hello", (req, res) => {
    console.log("Received hello request");
    res.send("hello 2.11 (2.11.0) 2023-11-29.2207.3251a05\n");
});

// Download
speedServer.get("/download", (req, res) => {
    const size = parseInt(config.downloadLength || req.query.size || 25000000);
    console.log(`Received download request, sending ${size} bytes`);
    res.send(Buffer.alloc(size).fill(0), "application/octet-stream");
});

// Upload
speedServer.post("/upload", (req, res) => {
    console.log(`Received upload request, Content-Length header: ${req.headers["content-length"]}`);
    res.send("");
});
speedServer.options("/upload", (req, res) => {
    console.log(`Received upload request`);
    res.send("");
});

speedServer.any("*", (req, res) => res.sendStatus(404));

// Web server

webServer.get("/", (req, res) => {
    webProxy(req, res, (stReq, stRes, data) => {
        try {
            let html = data.toString();
            if (config.customIP) html = html.replace(/"ip": *"(.*?)"/, (match, ip) => match.replace(ip, config.customIP));
            if (config.customISP) html = html.replace(/"isp": *"(.*?)"/, (match, isp) => match.replace(isp, config.customISP));
            res.html(html);
        } catch (err) { res.sendStatus(500) };
    });
});

webServer.get("/api/js/servers", (req, res) => {
    // Send custom server list
    webProxy(req, res, (stReq, stRes, data) => {
        // Use same server list, with some modified stuff
        let json;
        try { json = JSON.parse(data.toString()) } catch (err) { res.sendStatus(500) };
        if (json) res.json(json.map(i => ({ ...i, ...{
            // Custom server data
            url: `http://${config.speedtestHost}:${config.speedtestPort}/speedtest/upload.php`,
            https_functional: 0,
            host: `${config.speedtestHost}:${config.speedtestPort}`,
            ...config.customServerListData
        } })));
    });

    /*
    Somethings like this
    {
        "url": "http://localhost:8081/speedtest/upload.php",
        "lat": "53.8100",
        "lon": "-1.5500",
        "distance": 170,
        "name": "Leeds",
        "country": "United Kingdom",
        "cc": "GB",
        "sponsor": "Quickline Communications",
        "id": "41597",
        "preferred": 0,
        "https_functional": 0,
        "host": "localhost:8081"
    }
    */
});

if (!config.trySendResults) webServer.post("/api/results.php", (req, res) => res.json(config.customResultData || {}));

webServer.get("*", (req, res) => { 
    // Proxy everything else to www.speedtest.net
    webProxy(req, res);
});

webServer.listen(config.webPort, () => console.log(`Web server listening at :${config.webPort}`));
speedServer.listen(config.speedtestPort, () => console.log(`Speedtest server listening at :${config.speedtestPort}`));

function webProxy(req, res, callback) {
    const stReq = https.request({
        host: "www.speedtest.net",
        path: req.url,
        // headers: { ...req.headers, host: "www.speedtest.net", "accept-encoding": null }
        headers: { host: "www.speedtest.net", "accept-encoding": null }
    }, stRes => {
        Object.entries(stRes.headers).forEach(([key, value]) => res.setHeader(key, value));
        let data;
        stRes.on("data", chunk => {
            if (callback) {
                data = Buffer.concat(data ? [data, chunk] : [chunk]);
            } else {
                res.write(chunk);
            }
        });
        stRes.on("end", () => {
            if (callback) {
                callback(stReq, stRes, data);
            } else {
                res.end();
            }
        });
    });
    req.on("data", data => stReq.write(data));
    req.on("end", () => stReq.end());
}
// And so it begins...
import * as fs from 'fs';
import mqtt from 'mqtt';
import axios from 'axios';
import YAML from 'yaml'
import { createClient } from 'redis';
const RedisClient = createClient();

// ******************** read config
const file = fs.readFileSync('./config.yml', 'utf8')
const config = YAML.parse(file);

// ********************** API
const apiBase = config.api.method + '://' + config.api.host

// **************** REDIS
try {
    await RedisClient.connect();
    console.log("Redis connected");
    //await RedisClient.set('mykey', 'Hello from node redis');
    // const myKeyValue = await RedisClient.get('mykey');
} catch (e) {
    console.error(e);
}

// ********************** MQTT
const MQTTProtocol = config.mqtt.protocol
const MQTTHost = config.mqtt.host
const MQTTPort = config.mqtt.port
const MQTTClientId = config.mqtt.clientId
const MQTTConnectUrl = `${MQTTProtocol}://${MQTTHost}:${MQTTPort}`
let MQTTConfig = {
    clientId: MQTTClientId,
    clean: config.mqtt.clean,
    connectTimeout: config.mqtt.timeout,
    reconnectPeriod: config.mqtt.reconnect,
}
if( config.mqtt.anonymous === false){
    MQTTConfig['username'] = config.mqtt.username;
    MQTTConfig['password'] = config.mqtt.password;
}
const MQTTClient = mqtt.connect( MQTTConnectUrl, MQTTConfig)

const MQTTTopics = config.mqtt.subscribes;
MQTTClient.on('connect', () => {
    console.log( 'MQTT Connected')
    MQTTClient.subscribe(MQTTTopics,{ qos: 2 }, (err) => {
        if (err) {
            console.error( 'Error subscribing to topic:', err);
        } else {
            console.log('Subscribed to topics successfully');
        }
    })
})

MQTTClient.on('message', (topic, payload) => {
    console.log('Received Message:', topic, payload.toString())
    switch(topic){
        case 'server':
            handleServerMessage( JSON.parse( payload));
            break;
        case 'heartbeat':
            handleHeartBeatMessage( JSON.parse( payload));
            break;
    }
})
MQTTClient.on('offline', () => {
    console.log('Client is offline');
});

MQTTClient.on('reconnect', () => {
    console.log('Reconnecting to MQTT broker');
});

MQTTClient.on('end', () => {
    console.log('Connection to MQTT broker ended');
});

async function handleServerMessage( payload){

}

async function handleHeartBeatMessage( payload) {
    if (payload.event === 'connected') {
        const machineState = JSON.parse(await RedisClient.get(payload.source));
        if (machineState == null) {
            let machineState = new Machine(apiBase, payload.source);
            await machineState.init();
            let mode = machineState.kvGetValueByKey('mode');
            if( mode === 'virtual'){
                machineState.send( MQTTClient, config.messages.inventory.create.random);
                console.log( config.messages.inventory.report)
                machineState.send( MQTTClient, config.messages.inventory.report);
            }
        }
        await RedisClient.set('mykey', 'Hello from node redis');
    }
    if (payload.event === 'heartbeat') {
        //
        const myKeyValue = await RedisClient.get('mykey');
    }
    return true;
}

class Machine {
    uuid = undefined;
    rows = 30;
    cols = 30;
    inventory = [];
    state = undefined;
    base = undefined;
    mode = undefined;

    constructor(base, uuid) {  // Constructor
        this.uuid = uuid;
        this.base = base;
        console.log("constructor")
    }

    send(client, message) {
        client.publish( this.uuid, JSON.stringify( message))
    }

    getInventory() {

    }

    setInventoryMatrix() {

    }

    kvGetRecordByKey(key) {
        for (let x = 0; x < this.state.kv.length; x++) {
            if (this.state.kv[x].key === key) {
                return this.state.kv[x];
            }
        }
        return false;
    }

    kvGetValueByKey(key) {
        for (let x = 0; x < this.state.kv.length; x++) {
            if (this.state.kv[x].key === key) {
                return this.state.kv[x].value;
            }
        }
        return undefined;
    }

    async init() {
        console.log("init");
        await axios.get(this.base + '/api/v1/machine/state/' + this.uuid)
            .then(response => {
                this.state = response.data;
                console.log(response.data);
            })
            .catch(error => {
                console.log(error);
            });
    }
}

const instana = require('@instana/collector');
// init tracing
// MUST be done before loading anything else!
instana({
    tracing: {
        enabled: true
    }
});

const { createClient } = require('redis');
const request = require('request');
const bodyParser = require('body-parser');
const express = require('express');
const pino = require('pino');
const expPino = require('express-pino-logger');
// Prometheus
const promClient = require('prom-client');
const Registry = promClient.Registry;
const register = new Registry();
const counter = new promClient.Counter({
    name: 'items_added',
    help: 'running count of items added to cart',
    registers: [register]
});

let redisConnected = false;

const redisHost = process.env.REDIS_HOST || 'redis';
const catalogueHost = process.env.CATALOGUE_HOST || 'catalogue';
const cataloguePort = process.env.CATALOGUE_PORT || '8080';

const logger = pino({
    level: 'info',
    prettyPrint: false,
    useLevelLabels: true
});
const expLogger = expPino({
    logger: logger
});

const app = express();

app.use(expLogger);

app.use((req, res, next) => {
    res.set('Timing-Allow-Origin', '*');
    res.set('Access-Control-Allow-Origin', '*');
    next();
});

app.use((req, res, next) => {
    let dcs = [
        "asia-northeast2",
        "asia-south1",
        "europe-west3",
        "us-east1",
        "us-west1"
    ];
    let span = instana.currentSpan();
    span.annotate('custom.sdk.tags.datacenter', dcs[Math.floor(Math.random() * dcs.length)]);

    next();
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/health', (req, res) => {
    const stat = {
        app: 'OK',
        redis: redisConnected
    };
    res.json(stat);
});

// Prometheus
app.get('/metrics', (req, res) => {
    res.header('Content-Type', 'text/plain');
    res.send(register.metrics());
});

// get cart with id
app.get('/cart/:id', async (req, res) => {
    try {
        const data = await redisClient.get(req.params.id);
        if (data == null) {
            res.status(404).send('cart not found');
        } else {
            res.set('Content-Type', 'application/json');
            res.send(data);
        }
    } catch (err) {
        req.log.error('ERROR', err);
        res.status(500).send(err);
    }
});

// delete cart with id
app.delete('/cart/:id', async (req, res) => {
    try {
        const data = await redisClient.del(req.params.id);
        if (data == 1) {
            res.send('OK');
        } else {
            res.status(404).send('cart not found');
        }
    } catch (err) {
        req.log.error('ERROR', err);
        res.status(500).send(err);
    }
});

// rename cart i.e. at login
app.get('/rename/:from/:to', async (req, res) => {
    try {
        const data = await redisClient.get(req.params.from);
        if (data == null) {
            res.status(404).send('cart not found');
        } else {
            const cart = JSON.parse(data);
            await saveCart(req.params.to, cart);
            res.json(cart);
        }
    } catch (err) {
        req.log.error('ERROR', err);
        res.status(500).send(err);
    }
});

// update/create cart
app.get('/add/:id/:sku/:qty', async (req, res) => {
    const qty = parseInt(req.params.qty);
    if (isNaN(qty)) {
        req.log.warn('quantity not a number');
        res.status(400).send('quantity must be a number');
        return;
    } else if (qty < 1) {
        req.log.warn('quantity less than one');
        res.status(400).send('quantity has to be greater than zero');
        return;
    }

    try {
        const product = await getProduct(req.params.sku);
        req.log.info('got product', product);
        if (!product) {
            res.status(404).send('product not found');
            return;
        }
        if (product.instock == 0) {
            res.status(404).send('out of stock');
            return;
        }
        const data = await redisClient.get(req.params.id);
        let cart;
        if (data == null) {
            cart = {
                total: 0,
                tax: 0,
                items: []
            };
        } else {
            cart = JSON.parse(data);
        }
        req.log.info('got cart', cart);

        const item = {
            qty: qty,
            sku: req.params.sku,
            name: product.name,
            price: product.price,
            subtotal: qty * product.price
        };
        const list = mergeList(cart.items, item, qty);
        cart.items = list;
        cart.total = calcTotal(cart.items);
        cart.tax = calcTax(cart.total);

        await saveCart(req.params.id, cart);
        counter.inc(qty);
        res.json(cart);
    } catch (err) {
        req.log.error('ERROR', err);
        res.status(500).send(err);
    }
});

// update quantity - remove item when qty == 0
app.get('/update/:id/:sku/:qty', async (req, res) => {
    const qty = parseInt(req.params.qty);
    if (isNaN(qty)) {
        req.log.warn('quantity not a number');
        res.status(400).send('quantity must be a number');
        return;
    } else if (qty < 0) {
        req.log.warn('quantity less than zero');
        res.status(400).send('negative quantity not allowed');
        return;
    }

    try {
        const data = await redisClient.get(req.params.id);
        if (data == null) {
            res.status(404).send('cart not found');
        } else {
            const cart = JSON.parse(data);
            let idx;
            const len = cart.items.length;
            for (idx = 0; idx < len; idx++) {
                if (cart.items[idx].sku == req.params.sku) {
                    break;
                }
            }
            if (idx == len) {
                res.status(404).send('not in cart');
            } else {
                if (qty == 0) {
                    cart.items.splice(idx, 1);
                } else {
                    cart.items[idx].qty = qty;
                    cart.items[idx].subtotal = cart.items[idx].price * qty;
                }
                cart.total = calcTotal(cart.items);
                cart.tax = calcTax(cart.total);
                await saveCart(req.params.id, cart);
                res.json(cart);
            }
        }
    } catch (err) {
        req.log.error('ERROR', err);
        res.status(500).send(err);
    }
});

// add shipping
app.post('/shipping/:id', async (req, res) => {
    const shipping = req.body;
    if (shipping.distance === undefined || shipping.cost === undefined || shipping.location === undefined) {
        req.log.warn('shipping data missing', shipping);
        res.status(400).send('shipping data missing');
    } else {
        try {
            const data = await redisClient.get(req.params.id);
            if (data == null) {
                req.log.info('no cart for', req.params.id);
                res.status(404).send('cart not found');
            } else {
                const cart = JSON.parse(data);
                const item = {
                    qty: 1,
                    sku: 'SHIP',
                    name: 'shipping to ' + shipping.location,
                    price: shipping.cost,
                    subtotal: shipping.cost
                };

                let idx;
                const len = cart.items.length;
                for (idx = 0; idx < len; idx++) {
                    if (cart.items[idx].sku == item.sku) {
                        break;
                    }
                }
                if (idx == len) {
                    cart.items.push(item);
                } else {
                    cart.items[idx] = item;
                }
                cart.total = calcTotal(cart.items);
                cart.tax = calcTax(cart.total);

                await saveCart(req.params.id, cart);
                res.json(cart);
            }
        } catch (err) {
            req.log.error('ERROR', err);
            res.status(500).send(err);
        }
    }
});

function mergeList(list, product, qty) {
    let inlist = false;
    let idx;
    const len = list.length;
    for (idx = 0; idx < len; idx++) {
        if (list[idx].sku == product.sku) {
            inlist = true;
            break;
        }
    }

    if (inlist) {
        list[idx].qty += qty;
        list[idx].subtotal = list[idx].price * list[idx].qty;
    } else {
        list.push(product);
    }

    return list;
}

function calcTotal(list) {
    let total = 0;
    for (let idx = 0, len = list.length; idx < len; idx++) {
        total += list[idx].subtotal;
    }

    return total;
}

function calcTax(total) {
    return (total - (total / 1.2));
}

function getProduct(sku) {
    return new Promise((resolve, reject) => {
        request('http://' + catalogueHost + ':' + cataloguePort + '/product/' + sku, (err, res, body) => {
            if (err) {
                reject(err);
            } else if (res.statusCode != 200) {
                resolve(null);
            } else {
                resolve(JSON.parse(body));
            }
        });
    });
}

async function saveCart(id, cart) {
    logger.info('saving cart', cart);
    return redisClient.setEx(id, 3600, JSON.stringify(cart));
}

// connect to Redis
const redisClient = createClient({
    url: `redis://${redisHost}`
});

redisClient.on('error', (e) => {
    logger.error('Redis ERROR', e);
});
redisClient.on('connect', () => {
    logger.info('Redis connected');
    redisConnected = true;
});
redisClient.connect();

// fire it up!
const port = process.env.CART_SERVER_PORT || '8080';
app.listen(port, () => {
    logger.info('Started on port', port);
});

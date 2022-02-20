let io = require('socket.io-client')
const level = require('level')

const BASE_URL = 'wss://api-v4.zerion.io/';

const db = level('cache')

const users = new Map();
const scores = new Map();

const bitcoinMarketCap = "725975032036";

users.set("0xd8da6bf26964af9d7eed9e03e53415d37aa96045", {
    following: [],
    ens: "vitalik.eth"
})
users.set("0x648aa14e4424e0825a5ce739c8c68610e143fb79", {
    following: [
        "0x505e20c0fb8252ca7ac21d54d5432eccd4f2d076",
        "0x3d280fde2ddb59323c891cf30995e1862510342f"
    ],
    ens: "sassal.eth"
})
users.set("0x3d280fde2ddb59323c891cf30995e1862510342f", {
    following: [
        "0x505e20c0fb8252ca7ac21d54d5432eccd4f2d076"
    ],
    ens: "sebaudet.eth"
})
users.set("0x5a64f54ca8af1eafbcb31fec17042fc05c10aa14", {
    following: [],
    ens: "saketkmr007.eth"
})
users.set("0x384d600d124fa0e942b647fdc54586a159a2d321", {
    following: [ "0x5a64f54ca8af1eafbcb31fec17042fc05c10aa14", "0x52c8ff44260056f896e20d8a43610dd88f05701b" ],
    ens: "raushancrypto.eth"
})
users.set("0x52c8ff44260056f896e20d8a43610dd88f05701b", {
    following: [],
    ens: "0xjasper.eth"
})
users.set("0x11e4857bb9993a50c685a79afad4e6f65d518dda", {
    following: [
        "0x52c8ff44260056f896e20d8a43610dd88f05701b"
    ],
    isEmulateScanToken: false,
    ens: "hayden.eth"
})
users.set("0x5d6a6e3b443eba5427eed935d132d3d0eea5a707", {
    following: [
        "0x49a6518dc7ec146c58420a9c0bb0bfef5dae5dd4"
    ],
    ens: "javelin.eth"
})
users.set("0x49a6518dc7ec146c58420a9c0bb0bfef5dae5dd4", {
    following: [ "0xc5c26f52e44e535345edccb8d95f399a8212a890" ],
    ens: "surajraushan.eth"
})
users.set("0xc5c26f52e44e535345edccb8d95f399a8212a890", {
    following: [],
    ens: "cjx.eth"
})
users.set("0x7b1e3609ef49e800763058da347311774ec8bfdf", {
    following: [ "0xc5c26f52e44e535345edccb8d95f399a8212a890" ],
    ens: "deepanshu.eth"
})
users.set("0x000f4ae7700afde47c3b14d22883b4e7808f0e58", {
    following: [],
    ens: "elshan.eth"
})

const opts = {
    transports: ['websocket'],
    timeout: 60000,
    query: {
        api_token:
            'Demo.ukEVQp6L5vfgxcz4sBke7XvS873GMYHy',
    },
}

const addressSocket = {
    namespace: 'address',
    socket: io(`${BASE_URL}address`, opts),
};

const assetsSocket = {
    namespace: 'assets',
    socket: io(`${BASE_URL}assets`, opts),
};

function get(socketNamespace, requestBody) {
    return new Promise(resolve => {
        const {socket, namespace} = socketNamespace;

        function handleReceive(data) {
            resolve(data);
        }

        const model = requestBody.scope[0];

        socket.emit('get', requestBody);
        socket.on(`received ${namespace} ${model}`, handleReceive);
    });
}

async function calculateScore() {
    console.log("start calculation base score...")
    for (let user of users.keys()) {
        const result = await get(addressSocket, {
            scope: ['positions'],
            payload: {
                address: user,
                currency: "usd"
            }
        })

        const pResult = await get(addressSocket, {
            scope: ['portfolio'],
            payload: {
                address: user,
                currency: "usd"
            }
        })

        let usdTotalPortfolio = pResult.payload.portfolio.assets_value
        let aValue = 0
        let countA = 0
        let totalValue = 0
        for (let i = 0; i < result.payload.positions.positions.length; i++) {
            const asset = result.payload.positions.positions[i]
            if (asset.value == null)
                continue;

            const key = "market_cap_" + asset.asset.asset_code;
            let marketCap = null
            try {
                marketCap = await db.get(key)
            } catch (e) {
                const assetInfo = await get(assetsSocket, {
                    scope: ['full-info'],
                    payload: {
                        asset_code: asset.asset.asset_code,
                        currency: "usd"
                    }
                })


                marketCap = assetInfo.payload["full-info"].market_cap;

                if (marketCap == null) {
                    marketCap = 0;
                }

                await db.put(key, marketCap)
            }

            aValue += marketCap / bitcoinMarketCap
            countA++

            totalValue += marketCap / bitcoinMarketCap * asset.value;
        }

        if (users.get(user).isEmulateScanToken) {
            aValue += 7689734 / bitcoinMarketCap
            countA++

            const amount = 300000
            totalValue += 7689734 / bitcoinMarketCap * amount;

            usdTotalPortfolio += amount
        }
        scores.set(user, {
            baseScore: totalValue * aValue/countA,
            socialScore: 0,
            usdTotalPortfolio: usdTotalPortfolio
        })
    }

    console.log("end of calculation base score...")
}
async function calculateSocialScore() {
    console.log("start calculation social score...")
    for (let user of users.keys()) {
        for (let following of users.get(user).following) {
            if(scores.get(following) === undefined) {
                continue
            }
            scores.get(following).socialScore += scores.get(user).baseScore
        }
    }

    console.log("end of calculation social score...")
}

async function start() {
    await calculateScore();
    await calculateSocialScore();
    console.log(`address | base score | social score | total`)
    const table = []
    for (let user of users.keys()) {
        const score = scores.get(user)
        table.push({
            address: user,
            totalUSD: Math.round(score.usdTotalPortfolio) + " USD",
            baseScore: Math.round(score.baseScore),
            socialScore: score.socialScore/100*10,
            totalScore: score.baseScore+score.socialScore/100*10,
            ens: users.get(user).ens
        })
    }
    table.sort((a, b) => {
        return b.totalScore - a.totalScore;
    })

    console.table(table);
}

start()

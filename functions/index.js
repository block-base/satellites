const config = require('./config.json')
const project = process.env.PROJECT
const functions = require('firebase-functions')
const admin = require('firebase-admin')
admin.initializeApp()
const db = admin.firestore()
const settings = { timestampsInSnapshots: true }
db.settings(settings)
const bucket = admin.storage().bucket(config.bucket[project])
const { promisify } = require('util')
const fs = require('fs')
const readFile = promisify(fs.readFile)
const axios = require('axios')
const Canvas = require('canvas')
Canvas.registerFont(__dirname + '/assets/fonts/NotoSansJP-Regular.otf', {
  family: 'Noto Sans JP'
})
Canvas.registerFont(__dirname + '/assets/fonts/NotoSansJP-Bold.otf', {
  family: 'Noto Sans JP Bold',
  weight: 'bold'
})
const Web3 = require('web3')
const web3 = new Web3(config.node[project].https)
const bazaaar_v1 = new web3.eth.Contract(
  config.abi.bazaaar_v1,
  config.contract[project].bazaaar_v1
)
const twitter = require('twitter')
const client = new twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESSTOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESSTOKEN_SECRET
})
const {google} = require('googleapis');
const cloudbilling = google.cloudbilling('v1');
const {auth} = require('google-auth-library');
const PROJECT_NAME = `projects/${project}`;
console.log(PROJECT_NAME)
const deactivateDocOGP = async doc => {
  console.info("START deactivateDocOGP")
  const canvas = Canvas.createCanvas(1200, 630)
  const c = canvas.getContext('2d')
  const imagePromise = axios.get(doc.ogp, { responseType: 'arraybuffer' })
  const promises = [imagePromise, readFile('./assets/img/out_en.png')]
  const resolved = await Promise.all(promises)
  const bgImg = new Canvas.Image()
  const outImg = new Canvas.Image()
  bgImg.src = resolved[0].data
  outImg.src = resolved[1]
  c.clearRect(0, 0, 1200, 630)
  c.drawImage(bgImg, 0, 0)
  c.fillStyle = 'rgba(0,0,0,0.7)'
  c.fillRect(0, 0, 1200, 630)
  c.drawImage(outImg, 76, 145)
  const base64EncodedImageString = canvas.toDataURL().substring(22)
  const imageBuffer = Buffer.from(base64EncodedImageString, 'base64')
  const file = bucket.file(doc.hash + '.png')
  await file.save(imageBuffer, { metadata: { contentType: 'image/png' } })
  console.info("END deactivateDocOGP")
}

exports.subscribe = functions.region('asia-northeast1').pubsub.topic('subscribe').onPublish((event) => {
  const pubsubData = JSON.parse(Buffer.from(event.data.data, 'base64').toString());
  if (pubsubData.costAmount <= pubsubData.budgetAmount) {
    return Promise.resolve('No action shall be taken on current cost ' +
      pubsubData.costAmount);
  }

  return setAuthCredential()
    .then(() => isBillingEnabled(PROJECT_NAME))
    .then((enabled) => {
      if (enabled) {
        return disableBillingForProject(PROJECT_NAME);
      }
      return Promise.resolve('Billing already in disabled state');
    });
});

/**
 * @return {Promise} Credentials set globally
 */
function setAuthCredential() {
  return auth.getApplicationDefault()
    .then((res) => {
      let client2 = res.credential;
      if (client2.createScopedRequired && client2.createScopedRequired()) {
        client2 = client2.createScoped([
          'https://www.googleapis.com/auth/cloud-billing'
        ]);
      }

      // Set credential globally for all requests
      google.options({
        auth: client2
      });
    });
}

/**
 * @param {string} projectName Name of project to check if billing is enabled
 * @return {Promise} Whether project has billing enabled or not
 */
function isBillingEnabled(projectName) {
  return cloudbilling.projects.getBillingInfo({
    name: projectName
  }).then((res) => res.data.billingEnabled);
};

/**
 * @param {string} projectName Name of project disable billing on
 * @return {Promise} Text containing response from disabling billing
 */
function disableBillingForProject(projectName) {
  return cloudbilling.projects.updateBillingInfo({
    name: projectName,
    // Setting this to empty is equivalent to disabling billing.
    resource: {
      'billingAccountName': ''
    }
  }).then((res) => {
    return 'Billing disabled successfully: ' + JSON.stringify(res.data);
  });
}

exports.order = functions
  .region('asia-northeast1')
  .https.onCall(async (params, context) => {
    console.info("START order")
    console.info("INPUT data")
    console.info(params)
    const order = params.order
    if(order.asset != config.contract[project].ck) {
      console.info("Invalid Address")
      return
    }
    const hash = await bazaaar_v1.methods
      .requireValidOrder_(
        [
          order.proxy,
          order.maker,
          order.taker,
          order.creatorRoyaltyRecipient,
          order.asset
        ],
        [
          order.id,
          order.price,
          order.nonce,
          order.salt,
          order.expiration,
          order.creatorRoyaltyRatio,
          order.referralRatio
        ],
        order.v,
        order.r,
        order.s
      )
      .call()
    console.info("INFO order 1")
    const response = await axios({
      method: 'get',
      url: config.api.ck.metadata + order.id,
      responseType: 'json'
    })
    console.info("INFO order 2")
    const metadata = response.data
    const imagePromise = axios.get(metadata.image_url_png, {
      responseType: 'arraybuffer'
    })
    const promises = [readFile('./assets/img/template_en.png'), imagePromise]
    const resolved = await Promise.all(promises)
    console.info("INFO order 3")
    const templateImg = new Canvas.Image()
    const characterImg = new Canvas.Image()
    templateImg.src = resolved[0]
    characterImg.src = resolved[1].data
    const canvas = Canvas.createCanvas(1200, 630)
    const c = canvas.getContext('2d')
    c.clearRect(0, 0, 1200, 630)
    c.drawImage(templateImg, 0, 0)
    c.drawImage(characterImg, 15, 90, 450, 450)
    c.textBaseline = 'top'
    c.textAlign = 'center'
    c.fillStyle = '#ffff00'
    c.font = "bold 60px 'Noto Sans JP Bold'"
    if (!params.msg) {
      c.fillText('NOW ON SALE!!', 840, 120, 720)
    } else {
      if(params.msg.length <= 9){
        const msg = params.msg.replace(/\r?\n/g, '')
        c.fillText(msg, 840, 120, 720)
      } else {
        const msg = params.msg.replace(/\r?\n/g, '')
        c.fillText(msg.substr(0, 9), 840, 80, 720)
        c.fillText(msg.substr(9, 9), 840, 160, 720)
      }
    }
    c.fillStyle = '#fff'
    c.font = "40px 'Noto Sans JP'"
    c.fillText(
      'Id.' + order.id + ' / ' + 'Gen.' + metadata.generation,
      840,
      255,
      720
    )
    c.fillText('Cooldown.' + metadata.status.cooldown_index, 840, 305, 720)
    c.font = "bold 75px 'Noto Sans JP Bold'"
    c.fillText(web3.utils.fromWei(order.price) + ' ETH', 840, 375, 720)
    const base64EncodedImageString = canvas.toDataURL().substring(22)
    const imageBuffer = Buffer.from(base64EncodedImageString, 'base64')
    const file = bucket.file(hash + '.png')
    const ogp =
      'https://firebasestorage.googleapis.com/v0/b/' +
      bucket.name +
      '/o/' +
      encodeURIComponent(hash + '.png') +
      '?alt=media'
    const now = new Date().getTime()
    order.hash = hash
    order.metadata = metadata
    order.ogp = ogp
    order.created = now
    order.valid = true
    const batch = db.batch()
    const deactivateDocOGPPromises = []
    const snapshots = await db
      .collection('order')
      .where('maker', '==', order.maker)
      .where('asset', '==', order.asset)
      .where('id', '==', order.id)
      .where('valid', '==', true)
      .get()
    console.info("INFO order 4")
    snapshots.forEach(function(doc) {
      const ref = db.collection('order').doc(doc.id)
      batch.update(ref, {
        result: { status: 'cancelled' },
        valid: false,
        modified: now
      })
      deactivateDocOGPPromises.push(deactivateDocOGP(doc.data()))
    })
    const ref = db.collection('order').doc(hash)
    batch.set(ref, order)
    const savePromises = [
      file.save(imageBuffer, { metadata: { contentType: 'image/png' } }),
      batch.commit()
    ]
    await Promise.all(savePromises.concat(deactivateDocOGPPromises))
    console.info("INFO order 5")
    const msssage =
      'NOW ON SALE!!' +
      ' / Id.' +
      order.id +
      ' / Gen.' +
      metadata.generation +
      ' / Cooldown.' +
      metadata.status.cooldown_index +
      ' / #bazaaar #バザー #NFT #CryptoKitties from @bazaaario ' +
      config.host[project] +
      'ck/order/' +
      order.hash
    client.post('statuses/update', { status: msssage }, (error, tweet, response) => {
      if(error) throw error;
    });
    const result = {
      ogp: ogp,
      hash: hash
    }
    console.info("OUTPUT data")
    console.info(result)
    console.info("END order")
    return result
  })

exports.orderMatchedPubSub = functions
  .region('asia-northeast1')
  .pubsub.topic('orderMatched')
  .onPublish(async message => {
    console.info("START orderMatched")
    console.info("INPUT data:" + message.json)
    const transactionHash = message.json.transactionHash
    const transaction = await web3.eth.getTransactionReceipt(transactionHash)
    console.info("INFO orderMached 1")
    const hash = transaction.logs[0].topics[1]
    const address = web3.utils.toChecksumAddress(transaction.logs[0].address)
    const maker = web3.utils.toChecksumAddress(
      web3.utils.toHex(transaction.logs[0].data.substring(26, 66))
    )
    const taker = web3.utils.toChecksumAddress(
      web3.utils.toHex(transaction.logs[0].data.substring(90, 130))
    )
    const asset = web3.utils.toChecksumAddress(
      web3.utils.toHex(transaction.logs[0].data.substring(154, 194))
    )
    const id = web3.utils
      .hexToNumber(transaction.logs[0].data.substring(194, 258))
      .toString()
    const now = new Date().getTime()
    if (address == bazaaar_v1.options.address) {
      console.info("INFO orderMached 2")
      const batch = db.batch()
      const deactivateDocOGPPromises = []
      const promises = [
        db
          .collection('order')
          .where('hash', '==', hash)
          .where('valid', '==', true)
          .get(),
        db
          .collection('order')
          .where('maker', '==', maker)
          .where('asset', '==', asset)
          .where('id', '==', id)
          .where('valid', '==', true)
          .get()
      ]
      const resolved = await Promise.all(promises)
      console.info("INFO orderMached 3")
      resolved[0].forEach(function(doc) {
        let ref = db.collection('order').doc(doc.id)
        batch.update(ref, {
          result: { status: 'sold', taker: taker },
          valid: false,
          modified: now
        })
        deactivateDocOGPPromises.push(deactivateDocOGP(doc.data()))
      })
      resolved[1].forEach(function(doc) {
        if (doc.id != hash) {
          var ref = db.collection('order').doc(doc.id)
          batch.update(ref, {
            result: { status: 'cancelled' },
            valid: false,
            modified: now
          })
          deactivateDocOGPPromises.push(deactivateDocOGP(doc.data()))
        }
      })
      const savePromises = [batch.commit()]
      await Promise.all(savePromises.concat(deactivateDocOGPPromises))
    }
    console.info("END orderMached")
  })

exports.orderCancelledPubSub = functions
  .region('asia-northeast1')
  .pubsub.topic('orderCancelled')
  .onPublish(async message => {
    console.info("START orderCancelled")
    console.info("INPUT data:" + message.json)
    const transactionHash = message.json.transactionHash
    const transaction = await web3.eth.getTransactionReceipt(transactionHash)
    console.info("INFO orderCancelled 1")
    const address = web3.utils.toChecksumAddress(transaction.logs[0].address)
    const maker = web3.utils.toChecksumAddress(
      web3.utils.toHex(transaction.logs[0].data.substring(26, 66))
    )
    const asset = web3.utils.toChecksumAddress(
      web3.utils.toHex(transaction.logs[0].data.substring(90, 130))
    )
    const id = web3.utils
      .hexToNumber(transaction.logs[0].data.substring(130, 194))
      .toString()
    const now = new Date().getTime()
    if (address == bazaaar_v1.options.address) {
      console.info("INFO orderCancelled 2")
      const batch = db.batch()
      const deactivateDocOGPPromises = []
      const snapshots = await db
        .collection('order')
        .where('maker', '==', maker)
        .where('asset', '==', asset)
        .where('id', '==', id)
        .where('valid', '==', true)
        .get()
      console.info("INFO orderCancelled 3")
      snapshots.forEach(function(doc) {
        var ref = db.collection('order').doc(doc.id)
        batch.update(ref, {
          result: { status: 'cancelled' },
          valid: false,
          modified: now
        })
        deactivateDocOGPPromises.push(deactivateDocOGP(doc.data()))
      })
      const savePromises = [batch.commit()]
      await Promise.all(savePromises.concat(deactivateDocOGPPromises))
    }
    console.info("END orderCancelled")
  })

exports.orderPeriodicUpdatePubSub = functions
  .region('asia-northeast1')
  .pubsub.topic('orderPeriodicUpdate')
  .onPublish(async message => {
    console.info("START orderPeriodicUpdate")
    const eventPromises = [
      bazaaar_v1.getPastEvents('OrderMatched', {
        fromBlock: (await web3.eth.getBlockNumber()) - 25,
        toBlock: 'latest'
      }),
      bazaaar_v1.getPastEvents('OrderCancelled', {
        fromBlock: (await web3.eth.getBlockNumber()) - 25,
        toBlock: 'latest'
      })
    ]
    const eventResolved = await Promise.all(eventPromises)
    console.info("INFO Sold")
    console.info(eventResolved[0][0])
    console.info("INFO Cancel")
    console.info(eventResolved[1][0])
    console.info("INFO orderPeriodicUpdate 1")
    const batch = db.batch()
    const takers = []
    const soldPromises = []
    const cancelledPromises = []
    const deactivateDocOGPPromises = []
    const now = new Date().getTime()
    for (var i = 0; i < eventResolved[0].length; i++) {
      takers.push(eventResolved[0][i].returnValues.taker)
      soldPromises.push(
        db
          .collection('order')
          .where('hash', '==', eventResolved[0][i].raw.topics[1])
          .where('valid', '==', true)
          .get()
      )
      cancelledPromises.push(
        db
          .collection('order')
          .where('asset', '==', eventResolved[0][i].returnValues.asset)
          .where('id', '==', eventResolved[0][i].returnValues.id.toString())
          .where('maker', '==', eventResolved[0][i].returnValues.maker)
          .where('valid', '==', true)
          .get()
      )
    }
    for (var i = 0; i < eventResolved[1].length; i++) {
      cancelledPromises.push(
        db
          .collection('order')
          .where('asset', '==', eventResolved[1][i].returnValues.asset)
          .where('id', '==', eventResolved[1][i].returnValues.id.toString())
          .where('maker', '==', eventResolved[1][i].returnValues.maker)
          .where('valid', '==', true)
          .get()
      )
    }
    const promiseArray = [soldPromises, cancelledPromises]
    const orderResolved = await Promise.all(
      promiseArray.map(function(innerPromiseArray) {
        return Promise.all(innerPromiseArray)
      })
    )

    console.info("INFO orderPeriodicUpdate 2")
    const processed = []
    for (let i = 0; i < orderResolved[0].length; i++) {
      orderResolved[0][i].forEach(function(doc) {
        processed.push(doc.id)
        let ref = db.collection('order').doc(doc.id)
        batch.update(ref, {
          result: { status: 'sold', taker: takers[i] },
          valid: false,
          modified: now
        })
        deactivateDocOGPPromises.push(deactivateDocOGP(doc.data()))
      })
    }
    for (let i = 0; i < orderResolved[1].length; i++) {
      orderResolved[1][i].forEach(function(doc) {
        if(!processed.includes(doc.id)){
          let ref = db.collection('order').doc(doc.id)
          batch.update(ref, {
            result: { status: 'cancelled' },
            valid: false,
            modified: now
          })
          deactivateDocOGPPromises.push(deactivateDocOGP(doc.data()))
        }
      })
    }
    const savePromises = [batch.commit()]
    await Promise.all(savePromises.concat(deactivateDocOGPPromises))
    console.info("END orderPeriodicUpdate")
  })

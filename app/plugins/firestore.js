import firebase from 'firebase/app'
import 'firebase/firestore'

const config = require('../../config.json')

if (!firebase.apps.length) {
  firebase.initializeApp(config.firebase)
}

const db = firebase.firestore()

const getLatestOrders = async limit => {
  const result = []
  const snapshots = await db.collection('order')
    .orderBy('created', 'desc').limit(limit).get()
  snapshots.forEach(doc => result.push(doc.data()))
  return result
}

const getOrdersByMaker = async maker => {
  const result = []
  const snapshots = await db.collection('order').where('maker', '==', maker).get()
  snapshots.forEach(doc => result.push(doc.data()))
  return result
}

const getOrdersByMakerIdStatus = async (maker, id, status) => {
  const result = []
  const snapshots = await db.collection('order')
    .where('maker', '==', maker)
    .where('id', '==', id)
    .where('status', '==', status).get()
  snapshots.forEach(doc => result.push(doc.data()))
  return result
}

const doc = async (collenction, doc) => {
  console.log('db:get', collenction, doc)
  const snapshot = await db.collection(collenction).doc(doc).get()
  return snapshot.data()
}

const docs = async (collenction, a, cond1, b, c, cond2, d, e, cond3, f)  => {
  console.log('db:gets', collenction, a, cond1, b)
  const result = []
  if(!c){
    console.log('db:gets', collenction, a, cond1, b)
    const snapshots = await db.collection(collenction).where(a, cond1, b).get()
    snapshots.forEach(doc => result.push(doc.data()));
  }else if(!e){
    console.log('db:gets', collenction, a, cond1, b, c, cond2, d)
    const snapshots = await db.collection(collenction).where(a, cond1, b).where(c, cond2, d).get()
    snapshots.forEach(doc => result.push(doc.data()));
  }else{
    console.log('db:gets', collenction, a, cond1, b, c, cond2, d, e, cond3, f)
    const snapshots = await db.collection(collenction).where(a, cond1, b).where(c, cond2, d).where(e, cond3, f).get()
    snapshots.forEach(doc => result.push(doc.data()));
  }

  return result
}


const firestore = {
  doc:doc,
  docs: docs,
  getLatestOrders:getLatestOrders,
  getOrdersByMaker:getOrdersByMaker,
  getOrdersByMakerIdStatus:getOrdersByMakerIdStatus
}

export default firestore
